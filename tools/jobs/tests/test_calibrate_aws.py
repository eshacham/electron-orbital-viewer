import json
import math

import pytest

from jobs import sizing
from jobs.calibrate import (aws_samples, compare, fit, fit_aws, fit_f2, fit_files, fit_law, fit_speedup, fit_time,
                            guarded, incore_eri_gb, read_optimise_probe, read_probe, working_set_gb)
from jobs.canonical import canonical_job, job_key

M0, M2, T0, T3, G, F2 = 0.6, 2.5, 8.0, 1500.0, 1.2, 2100.0
SCF_LAW, FILES_LAW = (0.9, 16), (0.6, 32)


def sp(n, threads, law=SCF_LAW, t3=T3):
    return (T0 + t3 * (n / 1000) ** 3.5) / min(threads, law[1]) ** law[0]


def carbons(k):
    return [[6, 0.0, 0.0, 1.5 * i] for i in range(k)]


def write(tmp_path, recipe, atoms, threads, backend='aws', law=SCF_LAW, files_law=FILES_LAW, size='S', t3=T3):
    """A finished job folder whose timings obey the model exactly (with `t3`
    for its final SCF); its peak carries the in-core ERIs whenever PySCF
    would have held them on `size`."""
    from jobs.basis_counts import basis_functions
    job = canonical_job(recipe, atoms, 0, 1)
    key = job_key(job)
    n, svp = basis_functions(atoms, 'def2-TZVPD'), basis_functions(atoms, 'def2-SVP')
    stages = []
    if recipe == 'optimise':
        stages += [{'name': f'optimisation step {i}', 'seconds': (1 + G) * sp(svp, threads, law)} for i in range(1, 6)]
    stages.append({'name': 'SCF (DIIS)', 'seconds': sp(n, threads, law, t3)})
    files = F2 * (n / 1000) ** 2 / (min(threads, files_law[1]) ** files_law[0] if files_law else 1)
    stages.append({'name': 'writing files', 'seconds': files})
    memory_gb = next(s.memory_gb for s in sizing.SIZES if s.name == size)
    d = tmp_path / key
    d.mkdir()
    (d / 'job.json').write_text(json.dumps({'key': key, 'job': job, 'sizing': {'predictedSeconds': 1.0,
                                                                                 'predictedMemoryGB': 1.0}}))
    (d / 'timings.json').write_text(json.dumps({'backend': backend, 'vcpu': threads, 'size': size, 'capacity': 'spot',
                                                'stages': stages, 'wallSeconds': 99.0,
                                                'peakMemoryGB': M0 + M2 * (n / 1000) ** 2
                                                + incore_eri_gb(n, memory_gb)}))
    return d


def ladder(tmp_path, **kw):
    dirs = [write(tmp_path, 'single', carbons(k), t, **kw) for k, t in ((3, 2), (8, 2), (16, 4))]
    dirs += [write(tmp_path, 'optimise', carbons(4), 2, **kw), write(tmp_path, 'optimise', carbons(6), 2, **kw)]
    return dirs


def probe(law=(0.8, 32), files_law=None, scf1=600.0, files1=200.0, ns=(2, 4, 8, 16, 32)):
    """A probe line; files_law None means a file write that does not scale."""
    ns = list(ns)
    return {'probe': 'speedup', 'molecule': 'benzene', 'basis': 'def2-TZVPD', 'vcpu': 32, 'n': ns,
            'scfSeconds': [scf1 / min(c, law[1]) ** law[0] for c in ns],
            'filesSeconds': [files1 / (min(c, files_law[1]) ** files_law[0] if files_law else 1) for c in ns]}


def model_probe(t3=T3, law=SCF_LAW, files_law=FILES_LAW):
    """The probe a world obeying the model would print: benzene (N 276) at 4..32 threads."""
    n, ns = 276, [32, 16, 8, 4]
    return {'probe': 'speedup', 'n': ns, 'basisFunctions': n,
            'scfSeconds': [sp(n, c, law, t3) for c in ns],
            'filesSeconds': [F2 * (n / 1000) ** 2 / min(c, files_law[1]) ** files_law[0] for c in ns],
            'peakMemoryGB': [M0 + M2 * (n / 1000) ** 2] * 4}


def deployed_laws():
    c = sizing.CONSTANTS
    return (c['scfExponent'], c['scfSaturation']), (c['filesExponent'], c['filesSaturation'])


def test_fit_aws_recovers_known_constants(tmp_path):
    law, files_law = deployed_laws()
    dirs = ladder(tmp_path, law=law, files_law=files_law)
    dirs.append(write(tmp_path, 'single', carbons(5), 2, backend='local'))       # skipped
    samples = aws_samples(dirs)
    assert len(samples) == 5
    got = fit_aws(samples)
    for name, value in (('m0', M0), ('m2', M2), ('t0', T0), ('t3', T3), ('t3Step', T3), ('g', G), ('f2', F2)):
        assert got[name] == pytest.approx(value, rel=1e-6), name
    rows = compare(samples)
    assert len(rows) == 5 and rows[0]['wallSeconds'] == 99.0


def test_without_a_probe_the_deployed_speedup_laws_are_kept_and_said(tmp_path):
    law, files_law = deployed_laws()
    got = fit_aws(aws_samples(ladder(tmp_path, law=law, files_law=files_law)))
    assert (got['scfExponent'], got['scfSaturation']) == law
    assert (got['filesExponent'], got['filesSaturation']) == files_law
    assert got['speedupSource'] == 'deployed'
    assert any('no speedup probe' in note for note in got['notes'])


def test_fit_speedup_recovers_a_perfect_c_to_the_0_8():
    assert fit_speedup(probe((0.8, 32))) == pytest.approx(0.8, rel=1e-9)


def test_fit_speedup_recovers_other_exponents():
    assert fit_speedup(probe((0.65, 32))) == pytest.approx(0.65, rel=1e-9)


def test_fit_speedup_from_two_points():
    # Two distinct thread counts are the least a slope needs (Task 9 review).
    assert fit_speedup(probe((0.7, 32), ns=(4, 16))) == pytest.approx(0.7, rel=1e-9)


def test_fit_law_finds_where_the_speedup_levels_off():
    got = fit_law(probe((0.9, 16)), 'scfSeconds')
    assert got['saturation'] == 16 and got['exponent'] == pytest.approx(0.9, rel=1e-9)
    assert got['residual'] == pytest.approx(0.0, abs=1e-18)
    assert all(abs(r) < 1e-9 for r in got['relative'])


def test_fit_law_without_a_plateau_saturates_at_the_largest_n():
    got = fit_law(probe((0.65, 32)), 'scfSeconds')
    assert got['saturation'] == 32 and got['exponent'] == pytest.approx(0.65, rel=1e-9)


def test_fit_law_from_two_points_is_the_power_law():
    got = fit_law(probe((0.7, 32), ns=(4, 16)), 'scfSeconds')
    assert got['saturation'] == 16 and got['exponent'] == pytest.approx(0.7, rel=1e-9)


def test_files_that_do_not_scale_stay_undivided():
    points = probe((0.8, 32))
    points['filesSeconds'] = [200.0, 201.5, 199.0, 200.8, 199.6]               # flat, a little noise
    got = fit_files(points)
    assert got['form'] == 'undivided' and got['exponent'] == 0.0
    assert got['residualUndivided'] < got['residualDivided']


def test_files_that_scale_are_divided_by_a_law_of_their_own():
    got = fit_files(probe((0.9, 16), files_law=(0.6, 32)))
    assert got['form'] == 'divided'
    assert got['exponent'] == pytest.approx(0.6, rel=1e-9) and got['saturation'] == 32


def test_fit_aws_with_a_probe_refits_both_laws_and_every_constant(tmp_path):
    samples = aws_samples(ladder(tmp_path))
    got = fit_aws(samples, probe=model_probe())
    assert got['speedupSource'] == 'probe'
    assert got['scfExponent'] == pytest.approx(SCF_LAW[0], rel=1e-9) and got['scfSaturation'] == SCF_LAW[1]
    assert got['filesExponent'] == pytest.approx(FILES_LAW[0], rel=1e-9) and got['filesSaturation'] == FILES_LAW[1]
    for name, value in (('m0', M0), ('m2', M2), ('t0', T0), ('t3', T3), ('g', G), ('f2', F2)):
        assert got[name] == pytest.approx(value, rel=1e-6), name


def test_a_slower_probe_sets_t3_since_the_slower_prediction_is_the_safe_one(tmp_path):
    # Ruling T14-speedup: the ladder's SCFs ran with their ERIs in core (S
    # holds them up to N ≈ 280), which no larger molecule on S–L does; the
    # probe's direct SCF is the regime caffeine and beyond run in.
    samples = aws_samples(ladder(tmp_path))
    got = fit_aws(samples, probe=model_probe(t3=3 * T3))
    assert got['t3'] == pytest.approx(3 * T3, rel=1e-6)
    assert any(note.startswith('t3:') and 'probe' in note for note in got['notes'])
    assert fit_aws(samples, probe=model_probe(t3=T3 / 3))['t3'] == pytest.approx(T3, rel=1e-6)


def test_incore_eris_are_counted_only_where_pyscf_would_hold_them():
    # PySCF stores the 8-fold ERIs when N⁴/1e6 MB fits under 0.95 × its
    # max_memory, which BatchRunner sets to 0.8 × the container: benzene
    # (N 276) just fits on S; caffeine (N 614) does not.
    assert incore_eri_gb(276, 8) == pytest.approx(5.444, abs=1e-3)
    assert incore_eri_gb(614, 8) == 0.0
    assert incore_eri_gb(614, 244) > 100


def test_memory_is_fitted_on_the_working_set_not_the_incore_eris(tmp_path):
    # carbons(3) and carbons(8) hold their ERIs in core on S; carbons(16) cannot.
    samples = aws_samples(ladder(tmp_path))
    assert any(s['peakMemoryGB'] > s['workingSetGB'] for s in samples)
    got = fit_aws(samples)
    assert got['m0'] == pytest.approx(M0, rel=1e-6) and got['m2'] == pytest.approx(M2, rel=1e-6)


@pytest.mark.parametrize('bad', [{'n': [2], 'scfSeconds': [1.0], 'filesSeconds': [1.0]},
                                 {'n': [2, 4], 'scfSeconds': [1.0], 'filesSeconds': [1.0, 1.0]},
                                 {'n': [2, 4], 'scfSeconds': [1.0, 0.0], 'filesSeconds': [1.0, 1.0]},
                                 {'n': [2, 2], 'scfSeconds': [1.0, 1.0], 'filesSeconds': [1.0, 1.0]},
                                 {'scfSeconds': [1.0, 1.0], 'filesSeconds': [1.0, 1.0]}])
def test_a_malformed_probe_is_refused(bad):
    with pytest.raises(ValueError):
        fit_speedup(bad)
    with pytest.raises(ValueError):
        fit_law(bad, 'scfSeconds')


def test_read_probe_finds_the_json_line_among_log_lines(tmp_path):
    path = tmp_path / 'probe.log'
    line = json.dumps(probe())
    path.write_text(f'converged SCF energy = -232.1\n{line}\nexiting\n')
    assert read_probe(path)['n'] == [2, 4, 8, 16, 32]


@pytest.mark.parametrize('fitter', [fit, fit_time, fit_f2])
def test_fewer_than_two_samples_is_a_clear_error(tmp_path, fitter):
    one = aws_samples(ladder(tmp_path))[:1]
    with pytest.raises(ValueError, match='need at least 2 AWS samples to fit'):
        fitter(one)
    with pytest.raises(ValueError, match='need at least 2 AWS samples to fit'):
        fitter([])


def test_two_samples_of_one_size_cannot_fit_an_intercept(tmp_path):
    same = aws_samples([write(tmp_path, 'single', carbons(3), 2), write(tmp_path, 'optimise', carbons(3), 2)])
    with pytest.raises(ValueError, match='distinct'):
        fit_time(same)


def test_guarded_applies_task_14s_guards_and_names_them():
    raw = {'m0': 0.05, 'm2': -1.0, 't0': 0.3, 't3': -5.0, 't3Step': -2.0, 'g': None, 'f2': 0.0, 'stepScale': None,
           'scfExponent': 0.86731, 'scfSaturation': 16, 'filesExponent': 0.63071, 'filesSaturation': 32}
    constants, guards = guarded(raw)
    deployed = sizing.CONSTANTS
    assert constants['m0'] == 0.2 and constants['t0'] == 1.0 and constants['g'] == 1.5
    assert constants['m2'] == deployed['m2'] and constants['t3'] == deployed['t3'] and constants['f2'] == deployed['f2']
    assert constants['t3Step'] == deployed['t3Step'] and constants['stepScale'] == deployed['stepScale']
    assert constants['scfExponent'] == 0.867 and constants['filesExponent'] == 0.631
    assert constants['scfSaturation'] == 16.0 and isinstance(constants['scfSaturation'], float)
    assert {g.split(':')[0] for g in guards} == {'m0', 'm2', 't0', 't3', 't3Step', 'g', 'f2', 'stepScale'}


def test_guarded_rounds_to_three_significant_figures_and_passes_good_values():
    raw = {'m0': 0.34083, 'm2': 6.7673, 't0': 4.8431, 't3': 26643.9, 't3Step': 31042.7, 'g': 0.3, 'f2': 5244.6,
           'stepScale': 0.37512, 'scfExponent': 0.8673, 'scfSaturation': 16, 'filesExponent': 0.6307, 'filesSaturation': 32}
    constants, guards = guarded(raw)
    assert guards == []
    assert constants == {'m0': 0.341, 'm2': 6.77, 't0': 4.84, 't3': 26600.0, 't3Step': 31000.0, 'g': 0.3,
                         'f2': 5240.0, 'stepScale': 0.375, 'scfExponent': 0.867, 'scfSaturation': 16.0, 'filesExponent': 0.631,
                         'filesSaturation': 32.0}
    assert all(isinstance(v, float) for v in constants.values())


def test_a_negative_g_keeps_1_5():
    raw = {'m0': 0.5, 'm2': 3.0, 't0': 5.0, 't3': 2e4, 't3Step': 1.5e4, 'g': -0.2, 'f2': 3e3, 'stepScale': 0.5,
           'scfExponent': 0.9, 'scfSaturation': 16, 'filesExponent': 0.6, 'filesSaturation': 32}
    constants, guards = guarded(raw)
    assert constants['g'] == 1.5 and [g.split(':')[0] for g in guards] == ['g']


def test_fit_aws_output_has_every_constant_sizing_reads(tmp_path, monkeypatch):
    """D5: whatever v2's CONSTANTS look like, predict_parts and decide must
    find every key they read. Record the keys they touch, then run them again
    on the guarded fit alone."""
    read = set()

    class Recording(dict):
        def __getitem__(self, k):
            read.add(k)
            return super().__getitem__(k)

    monkeypatch.setattr(sizing, 'CONSTANTS', Recording(sizing.CONSTANTS))
    job = canonical_job('optimise', carbons(4), 0, 2)          # optimise + open shell: every branch
    sizing.predict_parts(job, sizing.SIZES[0])
    sizing.decide(job)
    assert {'m0', 'm2', 't0', 't3', 't3Step', 'g', 'f2', 'stepScale', 'scfExponent', 'scfSaturation',
            'filesExponent', 'filesSaturation'} <= read

    constants, _ = guarded(fit_aws(aws_samples(ladder(tmp_path)), probe=model_probe()))
    assert read <= set(constants), read - set(constants)
    monkeypatch.setattr(sizing, 'CONSTANTS', constants)
    parts = sizing.predict_parts(job, sizing.SIZES[0])
    assert all(math.isfinite(v) and v > 0 for v in parts.values())


def test_a_missing_g_or_a_non_positive_f2_is_guarded_with_a_name(tmp_path):
    dirs = [write(tmp_path, 'single', carbons(k), t) for k, t in ((3, 2), (8, 2), (16, 4))]
    samples = aws_samples(dirs)
    for s in samples:
        s['filesSeconds'] = 0.0
    got = fit_aws(samples)
    assert got['g'] is None and got['f2'] == 0.0
    constants, guards = guarded(got)
    assert constants['g'] == 1.5 and constants['f2'] == sizing.CONSTANTS['f2']
    assert any(g.startswith('g:') for g in guards) and any(g.startswith('f2:') for g in guards)


def test_aws_samples_say_whether_the_scf_ran_direct(tmp_path):
    # PySCF ran direct when its ERIs did not fit the size (incore_eri_gb 0):
    # carbons(3), N 111, holds them on S; carbons(16), N 592, cannot.
    small, big = aws_samples([write(tmp_path, 'single', carbons(3), 2), write(tmp_path, 'single', carbons(16), 4)])
    assert small['direct'] is False and big['direct'] is True


def test_aws_samples_reads_old_timings_without_a_cycles_field(tmp_path):
    # v4 prep (Task 6): a timings.json from before worker.py recorded the
    # SCF's cycle count (every fixture `write()` makes is this shape) must
    # still read -- backward compatibility, not an error.
    small, big = aws_samples([write(tmp_path, 'single', carbons(3), 2), write(tmp_path, 'single', carbons(16), 4)])
    assert small['scfCycles'] is None and big['scfCycles'] is None


def test_aws_samples_reads_the_cycles_field_when_present(tmp_path):
    d = write(tmp_path, 'single', carbons(3), 2)
    timings_path = d / 'timings.json'
    timings = json.loads(timings_path.read_text())
    for stage in timings['stages']:
        if stage['name'].startswith('SCF'):
            stage['cycles'] = 11
    timings_path.write_text(json.dumps(timings))
    [sample] = aws_samples([d])
    assert sample['scfCycles'] == 11


def incore_ladder(tmp_path):
    """Runs whose ERIs all fit on S (N 111, 148, 222), so the SCF ran in core."""
    return [write(tmp_path, 'single', carbons(3), 2), write(tmp_path, 'optimise', carbons(4), 2),
            write(tmp_path, 'optimise', carbons(6), 2)]


def test_a_slower_direct_job_sets_t3_and_t0_comes_from_the_incore_runs_alone(tmp_path):
    # Sizing v3 (Phase 6B-3 follow-up): caffeine on M ran direct and slower,
    # per (N/1000)^3.5, than the probe's benzene (15 SCF cycles to 7). One
    # line through in-core and direct runs together bends t0 negative; so the
    # in-core runs give t0, and every direct run (job or probe) offers a t3,
    # the slowest kept (Ruling T14-speedup).
    dirs = incore_ladder(tmp_path) + [write(tmp_path, 'single', carbons(20), 4, size='M', t3=2 * T3)]
    samples = aws_samples(dirs)
    assert [s['direct'] for s in samples].count(True) == 1
    got = fit_aws(samples, probe=model_probe())
    assert got['t0'] == pytest.approx(T0, rel=1e-6)
    assert got['t3'] == pytest.approx(2 * T3, rel=1e-6)
    assert any(note.startswith('t3:') and 'direct job' in note for note in got['notes'])


def test_a_faster_direct_job_leaves_the_slower_t3(tmp_path):
    dirs = incore_ladder(tmp_path) + [write(tmp_path, 'single', carbons(20), 4, size='M', t3=T3 / 2)]
    got = fit_aws(aws_samples(dirs), probe=model_probe(t3=3 * T3))
    assert got['t0'] == pytest.approx(T0, rel=1e-6) and got['t3'] == pytest.approx(3 * T3, rel=1e-6)


def test_a_fast_large_direct_job_does_not_lower_t3(tmp_path):
    # Task 3 (Phase 6B-3 follow-up): the direct jobs' t3 is the max of each
    # job's own t3, not a weighted least squares through the origin. That
    # average weights each job's point by its (N/1000)^3.5 squared, so a
    # fast job at a much larger N can outvote a slow job at a smaller one --
    # exactly backwards from "keep the slowest" (Ruling T14-speedup).
    a, b = tmp_path / 'a', tmp_path / 'b'
    a.mkdir(), b.mkdir()
    slow = write(a, 'single', carbons(20), 4, size='M', t3=2 * T3)
    without_fast = fit_aws(aws_samples(incore_ladder(a) + [slow]), probe=model_probe())
    slow = write(b, 'single', carbons(20), 4, size='M', t3=2 * T3)
    fast_and_large = write(b, 'single', carbons(50), 4, size='XL', t3=T3 / 4)
    with_fast = fit_aws(aws_samples(incore_ladder(b) + [slow, fast_and_large]), probe=model_probe())
    assert with_fast['t3'] >= without_fast['t3']
    assert with_fast['t3'] == pytest.approx(2 * T3, rel=1e-6)


def test_t0_falls_back_to_every_sample_when_fewer_than_two_incore_n(tmp_path):
    # fit_time needs two distinct N among the samples it fits on: fit_aws
    # normally takes those from the in-core runs alone, but two in-core runs
    # at the very same N (the same atoms, 'single' and 'optimise' both run
    # their final SCF at the same basis) cannot separate t0 from t3 alone.
    # fit_aws then falls back to every sample, in-core and direct together,
    # and the notes say so (calibrate.py's 'fewer than 2 in-core N' branch).
    same_n = [write(tmp_path, 'single', carbons(3), 2), write(tmp_path, 'optimise', carbons(3), 2)]
    direct = write(tmp_path, 'single', carbons(20), 4, size='M', t3=2 * T3)
    samples = aws_samples(same_n + [direct])
    assert len({s['basisFunctions'] for s in samples if not s['direct']}) == 1
    got = fit_aws(samples, probe=model_probe())
    assert any(note.startswith('t0: fewer than 2 in-core N') for note in got['notes'])
    expected = fit_time(samples, (got['scfExponent'], got['scfSaturation']))
    assert got['t0'] == pytest.approx(expected['t0'], rel=1e-9)


# -- Version 4: t3Step, an optimisation step's t3 when its ERIs fit in core --


def optimise_probe(t3_step, n=246, vcpu=16, g=G, slow=1.0, law=SCF_LAW):
    """A caffeine-like optimise-steps probe line whose first (cold) step obeys
    (1 + g)(t0 + t3_step (N/1000)^3.5) / speedup(vcpu) x `slow`, and whose two
    warm steps run 20 % faster."""
    step = (1 + g) * (T0 + t3_step * (n / 1000) ** 3.5) / min(vcpu, law[1]) ** law[0]
    return {'probe': 'optimise-steps', 'molecule': 'caffeine', 'basis': 'def2-SVP', 'vcpu': vcpu,
            'basisFunctions': n, 'steps': [{'seconds': step * slow, 'cycles': 14}, {'seconds': 0.8 * step, 'cycles': 11},
                                           {'seconds': 0.8 * step, 'cycles': 10}]}


def test_read_optimise_probe_finds_its_line_among_geometric_output(tmp_path):
    line = optimise_probe(3 * T3)
    path = tmp_path / 'caffeine-optimise-probe.log'
    path.write_text('Step    1 : Displace = 7.865e-02/1.361e-01 (rms/max)\n'
                    'Hessian Eigenvalues: 2.30000e-02 2.30000e-02\n' + json.dumps(line) + '\n')
    assert read_optimise_probe(path) == line
    speedup_only = tmp_path / 'speedup-probe.json'
    speedup_only.write_text(json.dumps(model_probe()) + '\n')
    with pytest.raises(ValueError):
        read_optimise_probe(speedup_only)


def test_the_optimise_probes_slowest_step_sets_t3step(tmp_path):
    # Its first step is the slowest (cold, from the minao guess): t3Step is
    # fitted to it alone, not to the mean of the three (Ruling T14-speedup).
    law, files_law = deployed_laws()
    samples = aws_samples(ladder(tmp_path, law=law, files_law=files_law))
    got = fit_aws(samples, optimise_probe=optimise_probe(3 * T3, law=law))
    assert got['t3Step'] == pytest.approx(3 * T3, rel=1e-6)
    assert got['t3'] == pytest.approx(T3, rel=1e-6)                 # single points untouched
    assert any(note.startswith('t3Step:') and 'optimise probe' in note for note in got['notes'])


def test_a_faster_optimise_probe_does_not_lower_t3step_below_the_jobs_steps(tmp_path):
    law, files_law = deployed_laws()
    samples = aws_samples(ladder(tmp_path, law=law, files_law=files_law))
    got = fit_aws(samples, optimise_probe=optimise_probe(T3 / 3, law=law))
    assert got['t3Step'] == pytest.approx(T3, rel=1e-6)


def test_t3step_is_fitted_with_the_g_sizing_will_use(tmp_path):
    # The fixtures' g fits negative and is guarded to 1.5: t3Step must be
    # fitted through the g sizing then multiplies by, or the probe's step is
    # not reproduced. Here the jobs' steps run 4x faster than (1 + G) x their
    # single point, so g fits negative.
    law, files_law = deployed_laws()
    dirs = ladder(tmp_path, law=law, files_law=files_law)
    for d in dirs:
        timings = json.loads((d / 'timings.json').read_text())
        for stage in timings['stages']:
            if stage['name'].startswith('optimisation step'):
                stage['seconds'] /= 4 * (1 + G)
        (d / 'timings.json').write_text(json.dumps(timings))
    got = fit_aws(aws_samples(dirs), optimise_probe=optimise_probe(3 * T3, g=1.5, law=law))
    assert got['g'] < 0
    assert got['t3Step'] == pytest.approx(3 * T3, rel=1e-6)


def test_without_any_optimisation_step_t3step_is_none_and_guarded(tmp_path):
    dirs = [write(tmp_path, 'single', carbons(k), t) for k, t in ((3, 2), (8, 2), (16, 4))]
    got = fit_aws(aws_samples(dirs))
    assert got['t3Step'] is None
    constants, guards = guarded(got)
    assert constants['t3Step'] == sizing.CONSTANTS['t3Step'] and any(g.startswith('t3Step:') for g in guards)


# -- Version 5: the step count, each step's cycles, and the slowest files run at each N --


def v5_steps(d, cycles):
    """Rewrite an optimise folder's step stages as v5's worker writes them:
    one stage per step, from its start, carrying its SCF's cycles, then
    geomeTRIC's wrap-up (no cycles)."""
    timings = json.loads((d / 'timings.json').read_text())
    rest = [s for s in timings['stages'] if not s['name'].startswith('optimisation step')]
    steps = [{'name': f'optimisation step {i}', 'seconds': 10.0 + c, 'cycles': c} for i, c in enumerate(cycles, 1)]
    timings['stages'] = steps + [{'name': f'optimisation step {len(cycles) + 1}', 'seconds': 0.05}] + rest
    (d / 'timings.json').write_text(json.dumps(timings))
    return d


def test_old_timings_count_every_step_stage_and_leave_out_the_last_ones_seconds(tmp_path):
    # Before v5, stage 'optimisation step k' ran from the end of step k to
    # the end of step k + 1 (step 1 fell in no stage; the last stage is
    # geomeTRIC's wrap-up): as many stages as steps, the last not a step.
    [sample] = aws_samples([write(tmp_path, 'optimise', carbons(4), 2)])
    assert sample['optimisationSteps'] == 5 and sample['stepCycles'] is None
    assert sample['stepSeconds'] == pytest.approx((1 + G) * sp(sample['svpBasisFunctions'], 2))


def test_v5_timings_count_the_steps_with_cycles_and_read_their_cycles(tmp_path):
    d = v5_steps(write(tmp_path, 'optimise', carbons(4), 2), [14, 11, 10, 9])
    [sample] = aws_samples([d])
    assert sample['optimisationSteps'] == 4 and sample['stepCycles'] == [14, 11, 10, 9]
    assert sample['stepSeconds'] == pytest.approx(20.5)          # the median of 24, 21, 20 and 19 s
    assert sample['scfCycles'] is None                            # write() records none on its final SCF


def test_a_resumed_job_adds_the_steps_of_the_attempts_before_it(tmp_path):
    # Ethanol (2233f97f7719) finished in attempt 2 after a Spot reclaim: its
    # timings count attempt 2's steps only, and attempt 1's trajectory (as
    # the sink keeps it, attempts/1/trajectory.xyz) holds the rest.
    d = write(tmp_path, 'optimise', carbons(4), 2)
    timings = json.loads((d / 'timings.json').read_text())
    timings['attempt'] = 2
    (d / 'timings.json').write_text(json.dumps(timings))
    (d / 'attempts' / '1').mkdir(parents=True)
    frame = '4\n{}\n' + ''.join(f'C 0.000000 0.000000 {1.5 * i:.6f}\n' for i in range(4))
    (d / 'attempts' / '1' / 'trajectory.xyz').write_text(''.join(frame.format(f'step {k} E=-1.0') for k in (1, 2, 3)))
    [sample] = aws_samples([d])
    assert sample['optimisationSteps'] == 3 + 5


def test_the_step_scale_keeps_the_largest_observed_ratio_inside_time_headroom(tmp_path):
    # v5: optimisation_steps = ceil(stepScale x (10 + 2 x atoms)), capped at
    # MAX_STEPS; stepScale = TIME_HEADROOM x the largest measured / (10 + 2
    # x atoms), so every sample's step count is predicted at TIME_HEADROOM x
    # or more, the worst one exactly.
    four = v5_steps(write(tmp_path, 'optimise', carbons(4), 2), [9] * 6)      # 6 of 18
    six = v5_steps(write(tmp_path, 'optimise', carbons(6), 2), [9] * 4)       # 4 of 22
    dirs = [write(tmp_path, 'single', carbons(k), t) for k, t in ((3, 2), (8, 2))] + [four, six]
    got = fit_aws(aws_samples(dirs))
    assert got['stepScale'] == pytest.approx(sizing.TIME_HEADROOM * 6 / 18, rel=1e-9)
    assert any(note.startswith('stepScale:') for note in got['notes'])


def test_without_an_optimisation_the_step_scale_is_none_and_guarded(tmp_path):
    dirs = [write(tmp_path, 'single', carbons(k), t) for k, t in ((3, 2), (8, 2), (16, 4))]
    got = fit_aws(aws_samples(dirs))
    assert got['stepScale'] is None
    constants, guards = guarded(got)
    assert constants['stepScale'] == sizing.CONSTANTS['stepScale'] and any(g.startswith('stepScale:') for g in guards)


def test_an_optimise_jobs_working_set_leaves_out_its_steps_incore_eris(tmp_path):
    # Caffeine optimise on L (09ae0fa051c6): its def2-SVP steps (N 246) held
    # 3.4 GiB of ERIs in core, its def2-TZVPD SCF (N 614) none; the peak
    # (5.67 GB) is the steps' working set plus those ERIs, not a need.
    assert working_set_gb(5.672, 614, 64, svp_n=246) == pytest.approx(5.672 - incore_eri_gb(246, 64))
    assert incore_eri_gb(246, 64) == pytest.approx(3.44, abs=0.01) and incore_eri_gb(614, 64) == 0
    # Where the final SCF's ERIs are the larger (ethanol on S), they are what is left out, as before v5.
    assert working_set_gb(1.392, 168, 8, svp_n=72) == pytest.approx(1.392 - incore_eri_gb(168, 8))
    d = write(tmp_path, 'optimise', carbons(16), 16, size='L')
    timings = json.loads((d / 'timings.json').read_text())
    timings['peakMemoryGB'] += incore_eri_gb(224, 64)
    (d / 'timings.json').write_text(json.dumps(timings))
    [sample] = aws_samples([d])
    assert sample['svpBasisFunctions'] == 224 and sample['direct']
    assert sample['workingSetGB'] == pytest.approx(M0 + M2 * (sample['basisFunctions'] / 1000) ** 2)


def test_a_faster_files_run_at_an_n_already_measured_does_not_lower_f2(tmp_path):
    # v5: where two runs share an N (caffeine's file write on M, then 4.4x
    # faster on L where the law promised 2.4x), the slower stands for that N
    # in the least squares: the faster one would lower f2 for every size.
    law, files_law = deployed_laws()
    slow = aws_samples(ladder(tmp_path, law=law, files_law=files_law))
    fast = dict(slow[0], filesSeconds=slow[0]['filesSeconds'] / 2)
    assert fit_f2(slow + [fast], files_law) == pytest.approx(F2, rel=1e-9)
    assert fit_f2(slow, files_law) == pytest.approx(F2, rel=1e-9)
