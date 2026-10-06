"""The job's identity (spec §5.2): a canonical JSON document and its SHA-256.

The key is built from the resolved geometry, never from a name, so a
PubChem structure that changes is a new calculation rather than a silently
different old one. Provenance (where the geometry came from, which image
ran it) stays out of the document: rebuilding the image must not orphan
every stored result.
"""
import hashlib
import math
from collections import Counter

import rfc8785

from jobs.elements import SYMBOLS, atomic_number
from jobs.errors import JobRefused

COMPUTE_VERSION = 1
RECIPES = {
    'single': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': None},
    'optimise': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'},
}
MAX_XYZ_BYTES = 65536
MAX_ATOMS = 200
MIN_SEPARATION = 0.3      # Å: closer than any real bond, so a typo rather than a molecule
MAX_COORD = 1000.0        # Å


def _invalid(message):
    return JobRefused('invalid-geometry', message)


def parse_xyz(text: str) -> list[list]:
    if len(text.encode()) > MAX_XYZ_BYTES:
        raise _invalid(f'the XYZ text is over {MAX_XYZ_BYTES} bytes')
    lines = [line.strip() for line in text.strip().splitlines()]
    if not lines or not lines[0]:
        raise _invalid('no atoms given')
    declared = None
    if lines[0].isdigit():
        declared = int(lines[0])
        lines = lines[2:]
    atoms = []
    for line in lines:
        if not line:
            continue
        parts = line.split()
        if len(parts) < 4:
            raise _invalid(f'"{line}" needs an element and three coordinates')
        try:
            xyz = [float(v) for v in parts[1:4]]
        except ValueError:
            raise _invalid(f'"{line}" has a coordinate that is not a number')
        if not all(math.isfinite(v) and abs(v) <= MAX_COORD for v in xyz):
            raise _invalid(f'"{line}" has a coordinate that is not finite or beyond {MAX_COORD:g} Å')
        atoms.append([atomic_number(parts[0]), *xyz])
    if declared is not None and declared != len(atoms):
        raise _invalid(f'the header says {declared} atoms but {len(atoms)} follow')
    return atoms


def check_atoms(atoms) -> None:
    if not atoms:
        raise _invalid('no atoms given')
    if len(atoms) > MAX_ATOMS:
        raise _invalid(f'{len(atoms)} atoms; this phase accepts at most {MAX_ATOMS}')
    for i in range(len(atoms)):
        for j in range(i):
            d = math.dist(atoms[i][1:4], atoms[j][1:4])
            if d < MIN_SEPARATION:
                raise _invalid(f'atoms {j + 1} and {i + 1} are {d:.3f} Å apart (under {MIN_SEPARATION} Å)')


def electron_count(atoms, charge: int) -> int:
    electrons = sum(int(a[0]) for a in atoms) - int(charge)
    if electrons < 1:
        raise JobRefused('bad-multiplicity', f'charge {charge:+d} leaves no electrons')
    return electrons


def multiplicity_for(electrons: int, requested: int | None) -> int:
    if requested is None:
        return 1 if electrons % 2 == 0 else 2
    # 2S + 1 with S from unpaired electrons: their parity must match the electron count's.
    if requested < 1 or requested > electrons + 1 or (requested - 1) % 2 != electrons % 2:
        raise JobRefused('bad-multiplicity', f'multiplicity {requested} is impossible with {electrons} electrons')
    return requested


def formula(atoms) -> str:
    counts = Counter(SYMBOLS[int(a[0]) - 1] for a in atoms)
    order = (['C', 'H'] + sorted(s for s in counts if s not in ('C', 'H'))) if 'C' in counts else sorted(counts)
    return ''.join(f'{s}{counts[s] if counts[s] > 1 else ""}' for s in order if s in counts)


def _round(v: float) -> float:
    return round(float(v), 5) + 0.0      # + 0.0 turns -0.0 into 0.0


def canonical_atoms(atoms) -> list[list]:
    return sorted([int(a[0]), _round(a[1]), _round(a[2]), _round(a[3])] for a in atoms)


def canonical_job(recipe: str, atoms, charge: int, multiplicity: int, method: dict | None = None) -> dict:
    if recipe not in RECIPES:
        raise JobRefused('invalid-request', f'unknown recipe "{recipe}"; choose one of {", ".join(RECIPES)}', 400)
    return {'computeVersion': COMPUTE_VERSION, 'recipe': recipe, 'method': dict(method or RECIPES[recipe]),
            'molecule': {'atoms': canonical_atoms(atoms), 'charge': int(charge), 'multiplicity': int(multiplicity)}}


def job_key(job: dict) -> str:
    return hashlib.sha256(rfc8785.dumps(job)).hexdigest()
