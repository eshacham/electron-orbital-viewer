import re

import pytest
from pyscf import dft, gto

from labels import bond_order, irrep_to_lambda, label_orbitals, select_orbitals
from molecules import ANGSTROM_TO_BOHR, DIATOMICS, IRREP_NELEC_DOOH

_BY_ID = {d.id: d for d in DIATOMICS}


@pytest.mark.parametrize('group,irrep,expected', [
    ('Dooh', 'A1g', ('σ', 'g')), ('Dooh', 'A1u', ('σ', 'u')), ('Dooh', 'E1ux', ('π', 'u')),
    ('Dooh', 'E1gy', ('π', 'g')), ('Coov', 'A1', ('σ', '')), ('Coov', 'E1x', ('π', '')),
    ('D2h', 'B3u', ('π', 'u')), ('D2h', 'B1u', ('σ', 'u')), ('C2v', 'B2', ('π', '')),
])
def test_irrep_to_lambda(group, irrep, expected):
    assert irrep_to_lambda(group, irrep) == expected


def test_unknown_irrep_is_loud():
    with pytest.raises(ValueError, match='No σ/π/δ label'):
        irrep_to_lambda('C3v', 'A1')


def test_bond_order_counts_bonding_minus_antibonding():
    assert bond_order(['1σg', '1σu*'], [2, 2], True) == 0
    assert bond_order(['1σg', '1σu*', '1πu', '1πu'], [2, 2, 2, 2], True) == 2
    assert bond_order(['1σ', '2σ'], [2, 2], False) is None


def test_nitrogen_orbitals_labels_and_kept_virtuals():
    mol = gto.M(atom='N 0 0 -1.0372; N 0 0 1.0372', unit='Bohr', basis='def2-tzvp', symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc = 'b3lyp'
    mf.kernel()
    kept = select_orbitals(mol, mf.mo_coeff, mf.mo_occ)
    labels = label_orbitals(mol, mf.mo_coeff, mf.mo_energy, kept, homonuclear=True)
    occupied = sorted(labels[i] for i in kept if mf.mo_occ[i] > 0)
    virtual = sorted(labels[i] for i in kept if mf.mo_occ[i] == 0)
    assert occupied == sorted(['1σg', '1σu*', '2σg', '2σu*', '1πu', '1πu', '3σg'])
    assert virtual == sorted(['1πg*', '1πg*', '3σu*'])
    assert bond_order([labels[i] for i in kept], [mf.mo_occ[i] for i in kept], True) == 3


# --- Fix round 1 (I1): label_orbitals numbers only within `kept`, so it can
# never disagree with select_orbitals about which orbital is "real" -- no
# more '0...' placeholder labels landing on an orbital that was in fact kept,
# and no more alpha/beta UKS channels disagreeing about one. ---

def _bohr_separation(molecule_id, factor):
    return _BY_ID[molecule_id].r_ref_angstrom * factor * ANGSTROM_TO_BOHR


def _assert_every_kept_orbital_is_numbered(labels, kept):
    kept_set = set(kept)
    for i, label in enumerate(labels):
        if i in kept_set:
            assert label is not None, f'kept orbital {i} has no label'
            number = re.match(r'\d+', label)
            assert number and int(number.group()) >= 1, f'kept orbital {i} labelled {label!r}'
        else:
            assert label is None, f'unkept orbital {i} unexpectedly labelled {label!r}'


def _b2_uks(factor):
    r = _bohr_separation('b2', factor)
    mol = gto.M(atom=f'B 0 0 {-r / 2}; B 0 0 {r / 2}', unit='Bohr', basis='def2-tzvp',
                spin=2, symmetry=True, verbose=0)
    mf = dft.UKS(mol)
    mf.xc = 'b3lyp'
    mf.irrep_nelec = IRREP_NELEC_DOOH['b2']
    mf.kernel()
    return mol, mf


@pytest.mark.parametrize('factor', [0.80, 0.88])
def test_b2_kept_orbitals_are_always_numbered(factor):
    """Both factors reproduce the fix-round review's B2 probes (f=0.80, 0.88),
    where the deleted MINAO floor used to give the kept sigma_u* orbital a
    '0sigma_u*' label in at least one spin channel."""
    mol, mf = _b2_uks(factor)
    for coeff, energy, occ in zip(mf.mo_coeff, mf.mo_energy, mf.mo_occ):
        kept = select_orbitals(mol, coeff, occ)
        labels = label_orbitals(mol, coeff, energy, kept, homonuclear=True)
        _assert_every_kept_orbital_is_numbered(labels, kept)


def test_b2_alpha_and_beta_kept_labels_agree():
    """Alpha and beta see the same molecule and the same MINAO capacity, so
    even though B2's open triplet shell occupies pi_u in alpha only, both
    channels keep the same total count of orbitals per irrep -- the set of
    labels (ignoring which channel calls a given orbital occupied or virtual)
    must agree."""
    mol, mf = _b2_uks(0.88)
    coeff_a, coeff_b = mf.mo_coeff
    energy_a, energy_b = mf.mo_energy
    occ_a, occ_b = mf.mo_occ
    kept_a = select_orbitals(mol, coeff_a, occ_a)
    kept_b = select_orbitals(mol, coeff_b, occ_b)
    labels_a = label_orbitals(mol, coeff_a, energy_a, kept_a, homonuclear=True)
    labels_b = label_orbitals(mol, coeff_b, energy_b, kept_b, homonuclear=True)
    _assert_every_kept_orbital_is_numbered(labels_a, kept_a)
    _assert_every_kept_orbital_is_numbered(labels_b, kept_b)
    assert sorted(labels_a[i] for i in kept_a) == sorted(labels_b[i] for i in kept_b)
    assert '3σu*' in (labels_a[i] for i in kept_a)
    assert '3σu*' in (labels_b[i] for i in kept_b)


def test_co_kept_orbitals_are_always_numbered():
    """Reproduces the fix-round review's CO f=0.80 probe, where numbering used
    to land '0sigma' then jump to '6sigma' from MO index 5."""
    r = _bohr_separation('co', 0.80)
    mol = gto.M(atom=f'C 0 0 {-r / 2}; O 0 0 {r / 2}', unit='Bohr', basis='def2-tzvp',
                symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc = 'b3lyp'
    mf.kernel()
    kept = select_orbitals(mol, mf.mo_coeff, mf.mo_occ)
    labels = label_orbitals(mol, mf.mo_coeff, mf.mo_energy, kept, homonuclear=False)
    _assert_every_kept_orbital_is_numbered(labels, kept)


def test_n2_kept_virtual_labels_stable_across_the_scan():
    """Where selection is stable (N2 is not one of the near-tie geometries the
    fix-round review flagged for Task 4), the same physical orbital keeps the
    same label at a nearby scan point."""
    virtuals_by_factor = {}
    for factor in (0.90, 1.00):
        r = _bohr_separation('n2', factor)
        mol = gto.M(atom=f'N 0 0 {-r / 2}; N 0 0 {r / 2}', unit='Bohr', basis='def2-tzvp',
                    symmetry=True, verbose=0)
        mf = dft.RKS(mol)
        mf.xc = 'b3lyp'
        mf.kernel()
        kept = select_orbitals(mol, mf.mo_coeff, mf.mo_occ)
        labels = label_orbitals(mol, mf.mo_coeff, mf.mo_energy, kept, homonuclear=True)
        virtuals_by_factor[factor] = sorted(labels[i] for i in kept if mf.mo_occ[i] == 0)
    assert virtuals_by_factor[0.90] == virtuals_by_factor[1.00] == sorted(['1πg*', '1πg*', '3σu*'])
