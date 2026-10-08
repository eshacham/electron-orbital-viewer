import json

import numpy as np
import pytest

from build_library import BudgetExceeded, build_molecule, check_box, merge_index, validation_rows
from compact import read_float32_gz
from library import by_id


@pytest.fixture(scope='module')
def water(tmp_path_factory):
    out = tmp_path_factory.mktemp('molecules')
    entry = build_molecule(by_id('h2o'), out_root=out, basis='def2-SVP', grid_points=(40,))
    return out, entry, json.loads((out / 'h2o' / 'meta.json').read_text())


def test_writes_the_four_spec_files(water):
    out, entry, meta = water
    assert {p.name for p in (out / 'h2o').iterdir()} == {'meta.json', 'density.bin.gz', 'esp.bin.gz', 'basis.json'}
    assert entry == {'id': 'h2o', 'name': 'Water', 'formula': 'H2O', 'category': 'first-examples', 'tags': ['polarity', 'hybridisation']}


def test_meta_carries_grids_method_and_the_additions(water):
    _, _, meta = water
    assert meta['grid']['shape'] == [40, 40, 40] and meta['espGrid']['shape'] == [20, 20, 20]
    assert meta['method'] == {'density': 'B3LYP-D3(BJ)/def2-SVP', 'energies': 'B3LYP-D3(BJ)/def2-SVP'}
    assert meta['dispersion']['model'] == 'D3(BJ)' and -0.001 < meta['dispersion']['energyHartree'] < 0
    assert meta['dispersion']['backend'].startswith(('pyscf-dispersion ', 'dftd3 '))
    assert meta['geometrySource'] == 'experiment (CCCBDB)' and meta['electronCount'] == 10 and meta['multiplicity'] == 1
    assert len(meta['dipoleVectorDebye']) == 3 and 1.7 < meta['dipoleDebye'] < 2.3
    assert meta['espRangeOnSurface'][0] < 0 < meta['espRangeOnSurface'][1]
    assert meta['symmetry']['pointGroup'] == 'C2v'
    assert {'quantity': 'dipole', 'value': 1.855, 'unit': 'D', 'source': 'CRC Handbook, via CCCBDB', 'tolerance': pytest.approx(0.1855)} in meta['references']


def test_shipped_density_integrates_to_ten_electrons(water):
    out, _, meta = water
    rho = read_float32_gz(out / 'h2o' / 'density.bin.gz')
    assert rho.size == 40 ** 3
    assert abs(rho.astype(np.float64).sum() * meta['grid']['spacing'] ** 3 - 10) / 10 < 0.005
    assert meta['densityIntegral'] == pytest.approx(rho.astype(np.float64).sum() * meta['grid']['spacing'] ** 3)


def test_budget_guard(tmp_path):
    with pytest.raises(BudgetExceeded):
        build_molecule(by_id('h2o'), out_root=tmp_path, basis='def2-SVP', grid_points=(40,), budget=1000)


def test_check_box_rejects_density_at_a_face():
    rho = np.zeros((4, 4, 4))
    rho[1, 1, 3] = 2e-5
    with pytest.raises(RuntimeError, match='box face'):
        check_box(rho)
    check_box(np.zeros((4, 4, 4)))


def test_merge_index_keeps_other_entries_and_orders_the_library(tmp_path):
    path = tmp_path / 'index.json'
    path.write_text(json.dumps([{'id': 'h2', 'name': 'Hydrogen', 'formula': 'H2', 'category': 'diatomic', 'tags': []},
                                {'id': 'nh3', 'name': 'old', 'formula': 'NH3', 'category': 'first-examples', 'tags': []}]))
    merge_index(path, [{'id': 'h2o', 'name': 'Water', 'formula': 'H2O', 'category': 'first-examples', 'tags': []}])
    merge_index(path, [{'id': 'nh3', 'name': 'Ammonia', 'formula': 'NH3', 'category': 'first-examples', 'tags': []}])
    assert [(e['id'], e['name']) for e in json.loads(path.read_text())] == [('h2', 'Hydrogen'), ('h2o', 'Water'), ('nh3', 'Ammonia')]


def test_validation_rows_have_the_phase1_shape(water):
    _, _, meta = water
    rows = validation_rows(by_id('h2o'), meta)
    keys = {'phase', 'quantity', 'system', 'app', 'reference', 'unit', 'tolerancePercent', 'referenceSource', 'method',
            'geometrySource'}
    geometry_rows = {'bond length O–H', 'angle H–O–H'}
    assert all(r['phase'] == 6 and set(r) == (keys | {'notATest'} if r['quantity'] in geometry_rows else keys) for r in rows)
    assert all(r['geometrySource'] == 'experiment (CCCBDB)' for r in rows)
    assert {r['notATest'] for r in rows if 'notATest' in r} == {'geometry from experiment (not a test of the method)'}
    by_quantity = {r['quantity']: r for r in rows}
    assert set(by_quantity) == {'bond length O–H', 'angle H–O–H', 'dipole moment', 'electrons in shipped density grid'}
    assert by_quantity['bond length O–H']['app'] == pytest.approx(0.958, abs=2e-3)
    assert by_quantity['angle H–O–H']['unit'] == '°' and by_quantity['dipole moment']['tolerancePercent'] == pytest.approx(10.0)
    # D28 (ruling, W/progress.md): the dipole floor (10 % or 0.05 D, whichever
    # is larger) must be visible in the row's own method, not just in code.
    assert by_quantity['dipole moment']['method'].endswith('tolerance 10 % or 0.05 D, whichever is larger')


def test_an_optimised_molecules_geometry_rows_count_as_validation():
    entry = by_id('ethanol')
    meta = {'atoms': [{'position': [0.0, 0.0, 0.0]}] * 9, 'geometrySource': entry.geometry_source,
            'dipoleDebye': 1.5, 'method': {'density': 'B3LYP-D3(BJ)/def2-TZVPD'}, 'densityIntegral': 26.0,
            'electronCount': 26, 'grid': {'shape': [96, 96, 96]}}
    rows = validation_rows(entry, meta)
    assert all('notATest' not in r and r['geometrySource'] == entry.geometry_source for r in rows)


def test_the_generator_commit_can_be_supplied(monkeypatch):
    import generate
    monkeypatch.setenv('MOLECULES_GENERATOR_COMMIT', 'abc123-dirty')
    assert generate.git_commit() == 'abc123-dirty'


# D1 (preflight controller correction): basis.json must be built from Phase
# 6's own orbital rows (library_basis_json), not generate.basis_json, so that
# a 'gaussianMO' recipe's position-addressed index always names the orbital
# meta.json's orbital list shows at that position.
def test_basis_json_orbitals_match_metas_orbitals_by_position(water):
    out, _, meta = water
    basis = json.loads((out / 'h2o' / 'basis.json').read_text())
    key = lambda rows: [(r['index'], r['label'], r['energyHartree']) for r in rows]
    assert key(basis['orbitals']) == key(meta['orbitals'])
    assert basis['orbitals']  # non-empty: the water fixture actually has orbitals to compare


# D25 (preflight controller correction, carried from Task 4): build_molecule
# must call density.check_density on the voxel-averaged density before
# compaction, so a genuine negative artefact is reported rather than
# silently flushed to zero by compact_float32's floor.
def test_build_molecule_refuses_a_negative_density(monkeypatch, tmp_path):
    import build_library

    bad = -np.ones((40, 40, 40))
    monkeypatch.setattr(build_library, 'voxel_averaged_density', lambda *a, **k: bad)
    with pytest.raises(ValueError):
        build_library.build_molecule(by_id('h2o'), out_root=tmp_path, basis='def2-SVP', grid_points=(40,))


def test_meta_carries_the_symmetry_and_classes_basis_json_the_same_rows(water):
    out, _, meta = water
    assert meta['symmetry'] == {'pointGroup': 'C2v', 'labelGroup': 'C2v', 'labels': 'full-group'}
    virtuals = [o for o in meta['orbitals'] if o['occupation'] == 0]
    assert virtuals and all(o['class'] in ('valence', 'diffuse') and 0 <= o['valenceCharacter'] <= 1 for o in virtuals)
    basis = json.loads((out / 'h2o' / 'basis.json').read_text())
    assert len(basis['orbitals']) == len(meta['orbitals'])


def test_a_valence_virtual_orbital_ships_its_own_coefficients(tmp_path):
    # Water at def2-TZVPD: the LVMO is not a canonical MO, so basis.json carries its coefficients and no pyscfIndex,
    # and both files carry Ruling D4's flag and caption wherever the row is read.
    from orbitals import CONSTRUCTED_NOTE
    build_molecule(by_id('h2o'), out_root=tmp_path, basis='def2-TZVPD', grid_points=(40,), budget=10_000_000)
    meta = json.loads((tmp_path / 'h2o' / 'meta.json').read_text())
    basis = json.loads((tmp_path / 'h2o' / 'basis.json').read_text())
    lvmo = basis['orbitals'][-1]
    assert lvmo['role'] == 'LVMO' and lvmo['kind'] == 'valence-virtual' and 'pyscfIndex' not in lvmo
    assert lvmo['index'] == len(meta['orbitals']) - 1 and len(lvmo['coefficients']) == basis['nao']
    assert all(o['pyscfIndex'] == o['index'] for o in basis['orbitals'][:-1])
    for row in (lvmo, meta['orbitals'][-1]):
        assert row['constructed'] is True and row['energyApproximate'] is True and row['note'] == CONSTRUCTED_NOTE
