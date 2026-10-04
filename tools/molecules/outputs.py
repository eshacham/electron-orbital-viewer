"""Everything the generator writes: the spec §4.2 files under
version.OUT_ROOT (tools/molecules/out/<version>/, published to S3 by
publish.py, never committed -- spec §4.5), the committed test fixtures under
tests/fixtures/molecules/, and the validation summary. Shapes are those of
src/molecules/types.ts."""
import gzip
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path

import numpy as np
from pyscf import gto, symm
from pyscf.data.elements import ELEMENTS

from basis_export import check_against_pyscf, evaluate_aos
from labels import label_orbitals, select_with_margin
from molecules import BOHR_TO_ANGSTROM, DIATOMICS, HUBER_HERZBERG

CACHE_DIR = Path(__file__).resolve().parent / '.cache'
# Bump when the meaning of a cached value changes (2: result dicts with
# convergence and T1, keyed by settings rather than by name).
CACHE_SCHEMA = 2
GRID_SPACING = 0.25
GRID_PADDING = 6.5
# The TS tests' density grid: odd, so it has a centre point like the shipped
# one, and 41³ floats gzip to well under the 1 MB fixture budget (spec §4.5).
FIXTURE_GRID_SIDE = 41
FIXTURE_BUDGET_BYTES = 1024 * 1024
# Seven orders below the faintest surface offered (0.002 e/a0^3); zeros gzip well.
ZERO_BELOW = 1e-12
DENSITY_METHOD = 'B3LYP/def2-TZVP'
ORBITAL_BASIS = 'def2-tzvp'
# A kept virtual whose MINAO weight beats the best orbital left out by less
# than this (5 % of the orbital's norm) is a near tie: across CO, B₂, C₂, N₂
# and O₂ the pairs that close (0.262 vs 0.257 for CO at 0.80 R_e, 0.364 vs
# 0.363 for B₂ β at 1.22 R_e) are always two σ virtuals of one irrep sharing
# the valence σ* character, so the label is the same whichever wins and only
# the shape is one of two comparable mixtures. That is recorded on the
# orbital as `nearTie` for the UI to caption; a tie across irreps would
# change the label set instead, which check_scan_labels refuses.
SELECTION_TIE_MARGIN = 0.05
FIXTURE_POINTS = [(0.0, 0.0, 0.0), (0.0, 0.0, 0.5), (0.3, -0.2, 1.1), (1.0, 0.5, -0.7), (-1.5, 0.8, 2.0),
                  (0.2, 0.2, -1.9), (2.5, -1.0, 0.3), (0.0, 1.2, 0.0), (-0.6, -0.6, 0.9), (3.0, 2.0, -2.5)]


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f'.{path.name}.partial')
    partial.write_bytes(json_bytes(data))
    partial.replace(path)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def cached(settings, compute):
    """compute(), remembered in CACHE_DIR under a hash of `settings` (a dict
    naming everything that decides the value; quantum.reference_setup builds
    them), so a generator run cut short resumes where it stopped. The dict is
    stored beside the value and compared on read: any difference, including
    CACHE_SCHEMA, recomputes rather than reuse a value computed another way
    (ruling T4-b). Written to a temporary name and renamed, so an
    interrupted write never leaves a half file that reads as a value."""
    settings = json.loads(json.dumps({**settings, 'cacheSchema': CACHE_SCHEMA}, sort_keys=True))
    digest = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:20]
    path = CACHE_DIR / f'{settings.get("id", "value")}-{digest}.json'
    if path.exists():
        stored = json.loads(path.read_text())
        if stored.get('settings') == settings:
            return stored['value']
    value = compute()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix('.partial')
    partial.write_text(json.dumps({'settings': settings, 'value': value}))
    partial.replace(path)
    return value


def energy_method_label(d, spin, *, exact=False):
    """`exact`: CCSD(T) with two correlated electrons (Li₂, both 1s frozen),
    which is full CI in that space -- said so, since that is why its whole
    curve ships while other CCSD(T) curves stop (ruling T4-c)."""
    # No counterpoise correction anywhere; it matters only for He₂, whose
    # well is the size of the basis-set superposition error (see its note).
    if d.energy_method == 'fci':
        return 'FCI/aug-cc-pVTZ (no counterpoise correction)'
    if exact:
        return 'CCSD(T)/aug-cc-pVTZ, 1s frozen: exact (full CI) for the two valence electrons'
    return ('UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core)' if spin
            else 'CCSD(T)/aug-cc-pVTZ (frozen core)')


def write_tree(files, target):
    """Write {relative path: bytes} as the directory `target`, replacing
    whatever was there, via a sibling staging directory renamed into place:
    a run that fails part-way leaves the previous output, never half of a
    new one (review M6)."""
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f'.{target.name}-', dir=target.parent))
    try:
        for relative, data in files.items():
            (staging / relative).parent.mkdir(parents=True, exist_ok=True)
            (staging / relative).write_bytes(data)
        if target.exists():
            shutil.rmtree(target)
        os.replace(staging, target)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def atoms_of(mol):
    return [list(map(float, mol.atom_coord(i))) for i in range(mol.natm)]


def assign_roles(entries, *, lowest_empty_energy=None):
    """HOMO (closed shells) or SOMO (open shells: an α orbital whose β partner
    of the same label is empty), and LUMO. The virtuals shipped are chosen by
    minimal-basis character, not energy, so a diffuse orbital left out may lie
    below them; given the calculation's lowest empty energy, LUMO goes only to
    an entry that really is that orbital."""
    for e in entries:
        e.pop('role', None)
    occupied = [e for e in entries if e['occupation'] > 0]
    empty = [e for e in entries if e['occupation'] == 0]
    if any(e['spin'] != 'restricted' for e in entries):
        for e in occupied:
            if e['spin'] == 'alpha' and not any(
                    b['spin'] == 'beta' and b['label'] == e['label'] and b['occupation'] > 0 for b in entries):
                e['role'] = 'SOMO'
    elif occupied:
        max(occupied, key=lambda e: e['energyHartree'])['role'] = 'HOMO'
    if empty:
        lowest = min(empty, key=lambda e: e['energyHartree'])
        if lowest_empty_energy is None or abs(lowest['energyHartree'] - lowest_empty_energy) < 1e-9:
            lowest['role'] = 'LUMO'


def orbital_labels(mol, coeff, energy, kept, homonuclear):
    """σ/π labels for a diatomic (numbered within `kept`, as label_orbitals
    explains); Mulliken labels (1b1, 3a1, as in spec §4.2) for any other
    symmetric molecule Phase 6 feeds through basis_json; plain numbers
    without symmetry."""
    if mol.natm == 2 and mol.symmetry:
        return label_orbitals(mol, coeff, energy, kept, homonuclear)
    if mol.symmetry:
        irreps = symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff)
        counts, labels = {}, [''] * len(energy)
        for i in np.argsort(energy, kind='stable'):
            counts[irreps[i]] = counts.get(irreps[i], 0) + 1
            labels[i] = f'{counts[irreps[i]]}{irreps[i].lower()}'
        return labels
    return [f'MO {i + 1}' for i in range(len(energy))]


def orbital_entries(mol, mf, homonuclear):
    """The orbitals worth shipping (labels.select_orbitals), α then β for an
    unrestricted calculation, each with its label, energy, occupation and
    coefficients; `index` is the position in this list, which is what the
    app's recipes address."""
    unrestricted = np.asarray(mf.mo_coeff).ndim == 3
    spins = (('alpha', 0), ('beta', 1)) if unrestricted else (('restricted', None),)
    entries, lowest_empty = [], np.inf
    for spin, s in spins:
        coeff = mf.mo_coeff[s] if unrestricted else mf.mo_coeff
        energy = mf.mo_energy[s] if unrestricted else mf.mo_energy
        occ = mf.mo_occ[s] if unrestricted else mf.mo_occ
        kept, margin = select_with_margin(mol, coeff, occ)
        labels = orbital_labels(mol, coeff, energy, kept, homonuclear)
        if np.any(occ == 0):
            lowest_empty = min(lowest_empty, float(np.min(energy[occ == 0])))
        for i in kept:
            entry = {'spin': spin, 'pyscfIndex': int(i), 'label': labels[i],
                     'energyHartree': float(energy[i]), 'occupation': float(occ[i]),
                     'coefficients': [float(c) for c in coeff[:, i]]}
            if margin and i == margin['kept'] and margin['keptWeight'] - margin['runnerUpWeight'] < SELECTION_TIE_MARGIN:
                entry['nearTie'] = {'minaoWeight': round(margin['keptWeight'], 4),
                                    'runnerUpMinaoWeight': round(margin['runnerUpWeight'], 4),
                                    'runnerUpEnergyHartree': float(energy[margin['runnerUp']])}
            entries.append(entry)
    for position, entry in enumerate(entries):
        entry['index'] = position
    assign_roles(entries, lowest_empty_energy=lowest_empty if np.isfinite(lowest_empty) else None)
    return entries


def check_scan_labels(molecule_id, entries_per_point):
    """The same (spin, label, occupation) set at every scan point, so an
    orbital picked at one R exists at every other. Selection keeps the
    minimal-basis count of virtuals, so a set that changes means two
    virtuals of different irreps swapped places in the ranking -- refused
    loudly rather than shipped as an orbital that vanishes mid-slider."""
    def signature(entries):
        return sorted((e['spin'], e['label'], e['occupation']) for e in entries)
    first = signature(entries_per_point[0])
    for i, entries in enumerate(entries_per_point[1:], start=1):
        here = signature(entries)
        if here != first:
            only_here = sorted(set(here) - set(first))
            only_first = sorted(set(first) - set(here))
            raise ValueError(f'{molecule_id}@{i:02d}: kept orbitals differ from {molecule_id}@00 '
                             f'(only here: {only_here}; only at 00: {only_first})')


def grid_spec(r_bohr, side=None):
    """A centred cube holding both nuclei with GRID_PADDING bohr to spare.
    By default the spacing is GRID_SPACING and the side follows; given an
    (odd) side, the spacing follows instead, rounded up to 1e-6 bohr so the
    padding is never cut short."""
    reach = r_bohr / 2 + GRID_PADDING
    if side is None:
        half_steps = int(np.ceil(reach / GRID_SPACING))
        spacing = GRID_SPACING
    else:
        if side % 2 == 0:
            raise ValueError(f'grid side {side} must be odd, so the grid has a centre point')
        half_steps = (side - 1) // 2
        spacing = float(np.ceil(reach / half_steps * 1e6) / 1e6)
    half = half_steps * spacing
    return {'shape': [2 * half_steps + 1] * 3, 'origin': [-half] * 3, 'spacing': spacing}


def density_on_grid(shells, atoms, orbitals, grid, chunk=40000):
    side = grid['shape'][0]
    axis = grid['origin'][0] + grid['spacing'] * np.arange(side)
    x, y, z = np.meshgrid(axis, axis, axis, indexing='ij')   # C order: z fastest, like GridFieldSource
    points = np.stack([x.ravel(), y.ravel(), z.ravel()], axis=1)
    occupied = [(o['occupation'], np.asarray(o['coefficients'])) for o in orbitals if o['occupation'] > 0]
    rho = np.empty(len(points))
    for start in range(0, len(points), chunk):
        ao = evaluate_aos(shells, atoms, points[start:start + chunk])
        rho[start:start + chunk] = sum(occ * (ao @ c) ** 2 for occ, c in occupied)
    rho[rho < ZERO_BELOW] = 0.0
    return rho.astype('<f4')


def gzip_floats(values):
    # mtime=0: the same floats always give the same bytes, so the manifest's
    # SHA-256 changes only when the data does.
    return gzip.compress(values.tobytes(), compresslevel=9, mtime=0)


def molecule_for_basis(basis_atoms, symbols, spin):
    return gto.M(atom=[(s, p) for s, p in zip(symbols, basis_atoms)], unit='Bohr',
                 basis=ORBITAL_BASIS, spin=spin, verbose=0)


def orbital_values(mol, basis, molecule_id):
    """PySCF's own MO values (its AOs, the shipped coefficients) at
    FIXTURE_POINTS, for the TS evaluator to match; the density is the shipped
    orbitals' Σ occ ψ²."""
    points = np.asarray(FIXTURE_POINTS)
    ao = mol.eval_gto('GTOval_sph', points)
    orbitals = basis['orbitals']
    values = [ao @ np.asarray(o['coefficients']) for o in orbitals]
    density = sum(o['occupation'] * v ** 2 for o, v in zip(orbitals, values))
    return {'moleculeId': molecule_id, 'points': points.tolist(),
            'orbitals': [{'index': o['index'], 'values': v.tolist()} for o, v in zip(orbitals, values)],
            'density': density.tolist()}


def write_fixtures(out_root, dest, *, density_id='n2', basis_ids=('o2', 'hf')):
    """The committed fixtures the TS tests read, as reduced copies of the
    generated files (so they test the data that is published): density_id's
    meta, basis and scan as written, its density on a FIXTURE_GRID_SIDE³ grid
    (meta.grid says so), basis_ids' basis.json, and for every one of them
    PySCF's orbital values at FIXTURE_POINTS (<id>.json)."""
    ids = (density_id,) + tuple(i for i in basis_ids if i != density_id)
    missing = [i for i in ids if not (out_root / i / 'basis.json').exists()]
    if missing or not (out_root / density_id / 'scan.json').exists():
        raise FileNotFoundError(f'fixtures are copied from generated data, and {out_root} lacks '
                                f'{", ".join(missing or [density_id])}: run generate.py --only {" ".join(ids)} first')
    meta = read_json(out_root / density_id / 'meta.json')
    small = dict(meta, grid=grid_spec(_separation(meta), side=FIXTURE_GRID_SIDE))
    files = {}   # built and measured in full before anything is written (review M6)
    for molecule_id in ids:
        basis = read_json(out_root / molecule_id / 'basis.json')
        atoms_meta = read_json(out_root / molecule_id / 'meta.json')
        mol = molecule_for_basis(basis['atoms'], [ELEMENTS[a['Z']] for a in atoms_meta['atoms']], atoms_meta['spin'])
        check_against_pyscf(mol, basis['shells'])
        files[f'{molecule_id}.json'] = json_bytes(orbital_values(mol, basis, molecule_id))
        files[f'{molecule_id}/basis.json'] = json_bytes(basis)
        if molecule_id == density_id:
            files[f'{molecule_id}/meta.json'] = json_bytes(small)
            files[f'{molecule_id}/scan.json'] = json_bytes(read_json(out_root / molecule_id / 'scan.json'))
            density = density_on_grid(basis['shells'], basis['atoms'], basis['orbitals'], small['grid'])
            files[f'{molecule_id}/density.bin.gz'] = gzip_floats(density)
    total = sum(len(data) for data in files.values())
    if total > FIXTURE_BUDGET_BYTES:
        raise AssertionError(f'fixtures would total {total} bytes, over the {FIXTURE_BUDGET_BYTES} budget; nothing written')
    # File by file (each atomically), not write_tree: tests/fixtures/molecules
    # may hold fixtures this function does not own.
    for relative, data in files.items():
        path = dest / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_name(f'.{path.name}.partial')
        partial.write_bytes(data)
        partial.replace(path)
    return total


def _separation(meta):
    a, b = (np.asarray(atom['position']) for atom in meta['atoms'])
    return float(np.linalg.norm(a - b))


def row(quantity, system, app, reference, unit, tolerance, source, method):
    return {'quantity': quantity, 'system': system, 'app': app, 'reference': reference, 'unit': unit,
            'tolerancePercent': tolerance, 'referenceSource': source, 'method': method}


def validation_rows(out_root):
    """Rows for src/validation/generated/phase5_diatomics.json (Task 14 adds
    `phase: 5`): every asserted R_e, and H₂'s D_e, from the scans on disk."""
    rows = []
    for d in DIATOMICS:
        path = out_root / d.id / 'scan.json'
        if d.reference_re_angstrom is None or not path.exists():
            continue
        scan = read_json(path)
        method = scan['energyMethod']
        if scan['fit']['ReBohr'] is None:
            raise ValueError(f'{d.id}: the scan has no minimum, so there is no R_e to set beside '
                             f'{d.reference_re_angstrom} Å; that is a physics finding, not a row')
        if d.id == 'h2':
            rows.append(row('R_e', 'H₂', scan['fit']['ReBohr'], 1.401, 'a₀', 1, HUBER_HERZBERG, method))
            rows.append(row('D_e', 'H₂', scan['fit']['DeEv'], 4.75, 'eV', 2,
                            'Kołos & Wolniewicz, J. Chem. Phys. 49, 404 (1968)', method))
        else:
            rows.append(row('R_e', d.formula, scan['fit']['ReBohr'] * BOHR_TO_ANGSTROM,
                            d.reference_re_angstrom, 'Å', 1, d.reference_source, method))
    return rows
