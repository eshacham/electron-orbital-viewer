import pytest

from jobs.canonical import (RECIPES, canonical_atoms, canonical_job, check_atoms, electron_count, formula, job_key,
                            multiplicity_for, parse_xyz)
from jobs.errors import JobRefused

WATER = [[1, 0.0, -0.75545, -0.47116], [1, 0.0, 0.75545, -0.47116], [8, 0.0, 0.0, 0.11779]]


def test_pinned_keys():
    # Pinned 2026-10-06 (def2-TZVPD) with rfc8785 0.1.4; a change here silently orphans every stored result.
    assert job_key(canonical_job('single', WATER, 0, 1)) == 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'
    assert job_key(canonical_job('optimise', WATER, 0, 1)) == '03e7648c54cbaf4888bb69434e8fb27b5a6091792ac0179f64981300902ab129'
    assert job_key(canonical_job('single', WATER, 1, 2)) == '7ccc1f468a6ecd3449b16bcb0dd483d36509971f523d770cdf3717f570753a5a'


def test_key_ignores_order_sign_of_zero_and_digits_past_1e5():
    shuffled = [[8, -0.0, 0.0, 0.117791], [1, 0.0, 0.755451, -0.471159], [1, 0.0, -0.75545, -0.47116]]
    assert job_key(canonical_job('single', shuffled, 0, 1)) == job_key(canonical_job('single', WATER, 0, 1))


def test_canonical_document_shape():
    job = canonical_job('optimise', WATER, 0, 1)
    assert job == {'computeVersion': 1, 'recipe': 'optimise',
                   'method': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'},
                   'molecule': {'atoms': canonical_atoms(WATER), 'charge': 0, 'multiplicity': 1}}
    assert RECIPES['single']['optimiseBasis'] is None


def test_method_override_is_for_tests_only_but_changes_the_key():
    small = canonical_job('single', WATER, 0, 1, method={'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': None})
    assert job_key(small) != job_key(canonical_job('single', WATER, 0, 1))


def test_unknown_recipe():
    with pytest.raises(JobRefused) as e:
        canonical_job('scan', WATER, 0, 1)
    assert e.value.code == 'invalid-request'


def test_parse_xyz_with_and_without_header():
    text = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nh 0 -0.75545 -0.47116\n'
    assert parse_xyz(text) == [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
    assert parse_xyz('8 0 0 0.11779\n1 0 0.75545 -0.47116\n1 0 -0.75545 -0.47116') == parse_xyz(text)


@pytest.mark.parametrize('text,code', [
    ('', 'invalid-geometry'),
    ('3\nwater\nO 0 0 0\nH 0 0 1\n', 'invalid-geometry'),              # header says 3, two atoms follow
    ('O 0 0\n', 'invalid-geometry'),                                    # missing z
    ('O 0 0 nan\n', 'invalid-geometry'),
    ('O 0 0 1e9\n', 'invalid-geometry'),
    ('Rb 0 0 0\n', 'element-out-of-range'),
    ('O 0 0 0\nH 0 0 0.1\n', 'invalid-geometry'),                       # closer than 0.3 Å
    ('H 0 0 0\n' * 1, None),
])
def test_parse_and_check_refusals(text, code):
    if code is None:
        check_atoms(parse_xyz(text))
        return
    with pytest.raises(JobRefused) as e:
        check_atoms(parse_xyz(text))
    assert e.value.code == code


def test_size_limits():
    with pytest.raises(JobRefused) as e:
        parse_xyz('H 0 0 0\n' + 'x' * 65536)
    assert e.value.code == 'invalid-geometry'
    many = ''.join(f'H 0 0 {i}\n' for i in range(201))
    with pytest.raises(JobRefused) as e:
        check_atoms(parse_xyz(many))
    assert e.value.code == 'invalid-geometry'


def test_electrons_and_multiplicity():
    assert electron_count(WATER, 0) == 10 and electron_count(WATER, 1) == 9
    assert multiplicity_for(10, None) == 1 and multiplicity_for(9, None) == 2
    assert multiplicity_for(10, 3) == 3
    for electrons, requested in ((10, 2), (9, 1), (10, 0), (2, 5)):
        with pytest.raises(JobRefused) as e:
            multiplicity_for(electrons, requested)
        assert e.value.code == 'bad-multiplicity'
    with pytest.raises(JobRefused) as e:
        electron_count([[1, 0, 0, 0]], 1)
    assert e.value.code == 'bad-multiplicity'


def test_hill_formula():
    assert formula(WATER) == 'H2O'
    caffeine = [[6, 0, 0, i] for i in range(8)] + [[1, 1, 0, i] for i in range(10)] + \
               [[7, 2, 0, i] for i in range(4)] + [[8, 3, 0, i] for i in range(2)]
    assert formula(caffeine) == 'C8H10N4O2'
    assert formula([[17, 0, 0, 0], [11, 0, 0, 2.4]]) == 'ClNa'      # no carbon: alphabetical
