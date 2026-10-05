"""
B3LYP/def2-TZVP geometries for the library's seven optimised molecules.

Resumable by design: each run takes at most `maxsteps` geomeTRIC steps from
wherever the last run stopped, and writes what it reached to
geometries/<id>.xyz with its convergence in the comment line. A first pass
at def2-SVP from the catalogue's start is much cheaper; the def2-TZVP passes
then start near the minimum. Only a converged def2-TZVP geometry is ever
used (geometry_for).

    tools/molecules/.venv/bin/python tools/molecules/optimise.py glycine --basis def2-SVP   # repeat until converged
    tools/molecules/.venv/bin/python tools/molecules/optimise.py glycine                    # repeat until converged
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from library import LibraryMolecule, by_id

GEOMETRY_DIR = Path(__file__).parent / 'geometries'
GRADIENT_TOLERANCE = 4.5e-4   # Ha/bohr, geomeTRIC's default gmax
FINAL_BASIS = 'def2-TZVP'


def write_xyz(path, atoms, comment):
    lines = [str(len(atoms)), comment] + [f'{s} {x:.8f} {y:.8f} {z:.8f}' for s, (x, y, z) in atoms]
    Path(path).write_text('\n'.join(lines) + '\n')


def read_xyz(path):
    lines = Path(path).read_text().splitlines()
    count = int(lines[0])
    atoms = []
    for line in lines[2:2 + count]:
        symbol, x, y, z = line.split()
        atoms.append((symbol, (float(x), float(y), float(z))))
    return atoms, lines[1]


def _comment_fields(comment):
    return dict(part.split('=', 1) for part in comment.split())


def make_dft(mol, xc='B3LYP'):
    from pyscf import dft
    mf = dft.RKS(mol) if mol.spin == 0 else dft.ROKS(mol)
    mf.xc = xc
    mf.grids.level = 4
    mf.conv_tol = 1e-10
    return mf


def optimise_steps(entry: LibraryMolecule, maxsteps=4, basis=FINAL_BASIS, xc='B3LYP'):
    from pyscf import gto
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel

    GEOMETRY_DIR.mkdir(parents=True, exist_ok=True)
    path = GEOMETRY_DIR / f'{entry.id}.xyz'
    start = read_xyz(path)[0] if path.exists() else (entry.zmatrix or list(entry.atoms))
    mol = gto.M(atom=start, unit='Angstrom', basis=basis, spin=entry.spin, verbose=0)
    converged, mol_eq = geometric_kernel(make_dft(mol, xc), maxsteps=maxsteps)
    mf = make_dft(mol_eq, xc)
    mf.kernel()
    gmax = float(np.abs(mf.nuc_grad_method().kernel()).max())
    coords = mol_eq.atom_coords(unit='Angstrom')
    atoms = [(mol_eq.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(mol_eq.natm)]
    done = bool(converged) and gmax < GRADIENT_TOLERANCE
    write_xyz(path, atoms, f'converged={str(done).lower()} maxGradient={gmax:.3e} method={xc}/{basis}')
    return {'converged': done, 'maxGradient': gmax, 'basis': basis}


def geometry_for(entry: LibraryMolecule):
    if not entry.optimised:
        return list(entry.atoms), {}
    path = GEOMETRY_DIR / f'{entry.id}.xyz'
    if not path.exists():
        raise FileNotFoundError(f'{entry.id}: no geometry at {path}; run `tools/molecules/.venv/bin/python tools/molecules/optimise.py {entry.id}`')
    atoms, comment = read_xyz(path)
    fields = _comment_fields(comment)
    if fields.get('converged') != 'true':
        raise RuntimeError(f'{entry.id}: optimisation not converged yet (max gradient {fields.get("maxGradient")}); run optimise.py again')
    if not fields.get('method', '').endswith(FINAL_BASIS):
        raise RuntimeError(f'{entry.id}: geometry is at {fields.get("method")}, not {FINAL_BASIS}; continue at {FINAL_BASIS}')
    return atoms, {'converged': True, 'maxGradient': float(fields['maxGradient'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('id')
    parser.add_argument('--steps', type=int, default=4)
    parser.add_argument('--basis', default=FINAL_BASIS)
    args = parser.parse_args()
    print(args.id, optimise_steps(by_id(args.id), args.steps, args.basis))
