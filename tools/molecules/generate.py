"""Bond-length scans for Bonds mode (spec §4.2, §4.5, §5 Phase 5).

Run once per molecule, in the foreground, from the repository root:
    tools/molecules/.venv/bin/python tools/molecules/generate.py --only n2
Output goes to version.OUT_ROOT (tools/molecules/out/<version>/, git-ignored;
publish.py uploads it). Reference energies are cached in tools/molecules/.cache,
so a run cut short resumes where it stopped. Every generating run rewrites
index.json and src/validation/generated/phase5_diatomics.json from what is
on disk.

    tools/molecules/.venv/bin/python tools/molecules/generate.py --fixtures
then copies n2, o2 and hf (generated first) into the committed TS test
fixtures under tests/fixtures/molecules/, with a reduced density grid.
"""
import argparse
import platform
import subprocess

import numpy as np
import pyscf
import scipy

from basis_export import CONVENTION, check_against_pyscf, export_shells
from fit import MIN_VALID_POINTS, T1_LIMIT_CLOSED, T1_LIMIT_OPEN, fit_minimum, valid_range
from labels import bond_order
from molecules import ANGSTROM_TO_BOHR, ATOM_GROUND_STATES, DIATOMICS, EQUILIBRIUM_INDEX, REPO_ROOT, SCAN_FACTORS
from outputs import (DENSITY_METHOD, atoms_of, cached, check_scan_labels, density_on_grid, energy_method_label,
                     grid_spec, gzip_floats, json_bytes, orbital_entries, read_json, validation_rows,
                     write_fixtures, write_json, write_tree)
# basis_json below is also Phase 6's entry point: `generate.basis_json(mol, mf)`.
from quantum import XC, atom_energy, atom_setup, is_exact, kohn_sham, reference_setup, solve
from version import DATA_VERSION, OUT_ROOT

OUT = OUT_ROOT
FIXTURES = REPO_ROOT / 'tests' / 'fixtures' / 'molecules'
VALIDATION_SUMMARY = REPO_ROOT / 'src' / 'validation' / 'generated' / 'phase5_diatomics.json'
META_ORBITAL_KEYS = ('index', 'label', 'energyHartree', 'occupation', 'spin', 'role', 'nearTie')


def git_commit():
    sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO_ROOT, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(['git', 'status', '--porcelain', 'tools/molecules'], cwd=REPO_ROOT,
                           capture_output=True, text=True).stdout.strip()
    return sha + ('-dirty' if dirty else '')


def provenance(commit):
    """Everything that decides the numbers, recorded in every meta.json."""
    return {'pyscf': pyscf.__version__, 'numpy': np.__version__, 'scipy': scipy.__version__,
            'python': platform.python_version(), 'xc': f'{XC} (PySCF >= 2.3: VWN-RPA)',
            'script': 'tools/molecules/generate.py', 'commit': commit, 'dataVersion': DATA_VERSION}


def basis_json(mol, mf):
    """The basis.json payload for any SCF result: shells, and the orbitals worth
    shipping with their coefficients. Phase 6 calls this for its library. No
    `id`: the caller (or loadBasis, from the path) supplies it."""
    shells = export_shells(mol)
    check_against_pyscf(mol, shells)
    homonuclear = mol.natm == 2 and mol.atom_charge(0) == mol.atom_charge(1)
    return {'spherical': True, 'convention': CONVENTION, 'atoms': atoms_of(mol), 'nao': int(mol.nao),
            'shells': shells, 'orbitals': orbital_entries(mol, mf, homonuclear)}


def reference_point(d, r_bohr, **overrides):
    """quantum.solve's result for one point of the curve, cached under its settings."""
    mol, pinned, settings = reference_setup(d, r_bohr, **overrides)
    return cached(settings, lambda: solve(mol, pinned, settings))


def separated_atoms(d):
    """E(A) + E(B) at the molecule's method and basis, and what that sum is."""
    energies = []
    for element in d.elements:
        settings = atom_setup(element, d.energy_method)[2]
        energies.append(cached(settings, lambda element=element: atom_energy(element, d.energy_method))['energyHartree'])
    states = ' + '.join(f'{e} {ATOM_GROUND_STATES[e][1]}' for e in d.elements)
    return sum(energies), f'{states}, {energy_method_label(d, ATOM_GROUND_STATES[d.elements[0]][0])}'


def check_curve(d, validity, fit, exact):
    """Refuse (ruling T4-a) a CCSD(T) curve too short to stand on: fewer than
    MIN_VALID_POINTS valid points, or no minimum inside them. Exact methods
    are refused only if a point failed outright."""
    if exact:
        if validity['stopReason']:
            raise ValueError(f'{d.id}: {validity["stopReason"]}')
        return
    if validity['count'] < MIN_VALID_POINTS or fit['ReBohr'] is None:
        raise ValueError(f'{d.id}: single-reference CCSD(T) is valid for only {validity["count"]} of '
                         f'{len(SCAN_FACTORS)} points, {"with" if fit["ReBohr"] else "without"} a minimum among them '
                         f'(need {MIN_VALID_POINTS} and a minimum); stopped by {validity["stopReason"]}')


def run_molecule(d, commit, out=OUT):
    """Compute, validate, then write: nothing reaches `out` until the curve's
    validity range, its fit and the orbital labels have all been checked, and
    the molecule's folder is then replaced whole (review M6)."""
    homonuclear = d.elements[0] == d.elements[1]
    r_ref = d.r_ref_angstrom * ANGSTROM_TO_BOHR
    radii = [r_ref * factor for factor in SCAN_FACTORS]
    results = []
    for i, r in enumerate(radii):
        result = reference_point(d, r)
        results.append({'RBohr': r, **result})
        t1 = f', T1 = {result["t1Diagnostic"]:.4f}' if result['t1Diagnostic'] is not None else ''
        energy = f'{result["energyHartree"]:.8f} Ha' if result['converged'] else result['failure']
        print(f'  {d.id}@{i:02d}: R = {r:.4f} bohr, {energy}{t1}', flush=True)

    exact = is_exact(d, r_ref)
    validity = valid_range(results, t1_limit=None if exact else (T1_LIMIT_OPEN if d.spin else T1_LIMIT_CLOSED))
    shipped = results[:validity['count']]
    limit, limit_method = separated_atoms(d)
    fit = fit_minimum([p['RBohr'] for p in shipped], [p['energyHartree'] for p in shipped], limit) if shipped else None
    check_curve(d, validity, fit or {'ReBohr': None}, exact)
    fit['separatedAtomsHartree'] = limit
    fit['separatedAtomsMethod'] = limit_method
    print(f'{d.id}: {validity["count"]} of {len(radii)} points valid'
          + (f' (stopped: {validity["stopReason"]})' if validity['stopReason'] else ''), flush=True)

    method = {'density': DENSITY_METHOD, 'energies': energy_method_label(d, d.spin)}
    generator = provenance(commit)
    references = ([{'quantity': 'R_e', 'value': d.reference_re_angstrom, 'unit': 'Å', 'source': d.reference_source}]
                  if d.reference_re_angstrom else [])
    files, points, orbitals_per_point = {}, [], []
    for i, p in enumerate(shipped):
        r, e_ref = p['RBohr'], p['energyHartree']
        mol, mf = kohn_sham(d, r)
        payload = basis_json(mol, mf)
        orbitals, atoms = payload['orbitals'], payload['atoms']
        orbitals_per_point.append(orbitals)
        for o in orbitals:
            if 'nearTie' in o:
                tie = o['nearTie']
                print(f'  {d.id}@{i:02d}: {o["spin"]} {o["label"]} kept on a near tie, MINAO weight '
                      f'{tie["minaoWeight"]:.3f} vs {tie["runnerUpMinaoWeight"]:.3f} (recorded as nearTie)', flush=True)
        order = bond_order([o['label'] for o in orbitals], [o['occupation'] for o in orbitals], homonuclear)
        point_id = f'{d.id}@{i:02d}'

        def meta_for(molecule_id, source, grid=None):
            meta = {'id': molecule_id, 'name': d.name, 'formula': d.formula,
                    'atoms': [{'Z': int(mol.atom_charge(k)), 'position': atoms[k]} for k in range(2)],
                    'geometrySource': source, 'method': method, 'totalEnergyHartree': e_ref,
                    'dftEnergyHartree': float(mf.e_tot), 'spin': d.spin, 'bondOrder': order,
                    'orbitals': [{k: o[k] for k in META_ORBITAL_KEYS if k in o} for o in orbitals],
                    'references': references, 'generator': generator}
            if grid:
                meta['grid'] = grid
                meta['scan'] = 'scan.json'
            return meta

        files[f'scan/{i:02d}/meta.json'] = json_bytes(
            meta_for(point_id, f'scan point {i} of {len(shipped)}, R = {r:.4f} bohr'))
        files[f'scan/{i:02d}/basis.json'] = json_bytes({'id': point_id, **payload})
        if i == EQUILIBRIUM_INDEX:
            grid = grid_spec(r)
            source = (f'experimental R_e ({d.reference_source})' if d.reference_source
                      else 'no equilibrium: scan centre')
            files['meta.json'] = json_bytes(meta_for(d.id, source, grid))
            files['basis.json'] = json_bytes({'id': d.id, **payload})
            files['density.bin.gz'] = gzip_floats(density_on_grid(payload['shells'], atoms, orbitals, grid))
        points.append({'index': i, 'id': point_id, 'RBohr': r, 'energyHartree': e_ref,
                       't1Diagnostic': p['t1Diagnostic'], 'dftEnergyHartree': float(mf.e_tot)})
    check_scan_labels(d.id, orbitals_per_point)

    spin_check = None
    if d.id == 'o2':
        triplet = reference_point(d, r_ref, symmetry=False)
        singlet = reference_point(d, r_ref, spin=0, symmetry=False)
        if not (triplet['converged'] and singlet['converged']):
            raise ValueError(f'o2 spin check: {triplet["failure"] or singlet["failure"]}')
        spin_check = {'RBohr': r_ref, 'tripletHartree': triplet['energyHartree'],
                      'singletHartree': singlet['energyHartree'],
                      'method': 'UCCSD(T) triplet vs closed-shell CCSD(T) singlet, aug-cc-pVTZ, frozen core'}
    files['scan.json'] = json_bytes({
        'id': d.id, 'name': d.name, 'formula': d.formula, 'spin': d.spin,
        'energyMethod': method['energies'], 'densityMethod': DENSITY_METHOD, 'points': points,
        'equilibriumIndex': EQUILIBRIUM_INDEX, 'fit': fit, 'spinCheck': spin_check, 'note': d.note,
        'validity': {'pointsComputed': len(radii), 'pointsShipped': len(shipped), 'exact': exact,
                     't1Limit': None if exact else (T1_LIMIT_OPEN if d.spin else T1_LIMIT_CLOSED),
                     'validUpToRBohr': validity['validUpToRBohr'], 'stoppedAtRBohr': validity['stoppedAtRBohr'],
                     'stopReason': validity['stopReason']},
        'reference': {'ReAngstrom': d.reference_re_angstrom, 'source': d.reference_source}})
    write_tree(files, out / d.id)
    print(f'{d.id}: fit {fit}', flush=True)


def write_index(out=OUT):
    """index.json keeps any non-diatomic entries (Phase 6's library) and lists
    every diatomic whose scan is on disk, in DIATOMICS order."""
    path = out / 'index.json'
    others = [e for e in (read_json(path) if path.exists() else []) if e.get('category') != 'diatomic']
    diatomics = [{'id': d.id, 'name': d.name, 'formula': d.formula, 'category': 'diatomic',
                  'tags': ['bonds', 'homonuclear' if d.elements[0] == d.elements[1] else 'heteronuclear']}
                 for d in DIATOMICS if (out / d.id / 'scan.json').exists()]
    write_json(path, others + diatomics)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--only', nargs='+', default=None, metavar='ID', help='molecule ids (default: all)')
    parser.add_argument('--fixtures', action='store_true',
                        help='copy n2, o2 and hf from the generated output into tests/fixtures/molecules '
                             '(on its own, generates nothing)')
    args = parser.parse_args(argv)
    known = {d.id for d in DIATOMICS}
    unknown = set(args.only or []) - known
    if unknown:
        parser.error(f'unknown molecule ids: {sorted(unknown)}')
    if args.only is not None or not args.fixtures:
        commit = git_commit()
        for d in DIATOMICS:
            if args.only is None or d.id in args.only:
                print(f'{d.id}: scanning {len(SCAN_FACTORS)} geometries', flush=True)
                run_molecule(d, commit)
        write_index()
        write_json(VALIDATION_SUMMARY, validation_rows(OUT))
    if args.fixtures:
        total = write_fixtures(OUT, FIXTURES)
        print(f'fixtures: {total} bytes under {FIXTURES.relative_to(REPO_ROOT)}', flush=True)


if __name__ == '__main__':
    main()
