"""
Electron density on the shipped grid, as voxel averages.

A point sample cannot integrate a nuclear cusp: neon's 1s decays over 0.05 a0,
and one sample at the nucleus on a 0.2 a0 grid alone holds ~5 electrons. Each
grid value is therefore the mean of ρ over its voxel, by Gauss-Legendre
quadrature: 2³ points everywhere (exact for cubics, so smooth regions are
unchanged to O(h⁴)), 8³ near a nucleus, 16³ in the voxel holding one. Then
Σ ρ h³ is the electron count, which is what the spec's 0.5 % check asserts,
and near the 0.001 surface the values move by ~2 %, i.e. ~0.01 a0 of surface.
"""
import numpy as np


def total_dm(mf):
    dm = mf.make_rdm1()
    return dm[0] + dm[1] if np.ndim(dm) == 3 else dm


def eval_density(mol, dm, coords, chunk=100_000):
    from pyscf.dft import numint
    coords = np.asarray(coords, dtype=float)
    out = np.empty(len(coords))
    for start in range(0, len(coords), chunk):
        ao = numint.eval_ao(mol, coords[start:start + chunk])
        out[start:start + chunk] = numint.eval_rho(mol, ao, dm)
    return out


def _voxel_rule(n, h):
    nodes, weights = np.polynomial.legendre.leggauss(n)
    offsets = np.stack(np.meshgrid(nodes, nodes, nodes, indexing='ij'), -1).reshape(-1, 3) * (h / 2)
    w = (weights[:, None, None] * weights[None, :, None] * weights[None, None, :]).reshape(-1) / 8.0
    return offsets, w


def voxel_averaged_density(mol, dm, grid, far=2, near=8, nucleus=16):
    centres = grid.coords()
    h = grid.spacing
    tier = np.full(len(centres), far, dtype=int)
    for Z, R in zip(mol.atom_charges(), mol.atom_coords()):
        d = np.linalg.norm(centres - R, axis=1)
        core = 0.6 if Z <= 2 else 1.2
        tier[d < core + h] = np.maximum(tier[d < core + h], near)
        tier[d < h] = np.maximum(tier[d < h], nucleus)
    rho = np.empty(len(centres))
    for n in np.unique(tier):
        idx = np.nonzero(tier == n)[0]
        offsets, w = _voxel_rule(int(n), h)
        batch = max(1, 200_000 // len(w))
        for start in range(0, len(idx), batch):
            block = idx[start:start + batch]
            points = (centres[block][:, None, :] + offsets[None, :, :]).reshape(-1, 3)
            rho[block] = eval_density(mol, dm, points).reshape(len(block), -1) @ w
    return rho.reshape(grid.shape)


def check_density(rho):
    """
    C13 (preflight D25): a density grid should never carry a value further
    below zero than numerical noise explains. Call this before compaction —
    compaction would otherwise silently flush a genuine negative artefact to
    0 along with real noise, hiding a bug the spec wants surfaced (§3.5
    "failures are shown, not hidden").
    """
    rho = np.asarray(rho)
    floor = -1e-6 * rho.max()
    if rho.min() < floor:
        raise ValueError(f'density has a value {rho.min():.3e} below the noise floor {floor:.3e}')
