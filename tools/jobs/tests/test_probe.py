"""The speedup probe (Ruling D15): its line must be one calibrate reads."""
import json
import math

import pytest

from jobs import probe, worker
from jobs.calibrate import fit_files, fit_speedup, read_probe

# What a probe's CloudWatch log looks like: PySCF's warning, the per-run
# progress lines, then the contract line. Numbers in the shape of a real
# run: the SCF at about c^-0.75, the file write barely moving.
CANNED_LOG = '\n'.join([
    "UserWarning: Since PySCF-2.3, B3LYP (and B3P86) are changed to the VWN-RPA variant",
    '{"probeRun": 32, "scfSeconds": 14.1, "filesSeconds": 181.0}',
    '{"probeRun": 16, "scfSeconds": 23.6, "filesSeconds": 183.5}',
    json.dumps({'probe': 'speedup', 'molecule': 'benzene', 'basis': 'def2-TZVPD', 'vcpu': 32,
                'n': [32, 16, 8, 4, 2], 'scfSeconds': [14.1, 23.6, 39.8, 67.0, 112.7],
                'filesSeconds': [181.0, 183.5, 186.2, 188.9, 192.4],
                'threadsSeen': [32, 16, 8, 4, 2], 'skipped': [], 'error': None}),
])


def test_a_canned_probe_line_goes_through_both_fits(tmp_path):
    log = tmp_path / 'probe.log'
    log.write_text(CANNED_LOG + '\n')
    points = read_probe(log)
    assert points['n'] == [32, 16, 8, 4, 2]          # the contract line, not a progress line
    p = fit_speedup(points)
    assert 0.7 < p < 0.8
    files = fit_files(points)
    assert files['form'] == 'undivided' and files['exponent'] == 0.0      # nothing divided
    assert files['residualUndivided'] < files['residualDivided']


def fake_runner(seconds):
    """A runner whose run at n threads takes seconds[n] on the fake clock."""
    clock = {'t': 0.0}

    def run(n, molecule, basis, grid_points):
        clock['t'] += seconds[n]
        return {'n': n, 'threadsSeen': n, 'scfSeconds': seconds[n] / 2, 'filesSeconds': seconds[n] / 2,
                'energyHartree': -232.0, 'basisFunctions': 276, 'gridShape': [96, 96, 96], 'peakMemoryGB': 1.0}
    return run, (lambda: clock['t'])


def test_runs_largest_first_and_prints_the_contract_line_last(capsys):
    run, clock = fake_runner({32: 10, 16: 15, 8: 25, 4: 40, 2: 70})
    line = probe.probe((2, 4, 8, 16, 32), grid_points=(96,), runner=run, clock=clock)
    out = capsys.readouterr().out.splitlines()
    assert [json.loads(o).get('probeRun') for o in out[:-1]] == [32, 16, 8, 4, 2]
    assert json.loads(out[-1]) == line
    assert line['n'] == [32, 16, 8, 4, 2] and line['skipped'] == [] and line['error'] is None
    assert line['scfSeconds'] == [5, 7.5, 12.5, 20, 35] and line['filesSeconds'] == line['scfSeconds']


def test_the_budget_skips_a_run_that_would_not_fit():
    # 10 + 15 + 25 = 50 s done; the next run is reckoned at 2 × 25 = 50 s,
    # which would end at 100 s, past a 90 s budget.
    run, clock = fake_runner({32: 10, 16: 15, 8: 25, 4: 40, 2: 70})
    line = probe.probe((32, 16, 8, 4, 2), grid_points=(96,), budget_seconds=90, runner=run, clock=clock,
                       emit=lambda *a, **k: None)
    assert line['n'] == [32, 16, 8] and line['skipped'] == [4, 2]
    fit_speedup(line)                                # still a usable line


def test_a_failed_run_ends_the_probe_with_what_it_has():
    run, clock = fake_runner({32: 10, 16: 15, 8: 25})

    def flaky(n, *rest):
        if n == 4:
            raise RuntimeError('the 4-thread run exited 137')
        return run(n, *rest)
    line = probe.probe((32, 16, 8, 4, 2), grid_points=(96,), runner=flaky, clock=clock, emit=lambda *a, **k: None)
    assert line['n'] == [32, 16, 8] and 'exited 137' in line['error']


def test_the_worker_entry_point_hands_probe_on(monkeypatch):
    seen = []
    monkeypatch.setattr(probe, 'main', lambda argv: seen.append(argv) or 0)
    assert worker.main(['probe', '--budget-seconds', '1080'], environ={}) == 0
    assert seen == [['--budget-seconds', '1080']]


def _has_openmp():
    import warnings
    from pyscf import lib
    before = lib.num_threads()
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        lib.num_threads(2)
    seen = lib.num_threads()
    lib.num_threads(before)
    return seen == 2


def test_a_real_two_point_probe_feeds_calibrate(tmp_path, capsys):
    # Tiny on purpose (water, def2-SVP, a 32³ grid, 1 and 2 threads): the
    # child processes, the thread pinning and the line's shape are what is
    # tested here; benzene at 32 vCPU is the AWS task's job.
    assert probe.main(['--molecule', 'h2o', '--basis', 'def2-SVP', '--threads', '1,2', '--grid-points', '32']) == 0
    out = capsys.readouterr().out
    (tmp_path / 'probe.log').write_text(out)
    points = read_probe(tmp_path / 'probe.log')
    assert points['probe'] == 'speedup' and points['molecule'] == 'h2o' and points['basis'] == 'def2-SVP'
    # macOS's PySCF wheel has no OpenMP, so there a child sees 1 thread
    # whatever it asks for; the Linux image's sees exactly n.
    assert points['n'] == [2, 1] and points['threadsSeen'] == ([2, 1] if _has_openmp() else [1, 1])
    assert all(s > 0 for s in points['scfSeconds'] + points['filesSeconds'])
    assert points['energyHartree'][0] == pytest.approx(points['energyHartree'][1], abs=1e-8)
    assert points['basisFunctions'] == 24 and points['gridShape'] == [32, 32, 32]
    assert math.isfinite(fit_speedup(points))
    assert fit_files(points)['form'] in ('divided', 'undivided')
