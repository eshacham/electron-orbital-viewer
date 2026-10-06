"""Regenerates basis_counts.json from PySCF: run after a PySCF upgrade.

    cd tools && ../tools/molecules/.venv/bin/python -m jobs.make_basis_counts
"""
import json
from pathlib import Path

from jobs.elements import SYMBOLS

BASES = ('def2-SVP', 'def2-TZVPD')


def counts():
    from pyscf import gto
    # spin = Z mod 2 only so PySCF accepts the lone atom; it does not change the count.
    return {basis: {s: gto.M(atom=f'{s} 0 0 0', basis=basis, spin=(i + 1) % 2, verbose=0).nao_nr()
                    for i, s in enumerate(SYMBOLS)} for basis in BASES}


if __name__ == '__main__':
    path = Path(__file__).with_name('basis_counts.json')
    path.write_text(json.dumps(counts(), indent=1) + '\n')
    print(f'wrote {path}')
