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
import subprocess

import pyscf

from basis_export import CONVENTION, check_against_pyscf, export_shells
from fit import fit_minimum
from labels import bond_order
from molecules import (ANGSTROM_TO_BOHR, DIATOMICS, EQUILIBRIUM_INDEX, HARTREE_TO_EV, REPO_ROOT,
                       SCAN_FACTORS)
from outputs import (DENSITY_METHOD, atoms_of, cached, check_scan_labels, density_on_grid, energy_method_label,
                     grid_spec, gzip_floats, orbital_entries, read_json, validation_rows, write_fixtures,
                     write_json)
# basis_json below is also Phase 6's entry point: `generate.basis_json(mol, mf)`.
from quantum import REFERENCE_BASIS, XC, hydrogen_atom_energy, kohn_sham, reference_energy
from version import OUT_ROOT

OUT = OUT_ROOT
FIXTURES = REPO_ROOT / 'tests' / 'fixtures' / 'molecules'
VALIDATION_SUMMARY = REPO_ROOT / 'src' / 'validation' / 'generated' / 'phase5_diatomics.json'
META_ORBITAL_KEYS = ('index', 'label', 'energyHartree', 'occupation', 'spin', 'role', 'nearTie')


def git_commit():
    sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO_ROOT, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(['git', 'status', '--porcelain', 'tools/molecules'], cwd=REPO_ROOT,
                           capture_output=True, text=True).stdout.strip()
    return sha + ('-dirty' if dirty else '')


def basis_json(mol, mf):
    """The basis.json payload for any SCF result: shells, and the orbitals worth
    shipping with their coefficients. Phase 6 calls this for its library. No
    `id`: the caller (or loadBasis, from the path) supplies it."""
    shells = export_shells(mol)
    check_against_pyscf(mol, shells)
    homonuclear = mol.natm == 2 and mol.atom_charge(0) == mol.atom_charge(1)
    return {'spherical': True, 'convention': CONVENTION, 'atoms': atoms_of(mol), 'nao': int(mol.nao),
            'shells': shells, 'orbitals': orbital_entries(mol, mf, homonuclear)}


def energy_key(d, r_bohr):
    """The cache key names the method, basis and geometry, so a changed scan
    or method recomputes instead of reusing a stale energy."""
    method = d.energy_method.replace('(', '').replace(')', '')
    return f'{d.id}-{method}-{REFERENCE_BASIS}-R{r_bohr:.6f}'


def run_molecule(d, commit, out=OUT):
    homonuclear = d.elements[0] == d.elements[1]
    r_ref = d.r_ref_angstrom * ANGSTROM_TO_BOHR
    method = {'density': DENSITY_METHOD, 'energies': energy_method_label(d, d.spin)}
    generator = {'pyscf': pyscf.__version__, 'xc': f'{XC} (PySCF >= 2.3: VWN-RPA)',
                 'script': 'tools/molecules/generate.py', 'commit': commit}
    references = ([{'quantity': 'R_e', 'value': d.reference_re_angstrom, 'unit': 'Å', 'source': d.reference_source}]
                  if d.reference_re_angstrom else [])
    points, orbitals_per_point = [], []
    for i, factor in enumerate(SCAN_FACTORS):
        r = r_ref * factor
        e_ref = cached(energy_key(d, r), lambda r=r: reference_energy(d, r))
        mol, mf = kohn_sham(d, r)
        payload = basis_json(mol, mf)
        shells, orbitals, atoms = payload['shells'], payload['orbitals'], payload['atoms']
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

        folder = out / d.id / 'scan' / f'{i:02d}'
        write_json(folder / 'meta.json', meta_for(point_id, f'scan point {i} of {len(SCAN_FACTORS)}, R = {r:.4f} bohr'))
        write_json(folder / 'basis.json', {'id': point_id, **payload})
        if i == EQUILIBRIUM_INDEX:
            grid = grid_spec(r)
            source = (f'experimental R_e ({d.reference_source})' if d.reference_source
                      else 'no equilibrium: scan centre')
            write_json(out / d.id / 'meta.json', meta_for(d.id, source, grid))
            write_json(out / d.id / 'basis.json', {'id': d.id, **payload})
            (out / d.id / 'density.bin.gz').write_bytes(gzip_floats(density_on_grid(shells, atoms, orbitals, grid)))
        points.append({'index': i, 'id': point_id, 'RBohr': r, 'energyHartree': e_ref, 'dftEnergyHartree': float(mf.e_tot)})
        print(f'  {point_id}: R = {r:.4f} bohr, E = {e_ref:.8f} Ha', flush=True)

    check_scan_labels(d.id, orbitals_per_point)
    fit = fit_minimum([p['RBohr'] for p in points], [p['energyHartree'] for p in points])
    fit['DeEv'] = None
    if d.id == 'h2':
        fit['DeEv'] = (2 * cached(f'h-atom-uhf-{REFERENCE_BASIS}', hydrogen_atom_energy) - fit['EminHartree']) * HARTREE_TO_EV
    spin_check = None
    if d.id == 'o2':
        triplet = cached(f'o2-spin-triplet-{REFERENCE_BASIS}-R{r_ref:.6f}', lambda: reference_energy(d, r_ref, symmetry=False))
        singlet = cached(f'o2-spin-singlet-{REFERENCE_BASIS}-R{r_ref:.6f}',
                         lambda: reference_energy(d, r_ref, spin=0, symmetry=False))
        spin_check = {'RBohr': r_ref, 'tripletHartree': triplet, 'singletHartree': singlet,
                      'method': 'UCCSD(T) triplet vs closed-shell CCSD(T) singlet, aug-cc-pVTZ, frozen core'}
    write_json(out / d.id / 'scan.json', {
        'id': d.id, 'name': d.name, 'formula': d.formula, 'spin': d.spin,
        'energyMethod': method['energies'], 'densityMethod': DENSITY_METHOD, 'points': points,
        'equilibriumIndex': EQUILIBRIUM_INDEX, 'fit': fit, 'spinCheck': spin_check, 'note': d.note,
        'reference': {'ReAngstrom': d.reference_re_angstrom, 'source': d.reference_source}})
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
