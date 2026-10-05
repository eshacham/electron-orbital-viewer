"""Spec Phase 6 validation, asserted on the files that actually ship."""
import json
from pathlib import Path

import numpy as np
import pytest

from compact import read_float32_gz
from library import LIBRARY, by_id
from measure import BOHR_TO_ANGSTROM, angular_difference, measure
from version import OUT_ROOT

REPO = Path(__file__).resolve().parents[3]
EACH = pytest.mark.parametrize('entry', LIBRARY, ids=lambda m: m.id)

pytestmark = pytest.mark.skipif(not (OUT_ROOT / 'index.json').exists(), reason='generated data absent (git-ignored); run build_library.py')


def meta(entry):
    return json.loads((OUT_ROOT / entry.id / 'meta.json').read_text())


def coords(m):
    return [np.asarray(a['position']) * BOHR_TO_ANGSTROM for a in m['atoms']]


def test_index_lists_the_library_in_catalogue_order():
    index = json.loads((OUT_ROOT / 'index.json').read_text())
    assert [e['id'] for e in index if e['id'] in {m.id for m in LIBRARY}] == [m.id for m in LIBRARY]


@EACH
def test_geometry_matches_its_stated_source(entry):
    m = meta(entry)
    for ref in entry.references:
        if ref.quantity in ('bond', 'angle'):
            assert abs(measure(ref, coords(m)) - ref.value) <= ref.tolerance, ref.label
        if ref.quantity == 'dihedral':
            assert angular_difference(measure(ref, coords(m)), ref.value) <= ref.tolerance, ref.label
    if entry.optimised:
        assert m['geometryOptimisation']['converged'] and m['geometryOptimisation']['maxGradient'] < 4.5e-4


@EACH
def test_dipole_within_tolerance(entry):
    ref = next(r for r in entry.references if r.quantity == 'dipole')
    assert abs(meta(entry)['dipoleDebye'] - ref.value) <= ref.tolerance


@EACH
def test_density_integrates_to_the_electron_count(entry):
    m = meta(entry)
    rho = read_float32_gz(OUT_ROOT / entry.id / 'density.bin.gz').astype(np.float64)
    assert rho.size == np.prod(m['grid']['shape'])
    assert abs(rho.sum() * m['grid']['spacing'] ** 3 - m['electronCount']) / m['electronCount'] < 0.005


@EACH
def test_density_vanishes_at_the_box_faces(entry):
    m = meta(entry)
    rho = read_float32_gz(OUT_ROOT / entry.id / 'density.bin.gz').reshape(m['grid']['shape'])
    assert max(rho[0].max(), rho[-1].max(), rho[:, 0].max(), rho[:, -1].max(), rho[:, :, 0].max(), rho[:, :, -1].max()) < 1e-5


@EACH
def test_homo_below_lumo_with_roles_on_whole_sets(entry):
    orbitals = meta(entry)['orbitals']
    occupied = [o for o in orbitals if o['occupation'] > 0]
    empty = [o for o in orbitals if o['occupation'] == 0]
    homo = [o for o in orbitals if o.get('role') == 'HOMO']
    lumo = [o for o in orbitals if o.get('role') == 'LUMO']
    assert homo and lumo
    assert max(o['energyHartree'] for o in homo) == max(o['energyHartree'] for o in occupied if o['occupation'] == 2)
    assert min(o['energyHartree'] for o in lumo) == min(o['energyHartree'] for o in empty)
    assert max(o['energyHartree'] for o in occupied) < min(o['energyHartree'] for o in empty)
    assert len({round(o['energyHartree'], 4) for o in homo}) == 1


@EACH
def test_within_the_size_budget(entry):
    assert sum(f.stat().st_size for f in (OUT_ROOT / entry.id).iterdir()) <= 3_000_000


def test_esp_ranges_are_physical():
    lo, hi = meta(by_id('h2o'))['espRangeOnSurface']
    assert lo < -0.03 and hi > 0.03                        # a polar molecule: both ends strongly charged
    lo, hi = meta(by_id('benzene'))['espRangeOnSurface']
    assert -0.04 < lo < 0 < hi < 0.04                       # weak π-face negative, weak C-H positive
    for entry in LIBRARY:
        assert all(abs(v) < 0.2 for v in meta(entry)['espRangeOnSurface'])


def test_rows_file_is_current():
    from build_library import validation_rows
    rows = json.loads((REPO / 'src' / 'validation' / 'generated' / 'phase6_library.json').read_text())
    assert rows == [r for entry in LIBRARY for r in validation_rows(entry, meta(entry))]


def test_ch4_and_benzene_homo_sets_have_the_expected_size():
    # Review Focus 5 (D-row carried from Task 5): CH4's triply-degenerate t2
    # HOMO and benzene's doubly-degenerate e1g HOMO must each land on one
    # energy, with exactly the expected number of components marked HOMO.
    ch4_orbitals = meta(by_id('ch4'))['orbitals']
    ch4_homo = [o for o in ch4_orbitals if o.get('role') == 'HOMO']
    assert len(ch4_homo) == 3
    assert len({round(o['energyHartree'], 4) for o in ch4_homo}) == 1

    benzene_orbitals = meta(by_id('benzene'))['orbitals']
    benzene_homo = [o for o in benzene_orbitals if o.get('role') == 'HOMO']
    assert len(benzene_homo) == 2
    assert len({round(o['energyHartree'], 4) for o in benzene_homo}) == 1

    for molecule_id in ('ch4', 'co2', 'bf3', 'sf6', 'c2h2', 'c2h4', 'c2h6', 'benzene', 'sih4'):
        assert meta(by_id(molecule_id))['dipoleDebye'] < 0.05
