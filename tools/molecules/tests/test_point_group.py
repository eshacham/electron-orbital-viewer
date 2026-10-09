"""Full point-group orbital labels (Phase 6D spec §3), on the library's own geometries at def2-SVP:
textbook labels for the eight molecules PySCF labelled in a subgroup, plus water, N2 and CO2. BF3 and SF6
are also labelled at def2-TZVPD, the production basis, where their fluorine 1s combinations lie closer
than SET_TOL and must be split (Ruling D1)."""
import os
import re

import numpy as np
import pytest
from pyscf import dft, gto

import point_group
from library import by_id
from point_group import (TABLES, UNLABELLED, label_orbitals, match_irrep, number_labels, reduce_characters,
                         split_set)


def scf(atoms, basis='def2-SVP'):
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc, mf.grids.level, mf.conv_tol = 'B3LYP', 4, 1e-10
    mf.kernel()
    return mol, mf


def occupied_labels(atoms, virtuals=0, basis='def2-SVP'):
    mol, mf = scf(atoms, basis)
    kept = [i for i in range(len(mf.mo_occ)) if mf.mo_occ[i] > 0]
    kept += list(range(len(kept), len(kept) + virtuals))
    labels, symmetry, notes = label_orbitals(mol, mf, kept)
    return [labels[i] for i in kept], symmetry, notes


TEXTBOOK = {
    'ch4': ('Td', ['1a1', '2a1', '1t2', '1t2', '1t2']),
    'sih4': ('Td', ['1a1', '2a1', '1t2', '1t2', '1t2', '3a1', '2t2', '2t2', '2t2']),
    'nh3': ('C3v', ['1a1', '2a1', '1e', '1e', '3a1']),
    'ph3': ('C3v', ['1a1', '2a1', '1e', '1e', '3a1', '4a1', '2e', '2e', '5a1']),
    'c2h6': ('D3d', ['1a1g', '1a2u', '2a1g', '2a2u', '1eu', '1eu', '3a1g', '1eg', '1eg']),
    'bf3': ('D3h', ["1e'", "1e'", "1a1'", "2a1'", "3a1'", "2e'", "2e'", "4a1'", "3e'", "3e'", '1a2"',
                    "4e'", "4e'", '1e"', '1e"', "1a2'"]),
    'benzene': ('D6h', ['1a1g', '1e1u', '1e1u', '1e2g', '1e2g', '1b1u', '2a1g', '2e1u', '2e1u', '2e2g', '2e2g',
                        '3a1g', '2b1u', '1b2u', '3e1u', '3e1u', '1a2u', '3e2g', '3e2g', '1e1g', '1e1g']),
    'h2o': ('C2v', ['1a1', '2a1', '1b2', '3a1', '1b1']),
}


@pytest.mark.parametrize('molecule_id', sorted(TEXTBOOK))
def test_occupied_orbitals_carry_their_textbook_labels(molecule_id):
    group, expected = TEXTBOOK[molecule_id]
    labels, symmetry, notes = occupied_labels(list(by_id(molecule_id).atoms))
    assert labels == expected and notes == {}
    assert symmetry == {'pointGroup': group, 'labelGroup': group, 'labels': 'full-group'}


def test_benzene_lumo_is_1e2u():
    labels, _, _ = occupied_labels(list(by_id('benzene').atoms), virtuals=2)
    assert labels[-4:] == ['1e1g', '1e1g', '1e2u', '1e2u']


def test_sf6_homo_is_1t1g_and_its_occupied_irreps_add_up():
    labels, symmetry, _ = occupied_labels(list(by_id('sf6').atoms))
    assert symmetry['labelGroup'] == 'Oh' and labels[-3:] == ['1t1g'] * 3
    irreps = [re.sub(r'^\d+', '', label) for label in labels]
    counts = {irrep: irreps.count(irrep) for irrep in set(irreps)}
    assert counts == {'a1g': 5, 't1u': 15, 'eg': 6, 't2g': 3, 't2u': 3, 't1g': 3}      # 35 MOs, 70 electrons


def test_bf3_at_def2_tzvpd_keeps_textbook_numbering():
    # Ruling D1: the three F 1s combinations lie within ~5e-6 Ha, chain into one set and, a1' and e' being
    # mixed in them, carry no single irrep. They read as one combined label counting both, so the B 1s is
    # still 2a1' and every later number matches def2-SVP's.
    labels, symmetry, notes = occupied_labels(list(by_id('bf3').atoms), basis='def2-TZVPD')
    # How much a1' and e' mix inside that near-degenerate set swings with conv_tol and the BLAS build
    # (about 7 % at 1e-10 here, about 1 % at 1e-9), so the Linux image may split it cleanly instead.
    # Either outcome is honest; what must hold is the numbering from the B 1s on.
    assert labels[3:] == TEXTBOOK['bf3'][1][3:]
    assert symmetry == {'pointGroup': 'D3h', 'labelGroup': 'D3h', 'labels': 'full-group'}
    if labels[:3] == ["1a1'+1e'"] * 3:
        assert set(notes) == {0, 1, 2} and notes[0] == notes[1] == notes[2]
        assert "near-degenerate combinations of a1' and e'" in notes[0] and 'mixed in these orbitals' in notes[0]
    else:
        assert sorted(labels[:3]) == sorted(["1a1'", "1e'", "1e'"])


SF6_TZVPD = (['1a1g'] + ['1t1u'] * 3 + ['1eg'] * 2 + ['2a1g', '3a1g'] + ['2t1u'] * 3 + ['4a1g'] + ['3t1u'] * 3
             + ['2eg'] * 2 + ['5a1g'] + ['4t1u'] * 3 + ['1t2g'] * 3 + ['3eg'] * 2 + ['5t1u'] * 3 + ['1t2u'] * 3
             + ['1t1g'] * 3)


@pytest.mark.skipif(not os.environ.get('MOLECULES_SLOW'), reason='SF6 at def2-TZVPD: an SCF of ~3 min')
def test_sf6_at_def2_tzvpd_splits_its_fluorine_core_set():
    # Ruling D1: the six F 1s combinations chain into one set; split at its internal gaps they label
    # exactly (t1u, eg, a1g), so the S 2s is 3a1g and the S 2p 2t1u, as textbooks number them.
    labels, symmetry, notes = occupied_labels(list(by_id('sf6').atoms), basis='def2-TZVPD')
    assert labels == SF6_TZVPD and notes == {}
    assert symmetry == {'pointGroup': 'Oh', 'labelGroup': 'Oh', 'labels': 'full-group'}


def test_split_set_cuts_at_the_largest_internal_gaps_first():
    energies = np.array([-10.0, -10.0 + 4e-6, -10.0 + 4e-6 + 1e-12, -10.0 + 6e-6, -10.0 + 6e-6 + 1e-12])
    members = [0, 1, 2, 3, 4]
    assert split_set(energies, members, 0) == [members]
    assert split_set(energies, members, 1) == [[0], [1, 2, 3, 4]]
    assert split_set(energies, members, 2) == [[0], [1, 2], [3, 4]]


def test_reduce_characters_finds_whole_irreps_or_none():
    assert reduce_characters('D3h', np.array([3.0, 0.0, 1.0, 3.0, 0.0, 1.0]), 3) == {"A1'": 1, "E'": 1}
    assert reduce_characters('D3h', np.array([2.0, 0.893, 0.0, 2.0, 0.893, 0.0]), 2) is None
    assert reduce_characters('Oh', np.array([6, 0, 0, 2, 2, 0, 0, 0, 4, 2], dtype=float), 6) == \
        {'A1g': 1, 'Eg': 1, 'T1u': 1}
    assert reduce_characters('D3h', np.array([3.0, 0.0, 1.0, 3.0, 0.0, 1.0]), 4) is None


def test_linear_molecules_read_sigma_pi_delta():
    labels, symmetry, _ = occupied_labels('N 0 0 -0.5488; N 0 0 0.5488')
    assert labels == ['1σg', '1σu', '2σg', '2σu', '1πu', '1πu', '3σg'] and symmetry['labelGroup'] == 'Dooh'
    labels, _, _ = occupied_labels(list(by_id('co2').atoms))
    assert labels[-2:] == ['1πg', '1πg'] and all(re.fullmatch(r'\d+[σπδ][gu]', label) for label in labels)


def test_a_degenerate_set_shares_one_label():
    mol, mf = scf(list(by_id('ch4').atoms))
    labels, _, _ = label_orbitals(mol, mf, [0, 1, 2, 3, 4])
    assert labels[2] == labels[3] == labels[4] == '1t2'


def test_a_partial_degenerate_set_is_left_unlabelled_not_mislabelled():
    # Review Focus 1: two of methane's three t2 orbitals carry characters no irrep of Td owns.
    mol, mf = scf(list(by_id('ch4').atoms))
    labels, symmetry, notes = label_orbitals(mol, mf, [0, 1, 2, 3])
    assert [labels[i] for i in range(4)] == ['1a1', '2a1', UNLABELLED, UNLABELLED]
    assert set(notes) == {2, 3} and notes[2] == notes[3] and 'match no single irrep of Td' in notes[2]
    assert symmetry['labels'] == 'full-group'


def test_an_unsupported_group_keeps_the_subgroup_and_says_so():
    allene = [('C', (0, 0, 0)), ('C', (0, 0, 1.31)), ('C', (0, 0, -1.31)), ('H', (0.93, 0, 1.87)),
              ('H', (-0.93, 0, 1.87)), ('H', (0, 0.93, -1.87)), ('H', (0, -0.93, -1.87))]
    labels, symmetry, _ = occupied_labels(allene)
    assert symmetry == {'pointGroup': 'D2d', 'labelGroup': 'D2', 'labels': 'subgroup',
                        'labelNote': 'irreducible representations of D2, a subgroup of D2d: '
                                     'full-group labels are not available for D2d'}
    assert all(re.fullmatch(r'\d+(a|b1|b2|b3)', label) for label in labels)


def test_operations_not_found_fall_back_to_the_subgroup_with_a_note(monkeypatch):
    # Review Focus 2: a supported group whose operations cannot be built at this geometry.
    def refuse(*args, **kwargs):
        raise point_group.SymmetryNotFound('no C3 axis')
    monkeypatch.setattr(point_group, 'class_operations', refuse)
    labels, symmetry, _ = occupied_labels(list(by_id('ch4').atoms))
    assert symmetry['labels'] == 'subgroup' and symmetry['labelGroup'] == 'D2'
    assert symmetry['labelNote'] == ('irreducible representations of D2, a subgroup of Td: the Td symmetry '
                                     'operations were not found at this geometry (no C3 axis)')
    assert labels[:2] == ['1a', '2a']


def unsymmetric_scf(atoms, basis='def2-SVP', spin=0, symmetry=False):
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=spin, symmetry=symmetry, verbose=0)
    mf = dft.RKS(mol) if spin == 0 else dft.ROKS(mol)
    mf.xc, mf.grids.level, mf.conv_tol = 'B3LYP', 4, 1e-10
    mf.kernel()
    return mol, mf


GEOMETRY_NOTE = ('the SCF ran without point-group symmetry (PySCF could not use it at this geometry): labelled '
                 "from the geometry's own point group, by character projection")


@pytest.mark.parametrize('molecule_id', ['h2o', 'ch4'])
def test_an_scf_without_symmetry_is_labelled_from_the_geometrys_own_point_group(molecule_id):
    # Controller ruling (Task 8): input.py's final SCF falls back to symmetry=False when PySCF cannot build
    # symmetry-adapted orbitals; the labels must not be lost with it. The group and its operations come from
    # the nuclei, as they do for the projection already.
    group, expected = TEXTBOOK[molecule_id]
    mol, mf = unsymmetric_scf(list(by_id(molecule_id).atoms))
    kept = [i for i in range(len(mf.mo_occ)) if mf.mo_occ[i] > 0]
    labels, symmetry, notes = label_orbitals(mol, mf, kept)
    assert [labels[i] for i in kept] == expected and notes == {}
    assert symmetry == {'pointGroup': group, 'labelGroup': group, 'labels': 'full-group', 'labelNote': GEOMETRY_NOTE}


def test_without_symmetry_a_valence_virtual_set_still_gets_its_irrep():
    mol, mf = unsymmetric_scf(list(by_id('h2o').atoms))
    homo = int(np.flatnonzero(mf.mo_occ > 0)[-1])
    assert point_group.irrep_of(mol, mf, mf.mo_coeff[:, [homo]]) == 'b1'


def test_without_symmetry_a_c1_geometry_reads_as_c1():
    mol, mf = unsymmetric_scf('H 0 0 0; H 0 0 0.74; H 0.9 0.3 1.4; H 1.1 1.2 0.2', basis='sto-3g')
    labels, symmetry, _ = label_orbitals(mol, mf, [0, 1])
    assert labels == {0: '1a', 1: '2a'} and symmetry['pointGroup'] == 'C1' and symmetry['labels'] == 'full-group'


def test_without_symmetry_a_group_the_projection_does_not_cover_keeps_psi_labels_and_says_so():
    # Allene is D2d: PySCF labels it in D2 through its symmetry-adapted orbitals, which this SCF does not
    # have, and projecting onto D2 would split each e pair into a b2+b3 sum. Unlabelled, and said.
    allene = [('C', (0, 0, 0)), ('C', (0, 0, 1.31)), ('C', (0, 0, -1.31)), ('H', (0.93, 0, 1.87)),
              ('H', (-0.93, 0, 1.87)), ('H', (0, 0.93, -1.87)), ('H', (0, -0.93, -1.87))]
    mol, mf = unsymmetric_scf(allene, basis='sto-3g')
    labels, symmetry, _ = label_orbitals(mol, mf, [0, 1])
    assert labels == {0: 'ψ1', 1: 'ψ2'}
    assert symmetry == {'pointGroup': 'D2d', 'labelGroup': None, 'labels': 'none',
                        'labelNote': 'the SCF ran without point-group symmetry (PySCF could not use it at this '
                                     'geometry), and D2d orbitals cannot be labelled without it'}
    assert point_group.irrep_of(mol, mf, mf.mo_coeff[:, [0]]) == UNLABELLED


@pytest.mark.parametrize('group', sorted(TABLES))
def test_every_character_table_is_orthonormal(group):
    classes, irreps = TABLES[group]
    sizes = np.array([size for _, size, _ in classes], dtype=float)
    order = sizes.sum()
    rows = {name: np.array(chars, dtype=float) for name, chars in irreps.items()}
    assert len(rows) == len(classes) and sum(row[0] ** 2 for row in rows.values()) == order
    for a in rows:
        for b in rows:
            assert (sizes * rows[a] * rows[b]).sum() / order == (1.0 if a == b else 0.0), (a, b)


def test_match_irrep_needs_every_character_within_tolerance_and_the_right_size():
    assert match_irrep('Td', np.array([3.0, 0.0, -1.0, -1.0, 1.0]), 3) == 'T2'
    assert match_irrep('Td', np.array([3.04, 0.04, -0.96, -1.04, 0.96]), 3) == 'T2'
    assert match_irrep('Td', np.array([3.0, 0.0, -1.0, -1.06, 1.0]), 3) is None
    assert match_irrep('Td', np.array([3.0, 0.0, -1.0, -1.0, 1.0]), 2) is None


def test_number_labels_counts_per_irrep_and_pairs_components():
    assert number_labels(['A1', 'A1', 'B2', 'A1', 'B1']) == ['1a1', '2a1', '1b2', '3a1', '1b1']
    assert number_labels(['A1g', 'E1uy', 'E1ux', 'A1g']) == ['1a1g', '1e1u', '1e1u', '2a1g']


# --- Task 8 fix round 1: linear molecules and atoms without PySCF symmetry ---------------------------

N2 = 'N 0 0 -0.5488; N 0 0 0.5488'


def both_labels(atoms, kept, basis='def2-SVP', spin=0):
    """The labels of the same molecule with PySCF's symmetry and without it."""
    out = []
    for symmetry in (True, False):
        mol, mf = unsymmetric_scf(atoms, basis, spin, symmetry)
        assert mf.converged
        labels, info, notes = label_orbitals(mol, mf, kept)
        out.append(([labels[i] for i in kept], info, notes))
    return out


def test_n2_without_symmetry_reads_sigma_pi_as_with_it():
    (on, _, _), (off, symmetry, notes) = both_labels(N2, list(range(9)))
    assert off == on and off[:7] == ['1σg', '1σu', '2σg', '2σu', '1πu', '1πu', '3σg'] and notes == {}
    assert symmetry == {'pointGroup': 'Dooh', 'labelGroup': 'Dooh', 'labels': 'full-group', 'labelNote': GEOMETRY_NOTE}


def test_co2_off_its_axis_without_symmetry_has_its_1pig_homo():
    # Laid along a tilted line, so nothing depends on PySCF's z-axis convention.
    line = np.array([1.0, 2.0, 2.0]) / 3.0
    co2 = [(s, tuple(float(v) for v in t * line)) for s, t in (('O', -1.16), ('C', 0.0), ('O', 1.16))]
    (on, _, _), (off, symmetry, _) = both_labels(co2, list(range(11)))
    assert off == on and off[-2:] == ['1πg', '1πg'] and symmetry['pointGroup'] == 'Dooh'


def test_oh_without_symmetry_reads_sigma_and_pi():
    # ROKS splits OH's 1π pair (one component doubly, one singly occupied) once symmetry no longer holds them
    # together; both components are still 1π, as with symmetry. (ROKS with symmetry on does not converge at
    # def2-SVP, so the comparison runs at STO-3G.)
    (on, _, _), (off, symmetry, notes) = both_labels('O 0 0 0; H 0 0 0.975', list(range(6)), basis='sto-3g', spin=1)
    assert off == on == ['1σ', '2σ', '3σ', '1π', '1π', '4σ'] and notes == {}
    assert symmetry['pointGroup'] == symmetry['labelGroup'] == 'Coov'
    mol, mf = unsymmetric_scf('O 0 0 0; H 0 0 0.975', spin=1)
    labels, _, _ = label_orbitals(mol, mf, list(range(7)))
    assert [labels[i] for i in range(5)] == ['1σ', '2σ', '3σ', '1π', '1π']


def test_a_linear_set_without_symmetry_gets_its_irrep():
    mol, mf = unsymmetric_scf(N2)
    assert point_group.irrep_of(mol, mf, mf.mo_coeff[:, [4, 5]]) == 'πu'
    assert point_group.irrep_of(mol, mf, mf.mo_coeff[:, [6]]) == 'σg'
    assert point_group.irrep_of(mol, mf, mf.mo_coeff[:, [5, 6]]) == UNLABELLED


def test_an_atom_without_symmetry_keeps_psi_labels_and_names_its_group():
    mol, mf = unsymmetric_scf('Ne 0 0 0', basis='sto-3g')
    labels, symmetry, _ = label_orbitals(mol, mf, [0, 1])
    assert labels == {0: 'ψ1', 1: 'ψ2'} and symmetry['pointGroup'] == 'SO3' and symmetry['labels'] == 'none'
    assert symmetry['labelNote'] == ('the SCF ran without point-group symmetry (PySCF could not use it at this '
                                     'geometry), and SO3 orbitals cannot be labelled without it')
    assert point_group.irrep_of(mol, mf, mf.mo_coeff[:, [0]]) == UNLABELLED


@pytest.mark.parametrize('atoms, spin', [(N2, 0), ('Ne 0 0 0', 0), ('O 0 0 0; H 0 0 0.975', 1)])
def test_geometry_operations_raises_symmetry_not_found_for_groups_it_cannot_project(atoms, spin):
    # Review (Task 8): as_subgroup hands back Coov, Dooh and SO3 unchanged, which PySCF's Abelian tables lack.
    mol = gto.M(atom=atoms, basis='sto-3g', spin=spin, symmetry=False, verbose=0)
    with pytest.raises(point_group.SymmetryNotFound):
        point_group.geometry_operations(mol)
