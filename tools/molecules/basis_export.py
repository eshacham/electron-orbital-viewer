"""PySCF's spherical AOs, written out so src/molecules/gaussian_basis.ts can
rebuild them exactly. SOLID_HARMONICS here and in the TS file must match
line for line (see the plan's Design decisions)."""
import numpy as np
from pyscf import gto

CONVENTION = ('pyscf-sph: AO = [sum_k c_k exp(-a_k r^2)] * S_lm(x,y,z), S_lm real solid harmonics '
              'normalised on the unit sphere; p order x,y,z; l>=2 order m=-l..l')


def solid_harmonics(l, x, y, z):
    if l == 0:
        return [0.28209479177387814 * np.ones_like(x)]
    if l == 1:
        c = 0.4886025119029199
        return [c * x, c * y, c * z]
    if l == 2:
        return [1.0925484305920792 * x * y, 1.0925484305920792 * y * z,
                0.31539156525252005 * (2 * z * z - x * x - y * y),
                1.0925484305920792 * x * z, 0.5462742152960396 * (x * x - y * y)]
    if l == 3:
        return [0.5900435899266435 * y * (3 * x * x - y * y), 2.890611442640554 * x * y * z,
                0.4570457994644658 * y * (4 * z * z - x * x - y * y),
                0.3731763325901154 * z * (2 * z * z - 3 * x * x - 3 * y * y),
                0.4570457994644658 * x * (4 * z * z - x * x - y * y),
                1.445305721320277 * z * (x * x - y * y), 0.5900435899266435 * x * (x * x - 3 * y * y)]
    raise ValueError(f'l = {l}: the diatomics in def2-TZVP need nothing beyond f')


def export_shells(mol):
    if mol.cart:
        raise ValueError('export expects spherical AOs (mol.cart = False)')
    shells = []
    for ib in range(mol.nbas):
        l = mol.bas_angular(ib)
        exponents = mol.bas_exp(ib)
        # libcint's coefficients: contraction x primitive normalisation.
        coefficients = mol.bas_ctr_coeff(ib) * gto.gto_norm(l, exponents)[:, None]
        for column in range(coefficients.shape[1]):   # general contractions: one shell per column
            shells.append({'atom': int(mol.bas_atom(ib)), 'l': int(l),
                           'exponents': [float(a) for a in exponents],
                           'coefficients': [float(c) for c in coefficients[:, column]]})
    return shells


def evaluate_aos(shells, atoms, points):
    points = np.asarray(points, dtype=float)
    columns = []
    for shell in shells:
        d = points - np.asarray(atoms[shell['atom']])
        r2 = np.einsum('ij,ij->i', d, d)
        radial = sum(c * np.exp(-a * r2) for a, c in zip(shell['exponents'], shell['coefficients']))
        columns.extend(radial * angular for angular in solid_harmonics(shell['l'], d[:, 0], d[:, 1], d[:, 2]))
    return np.stack(columns, axis=1)


def check_against_pyscf(mol, shells):
    points = np.random.default_rng(11).uniform(-4, 4, size=(200, 3))
    atoms = [list(map(float, p)) for p in mol.atom_coords()]
    theirs = mol.eval_gto('GTOval_sph', points)
    error = np.max(np.abs(evaluate_aos(shells, atoms, points) - theirs))
    if error > 1e-10 * max(1.0, np.max(np.abs(theirs))):
        raise AssertionError(f'exported basis differs from PySCF by {error:.3e}')
