"""
Builds the molecule library's files (spec §4.2) into version.OUT_ROOT/<id>/,
merges OUT_ROOT/index.json, and derives the validation rows the app's Methods
page shows (src/validation/generated/phase6_library.json) from the meta.json
files actually shipped.

One molecule per call keeps every run under the tool timeout:
    tools/molecules/.venv/bin/python tools/molecules/build_library.py --only h2o
    tools/molecules/.venv/bin/python tools/molecules/build_library.py --rows-only
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from basis_export import CONVENTION, check_against_pyscf, export_shells
from compact import compact_float32, write_float32_gz
from density import check_density, eval_density, total_dm, voxel_averaged_density
from esp import esp_on_points, esp_surface_range
from generate import git_commit, provenance
from grid import grid_for
from library import LIBRARY, by_id
from measure import BOHR_TO_ANGSTROM, measure
from optimise import geometry_for, make_dft
from orbitals import orbital_table
from outputs import atoms_of
from version import OUT_ROOT

REPO = Path(__file__).resolve().parents[2]
# D26/D27 (preflight controller corrections): §4.5 puts generated data under
# version.OUT_ROOT (not a committed public/ tree), and the validation summary
# next to Phase 5's, under src/validation/generated/.
ROWS = REPO / 'src' / 'validation' / 'generated' / 'phase6_library.json'
# Ruling T7-TZVPD (owner decision 2026-10-05): the library's properties
# (density, dipole, ESP, orbitals) move to B3LYP/def2-TZVPD -- the added
# diffuse functions bring every dipole but ozone's within tolerance.
# Geometry is unaffected: optimise.FINAL_BASIS stays def2-TZVP, and
# geometry_for keeps checking against it.
PROPERTY_BASIS = 'def2-TZVPD'
BUDGET_BYTES = 3_000_000
GRID_POINTS_TRIES = (96, 88, 80)
FACE_DENSITY_LIMIT = 1e-5
DENSITY_FLOOR = 1e-7
UNITS = {'deg': '°'}


class BudgetExceeded(RuntimeError):
    pass


def run_dft(atoms, spin, basis, xc):
    from pyscf import gto
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=spin, symmetry=True, verbose=0)
    mf = make_dft(mol, xc)
    mf.kernel()
    if not mf.converged:
        raise RuntimeError(f'SCF did not converge ({xc}/{basis})')
    return mol, mf


def check_box(density, limit=FACE_DENSITY_LIMIT):
    d = np.asarray(density)
    faces = max(d[0].max(), d[-1].max(), d[:, 0].max(), d[:, -1].max(), d[:, :, 0].max(), d[:, :, -1].max())
    if faces >= limit:
        raise RuntimeError(f'density {faces:.1e} at the box face: the 0.001 surface may be cut off; widen SURFACE_MARGIN_BOHR')


def _size(directory):
    return sum(f.stat().st_size for f in directory.iterdir() if f.is_file())


def _commit():
    # D2 (preflight controller correction): delegate to generate.git_commit
    # (full SHA, "-dirty" suffix when tools/molecules is dirty) so
    # publish.py's single-commit check (it refuses mixed generator commits)
    # can hold across the diatomics and the library. 6B-1's worker imports
    # this name directly.
    return git_commit()


def _reference_json(ref):
    out = {'quantity': ref.quantity, 'value': ref.value, 'unit': ref.unit, 'source': ref.source, 'tolerance': ref.tolerance}
    if ref.atoms:
        out['atoms'] = list(ref.atoms)
    if ref.label:
        out['label'] = ref.label
    return out


def library_basis_json(mol, mf, rows):
    """basis.json's payload, built from Phase 6's own orbital rows (D1:
    preflight controller correction) rather than generate.basis_json, whose
    MINAO-selected virtuals are a different set addressed by a different
    position. orbitals.orbital_table pins position == PySCF MO index, which
    is what makes `coefficients: mf.mo_coeff[:, r['index']]` the orbital at
    that position in this very list."""
    shells = export_shells(mol)
    check_against_pyscf(mol, shells)
    return {'spherical': True, 'convention': CONVENTION, 'atoms': atoms_of(mol), 'nao': int(mol.nao), 'shells': shells,
            'orbitals': [{**r, 'spin': 'restricted', 'pyscfIndex': r['index'],
                          'coefficients': [float(c) for c in mf.mo_coeff[:, r['index']]]} for r in rows]}


def build_molecule(entry, out_root=OUT_ROOT, basis=PROPERTY_BASIS, xc='B3LYP', grid_points=GRID_POINTS_TRIES, budget=BUDGET_BYTES):
    atoms, optimisation = geometry_for(entry)
    mol, mf = run_dft(atoms, entry.spin, basis, xc)
    dm = total_dm(mf)
    coords = mol.atom_coords()
    out = Path(out_root) / entry.id
    out.mkdir(parents=True, exist_ok=True)
    orbitals = orbital_table(mol, mf)
    (out / 'basis.json').write_text(json.dumps(library_basis_json(mol, mf, orbitals), separators=(',', ':')))
    dipole = np.asarray(mf.dip_moment(unit='Debye', verbose=0), dtype=float)
    for points in grid_points:
        grid, esp_grid = grid_for(coords, points), grid_for(coords, points // 2)
        raw_density = voxel_averaged_density(mol, dm, grid)
        # D25 (preflight controller correction, carried from Task 4/D25):
        # check before compaction — compact_float32's floor would otherwise
        # silently flush a genuine negative artefact to 0 along with real
        # noise, hiding a bug the spec wants surfaced (§3.5).
        check_density(raw_density)
        density = compact_float32(raw_density, floor=DENSITY_FLOOR)
        check_box(density)
        esp_coords = esp_grid.coords()
        esp = esp_on_points(mol, dm, esp_coords)
        write_float32_gz(out / 'density.bin.gz', density)
        write_float32_gz(out / 'esp.bin.gz', compact_float32(esp))
        meta = {
            'id': entry.id, 'name': entry.name, 'formula': entry.formula,
            'atoms': [{'Z': int(mol.atom_charge(i)), 'position': [float(v) for v in coords[i]]} for i in range(mol.natm)],
            'geometrySource': entry.geometry_source,
            'method': {'density': f'{xc}/{basis}', 'energies': f'{xc}/{basis}'},
            'totalEnergyHartree': float(mf.e_tot),
            'dipoleDebye': float(np.linalg.norm(dipole)),
            'dipoleVectorDebye': [float(v) for v in dipole],
            'orbitals': orbitals,
            'grid': grid.as_meta(),
            'espGrid': esp_grid.as_meta(),
            'espRangeOnSurface': list(esp_surface_range(esp, eval_density(mol, dm, esp_coords))),
            'electronCount': int(mol.nelectron),
            'densityIntegral': float(density.astype(np.float64).sum() * grid.spacing ** 3),
            'multiplicity': entry.spin + 1,
            'symmetry': {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname},
            'references': [_reference_json(r) for r in entry.references],
            # D2 (preflight controller correction): generate.provenance gives
            # everything that decides the numbers (pyscf/numpy/scipy/python
            # versions, xc variant, dataVersion) and the one commit shared
            # with the diatomics; only `script` is this module's own.
            'generator': {**provenance(_commit()), 'script': 'tools/molecules/build_library.py'},
        }
        if optimisation:
            meta['geometryOptimisation'] = optimisation
        if entry.caveat:
            # Ruling T7-O3: a known, owner-accepted exception is shown, not
            # hidden (spec §3.5) -- the app's readout (Task 14) displays this.
            meta['caveat'] = entry.caveat
        (out / 'meta.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')
        if _size(out) <= budget:
            return {'id': entry.id, 'name': entry.name, 'formula': entry.formula, 'category': entry.category, 'tags': list(entry.tags)}
    raise BudgetExceeded(f'{entry.id}: {_size(out)} bytes at {grid_points[-1]}³ exceeds {budget}')


def merge_index(path, entries):
    path = Path(path)
    order = {m.id: i for i, m in enumerate(LIBRARY)}
    merged = {e['id']: e for e in (json.loads(path.read_text()) if path.exists() else [])}
    merged.update({e['id']: e for e in entries})
    others = [e for e in merged.values() if e['id'] not in order]
    ours = sorted((e for e in merged.values() if e['id'] in order), key=lambda e: order[e['id']])
    path.write_text(json.dumps(others + ours, indent=1, ensure_ascii=False) + '\n')


def validation_rows(entry, meta):
    coords = [np.asarray(a['position']) * BOHR_TO_ANGSTROM for a in meta['atoms']]
    rows = []
    for ref in entry.references:
        if ref.quantity == 'dipole':
            if ref.value == 0:
                continue      # a percentage of zero is meaningless; test_library_data asserts |μ| < 0.01 D instead
            # D28 (ruling, W/progress.md): the dipole floor (10 % or 0.05 D,
            # whichever is larger — library.dipole()) is a deliberate
            # deviation from the spec's verbatim "within 10 %"; the row's
            # method states it so the deviation is visible on the Methods
            # page, not just in this module's comments.
            quantity, app = 'dipole moment', meta['dipoleDebye']
            method = f'{meta["method"]["density"]}; tolerance 10 % or 0.05 D, whichever is larger'
        elif ref.quantity in ('bond', 'angle'):
            quantity = f'{"bond length" if ref.quantity == "bond" else "angle"} {ref.label}'
            app, method = measure(ref, coords), meta['geometrySource']
        else:
            continue
        row = {'phase': 6, 'quantity': quantity, 'system': entry.formula, 'app': round(float(app), 4),
               'reference': ref.value, 'unit': UNITS.get(ref.unit, ref.unit),
               'tolerancePercent': round(100 * ref.tolerance / abs(ref.value), 3),
               'referenceSource': ref.source, 'method': method}
        if ref.known_miss:
            # Ruling T7-O3: a row known to fall outside its tolerance carries
            # the reason beside it, rather than passing silently or being
            # dropped (spec §3.5); references.test.ts pins it both ways.
            row['knownMiss'] = ref.known_miss
        rows.append(row)
    rows.append({'phase': 6, 'quantity': 'electrons in shipped density grid', 'system': entry.formula,
                 'app': round(meta['densityIntegral'], 4), 'reference': meta['electronCount'], 'unit': 'e',
                 'tolerancePercent': 0.5, 'referenceSource': 'electron count',
                 'method': f'{meta["method"]["density"]}, voxel-averaged {meta["grid"]["shape"][0]}³ grid'})
    return rows


def write_validation_rows(public_root=OUT_ROOT, out=ROWS):
    rows = []
    for entry in LIBRARY:
        meta_path = Path(public_root) / entry.id / 'meta.json'
        if meta_path.exists():
            rows += validation_rows(entry, json.loads(meta_path.read_text()))
    Path(out).write_text(json.dumps(rows, indent=1, ensure_ascii=False) + '\n')
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--only')
    group.add_argument('--all', action='store_true')
    group.add_argument('--rows-only', action='store_true')
    args = parser.parse_args(argv)
    if not args.rows_only:
        ids = [m.id for m in LIBRARY] if args.all else args.only.split(',')
        for molecule_id in ids:
            started = time.time()
            entry = build_molecule(by_id(molecule_id))
            merge_index(OUT_ROOT / 'index.json', [entry])
            print(f'{molecule_id}: {_size(OUT_ROOT / molecule_id)} bytes in {time.time() - started:.0f} s')
    print(f'{len(write_validation_rows())} validation rows')


if __name__ == '__main__':
    main()
