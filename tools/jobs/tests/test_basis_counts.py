import json
import os
from pathlib import Path

import pytest

from jobs.basis_counts import COUNTS, basis_functions
from jobs.elements import SYMBOLS, atomic_number
from jobs.errors import JobRefused


def test_symbols_cover_h_to_kr():
    assert len(SYMBOLS) == 36 and SYMBOLS[0] == 'H' and SYMBOLS[35] == 'Kr'


@pytest.mark.parametrize('token,z', [('H', 1), ('h', 1), ('CL', 17), ('cl', 17), ('Kr', 36), ('8', 8)])
def test_atomic_number_accepts_symbols_any_case_and_numbers(token, z):
    assert atomic_number(token) == z


@pytest.mark.parametrize('token,code', [('Rb', 'element-out-of-range'), ('37', 'element-out-of-range'),
                                        ('Xx', 'invalid-geometry'), ('0', 'invalid-geometry')])
def test_atomic_number_refuses(token, code):
    with pytest.raises(JobRefused) as e:
        atomic_number(token)
    assert e.value.code == code


def test_known_counts():
    # PySCF 2.8.0, spherical functions (measured 2026-10-05).
    assert COUNTS['def2-SVP']['H'] == 5 and COUNTS['def2-SVP']['O'] == 14
    assert COUNTS['def2-TZVPD']['H'] == 9 and COUNTS['def2-TZVPD']['O'] == 40 and COUNTS['def2-TZVPD']['Kr'] == 57


def test_water_benzene_caffeine():
    water = [[8, 0, 0, 0], [1, 0, 0, 1], [1, 0, 1, 0]]
    assert basis_functions(water, 'def2-TZVPD') == 58
    assert basis_functions(water, 'def2-SVP') == 24
    benzene = [[6, 0, 0, i] for i in range(6)] + [[1, 0, 1, i] for i in range(6)]
    assert basis_functions(benzene, 'def2-TZVPD') == 276
    caffeine = [[6, 0, 0, i] for i in range(8)] + [[7, 0, 1, i] for i in range(4)] + \
               [[8, 0, 2, i] for i in range(2)] + [[1, 0, 3, i] for i in range(10)]
    assert basis_functions(caffeine, 'def2-TZVPD') == 614


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='builds 72 PySCF molecules')
def test_table_matches_pyscf():
    from jobs.make_basis_counts import counts
    assert counts() == json.loads((Path(__file__).parents[1] / 'basis_counts.json').read_text())
