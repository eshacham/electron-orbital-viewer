import pytest

from library import CATEGORIES, LIBRARY, OPTIMISED, by_id
from measure import angle, dihedral, measure

SPEC_IDS = {'h2o', 'nh3', 'ch4', 'co2', 'c2h2', 'c2h4', 'c2h6', 'hcn', 'h2co', 'ch3oh', 'hcooh', 'bf3', 'sf6',
            'benzene', 'pyridine', 'formamide', 'glycine', 'ethanol', 'acetone', 'o3', 'no2', 'so2', 'ph3', 'h2s', 'sih4'}
OPTIMISED_IDS = {'ch3oh', 'hcooh', 'pyridine', 'formamide', 'glycine', 'ethanol', 'acetone'}


def test_the_spec_list_exactly():
    ids = [m.id for m in LIBRARY]
    assert len(ids) == len(set(ids)) == 25
    assert set(ids) == SPEC_IDS


def test_every_category_has_a_primary_member_and_categories_are_known():
    assert {m.category for m in LIBRARY} == set(CATEGORIES)


def test_exactly_the_seven_are_optimised_and_have_a_start():
    assert {m.id for m in LIBRARY if m.optimised} == OPTIMISED_IDS
    for m in LIBRARY:
        assert (m.zmatrix or m.atoms), m.id
        assert m.geometry_source == OPTIMISED or m.atoms, m.id


@pytest.mark.parametrize('entry', [m for m in LIBRARY if not m.optimised], ids=lambda m: m.id)
def test_experimental_geometries_reproduce_their_parameters(entry):
    coords = [xyz for _, xyz in entry.atoms]
    for ref in entry.references:
        if ref.quantity in ('bond', 'angle'):
            assert measure(ref, coords) == pytest.approx(ref.value, abs=1e-6), ref.label


def test_symmetric_builders_make_every_equivalent_angle_equal():
    coords = [xyz for _, xyz in by_id('nh3').atoms]
    assert angle(coords[1], coords[0], coords[3]) == pytest.approx(106.7, abs=1e-9)
    assert angle(coords[2], coords[0], coords[3]) == pytest.approx(106.7, abs=1e-9)


def test_dipole_tolerance_is_ten_percent_with_a_floor():
    tol = {m.id: next(r.tolerance for r in m.references if r.quantity == 'dipole') for m in LIBRARY}
    assert tol['h2o'] == pytest.approx(0.1855)
    assert tol['no2'] == pytest.approx(0.05)
    assert tol['ch4'] == pytest.approx(0.01)


def test_dihedral_sign_and_wrap():
    assert dihedral((1, 0, 0), (0, 0, 0), (0, 0, 1), (1, 0, 1)) == pytest.approx(0.0, abs=1e-9)
    assert abs(dihedral((1, 0, 0), (0, 0, 0), (0, 0, 1), (-1, 0, 1))) == pytest.approx(180.0)
