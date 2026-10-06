import json
import math

import pytest

from jobs import sizing
from jobs.calibrate import aws_samples, compare, fit_aws, fit_files, fit_speedup, read_probe
from jobs.canonical import canonical_job, job_key

M0, M2, T0, T3, G, F2 = 0.6, 2.5, 8.0, 1500.0, 1.2, 2100.0
V1_EXPONENT = 0.8


def sp(n, threads, p=V1_EXPONENT):
    return (T0 + T3 * (n / 1000) ** 3.5) / threads ** p


def carbons(k):
    return [[6, 0.0, 0.0, 1.5 * i] for i in range(k)]


def write(tmp_path, recipe, atoms, threads, backend='aws', p=V1_EXPONENT, files_divided=False):
    """A finished job folder whose timings obey the model exactly."""
    from jobs.basis_counts import basis_functions
    job = canonical_job(recipe, atoms, 0, 1)
    key = job_key(job)
    n, svp = basis_functions(atoms, 'def2-TZVPD'), basis_functions(atoms, 'def2-SVP')
    stages = []
    if recipe == 'optimise':
        stages += [{'name': f'optimisation step {i}', 'seconds': (1 + G) * sp(svp, threads, p)} for i in range(1, 6)]
    stages.append({'name': 'SCF (DIIS)', 'seconds': sp(n, threads, p)})
    files = F2 * (n / 1000) ** 2 / (threads ** p if files_divided else 1)
    stages.append({'name': 'writing files', 'seconds': files})
    d = tmp_path / key
    d.mkdir()
    (d / 'job.json').write_text(json.dumps({'key': key, 'job': job, 'sizing': {'predictedSeconds': 1.0,
                                                                                 'predictedMemoryGB': 1.0}}))
    (d / 'timings.json').write_text(json.dumps({'backend': backend, 'vcpu': threads, 'size': 'S', 'capacity': 'spot',
                                                'stages': stages, 'wallSeconds': 99.0,
                                                'peakMemoryGB': M0 + M2 * (n / 1000) ** 2}))
    return d


def ladder(tmp_path, **kw):
    dirs = [write(tmp_path, 'single', carbons(k), t, **kw) for k, t in ((3, 2), (8, 2), (16, 4))]
    dirs += [write(tmp_path, 'optimise', carbons(4), 2, **kw), write(tmp_path, 'optimise', carbons(6), 2, **kw)]
    return dirs


def probe(p, files_divided, scf1=600.0, files1=200.0):
    ns = [2, 4, 8, 16, 32]
    return {'probe': 'speedup', 'molecule': 'benzene', 'basis': 'def2-TZVPD', 'vcpu': 32, 'n': ns,
            'scfSeconds': [scf1 / c ** p for c in ns],
            'filesSeconds': [files1 / (c ** p if files_divided else 1) for c in ns]}


def test_fit_aws_recovers_known_constants(tmp_path):
    dirs = ladder(tmp_path)
    dirs.append(write(tmp_path, 'single', carbons(5), 2, backend='local'))       # skipped
    samples = aws_samples(dirs)
    assert len(samples) == 5
    got = fit_aws(samples)
    for name, value in (('m0', M0), ('m2', M2), ('t0', T0), ('t3', T3), ('g', G), ('f2', F2)):
        assert got[name] == pytest.approx(value, rel=1e-6), name
    rows = compare(samples)
    assert len(rows) == 5 and rows[0]['wallSeconds'] == 99.0


def test_without_a_probe_v1s_exponent_and_undivided_files_are_kept_and_said(tmp_path):
    got = fit_aws(aws_samples(ladder(tmp_path)))
    assert got['speedupExponent'] == pytest.approx(V1_EXPONENT)
    assert got['filesForm'] == 'undivided'
    assert got['speedupSource'] == 'v1'
    assert any('no speedup probe' in note for note in got['notes'])


def test_fit_speedup_recovers_a_perfect_c_to_the_0_8():
    assert fit_speedup(probe(0.8, files_divided=False)) == pytest.approx(0.8, rel=1e-9)


def test_fit_speedup_recovers_other_exponents():
    assert fit_speedup(probe(0.65, files_divided=False)) == pytest.approx(0.65, rel=1e-9)


def test_files_that_do_not_scale_stay_undivided():
    points = probe(0.8, files_divided=False)
    points['filesSeconds'] = [200.0, 201.5, 199.0, 200.8, 199.6]               # flat, a little noise
    got = fit_files(points)
    assert got['form'] == 'undivided'
    assert got['residualUndivided'] < got['residualDivided']


def test_files_that_scale_like_the_scf_are_divided():
    got = fit_files(probe(0.8, files_divided=True))
    assert got['form'] == 'divided'
    assert got['residualDivided'] == pytest.approx(0.0, abs=1e-18)


def test_fit_files_uses_a_given_exponent():
    points = probe(0.5, files_divided=True)
    assert fit_files(points, exponent=0.5)['form'] == 'divided'
    assert fit_files(points)['exponent'] == pytest.approx(0.5)


def test_fit_aws_with_a_probe_refits_under_the_measured_exponent_and_files_form(tmp_path):
    p = 0.7
    samples = aws_samples(ladder(tmp_path, p=p, files_divided=True))
    got = fit_aws(samples, probe=probe(p, files_divided=True))
    assert got['speedupExponent'] == pytest.approx(p, rel=1e-9)
    assert got['filesForm'] == 'divided' and got['speedupSource'] == 'probe'
    for name, value in (('m0', M0), ('m2', M2), ('t0', T0), ('t3', T3), ('g', G), ('f2', F2)):
        assert got[name] == pytest.approx(value, rel=1e-6), name


@pytest.mark.parametrize('bad', [{'n': [2], 'scfSeconds': [1.0], 'filesSeconds': [1.0]},
                                 {'n': [2, 4], 'scfSeconds': [1.0], 'filesSeconds': [1.0, 1.0]},
                                 {'n': [2, 4], 'scfSeconds': [1.0, 0.0], 'filesSeconds': [1.0, 1.0]},
                                 {'n': [2, 2], 'scfSeconds': [1.0, 1.0], 'filesSeconds': [1.0, 1.0]},
                                 {'scfSeconds': [1.0, 1.0], 'filesSeconds': [1.0, 1.0]}])
def test_a_malformed_probe_is_refused(bad):
    with pytest.raises(ValueError):
        fit_speedup(bad)


def test_read_probe_finds_the_json_line_among_log_lines(tmp_path):
    path = tmp_path / 'probe.log'
    line = json.dumps(probe(0.8, files_divided=False))
    path.write_text(f'converged SCF energy = -232.1\n{line}\nexiting\n')
    assert read_probe(path)['n'] == [2, 4, 8, 16, 32]


def test_fit_aws_output_has_every_constant_sizing_reads(tmp_path, monkeypatch):
    """D5: whatever v2's CONSTANTS look like, predict_parts and decide must
    find every key they read. Record the keys they touch under v1, then run
    them again on fit_aws's output alone."""
    read = set()

    class Recording(dict):
        def __getitem__(self, k):
            read.add(k)
            return super().__getitem__(k)

    monkeypatch.setattr(sizing, 'CONSTANTS', Recording(sizing.CONSTANTS))
    job = canonical_job('optimise', carbons(4), 0, 2)          # optimise + open shell: every branch
    sizing.predict_parts(job, sizing.SIZES[0])
    sizing.decide(job)
    assert {'m0', 'm2', 't0', 't3', 'g', 'f2'} <= read

    got = fit_aws(aws_samples(ladder(tmp_path)))
    assert read <= set(got), read - set(got)
    monkeypatch.setattr(sizing, 'CONSTANTS', {k: got[k] for k in read})
    parts = sizing.predict_parts(job, sizing.SIZES[0])
    assert all(math.isfinite(v) and v > 0 for v in parts.values())


def test_a_missing_g_or_a_non_positive_f2_falls_back_to_v1_with_a_note(tmp_path):
    dirs = [write(tmp_path, 'single', carbons(k), t) for k, t in ((3, 2), (8, 2), (16, 4))]
    samples = aws_samples(dirs)
    for s in samples:
        s['filesSeconds'] = 0.0
    got = fit_aws(samples)
    assert got['g'] == sizing.CONSTANTS['g'] and got['f2'] == sizing.CONSTANTS['f2']
    assert any(note.startswith('g:') for note in got['notes'])
    assert any(note.startswith('f2:') for note in got['notes'])
