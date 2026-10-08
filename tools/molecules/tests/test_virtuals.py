"""Honest virtual orbitals (Phase 6D spec §4), at the library's property basis (def2-TZVPD) where the
diffuse functions are the point; benzene at def2-SVPD to stay quick."""
import numpy as np
import pytest
from pyscf import dft, gto

from library import by_id
from optimise import GEOMETRY_DIR, read_xyz
from orbitals import (CONSTRUCTED_NOTE, VALENCE_THRESHOLD, orbital_table, valence_character_of, valence_characters,
                      valence_virtuals)
from point_group import SET_TOL, UNLABELLED


def scf(molecule_id, basis):
    entry = by_id(molecule_id)
    # An optimised molecule's committed geometry is read directly, whatever method it was optimised with:
    # its library entry holds only the starting guess.
    atoms = read_xyz(GEOMETRY_DIR / f'{molecule_id}.xyz')[0] if entry.optimised else list(entry.atoms)
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=entry.spin, symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc, mf.grids.level, mf.conv_tol = 'B3LYP', 4, 1e-10
    mf.kernel()
    return mol, mf


def roles(table, role):
    return [r for r in table.rows if r.get('role') == role]


def assert_constructed(table, mol, label, count):
    """The LVMO is the lowest valence virtual orbital, appended after the canonical rows with its own
    coefficients, flagged and captioned as constructed (Ruling D4)."""
    lumo, lvmo = roles(table, 'LUMO'), roles(table, 'LVMO')
    assert lumo and all(r['class'] == 'diffuse' and r['valenceCharacter'] < VALENCE_THRESHOLD for r in lumo)
    assert len(lvmo) == count and lvmo == table.rows[-count:]
    s = mol.intor('int1e_ovlp')
    for k, row in enumerate(lvmo):
        position = len(table.rows) - count + k
        assert row['index'] == position and row['label'] == label and row['occupation'] == 0.0
        assert row['kind'] == 'valence-virtual' and row['class'] == 'valence'
        assert row['constructed'] is True and row['energyApproximate'] is True and row['note'] == CONSTRUCTED_NOTE
        assert row['energyHartree'] > lumo[0]['energyHartree']
        c = table.coefficients[:, position]
        assert c @ s @ c == pytest.approx(1.0, abs=1e-8)
    return lvmo


def assert_no_partial_sets(table, mf):
    """The kept virtuals end on a whole degenerate set (Task 3's carry-forward): no '?' from a set cut short."""
    assert all(r['label'] != UNLABELLED for r in table.rows), [r.get('labelNote') for r in table.rows]
    last = [r['index'] for r in table.rows if 'kind' not in r][-1]
    assert last + 1 == len(mf.mo_energy) or mf.mo_energy[last + 1] - mf.mo_energy[last] >= SET_TOL


@pytest.mark.parametrize('molecule_id', ['h2o', 'nh3', 'ch4'])
def test_a_diffuse_lumo_and_a_valence_lvmo(molecule_id):
    mol, mf = scf(molecule_id, 'def2-TZVPD')
    table = orbital_table(mol, mf)
    # No canonical virtual of these three is valence at def2-TZVPD: the LVMO is the lowest valence virtual
    # orbital, appended after the canonical rows with its own coefficients.
    [lvmo] = assert_constructed(table, mol, 'a1', 1)
    assert lvmo['valenceCharacter'] == 1.0
    assert_no_partial_sets(table, mf)


@pytest.mark.parametrize('molecule_id,label,count', [('sih4', 't2', 3), ('c2h6', 'a1g', 1), ('ch3oh', "a'", 1)])
def test_the_other_library_molecules_with_a_constructed_lvmo(molecule_id, label, count):
    # Ruling D4: seven library molecules get a constructed LVMO, not three. Silane's is a whole t2 set, and its
    # canonical 3t2 (68 % valence) stays 'diffuse'.
    mol, mf = scf(molecule_id, 'def2-TZVPD')
    table = orbital_table(mol, mf)
    assert_constructed(table, mol, label, count)
    assert_no_partial_sets(table, mf)


def test_the_constructed_rows_valence_character_is_measured_not_assumed():
    # D18: computed from the orbital itself (the singular values of the virtual-IAO overlap), not written as 1.0.
    mol, mf = scf('h2o', 'def2-TZVPD')
    table = orbital_table(mol, mf)
    measured = valence_character_of(mol, mf, table.coefficients[:, -1:])[0]
    assert table.rows[-1]['valenceCharacter'] == round(float(measured), 4)
    assert 0.9999 <= measured <= 1.0 + 1e-8


def test_benzenes_lumo_is_a_valence_pi_star_and_there_is_no_separate_lvmo():
    mol, mf = scf('benzene', 'def2-SVPD')
    table = orbital_table(mol, mf)
    lumo = roles(table, 'LUMO')
    assert [r['label'] for r in lumo] == ['1e2u', '1e2u'] and all(r['class'] == 'valence' for r in lumo)
    assert roles(table, 'LVMO') == [] and not any(r.get('kind') for r in table.rows)


def test_a_canonical_valence_virtual_is_the_lvmo_when_one_is_shipped():
    mol, mf = scf('co2', 'def2-TZVPD')
    table = orbital_table(mol, mf)
    assert [r['class'] for r in roles(table, 'LUMO')] == ['diffuse']
    lvmo = roles(table, 'LVMO')
    assert [r['label'] for r in lvmo] == ['2πu', '2πu'] and all('kind' not in r and 'constructed' not in r for r in lvmo)
    assert all(r['valenceCharacter'] > 0.9 for r in lvmo)


def test_occupied_orbitals_are_wholly_valence_and_carry_no_class():
    mol, mf = scf('h2o', 'def2-TZVPD')
    occupied = mf.mo_occ > 0
    assert np.all(valence_characters(mol, mf)[occupied] > 0.99)
    assert all('class' not in r and 'valenceCharacter' not in r for r in orbital_table(mol, mf).rows if r['occupation'] > 0)


def test_there_are_as_many_valence_virtuals_as_minimal_basis_functions_left_over():
    mol, mf = scf('ch4', 'def2-TZVPD')
    energies, coeff = valence_virtuals(mol, mf)
    assert len(energies) == 9 - 5 and np.all(np.diff(energies) >= 0)          # MINAO: C 5 + 4 H 1, 5 occupied
    s = mol.intor('int1e_ovlp')
    assert np.allclose(coeff.T @ s @ coeff, np.eye(4), atol=1e-8)
    assert np.allclose(coeff.T @ s @ mf.mo_coeff[:, mf.mo_occ > 0], 0, atol=1e-8)   # purely virtual


def test_the_kept_virtuals_never_end_partway_through_a_degenerate_set():
    # Task 3's carry-forward: "occupied + 5 virtuals" cuts methane's 2t2 set at def2-TZVPD (and ammonia's,
    # silane's, ethane's), and label_orbitals then labels the partial set '?'. Asking for a cut inside a set
    # keeps the whole set, whatever the cut.
    mol, mf = scf('ch4', 'def2-TZVPD')
    for extra in range(1, 9):
        table = orbital_table(mol, mf, extra_virtuals=extra)
        assert_no_partial_sets(table, mf)
        assert sum(1 for r in table.rows if r['occupation'] == 0 and 'kind' not in r) >= extra
