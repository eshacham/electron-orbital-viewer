import numpy as np
import pytest
from pyscf import gto

from basis_export import evaluate_aos, export_shells, check_against_pyscf


@pytest.mark.parametrize('atoms', [[('N', (0, 0, -1.04)), ('N', (0, 0, 1.04))],
                                   [('H', (0, 0, -0.87)), ('F', (0, 0, 0.87))]])
def test_exported_shells_reproduce_pyscf_aos(atoms):
    mol = gto.M(atom=atoms, unit='Bohr', basis='def2-tzvp', verbose=0)
    shells = export_shells(mol)
    assert sum(2 * s['l'] + 1 for s in shells) == mol.nao
    assert max(s['l'] for s in shells) == 3 if atoms[0][0] == 'N' else True
    points = np.random.default_rng(7).uniform(-3, 3, size=(300, 3))
    ours = evaluate_aos(shells, [list(map(float, p)) for p in mol.atom_coords()], points)
    theirs = mol.eval_gto('GTOval_sph', points)
    assert np.max(np.abs(ours - theirs)) < 1e-10 * max(1.0, np.max(np.abs(theirs)))
    check_against_pyscf(mol, shells)


def test_refuses_cartesian_basis():
    mol = gto.M(atom='N 0 0 0; N 0 0 2.07', unit='Bohr', basis='def2-tzvp', cart=True, verbose=0)
    with pytest.raises(ValueError, match='spherical'):
        export_shells(mol)
