"""Checks on the generated output, read from version.OUT_ROOT (spec §5 Phase 5
validation). The data lives under tools/molecules/out/<DATA_VERSION>/, which
is git-ignored (spec §4.5 amendment) -- these tests are skipped on a checkout
that has not run generate.py, and run for real wherever it has (ruling C12)."""
import json

import numpy as np
import pytest
from pyscf import dft

from basis_export import evaluate_aos
from fit import MIN_VALID_POINTS
from molecules import BOHR_TO_ANGSTROM, DIATOMICS, REPO_ROOT, SCAN_FACTORS
from outputs import molecule_for_basis
from version import OUT_ROOT

OUT = OUT_ROOT
IDS = [d.id for d in DIATOMICS]

pytestmark = pytest.mark.skipif(
    not OUT.exists(), reason=f'{OUT} is git-ignored generated data; run generate.py first')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def test_index_lists_every_diatomic():
    entries = [e for e in load(OUT / 'index.json') if e['category'] == 'diatomic']
    assert [e['id'] for e in entries] == IDS


@pytest.mark.parametrize('mol_id', IDS)
def test_every_scan_point_has_meta_and_basis(mol_id):
    scan = load(OUT / mol_id / 'scan.json')
    validity = scan['validity']
    # Ruling T4-a/T4-d: a scan ships only the points where single-reference
    # CCSD(T) holds, so fewer than 20 points is expected and not a failure --
    # exact methods (FCI, or CCSD with <=2 correlated electrons) keep all 20.
    assert validity['pointsComputed'] == len(SCAN_FACTORS) == 20
    assert len(scan['points']) == validity['pointsShipped']
    if validity['exact']:
        assert validity['pointsShipped'] == 20
    else:
        assert validity['pointsShipped'] >= MIN_VALID_POINTS
    for point in scan['points']:
        folder = OUT / mol_id / 'scan' / f"{point['index']:02d}"
        assert load(folder / 'meta.json')['id'] == point['id'] == f"{mol_id}@{point['index']:02d}"
        basis = load(folder / 'basis.json')
        assert all(len(o['coefficients']) == basis['nao'] for o in basis['orbitals'])


@pytest.mark.parametrize('mol_id', IDS)
def test_size_budget(mol_id):
    total = sum(p.stat().st_size for p in (OUT / mol_id).rglob('*') if p.is_file())
    assert total <= 3 * 1024 * 1024, f'{mol_id}: {total / 1e6:.2f} MB'


@pytest.mark.parametrize('d', DIATOMICS, ids=IDS)
def test_density_integrates_to_the_electron_count(d):
    basis = load(OUT / d.id / 'basis.json')
    mol = molecule_for_basis([a for a in basis['atoms']], d.elements, d.spin)
    grids = dft.gen_grid.Grids(mol)
    grids.level = 5
    grids.build()
    ao = evaluate_aos(basis['shells'], basis['atoms'], grids.coords)
    rho = sum(o['occupation'] * (ao @ np.asarray(o['coefficients'])) ** 2 for o in basis['orbitals'])
    assert abs(float(rho @ grids.weights) - mol.nelectron) < 1e-3 * mol.nelectron


@pytest.mark.parametrize('mol_id,reference', [('n2', 1.098), ('o2', 1.207), ('f2', 1.412), ('co', 1.128), ('hf', 0.917)])
def test_equilibrium_bond_lengths(mol_id, reference):
    fit = load(OUT / mol_id / 'scan.json')['fit']
    assert fit['bound'] is True
    assert abs(fit['ReBohr'] * BOHR_TO_ANGSTROM - reference) / reference < 0.01


def test_hydrogen_bond_length_and_dissociation_energy():
    fit = load(OUT / 'h2' / 'scan.json')['fit']
    assert abs(fit['ReBohr'] - 1.401) / 1.401 < 0.01
    assert abs(fit['DeEv'] - 4.75) / 4.75 < 0.02


def test_oxygen_ground_state_is_the_triplet():
    check = load(OUT / 'o2' / 'scan.json')['spinCheck']
    assert check['tripletHartree'] < check['singletHartree']


def test_helium_dimer_is_not_bound():
    scan = load(OUT / 'he2' / 'scan.json')
    energies = [p['energyHartree'] for p in scan['points']]
    # fit.py has no separate "well depth" field; DeHartree (separated atoms
    # minus the scan minimum) is what stands in for it here.
    assert scan['fit']['bound'] is False
    if scan['fit']['DeHartree'] is not None:
        assert scan['fit']['DeHartree'] < 1e-4
    assert energies[0] - energies[-1] > 5e-3   # the repulsive wall at 2.4 a0


@pytest.mark.parametrize('mol_id,order', [('h2', 1), ('he2', 0), ('li2', 1), ('b2', 1), ('c2', 2),
                                          ('n2', 3), ('o2', 2), ('f2', 1), ('co', None), ('hf', None)])
def test_bond_orders(mol_id, order):
    assert load(OUT / mol_id / 'meta.json')['bondOrder'] == order


@pytest.mark.parametrize('mol_id,label', [('o2', '1πg*'), ('b2', '1πu')])
def test_open_shells_put_two_unpaired_electrons_in_the_pi_pair(mol_id, label):
    orbitals = load(OUT / mol_id / 'meta.json')['orbitals']
    alpha = [o for o in orbitals if o['spin'] == 'alpha' and o['label'] == label]
    beta = [o for o in orbitals if o['spin'] == 'beta' and o['label'] == label]
    assert [o['occupation'] for o in alpha] == [1.0, 1.0]
    assert [o['occupation'] for o in beta] == [0.0, 0.0]
    assert all(o['role'] == 'SOMO' for o in alpha)


def test_validation_summary_matches_the_scans():
    rows = load(REPO_ROOT / 'src' / 'validation' / 'generated' / 'phase5_diatomics.json')
    assert {(r['system'], r['quantity']) for r in rows} == {
        ('H₂', 'R_e'), ('H₂', 'D_e'), ('N₂', 'R_e'), ('O₂', 'R_e'),
        ('O₂', 'E(closed-shell singlet) − E(triplet)'), ('F₂', 'R_e'), ('CO', 'R_e'), ('HF', 'R_e')}
