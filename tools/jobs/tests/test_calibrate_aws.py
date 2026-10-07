import json
import math

import pytest

from jobs import sizing
from jobs.calibrate import (aws_samples, compare, fit, fit_aws, fit_f2, fit_files, fit_law, fit_speedup, fit_time,
                            guarded, incore_eri_gb, read_probe)
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
    for name, value in (('m0', M0), ('m2', M2), ('t0', T0), ('t3', T3), ('g', G), ('f2', F2)):
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
    raw = {'m0': 0.05, 'm2': -1.0, 't0': 0.3, 't3': -5.0, 'g': None, 'f2': 0.0,
           'scfExponent': 0.86731, 'scfSaturation': 16, 'filesExponent': 0.63071, 'filesSaturation': 32}
    constants, guards = guarded(raw)
    deployed = sizing.CONSTANTS
    assert constants['m0'] == 0.2 and constants['t0'] == 1.0 and constants['g'] == 1.5
    assert constants['m2'] == deployed['m2'] and constants['t3'] == deployed['t3'] and constants['f2'] == deployed['f2']
    assert constants['scfExponent'] == 0.867 and constants['filesExponent'] == 0.631
    assert constants['scfSaturation'] == 16.0 and isinstance(constants['scfSaturation'], float)
    assert {g.split(':')[0] for g in guards} == {'m0', 'm2', 't0', 't3', 'g', 'f2'}


def test_guarded_rounds_to_three_significant_figures_and_passes_good_values():
    raw = {'m0': 0.34083, 'm2': 6.7673, 't0': 4.8431, 't3': 26643.9, 'g': 0.3, 'f2': 5244.6,
           'scfExponent': 0.8673, 'scfSaturation': 16, 'filesExponent': 0.6307, 'filesSaturation': 32}
    constants, guards = guarded(raw)
    assert guards == []
    assert constants == {'m0': 0.341, 'm2': 6.77, 't0': 4.84, 't3': 26600.0, 'g': 0.3, 'f2': 5240.0,
                         'scfExponent': 0.867, 'scfSaturation': 16.0, 'filesExponent': 0.631, 'filesSaturation': 32.0}
    assert all(isinstance(v, float) for v in constants.values())


def test_a_negative_g_keeps_1_5():
    raw = {'m0': 0.5, 'm2': 3.0, 't0': 5.0, 't3': 2e4, 'g': -0.2, 'f2': 3e3,
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
    assert {'m0', 'm2', 't0', 't3', 'g', 'f2', 'scfExponent', 'scfSaturation', 'filesExponent',
            'filesSaturation'} <= read

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
