"""
Electrostatic potential V(r) = Σ Z_A/|r - R_A| - ∫ρ(r')/|r - r'| dr', in Ha/e.

The electronic part uses PySCF's point-charge fake molecule: three-centre
integrals (μν|1/r|C) contracted with the density matrix. Chunks of 256 points
keep that array near 100 MB even for SF6. The nuclear term is clamped at
0.05 a0 so a grid point that lands on a nucleus stays finite; ESP is only
ever read on the 0.001 surface, far from any nucleus.
"""
import numpy as np

NUCLEAR_CLAMP_BOHR = 0.05


def esp_on_points(mol, dm, coords, chunk=256):
    from pyscf import df, gto
    coords = np.asarray(coords, dtype=float)
    charges = mol.atom_charges().astype(float)
    nuclei = mol.atom_coords()
    out = np.empty(len(coords))
    for start in range(0, len(coords), chunk):
        block = coords[start:start + chunk]
        r = np.linalg.norm(block[:, None, :] - nuclei[None, :, :], axis=2)
        nuclear = (charges[None, :] / np.maximum(r, NUCLEAR_CLAMP_BOHR)).sum(axis=1)
        electronic = np.einsum('ijp,ij->p', df.incore.aux_e2(mol, gto.fakemol_for_charges(block)), dm)
        out[start:start + chunk] = nuclear - electronic
    return out


def esp_surface_range(esp, rho, lo=8e-4, hi=1.25e-3):
    """ESP extremes over the grid points lying in a thin shell around ρ = 0.001: the map's range, for validation."""
    shell = (rho > lo) & (rho < hi)
    if not shell.any():
        raise RuntimeError('no ESP grid point lies near the 0.001 surface; the ESP grid is too coarse')
    return float(esp[shell].min()), float(esp[shell].max())
