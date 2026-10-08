"""B3LYP-D3(BJ) through PySCF's own hook on this platform (Phase 6D spec §6),
and the density-fitted gradient the NumPy pin restores (spec §8)."""
import sys

import numpy as np
import pytest
from pyscf import dft, gto

from dispersion import LABEL, MODEL, XC, backend, ensure_d3, method_label

WATER = 'O 0 0 0; H 0 0.757 0.587; H 0 -0.757 0.587'
METHANE = ('C 0 0 0; H 0.6276 0.6276 0.6276; H 0.6276 -0.6276 -0.6276; '
           'H -0.6276 0.6276 -0.6276; H -0.6276 -0.6276 0.6276')
# Two-body D3(BJ) energies with B3LYP's parameters (Hartree), from pyscf-dispersion 1.5.0 in the worker
# image (Linux ARM64) and the dftd3 1.6.0 stand-in on macOS: identical to every printed digit, 2026-10-08.
REFERENCE = {WATER: -0.0005738788210828446, METHANE: -0.0019136930093918568}


@pytest.mark.parametrize('atoms', [WATER, METHANE], ids=['water', 'methane'])
def test_d3bj_energy_matches_the_reference(atoms):
    ensure_d3()
    from pyscf.dispersion import dftd3
    mol = gto.M(atom=atoms, basis='sto-3g', verbose=0)
    energy = dftd3.DFTD3Dispersion(mol, xc='b3lyp', version='d3bj').get_dispersion()['energy']
    assert float(energy) == pytest.approx(REFERENCE[atoms], abs=1e-6)        # spec §12: to 1e-6 Ha
    assert float(energy) == pytest.approx(REFERENCE[atoms], abs=1e-12)       # and in fact to the last digit


def _scf(xc):
    ensure_d3()
    mf = dft.RKS(gto.M(atom=WATER, basis='def2-SVP', verbose=0))
    mf.xc, mf.grids.level, mf.conv_tol = xc, 4, 1e-10
    mf.kernel()
    return mf


def test_an_scf_named_b3lyp_d3bj_adds_exactly_the_d3_energy():
    # D3 does not touch the SCF, so the two runs' densities are the same and the totals differ by E(D3).
    plain, dispersed = _scf('B3LYP'), _scf(XC)
    assert dispersed.scf_summary['dispersion'] == pytest.approx(REFERENCE[WATER], abs=1e-9)
    assert dispersed.e_tot - plain.e_tot == pytest.approx(REFERENCE[WATER], abs=1e-8)


def test_the_gradient_carries_the_d3_gradient_and_the_hessian_runs():
    from pyscf.dispersion import dftd3
    plain, dispersed = _scf('B3LYP'), _scf(XC)
    d3 = dftd3.DFTD3Dispersion(dispersed.mol, xc='b3lyp', version='d3bj').get_dispersion(grad=True)['gradient']
    difference = dispersed.nuc_grad_method().kernel() - plain.nuc_grad_method().kernel()
    assert np.abs(difference - d3).max() < 1e-6
    hessian = dispersed.Hessian().kernel()
    assert hessian.shape == (3, 3, 3, 3) and np.isfinite(hessian).all()


def test_method_label_spells_d3bj_as_the_literature_does():
    assert method_label(XC) == LABEL == 'B3LYP-D3(BJ)' and MODEL == 'D3(BJ)'
    assert method_label('B3LYP') == 'B3LYP' and method_label('b3lyp-d3bj') == 'b3lyp-D3(BJ)'


def test_the_backend_names_its_package():
    name = backend()
    if sys.platform == 'linux':
        assert name == 'pyscf-dispersion 1.5.0'
    else:
        assert name == 'dftd3 1.6.0 (macOS stand-in for pyscf-dispersion)'


def test_numpy_is_pinned_below_2_4():
    assert tuple(int(p) for p in np.__version__.split('.')[:2]) < (2, 4)


def test_density_fitted_gradients_work_with_the_locked_numpy():
    # Scans research §4.2, pitfall 3: NumPy 2.4 changed einsum_path's contraction tuples, and PySCF 2.8.0's
    # DF gradients failed ("not enough values to unpack (expected 4, got 3)"). Phase 6B-4 needs them.
    mf = dft.RKS(gto.M(atom=WATER, basis='def2-SVP', verbose=0)).density_fit()
    mf.xc = 'B3LYP'
    mf.kernel()
    assert np.abs(mf.nuc_grad_method().kernel()).max() == pytest.approx(0.0124211, abs=1e-5)
