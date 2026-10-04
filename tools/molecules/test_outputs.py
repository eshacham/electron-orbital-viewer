import gzip
import json

import numpy as np
import pytest
from pyscf import gto

from molecules import ANGSTROM_TO_BOHR, DIATOMICS
from outputs import (SELECTION_TIE_MARGIN, assign_roles, cached, check_scan_labels, density_on_grid, grid_spec,
                     orbital_entries)

_BY_ID = {d.id: d for d in DIATOMICS}


def test_grid_is_a_centred_cube_holding_both_atoms_with_padding():
    grid = grid_spec(2.07)
    side = grid['shape'][0]
    assert grid['shape'] == [side, side, side] and side % 2 == 1
    half = (side - 1) * grid['spacing'] / 2
    assert grid['origin'] == [-half] * 3
    assert half >= 2.07 / 2 + 6.5


def test_a_fixture_grid_has_the_side_asked_for_and_still_holds_the_molecule():
    grid = grid_spec(2.07, side=41)
    assert grid['shape'] == [41, 41, 41]
    half = 20 * grid['spacing']
    assert grid['origin'] == [-half] * 3
    assert 2.07 / 2 + 6.5 <= half < 2.07 / 2 + 6.5 + 20 * 1.01e-6   # spacing rounded up to 1e-6 bohr


def test_density_grid_is_z_fastest():
    shells = [{'atom': 0, 'l': 0, 'exponents': [2.0], 'coefficients': [1.0]}]
    orbitals = [{'occupation': 2.0, 'coefficients': [1.0]}]
    grid = {'shape': [5, 5, 5], 'origin': [-1.0, -1.0, -1.0], 'spacing': 0.5}
    rho = density_on_grid(shells, [[0.0, 0.0, 0.5]], orbitals, grid)
    assert rho.dtype == np.dtype('<f4')
    assert int(np.argmax(rho)) == (2 * 5 + 2) * 5 + 3   # i = j = 2 (x = y = 0), k = 3 (z = 0.5)


def test_roles_restricted_and_unrestricted():
    restricted = [{'spin': 'restricted', 'label': 'a', 'energyHartree': -1.0, 'occupation': 2.0},
                  {'spin': 'restricted', 'label': 'b', 'energyHartree': -0.5, 'occupation': 2.0},
                  {'spin': 'restricted', 'label': 'c', 'energyHartree': 0.1, 'occupation': 0.0}]
    assign_roles(restricted)
    assert [e.get('role') for e in restricted] == [None, 'HOMO', 'LUMO']
    open_shell = [{'spin': 'alpha', 'label': '1πg*', 'energyHartree': -0.3, 'occupation': 1.0},
                  {'spin': 'beta', 'label': '1πg*', 'energyHartree': -0.1, 'occupation': 0.0}]
    assign_roles(open_shell)
    assert [e.get('role') for e in open_shell] == ['SOMO', 'LUMO']


def test_no_lumo_role_when_the_true_lumo_is_not_shipped():
    # The kept virtuals are chosen by minimal-basis character, not energy, so
    # a diffuse orbital below them may be the calculation's real LUMO.
    entries = [{'spin': 'restricted', 'label': 'a', 'energyHartree': -0.5, 'occupation': 2.0},
               {'spin': 'restricted', 'label': 'b', 'energyHartree': 0.1, 'occupation': 0.0}]
    assign_roles(entries, lowest_empty_energy=-0.02)
    assert [e.get('role') for e in entries] == ['HOMO', None]
    assign_roles(entries, lowest_empty_energy=0.1)
    assert [e.get('role') for e in entries] == ['HOMO', 'LUMO']


def test_basis_json_serves_any_scf_result():
    # Phase 6's contract: generate.basis_json(mol, mf) for molecules that are not diatomic scans.
    from pyscf import scf
    import generate
    mol = gto.M(atom='H 0 0 0; H 0 0 0.74', basis='sto-3g', verbose=0)
    payload = generate.basis_json(mol, scf.RHF(mol).run())
    assert payload['nao'] == 2 and 'id' not in payload
    assert [o['label'] for o in payload['orbitals']] == ['MO 1', 'MO 2']
    json.dumps(payload)


def test_cached_computes_once(tmp_path, monkeypatch):
    import outputs
    monkeypatch.setattr(outputs, 'CACHE_DIR', tmp_path)
    calls = []
    settings = {'id': 'n2', 'RBohr': repr(2.0), 'reference': 'RHF'}
    assert cached(settings, lambda: calls.append(1) or 1.5) == 1.5
    assert cached(dict(settings), lambda: calls.append(1) or 9.9) == 1.5
    assert calls == [1]


def test_a_change_of_reference_misses_the_cache(tmp_path, monkeypatch):
    """Ruling T4-b: anything that decides the number is in the key, and the
    stored settings are compared on read."""
    import outputs
    monkeypatch.setattr(outputs, 'CACHE_DIR', tmp_path)
    assert cached({'id': 'o2', 'reference': 'UHF'}, lambda: 1.0) == 1.0
    assert cached({'id': 'o2', 'reference': 'RHF'}, lambda: 2.0) == 2.0
    assert cached({'id': 'o2', 'reference': 'UHF'}, lambda: 3.0) == 1.0
    # A file whose stored settings disagree with its name (a hash collision,
    # or a hand edit) is recomputed, not trusted.
    path = next(tmp_path.glob('o2-*.json'))
    stored = json.loads(path.read_text())
    stored['settings']['reference'] = 'ROHF'
    path.write_text(json.dumps(stored))
    recomputed = [cached({'id': 'o2', 'reference': r}, lambda: 4.0) for r in ('UHF', 'RHF')]
    assert sorted(recomputed) == [2.0, 4.0]
    monkeypatch.setattr(outputs, 'CACHE_SCHEMA', outputs.CACHE_SCHEMA + 1)
    assert cached({'id': 'o2', 'reference': 'RHF'}, lambda: 5.0) == 5.0


def test_reference_settings_name_what_decides_the_energy():
    from quantum import reference_setup
    o2 = _BY_ID['o2']
    triplet = reference_setup(o2, 2.28)[2]
    singlet = reference_setup(o2, 2.28, spin=0, symmetry=False)[2]
    assert (triplet['reference'], singlet['reference']) == ('UHF', 'RHF')
    assert triplet['pinned'] and singlet['pinned'] is None
    assert triplet['frozen'] == 2 and triplet['RBohr'] == repr(2.28)
    assert {'method', 'basis', 'spin', 'thresholds', 'pyscf', 'symmetry'} <= set(triplet)


def test_generator_writes_under_the_versioned_out_root():
    import generate
    import version
    from molecules import REPO_ROOT
    assert generate.OUT is version.OUT_ROOT
    assert version.OUT_ROOT.relative_to(REPO_ROOT).as_posix() == f'tools/molecules/out/{version.DATA_VERSION}'


def _kohn_sham(molecule_id, factor):
    from quantum import kohn_sham
    d = _BY_ID[molecule_id]
    return kohn_sham(d, d.r_ref_angstrom * factor * ANGSTROM_TO_BOHR)


def test_a_near_tie_in_the_kept_virtuals_is_recorded_on_the_orbital():
    """CO at 0.80 R_e (Task 3's carry): the last virtual kept and the first
    left out have minimal-basis weights 0.26 and 0.26. The pick is recorded,
    with both weights, on the orbital that won it."""
    mol, mf = _kohn_sham('co', 0.80)
    entries = orbital_entries(mol, mf, homonuclear=False)
    tied = [e for e in entries if 'nearTie' in e]
    assert [e['label'] for e in tied] == ['6σ']
    tie = tied[0]['nearTie']
    assert tie['minaoWeight'] - tie['runnerUpMinaoWeight'] < SELECTION_TIE_MARGIN
    assert isinstance(tie['runnerUpEnergyHartree'], float)
    assert tie['runnerUpEnergyHartree'] != tied[0]['energyHartree']


def test_a_clear_selection_records_no_tie():
    mol, mf = _kohn_sham('n2', 1.00)
    assert not any('nearTie' in e for e in orbital_entries(mol, mf, homonuclear=True))


def test_labels_must_agree_across_a_scan():
    def entries(*labels):
        return [{'spin': 'restricted', 'label': label, 'occupation': 2.0} for label in labels]
    check_scan_labels('x', [entries('1σg', '1σu*'), entries('1σu*', '1σg')])
    with pytest.raises(ValueError, match=r'x@01.*1πu'):
        check_scan_labels('x', [entries('1σg', '1σu*'), entries('1σg', '1πu')])


def test_fixtures_are_reduced_copies_of_the_generated_files(tmp_path):
    """--fixtures reads what the generator wrote (so the TS tests check the
    data that is published), shrinks the density grid, and adds PySCF's own
    orbital values at a few points."""
    import generate
    from basis_export import evaluate_aos
    from outputs import FIXTURE_POINTS, write_fixtures
    out_root, dest = tmp_path / 'out', tmp_path / 'fixtures'
    mol, mf = _kohn_sham('h2', 1.00)
    r = float(mol.atom_coord(1)[2] - mol.atom_coord(0)[2])
    basis = {'id': 'h2', **generate.basis_json(mol, mf)}
    meta = {'id': 'h2', 'atoms': [{'Z': 1, 'position': p} for p in basis['atoms']], 'spin': 0, 'grid': grid_spec(r)}
    for name, data in (('meta', meta), ('basis', basis), ('scan', {'id': 'h2', 'points': []})):
        (out_root / 'h2').mkdir(parents=True, exist_ok=True)
        (out_root / 'h2' / f'{name}.json').write_text(json.dumps(data))

    write_fixtures(out_root, dest, density_id='h2', basis_ids=('h2',))

    small = json.loads((dest / 'h2' / 'meta.json').read_text())
    assert small['grid'] == grid_spec(r, side=41)
    assert json.loads((dest / 'h2' / 'basis.json').read_text()) == basis
    assert json.loads((dest / 'h2' / 'scan.json').read_text()) == {'id': 'h2', 'points': []}
    rho = np.frombuffer(gzip.decompress((dest / 'h2' / 'density.bin.gz').read_bytes()), dtype='<f4')
    assert np.array_equal(rho, density_on_grid(basis['shells'], basis['atoms'], basis['orbitals'], small['grid']))
    values = json.loads((dest / 'h2.json').read_text())
    ao = mol.eval_gto('GTOval_sph', np.asarray(FIXTURE_POINTS))
    # Every AO on its own as well: an AO no shipped orbital uses (a δ d or f
    # function in a σ/π molecule) is invisible in the orbital values.
    assert np.array_equal(np.asarray(values['aos']), ao)
    for orbital, shipped in zip(values['orbitals'], basis['orbitals']):
        assert orbital['index'] == shipped['index']
        assert np.allclose(orbital['values'], ao @ np.asarray(shipped['coefficients']), rtol=0, atol=1e-13)
    ours = evaluate_aos(basis['shells'], basis['atoms'], FIXTURE_POINTS)
    density = sum(o['occupation'] * (ours @ np.asarray(o['coefficients'])) ** 2 for o in basis['orbitals'])
    assert np.allclose(values['density'], density, rtol=1e-10, atol=0)
    assert sum(p.stat().st_size for p in dest.rglob('*') if p.is_file()) < 1024 * 1024


def test_fixtures_say_what_to_generate_first(tmp_path):
    from outputs import write_fixtures
    with pytest.raises(FileNotFoundError, match=r'generate\.py --only n2'):
        write_fixtures(tmp_path / 'out', tmp_path / 'fixtures', density_id='n2', basis_ids=('o2', 'hf'))


def test_a_refused_curve_writes_nothing(tmp_path, monkeypatch):
    """Review M6: validation happens before any file is written. A curve
    that turns over before R_e has fewer than eight valid points and is
    refused; the molecule's folder must not appear."""
    import generate
    from molecules import SCAN_FACTORS
    energies = [-1.0 - 0.01 * k for k in range(5)] + [-1.06 + 0.01 * k for k in range(15)]
    energies[5] = energies[4] - 0.001
    energies[6] = energies[5] - 0.002   # minimum at 6, then
    energies[7] = energies[6] - 0.0     # flat: a turnover at index 7
    results = iter([{'energyHartree': e, 'converged': True, 't1Diagnostic': 0.01, 'failure': None}
                    for e in energies])
    monkeypatch.setattr(generate, 'reference_point', lambda d, r, **kw: next(results))
    monkeypatch.setattr(generate, 'separated_atoms', lambda d: (0.0, 'mock atoms'))
    with pytest.raises(ValueError, match=r'n2: single-reference CCSD\(T\) is valid for only 7 of 20 points'):
        generate.run_molecule(_BY_ID['n2'], 'abc', out=tmp_path)
    assert list(tmp_path.iterdir()) == []
    assert len(SCAN_FACTORS) == 20


def test_a_multireference_molecule_ships_flagged(tmp_path, monkeypatch):
    """Ruling T4-d end to end: T1 over the closed-shell bar at R_e (as for
    C₂) keeps the curve, to 1.5 × T1(R_e), and every meta says
    multireference with the T1 it was judged on. Energies are mocked; the
    Kohn-Sham orbitals and the files are real."""
    import generate
    energies = [-1.0 - 0.01 * k for k in range(8)] + [-1.07 + 0.002 * k for k in range(1, 13)]
    t1 = [0.03] * 8 + [0.03 + 0.003 * k for k in range(1, 13)]   # limit 0.045: 0.045 at 12, 0.048 at 13
    results = iter([{'energyHartree': e, 'converged': True, 't1Diagnostic': t, 'failure': None}
                    for e, t in zip(energies, t1)])
    monkeypatch.setattr(generate, 'reference_point', lambda d, r, **kw: next(results))
    monkeypatch.setattr(generate, 'separated_atoms', lambda d: (-0.9, 'mock atoms'))
    generate.run_molecule(_BY_ID['n2'], 'abc', out=tmp_path)
    scan = json.loads((tmp_path / 'n2' / 'scan.json').read_text())
    assert scan['validity']['multireference'] is True and scan['validity']['t1AtRe'] == 0.03
    assert scan['validity']['pointsShipped'] == len(scan['points']) == 13
    assert 'T1 diagnostic 0.0480 exceeds 0.0450' in scan['validity']['stopReason']
    assert not (tmp_path / 'n2' / 'scan' / '13').exists()
    for meta in [tmp_path / 'n2' / 'meta.json', *(tmp_path / 'n2' / 'scan').glob('*/meta.json')]:
        data = json.loads(meta.read_text())
        assert data['multireference'] is True and data['t1AtRe'] == 0.03
    assert [p.name for p in tmp_path.iterdir()] == ['n2']   # no staging directory left behind


def test_lithium_says_why_its_whole_curve_ships():
    from outputs import energy_method_label
    li2 = _BY_ID['li2']
    assert 'exact (full CI) for the two valence electrons' in energy_method_label(li2, 0, exact=True)
    assert 'exact' in li2.note and energy_method_label(_BY_ID['n2'], 0) == 'CCSD(T)/aug-cc-pVTZ (frozen core)'
