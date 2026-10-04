"""The two levels of theory the generator runs, and nothing else: reference
energies (CCSD(T), or full CI where the electron count allows) for the
potential curve, and Kohn-Sham orbitals for the pictures."""
from pyscf import cc, dft, fci, gto, scf

from molecules import DOOH_TO_D2H, IRREP_NELEC_DOOH

REFERENCE_BASIS = 'aug-cc-pvtz'
ORBITAL_BASIS = 'def2-tzvp'
XC = 'b3lyp'   # PySCF >= 2.3: the VWN-RPA variant, as in Gaussian


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
    mf.conv_tol = 1e-10
    mf.kernel()
    if not mf.converged:
        raise RuntimeError(f'{type(mf).__name__} did not converge for {mf.mol.atom}')
    return mf


def frozen_core(mol):
    """1s on every atom past helium: aug-cc-pVTZ has no core-correlating
    functions, so correlating those electrons would add basis error, not
    accuracy."""
    return sum(1 for i in range(mol.natm) if mol.atom_charge(i) > 2)


def reference_energy(d, r_bohr, *, spin=None, symmetry=True):
    """Total energy (Hartree) on the potential curve: full CI for H₂ and He₂
    (two and four electrons, exact within aug-cc-pVTZ), CCSD(T) with a frozen
    core otherwise -- UCCSD(T) on a UHF reference for the open shells."""
    mol = build_mol(d, r_bohr, REFERENCE_BASIS, spin=spin, symmetry=symmetry)
    mf = run_scf(scf.UHF(mol) if mol.spin else scf.RHF(mol), pinned_occupations(d, mol) if spin is None else None)
    if d.energy_method == 'fci':
        solver = fci.FCI(mf)
        solver.conv_tol = 1e-10
        energy, _ = solver.kernel()
        if not solver.converged:
            raise RuntimeError(f'{d.id}: full CI did not converge at R = {r_bohr:.4f} bohr')
        return float(energy)
    coupled = cc.CCSD(mf, frozen=frozen_core(mol))
    coupled.conv_tol = 1e-9
    coupled.kernel()
    if not coupled.converged:
        raise RuntimeError(f'{d.id}: CCSD did not converge at R = {r_bohr:.4f} bohr')
    return float(coupled.e_tot + coupled.ccsd_t())


def hydrogen_atom_energy():
    """Exact in this basis: one electron, so UHF is full CI."""
    mol = gto.M(atom='H 0 0 0', basis=REFERENCE_BASIS, spin=1, verbose=0)
    return float(run_scf(scf.UHF(mol), None).e_tot)


def kohn_sham(d, r_bohr):
    mol = build_mol(d, r_bohr, ORBITAL_BASIS)
    mf = dft.UKS(mol) if mol.spin else dft.RKS(mol)
    mf.xc = XC
    return mol, run_scf(mf, pinned_occupations(d, mol))
