"""The two levels of theory the generator runs, and nothing else: reference
energies (CCSD(T), or full CI where the electron count allows) for the
potential curve and the separated atoms, and Kohn-Sham orbitals for the
pictures.

Every reference calculation is described by a settings dict (molecule or
atom, method, basis, geometry, reference determinant, pinned occupations,
frozen core, thresholds, PySCF version) before it runs. The generator caches
results under that dict, so any change to how a number would be computed
misses the cache instead of reusing a stale value (ruling T4-b)."""
import numpy as np
import pyscf
from pyscf import cc, dft, fci, gto, scf

from molecules import ATOM_GROUND_STATES, DOOH_TO_D2H, IRREP_NELEC_DOOH

REFERENCE_BASIS = 'aug-cc-pvtz'
ORBITAL_BASIS = 'def2-tzvp'
XC = 'b3lyp'   # PySCF >= 2.3: the VWN-RPA variant, as in Gaussian
THRESHOLDS = {'scf': 1e-10, 'ccsd': 1e-9, 'fci': 1e-10}


def build_mol(d, r_bohr, basis, *, spin=None, symmetry=True):
    return gto.M(atom=[(d.elements[0], (0.0, 0.0, -r_bohr / 2)), (d.elements[1], (0.0, 0.0, r_bohr / 2))],
                 unit='Bohr', basis=basis, spin=d.spin if spin is None else spin, symmetry=symmetry, verbose=0)


def pinned_occupations(d, mol):
    """irrep_nelec for the open shells (molecules.IRREP_NELEC_DOOH), in the
    irrep names of whichever group PySCF chose; a restricted calculation takes
    the per-irrep total rather than (alpha, beta)."""
    table = IRREP_NELEC_DOOH.get(d.id)
    if table is None or not mol.symmetry:
        return None
    if mol.groupname == 'Dooh':
        names = {k: k for k in table}
    elif mol.groupname == 'D2h':
        names = DOOH_TO_D2H
    else:
        raise ValueError(f'{d.id}: pinned occupations need Dooh or D2h, PySCF chose {mol.groupname}')
    return {names[k]: (v if mol.spin else sum(v)) for k, v in table.items()}


def run_scf(mf, pinned):
    if pinned:
        mf.irrep_nelec = pinned
    mf.conv_tol = THRESHOLDS['scf']
    mf.kernel()
    if not mf.converged:
        raise RuntimeError(f'{type(mf).__name__} did not converge')
    return mf


def frozen_core(mol):
    """1s on every atom past helium: aug-cc-pVTZ has no core-correlating
    functions, so correlating those electrons would add basis error, not
    accuracy."""
    return sum(1 for i in range(mol.natm) if mol.atom_charge(i) > 2)


def correlated_electrons(mol):
    return mol.nelectron - 2 * frozen_core(mol)


def is_exact(d, r_bohr):
    """Full CI, or CCSD with only two correlated electrons (Li₂ with its 1s
    frozen), which is full CI in the frozen-core space: no approximation for
    the single-reference guards to police, so the whole scan is kept."""
    return d.energy_method == 'fci' or correlated_electrons(build_mol(d, r_bohr, REFERENCE_BASIS)) <= 2


def _settings(kind, label, mol, method, pinned):
    return {'kind': kind, 'id': label, 'atoms': [(mol.atom_symbol(i), [float(x) for x in mol.atom_coord(i)])
                                                 for i in range(mol.natm)],
            'method': method, 'basis': REFERENCE_BASIS, 'spin': mol.spin,
            'reference': 'UHF' if mol.spin else 'RHF', 'symmetry': mol.groupname if mol.symmetry else None,
            'pinned': sorted((k, v) for k, v in pinned.items()) if pinned else None,
            'frozen': frozen_core(mol) if method == 'ccsd(t)' else 0,
            'thresholds': THRESHOLDS, 'pyscf': pyscf.__version__}


def reference_setup(d, r_bohr, *, spin=None, symmetry=True):
    """(mol, pinned occupations, settings) for one point of d's potential
    curve; `spin`/`symmetry` override only for the O₂ spin check."""
    mol = build_mol(d, r_bohr, REFERENCE_BASIS, spin=spin, symmetry=symmetry)
    pinned = pinned_occupations(d, mol) if spin is None else None
    settings = _settings('molecule', d.id, mol, d.energy_method, pinned)
    settings['RBohr'] = repr(float(r_bohr))
    return mol, pinned, settings


def atom_setup(element, method):
    """The free atom at its ground spin (molecules.ATOM_GROUND_STATES), no
    symmetry: UHF may then break spatial symmetry for a P state, which only
    lowers its energy, as the molecule's own UHF/RHF is free to."""
    spin, _ = ATOM_GROUND_STATES[element]
    mol = gto.M(atom=[(element, (0.0, 0.0, 0.0))], basis=REFERENCE_BASIS, spin=spin, verbose=0)
    return mol, None, _settings('atom', element, mol, method, None)


def t1_diagnostic(coupled):
    """Lee & Taylor's T1 = |t1| / sqrt(N_corr). PySCF's RCCSD has it; for
    UCCSD the α and β spin-orbital amplitudes give sqrt((|t1α|² + |t1β|²) /
    (2 N_corr)), which reduces to the restricted value for a closed shell."""
    if isinstance(coupled.t1, tuple):
        ta, tb = coupled.t1
        n_corr = ta.shape[0] + tb.shape[0]
        return float(np.sqrt((np.sum(ta ** 2) + np.sum(tb ** 2)) / (2 * n_corr)))
    return float(coupled.get_t1_diagnostic())


def solve(mol, pinned, settings):
    """Run what settings describe. Returns {'energyHartree', 'converged',
    't1Diagnostic', 'failure'}: a calculation that fails is a result (the
    generator's validity range needs to know where), never an exception."""
    def failed(why):
        return {'energyHartree': None, 'converged': False, 't1Diagnostic': None, 'failure': why}

    mf = scf.UHF(mol) if settings['reference'] == 'UHF' else scf.RHF(mol)
    try:
        run_scf(mf, pinned)
    except RuntimeError as error:
        return failed(str(error))
    if mol.nelectron - 2 * settings['frozen'] <= 1:
        # One correlated electron (H, or Li with its 1s frozen): the SCF
        # determinant is already exact, and CCSD has nothing to correlate.
        return {'energyHartree': float(mf.e_tot), 'converged': True, 't1Diagnostic': None, 'failure': None}
    if settings['method'] == 'fci':
        solver = fci.FCI(mf)
        solver.conv_tol = THRESHOLDS['fci']
        energy, _ = solver.kernel()
        if not solver.converged:
            return failed('full CI did not converge')
        return {'energyHartree': float(energy), 'converged': True, 't1Diagnostic': None, 'failure': None}
    coupled = cc.CCSD(mf, frozen=settings['frozen'])
    coupled.conv_tol = THRESHOLDS['ccsd']
    coupled.kernel()
    if not coupled.converged:
        return failed('CCSD did not converge')
    return {'energyHartree': float(coupled.e_tot + coupled.ccsd_t()), 'converged': True,
            't1Diagnostic': t1_diagnostic(coupled), 'failure': None}


def reference_energy(d, r_bohr, *, spin=None, symmetry=True):
    """One point of the potential curve: full CI for H₂ and He₂ (two and four
    electrons, exact within aug-cc-pVTZ), CCSD(T) with a frozen core otherwise
    -- UCCSD(T) on a UHF reference for the open shells. A result dict (see
    solve)."""
    return solve(*reference_setup(d, r_bohr, spin=spin, symmetry=symmetry))


def atom_energy(element, method):
    """A free atom at the molecule's method and basis, so D_e = E(A) + E(B) −
    E(AB, R_e) compares like with like (no counterpoise correction)."""
    result = solve(*atom_setup(element, method))
    if not result['converged']:
        raise RuntimeError(f'{element} atom ({method}): {result["failure"]}')
    return result


def kohn_sham(d, r_bohr):
    mol = build_mol(d, r_bohr, ORBITAL_BASIS)
    mf = dft.UKS(mol) if mol.spin else dft.RKS(mol)
    mf.xc = XC
    try:
        return mol, run_scf(mf, pinned_occupations(d, mol))
    except RuntimeError as error:
        raise RuntimeError(f'{d.id} at R = {r_bohr:.4f} bohr: {error}') from None
