import json

from build_library import run_dft, write_molecule_files


def test_writes_phase_6_files_from_any_scf(tmp_path):
    mol, mf = run_dft([('H', (0, 0, 0)), ('H', (0, 0, 0.74))], 0, 'def2-SVP', 'B3LYP')
    meta = write_molecule_files(tmp_path, mol, mf, {
        'id': 'k' * 64, 'name': 'Hydrogen', 'formula': 'H2', 'geometrySource': 'pasted XYZ', 'method': 'B3LYP/def2-SVP',
        'references': [], 'multiplicity': 1, 'tier': 'computed', 'provenance': {'jobKey': 'k' * 64}},
        grid_points=(32,))
    assert {p.name for p in tmp_path.iterdir()} == {'meta.json', 'density.bin.gz', 'esp.bin.gz', 'basis.json'}
    on_disk = json.loads((tmp_path / 'meta.json').read_text())
    assert on_disk == meta and meta['tier'] == 'computed' and meta['method']['density'] == 'B3LYP/def2-SVP'
    assert abs(meta['densityIntegral'] - 2) < 0.02


def test_commit_parameter_overrides_git(tmp_path):
    # D2 (preflight controller correction): the worker container has no git,
    # so write_molecule_files must take the commit rather than always
    # shelling out to find one.
    mol, mf = run_dft([('H', (0, 0, 0)), ('H', (0, 0, 0.74))], 0, 'def2-SVP', 'B3LYP')
    meta = write_molecule_files(tmp_path, mol, mf, {
        'id': 'k' * 64, 'name': 'Hydrogen', 'formula': 'H2', 'geometrySource': 'pasted XYZ', 'method': 'B3LYP/def2-SVP',
        'references': [], 'multiplicity': 1}, grid_points=(32,), commit='deadbeef')
    assert meta['generator']['commit'] == 'deadbeef'
