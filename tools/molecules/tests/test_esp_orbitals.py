import numpy as np
from pyscf import gto
from pyscf.dft import numint

from density import total_dm
from esp import esp_on_points
from library import by_id
from optimise import make_dft
from orbitals import degeneracy_groups, orbital_labels, orbital_table


def scf(molecule_id, symmetry=True):
    entry = by_id(molecule_id)
    mol = gto.M(atom=list(entry.atoms), unit='Angstrom', basis='def2-SVP', spin=entry.spin, symmetry=symmetry, verbose=0)
    mf = make_dft(mol)
    mf.kernel()
    return mol, mf


def test_labels_count_per_irrep_and_pair_degenerate_components():
    assert orbital_labels(['A1', 'A1', 'B2', 'A1', 'B1']) == ['1a1', '2a1', '1b2', '3a1', '1b1']
    assert orbital_labels(['A1g', 'E1uy', 'E1ux', 'A1g']) == ['1a1g', '1e1u', '1e1u', '2a1g']


def test_degeneracy_groups():
    assert degeneracy_groups([-1.0, -0.5, -0.49999, -0.2]) == [0, 1, 1, 2]


def test_esp_signs_on_water():
    mol, mf = scf('h2o', symmetry=False)       # the builder's frame: O at 0, H on +z
    dm = total_dm(mf)
    o, h1 = mol.atom_coords()[0], mol.atom_coords()[1]
    beyond_o = o + np.array([0.0, 0.0, -3.0])
    beyond_h = h1 + 1.5 * (h1 - o) / np.linalg.norm(h1 - o)
    far = np.array([0.0, 0.0, 30.0])
    v = esp_on_points(mol, dm, np.array([beyond_o, beyond_h, far]))
    assert v[0] < 0 < v[1] and abs(v[2]) < 5e-3


def test_water_homo_is_the_out_of_plane_lone_pair_and_dipole_points_to_the_hydrogens():
    mol, mf = scf('h2o')
    table = orbital_table(mol, mf)
    homo = next(r for r in table if r.get('role') == 'HOMO')
    lumo = next(r for r in table if r.get('role') == 'LUMO')
    assert homo['energyHartree'] < lumo['energyHartree'] and homo['label'][1:] in ('b1', 'b2')
    c = mol.atom_coords()
    normal = np.cross(c[1] - c[0], c[2] - c[0])
    normal /= np.linalg.norm(normal)
    u = (c[1] - c[0]) / np.linalg.norm(c[1] - c[0])
    v = np.cross(normal, u)
    plane = np.array([c[0] + a * u + b * v for a in np.linspace(-2, 2, 9) for b in np.linspace(-2, 2, 9)])
    psi = lambda pts: numint.eval_ao(mol, pts) @ mf.mo_coeff[:, homo['index']]
    assert np.abs(psi(plane)).max() < 1e-8 < 1e-2 < np.abs(psi(plane + 0.7 * normal)).max()
    mu = np.asarray(mf.dip_moment(unit='Debye', verbose=0))
    assert 1.7 < np.linalg.norm(mu) < 2.3
    assert np.dot(mu, (c[1] + c[2]) / 2 - c[0]) > 0          # from - (O) towards + (H)


def test_all_three_ch4_homos_are_marked():
    mol, mf = scf('ch4')
    assert sum(1 for r in orbital_table(mol, mf) if r.get('role') == 'HOMO') == 3


def test_no2_has_one_somo_below_the_lumo():
    mol, mf = scf('no2')
    table = orbital_table(mol, mf)
    somo = [r for r in table if r.get('role') == 'SOMO']
    lumo = next(r for r in table if r.get('role') == 'LUMO')
    assert len(somo) == 1 and somo[0]['occupation'] == 1.0 and somo[0]['energyHartree'] < lumo['energyHartree']


def test_table_keeps_occupied_plus_five_virtuals_and_completes_a_degenerate_set():
    mol, mf = scf('ch4')
    table = orbital_table(mol, mf)
    virtual = [r for r in table if r['occupation'] == 0]
    assert len([r for r in table if r['occupation'] > 0]) == 5 and len(virtual) >= 5
    groups = degeneracy_groups(mf.mo_energy)
    last = virtual[-1]['index']
    assert last + 1 >= len(mf.mo_energy) or groups[last + 1] != groups[last]


def test_table_rows_address_basis_json_positions():
    # D1 (preflight): meta's orbital rows must address basis.json by position
    # (occupied + leading virtuals are contiguous from 0 under RKS/ROKS
    # aufbau occupation, so position == PySCF index). Task 6 writes basis.json
    # from these rows; this pins the precondition that makes that valid.
    mol, mf = scf('ch4')
    table = orbital_table(mol, mf)
    assert [r['index'] for r in table] == list(range(len(table)))
