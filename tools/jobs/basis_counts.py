import json
from pathlib import Path

from jobs.elements import SYMBOLS

# Committed output of make_basis_counts.py, so sizing needs no PySCF (spec §7.1).
COUNTS: dict[str, dict[str, int]] = json.loads(Path(__file__).with_name('basis_counts.json').read_text())


def basis_functions(atoms, basis: str) -> int:
    table = COUNTS[basis]
    return sum(table[SYMBOLS[int(a[0]) - 1]] for a in atoms)
