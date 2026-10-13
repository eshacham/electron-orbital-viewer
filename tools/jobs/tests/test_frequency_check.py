"""Recipe B's frequency check (Phase 6D spec §7), run through the rendered input.py itself."""
import json
import os
import runpy
from pathlib import Path

import numpy as np
import pytest

from jobs.canonical import canonical_job
from jobs.input_template import predicted_frequencies_bytes, render_input, resumed_check

WATER = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
PLANAR_NH3 = [[7, 0.0, 0.0, 0.0], [1, 1.01, 0.0, 0.0], [1, -0.505, 0.8747, 0.0], [1, -0.505, -0.8747, 0.0]]
CHECKED = {'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': 'def2-SVP'}   # final SCF kept small
# Water's harmonic frequencies, experiment (CCCBDB: ω2, ω1, ω3), cm-1.
WATER_OMEGA = (1648.5, 3832.2, 3942.5)


def namespace(tmp_path, monkeypatch, atoms, multiplicity=1, method=CHECKED):
    monkeypatch.chdir(tmp_path)
    job = {**canonical_job('optimise', atoms, 0, multiplicity, method=method), 'computeVersion': 2}
    (tmp_path / 'input.py').write_text(render_input(job, 'k' * 64))
    return runpy.run_path('input.py', run_name='jobs_input')


def test_water_is_a_true_minimum_with_frequencies_near_experiment(tmp_path, monkeypatch):
    stages = []
    mol, mf, info = namespace(tmp_path, monkeypatch, WATER)['build'](on_stage=lambda s, e=None, c=None: stages.append(s))
    check = info['frequencyCheck']
    assert check['result'] == 'minimum' and check['summary'] == 'true minimum (no imaginary frequencies)'
    assert check['imaginaryCount'] == 0 and 'frequency check' in stages
    wavenumbers = info['frequencies']['wavenumbers']
    assert len(wavenumbers) == 3
    for computed, experiment in zip(sorted(wavenumbers), WATER_OMEGA):
        assert abs(computed - experiment) / experiment < 0.05               # spec §12: within 5 %
    assert check['zeroPointEnergyHartree'] == pytest.approx(0.5 * sum(wavenumbers) / 219474.6313705)
    assert len(info['frequencies']['normalModes']) == 3 and len(info['frequencies']['normalModes'][0]) == 3
    assert info['frequencies']['reducedMasses'][0] > 1.0


def test_a_planar_ammonia_is_detected_displaced_and_reoptimised_to_the_pyramid(tmp_path, monkeypatch):
    # Spec §12: a planar start converges to the D3h saddle point; one imaginary mode (the umbrella) takes it
    # to the C3v minimum.
    steps = []
    mol, mf, info = namespace(tmp_path, monkeypatch, PLANAR_NH3)['build'](on_step=lambda n, e, a: steps.append(n))
    check = info['frequencyCheck']
    assert check['result'] == 'minimum-after-displacement' and info['displacedFrom'] == 1
    assert check['summary'] == ('true minimum (no imaginary frequencies), reached by displacing a saddle point '
                                '(1 imaginary) and re-optimising')
    c = mol.atom_coords(unit='Angstrom')
    normal = np.cross(c[2] - c[1], c[3] - c[1])
    assert abs((c[0] - c[1]) @ normal / np.linalg.norm(normal)) > 0.3          # N well out of the H3 plane
    umbrella = min(info['frequencies']['wavenumbers'])
    assert 950 < umbrella < 1150
    assert steps == list(range(1, len(steps) + 1)) and info['steps'] == len(steps)   # one numbering across both runs


def test_a_saddle_that_survives_reoptimisation_is_labelled_a_saddle(tmp_path, monkeypatch):
    ns = namespace(tmp_path, monkeypatch, WATER)
    live = ns['check_structure'].__globals__
    real = live['frequency_check']

    def always_saddle(atoms, on_stage, stage='frequency check'):
        out = real(atoms, on_stage, stage)
        return {**out, 'imaginary': [-400.0], 'wavenumbers': [-400.0] + out['wavenumbers'][1:]}
    live['frequency_check'] = always_saddle
    _, _, info = ns['build']()
    assert info['frequencyCheck']['result'] == 'saddle-point'
    assert info['frequencyCheck']['summary'] == 'saddle point (1 imaginary frequency), not a minimum'
    assert info['displacedFrom'] == 1


def test_small_imaginary_values_are_noise_not_a_saddle(tmp_path, monkeypatch):
    summarise = namespace(tmp_path, monkeypatch, WATER)['summarise']
    check = {'imaginary': [], 'noise': [-31.0], 'wavenumbers': [-31.0, 1600.0, 3800.0], 'zeroPointEnergyHartree': 0.012}
    out = summarise(check)
    assert out['result'] == 'minimum' and out['lowestWavenumber'] == -31.0
    assert out['summary'] == ('true minimum (no imaginary frequencies); 1 small imaginary value above -50 cm-1 '
                              'treated as numerical noise')


def test_no_time_for_the_check_says_so_and_skips_it(tmp_path, monkeypatch):
    stages = []
    _, mf, info = namespace(tmp_path, monkeypatch, WATER)['build'](
        on_stage=lambda s, e=None, c=None: stages.append(s), may_start=lambda stage: stage != 'frequency check')
    assert info['frequencyCheck'] == {'result': 'not-run', 'summary': 'not checked: no time was left for the frequency check'}
    assert 'frequencies' not in info and 'frequency check' not in stages and mf.converged


def test_a_stopped_optimisation_is_not_checked(tmp_path, monkeypatch):
    _, _, info = namespace(tmp_path, monkeypatch, PLANAR_NH3)['build'](may_start=lambda stage: False)
    assert info['stoppedBy'] == 'time-limit'
    assert info['frequencyCheck'] == {'result': 'not-run', 'summary': 'not checked: the optimisation stopped at its time limit'}


def test_an_open_shell_is_checked_with_uks(tmp_path, monkeypatch):
    # Review Focus 3: PySCF 2.8 has no ROKS Hessian; OH's geometry work runs UKS, its final SCF ROKS.
    oh = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.98]]
    mol, mf, info = namespace(tmp_path, monkeypatch, oh, multiplicity=2,
                              method={'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'})['build']()
    assert info['frequencyCheck']['result'] == 'minimum' and len(info['frequencies']['wavenumbers']) == 1
    assert type(mf).__name__.endswith('ROKS')


def test_a_noisy_linear_molecule_is_symmetrised_onto_its_line_and_keeps_its_3n_minus_5_modes(tmp_path, monkeypatch):
    # Task 7 review M1: an optimised CO2 is linear only to numerical noise. symmetrised() lays it exactly on
    # its line before the check, so PySCF's harmonic analysis takes it for the linear rotor it is.
    ns = namespace(tmp_path, monkeypatch, WATER)
    noisy = [('O', (0.0, 4e-4, -1.16)), ('C', (2e-4, 0.0, 0.0)), ('O', (0.0, -4e-4, 1.16))]
    placed, order, moved = ns['symmetrised'](noisy)
    assert order is None and moved < 1e-3
    check = ns['frequency_check'](placed, lambda *a: None)
    assert len(check['wavenumbers']) == 4 and len(check['normalModes'][0]) == 3
    # on_axis stays: exactly on a line that is not an axis, the smallest moment rounds to about -1e-17, not 0,
    # and PySCF reads that as a non-linear rotor too.
    placed, axes = ns['on_axis'](placed)
    assert axes is not None and all(x == y == 0.0 for _, (x, y, _) in placed)
    assert ns['on_axis']([('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.76, 0.59)), ('H', (0.0, -0.76, 0.59))])[1] is None


def test_a_linear_molecule_off_the_z_axis_gets_its_modes_in_its_own_frame(tmp_path, monkeypatch):
    # The asymmetric stretch moves every atom along the molecule's own line; the bends move them across it.
    ns = namespace(tmp_path, monkeypatch, WATER)
    line = np.array([1.0, 1.0, 0.0]) / np.sqrt(2)
    tilted = [(s, tuple(float(v) for v in t * line)) for s, t in (('O', -1.16), ('C', 0.0), ('O', 1.16))]
    check = ns['frequency_check'](tilted, lambda *a: None)
    modes = np.asarray(check['normalModes'])
    along = np.abs(np.einsum('mak,k->ma', modes, line)).sum(axis=1)
    total = np.linalg.norm(modes, axis=2).sum(axis=1)
    assert along[-1] == pytest.approx(total[-1], rel=1e-3)                      # asymmetric stretch: on the line
    assert along[0] < 1e-3 * total[0] and along[1] < 1e-3 * total[1]            # the degenerate bend: across it


def test_the_check_analyses_the_geometry_the_final_scf_uses(tmp_path, monkeypatch):
    # Task 7 review M1: symmetrised before the check, so the frequencies belong to the reported geometry.
    ns = namespace(tmp_path, monkeypatch, WATER)
    live = ns['check_structure'].__globals__
    real, seen = live['frequency_check'], []
    live['frequency_check'] = lambda atoms, on_stage, stage='frequency check': seen.append(atoms) or real(atoms, on_stage, stage)
    mol, _, info = ns['build']()
    assert len(seen) == 1 and info['finalGeometry']['symmetrised']
    analysed = np.array([xyz for _, xyz in seen[0]])
    assert np.abs(analysed - mol.atom_coords(unit='Angstrom')).max() < 1e-12
    assert info['frequencies']['massesAmu'] == pytest.approx([1.008, 1.008, 15.999], abs=1e-3)   # H, H, O (canonical)


def test_no_time_to_displace_off_a_saddle_point_says_so(tmp_path, monkeypatch):
    # Task 7 review M2: the displacement, its re-optimisation and the recheck are asked for as a step.
    ns = namespace(tmp_path, monkeypatch, WATER)
    live = ns['check_structure'].__globals__
    real = live['frequency_check']
    live['frequency_check'] = lambda atoms, on_stage, stage='frequency check': {
        **real(atoms, on_stage, stage), 'imaginary': [-400.0]}
    calls = []

    def budget(stage):
        # Yes to every optimisation step and to the check; no to anything asked after the check.
        calls.append(stage)
        return 'frequency check' not in calls[:-1]
    stages = []
    _, mf, info = ns['build'](on_stage=lambda s, e=None, c=None: stages.append(s), may_start=budget)
    check = info['frequencyCheck']
    assert check['result'] == 'saddle-point'
    assert check['summary'] == 'saddle point (1 imaginary frequency), not displaced (time limit)'
    assert 'displacedFrom' not in info and 'displacing from a saddle point' not in stages and mf.converged
    # Deferred minor (Task 8): displacing costs two SCFs and the re-optimisation's first step, so the budget is
    # asked for a 'displacement', not one 'step'.
    assert calls[-1] == 'displacement' and 'zeroPointEnergyNote' in check


def test_a_reoptimisation_stopped_by_the_time_limit_is_not_called_finished(tmp_path, monkeypatch):
    # Task 7 review M4: the summary must not say "re-optimised" as if it had finished.
    ns = namespace(tmp_path, monkeypatch, PLANAR_NH3)
    asked = []

    def budget(stage):
        # After the first check: yes to the displacement, no to the re-optimisation's next step.
        asked.append(stage)
        if 'frequency check' not in asked:
            return True
        return not (stage == 'step' and asked[asked.index('frequency check') + 1:].count('step') == 1)
    _, _, info = ns['build'](may_start=budget)
    check = info['frequencyCheck']
    assert check['result'] == 'not-rechecked' and info['stoppedBy'] == 'time-limit' and info['displacedFrom'] == 1
    assert check['summary'] == ('displaced from a saddle point (1 imaginary); the re-optimisation stopped at its '
                                'time limit, not converged, and was not checked again')
    assert 're-optimised' not in check['summary']


def test_one_displaced_scf_that_does_not_converge_leaves_the_other_sign(tmp_path, monkeypatch):
    # Task 7 review M6: a paid job does not fail because one of the two trial displacements will not converge.
    ns = namespace(tmp_path, monkeypatch, WATER)
    live = ns['_lower'].__globals__
    real, tried = live['_scf_for_check'], []

    def flaky(mol, stage):
        tried.append(stage)
        if len(tried) == 1:
            raise live['SCFNotConverged']('the displacement SCF did not converge')
        return real(mol, stage)
    live['_scf_for_check'] = flaky
    a = [('O', (0.0, 0.0, 0.12)), ('H', (0.0, 0.76, -0.47)), ('H', (0.0, -0.76, -0.47))]
    b = [('O', (0.0, 0.0, 0.11)), ('H', (0.0, 0.75, -0.47)), ('H', (0.0, -0.75, -0.47))]
    assert ns['_lower']([a, b], 'displacement') == b
    live['_scf_for_check'] = lambda mol, stage: (_ for _ in ()).throw(live['SCFNotConverged']('no'))
    with pytest.raises(Exception, match='no'):
        ns['_lower']([a, b], 'displacement')


def test_a_one_electron_open_shell_is_not_checked_rather_than_failing(tmp_path, monkeypatch):
    # PySCF 2.8's UKS Hessian cannot treat a molecule with no beta electrons (H2+); the paid job must not
    # fail on it.
    monkeypatch.chdir(tmp_path)
    h2plus = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 1.06]]
    job = {**canonical_job('optimise', h2plus, 1, 2, method={'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g',
                                                              'optimiseBasis': 'sto-3g'}), 'computeVersion': 2}
    (tmp_path / 'input.py').write_text(render_input(job, 'k' * 64))
    _, mf, info = runpy.run_path('input.py', run_name='jobs_input')['build']()
    assert info['frequencyCheck']['result'] == 'not-run' and mf.converged
    assert 'no beta electrons' in info['frequencyCheck']['summary']


def test_the_numbers_are_rounded_so_frequencies_json_stays_small(tmp_path, monkeypatch):
    # Preflight D10: normal modes are (3N-6) x N x 3 numbers; at full float precision frequencies.json would
    # reach megabytes at 100 atoms. Rounded at source, and its predicted size (the hook for the 3 MB result
    # budget and the quote's storage) covers what is written.
    ns = namespace(tmp_path, monkeypatch, WATER)
    check = ns['frequency_check']([(s, (x, y, z)) for s, (x, y, z) in ns['ATOMS']], lambda *a: None)
    numbers = check['wavenumbers'] + check['reducedMasses'] + [v for m in check['normalModes'] for a in m for v in a]
    assert all(len(repr(v)) <= 10 for v in numbers)
    assert all(v == round(v, 6) for v in numbers) and all(v == round(v, 2) for v in check['wavenumbers'])
    payload = {**check, 'atoms': [[s, *xyz] for s, xyz in check['atoms']], 'summary': 'x' * 200, 'notes': ['x' * 1500]}
    assert len(json.dumps(payload, separators=(',', ':'))) < predicted_frequencies_bytes(3)


def test_a_spot_resume_after_a_displacement_keeps_the_displacement_and_the_check(tmp_path, monkeypatch):
    # Preflight D16: after a displacement, every trajectory frame's comment carries it, so an attempt resumed
    # from such a frame re-optimises, rechecks and reports a minimum reached by displacement -- not a plain one.
    ns = namespace(tmp_path, monkeypatch, PLANAR_NH3)
    comments, frames = [], []
    ns['build'](on_step=lambda n, e, a: (comments.append(ns['trajectory_comment'](n, e)), frames.append(a)))
    assert all(resumed_check(c) is None for c in comments if ' check=' not in c)
    first = next(i for i, c in enumerate(comments) if ' check=' in c)
    assert comments[first].startswith(f'step {first + 1} E=')
    carried = resumed_check(comments[first])
    assert carried['displacedFrom'] == 1 and carried['checkHistory'][0]['result'] == 'saddle-point'
    assert carried['checkHistory'][0]['imaginaryWavenumbers'][0] < -50

    monkeypatch.chdir(tmp_path)
    job = {**canonical_job('optimise', PLANAR_NH3, 0, 1, method=CHECKED), 'computeVersion': 2}
    text = render_input(job, 'k' * 64, start=frames[first], resumed_from=1, resumed_check=carried)
    assert 'after displacing from a saddle point (1 imaginary)' in text
    (tmp_path / 'input.py').write_text(text)
    stages = []
    _, _, info = runpy.run_path('input.py', run_name='jobs_input')['build'](on_stage=lambda s, e=None, c=None: stages.append(s))
    assert info['frequencyCheck']['result'] == 'minimum-after-displacement' and info['displacedFrom'] == 1
    assert info['checkHistory'] == carried['checkHistory']
    assert 'displacing from a saddle point' not in stages and 'frequency check (after displacement)' in stages
    assert stages[0] == 're-optimisation step 1'


def test_a_resumed_recheck_that_still_finds_a_saddle_does_not_displace_again(tmp_path, monkeypatch):
    # Spec §7: one displacement, then the label. A resume must not grant a second.
    carried = {'displacedFrom': 2, 'checkHistory': [{'result': 'saddle-point', 'imaginaryWavenumbers': [-300.0, -90.0]}]}
    monkeypatch.chdir(tmp_path)
    job = {**canonical_job('optimise', WATER, 0, 1, method=CHECKED), 'computeVersion': 2}
    start = [('O', (0.0, 0.0, 0.11779)), ('H', (0.0, 0.75545, -0.47116)), ('H', (0.0, -0.75545, -0.47116))]
    (tmp_path / 'input.py').write_text(render_input(job, 'k' * 64, start=start, resumed_from=1, resumed_check=carried))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    live = ns['check_structure'].__globals__
    real = live['frequency_check']
    live['frequency_check'] = lambda atoms, on_stage, stage='frequency check': {
        **real(atoms, on_stage, stage), 'imaginary': [-400.0]}
    stages = []
    _, _, info = ns['build'](on_stage=lambda s, e=None, c=None: stages.append(s))
    assert info['frequencyCheck']['result'] == 'saddle-point' and info['displacedFrom'] == 2
    assert 'displacing from a saddle point' not in stages


def test_a_comment_without_a_readable_check_resumes_as_a_plain_optimisation():
    assert resumed_check('step 3 E=-76.0000000000') is None
    assert resumed_check('step 3 E=-76.0 check={not json') is None
    assert resumed_check('step 3 E=-76.0 check={"displacedFrom": 0, "checkHistory": []}') is None


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='ethanol: optimisation and Hessian, about 2 min')
def test_ethanol_is_a_true_minimum(tmp_path, monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'molecules'))
    from optimise import read_xyz
    from jobs.elements import atomic_number
    atoms = [[atomic_number(s), *xyz] for s, xyz in read_xyz(Path(__file__).resolve().parents[2] / 'molecules' / 'geometries' / 'ethanol.xyz')[0]]
    _, _, info = namespace(tmp_path, monkeypatch, atoms)['build']()
    assert info['frequencyCheck']['result'] == 'minimum' and len(info['frequencies']['wavenumbers']) == 21


def test_an_open_shell_records_its_spin_and_the_methods_it_mixes(tmp_path, monkeypatch):
    # Task 6 review: geometry and frequencies UKS, properties ROKS -- recorded, with UKS's <S^2> at the last
    # geometry step and at the Hessian's reference, so spin contamination cannot pass unseen.
    oh = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.98]]
    _, _, info = namespace(tmp_path, monkeypatch, oh, multiplicity=2,
                           method={'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'})['build']()
    spin = info['openShell']
    assert spin['methods'] == 'geometry and frequencies: UKS; properties: ROKS'
    assert spin['expectedS2'] == 0.75 and spin['geometryS2'] == pytest.approx(0.75, abs=0.01)
    assert spin['frequenciesS2'] == pytest.approx(0.75, abs=0.01) and spin['contaminated'] is False
    assert 'note' not in spin and info['frequencies']['spinSquared'] == spin['frequenciesS2']


def test_spin_contamination_beyond_ten_percent_is_flagged(tmp_path, monkeypatch):
    record = namespace(tmp_path, monkeypatch, WATER)['spin_record']
    clean = record(2, 2.03, 2.04)                  # a triplet, S(S+1) = 2
    assert clean['contaminated'] is False and 'note' not in clean
    flagged = record(1, 0.86, 0.79)
    assert flagged['contaminated'] is True
    assert flagged['note'] == ('UKS spin contamination: <S^2> 0.860 at the last geometry step and 0.790 at the '
                               'frequency check, against S(S+1) = 0.750 (more than 10 % off)')
    assert record(1, 0.76, None)['frequenciesS2'] is None
    # Deferred minor (Task 8): with no frequency check run, the record names only what did run UKS.
    assert record(1, 0.76, None)['methods'] == 'geometry: UKS; properties: ROKS'
    assert record(1, 0.76, 0.77)['methods'] == 'geometry and frequencies: UKS; properties: ROKS'
