"""B3LYP-D3(BJ) on every platform this project runs on (Phase 6D spec §6).

PySCF 2.8 adds Grimme's D3 to any SCF whose xc names it ('B3LYP-D3BJ'):
the energy (scf.dispersion), the gradient (grad.dispersion) and the Hessian
(hessian.dispersion, by finite differences of the D3 gradient). It does so
through the pyscf-dispersion package, which ships Linux aarch64 wheels (1.5.0,
the worker image) but nothing that runs on Apple-silicon macOS: its one macOS
wheel (1.0.0, 'universal2') holds x86_64-only libraries and calls
numpy.ctypeslib.load_library without the path that function requires
(checked 2026-10-08). On macOS, ensure_d3() installs a stand-in module under
the same name, backed by the dftd3 package (simple-dftd3's own Python API,
which has macOS arm64 wheels): the same model -- rational (Becke-Johnson)
damping with B3LYP's parameters, two-body only, as pyscf-dispersion's
'd3bj' computes it. tests/test_dispersion.py pins both to the same energies.
The library itself is generated inside the worker image (spec §6), so its
D3 comes from pyscf-dispersion; the stand-in serves local tests and This
Mac's jobs, and says so in provenance (backend()).
"""
import sys
import types
from importlib.metadata import version

import numpy as np

XC = 'B3LYP-D3BJ'            # PySCF's xc string
LABEL = 'B3LYP-D3(BJ)'       # as the literature, and every caption, writes it
MODEL = 'D3(BJ)'
_SUFFIX = '-D3BJ'


def method_label(xc: str) -> str:
    """'B3LYP-D3BJ' -> 'B3LYP-D3(BJ)'; any other xc unchanged."""
    return xc[:-len(_SUFFIX)] + '-D3(BJ)' if xc.upper().endswith(_SUFFIX) else xc


def ensure_d3() -> None:
    """Make `pyscf.dispersion.dftd3` importable: pyscf-dispersion where it is
    installed (Linux), else the dftd3-backed stand-in. Idempotent."""
    if 'pyscf.dispersion.dftd3' in sys.modules:
        return
    try:
        import pyscf.dispersion.dftd3  # noqa: F401
        return
    except ImportError:
        pass
    try:
        from dftd3.interface import DispersionModel, RationalDampingParam
    except ImportError as e:
        raise ImportError('B3LYP-D3(BJ) needs pyscf-dispersion (Linux) or dftd3 (macOS): '
                          'uv pip sync tools/molecules/requirements.lock') from e

    class DFTD3Dispersion:
        """The part of pyscf.dispersion.dftd3.DFTD3Dispersion PySCF 2.8 calls."""

        def __init__(self, mol, xc, version='d3bj', atm=False):
            if version != 'd3bj':
                raise NotImplementedError(f'the macOS D3 stand-in computes d3bj only, not {version}')
            self._model = DispersionModel(np.asarray(mol.atom_charges(), dtype=int),
                                          np.asarray(mol.atom_coords(), dtype=float))   # bohr, as dftd3 expects
            # atm: PySCF passes None or False for 'D3BJ' (two-body); dftd3 would otherwise add the ATM term.
            self._param = RationalDampingParam(method=xc.lower(), atm=bool(atm))

        def get_dispersion(self, grad=False):
            result = self._model.get_dispersion(self._param, grad=grad)
            out = {'energy': float(result['energy'])}
            if grad:
                out['gradient'] = np.asarray(result['gradient'], dtype=float)
            return out

    dftd3_module = types.ModuleType('pyscf.dispersion.dftd3')
    dftd3_module.DFTD3Dispersion = DFTD3Dispersion
    dftd3_module.BACKEND = f'dftd3 {version("dftd3")} (macOS stand-in for pyscf-dispersion)'
    dftd4_module = types.ModuleType('pyscf.dispersion.dftd4')     # PySCF imports it beside dftd3; never used
    package = types.ModuleType('pyscf.dispersion')
    package.__path__ = []
    package.dftd3, package.dftd4 = dftd3_module, dftd4_module
    sys.modules.update({'pyscf.dispersion': package, 'pyscf.dispersion.dftd3': dftd3_module,
                        'pyscf.dispersion.dftd4': dftd4_module})
    import pyscf
    pyscf.dispersion = package


def backend() -> str:
    """Which package computes D3 here, and its version, for provenance."""
    ensure_d3()
    stand_in = getattr(sys.modules['pyscf.dispersion.dftd3'], 'BACKEND', None)
    return stand_in or f'pyscf-dispersion {version("pyscf-dispersion")}'
