import pytest
from pyscf import dft, gto

from labels import bond_order, irrep_to_lambda, label_orbitals, select_orbitals


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
    labels = label_orbitals(mol, mf.mo_coeff, mf.mo_energy, homonuclear=True)
    kept = select_orbitals(mol, mf.mo_coeff, mf.mo_occ)
    occupied = sorted(labels[i] for i in kept if mf.mo_occ[i] > 0)
    virtual = sorted(labels[i] for i in kept if mf.mo_occ[i] == 0)
    assert occupied == sorted(['1σg', '1σu*', '2σg', '2σu*', '1πu', '1πu', '3σg'])
    assert virtual == sorted(['1πg*', '1πg*', '3σu*'])
    assert bond_order([labels[i] for i in kept], [mf.mo_occ[i] for i in kept], True) == 3
