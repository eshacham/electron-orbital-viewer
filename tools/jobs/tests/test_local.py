import http.client
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import pytest

from jobs.canonical import canonical_job, job_key
from jobs.handlers import Api
from jobs.local_server import make_server
from jobs.model import new_record
from jobs.runner import LocalRunner, NullRunner
from jobs.store import FileStore

WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'
NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'local', 'attempts': 1,
            'basisFunctions': 10, 'predictedSeconds': 5.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 0, 'predictedCostMicros': 0}


def _h2_record(store, bond_length, name='H2', backend='local'):
    """A trivially valid single-point H2 job, far enough from any other
    bond length used in the same test that the two get different keys."""
    job = canonical_job('single', [[1, 0, 0, 0], [1, 0, 0, bond_length]], 0, 1)
    key = job_key(job)
    record = new_record(key=key, job=job, decision={**DECISION, 'reservationMicros': 5}, name=name,
                        formula='H2', electron_count=2, geometry_source={'kind': 'xyz'}, backend=backend, now=NOW)
    store.create_job(record)
    return store.get_job(key)


def _wait_for(store, key, predicate, tries=100):
    for _ in range(tries):
        rec = store.get_job(key)
        if rec is not None and predicate(rec):
            return rec
        time.sleep(0.05)
    return store.get_job(key)


def test_server_round_trip(tmp_path):
    api = Api(FileStore(tmp_path), NullRunner(), backend='local')
    server = make_server(api, port=0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    try:
        req = urllib.request.Request(f'{base}/api/v1/jobs', method='POST', headers={'Content-Type': 'application/json'},
                                     data=json.dumps({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}}).encode())
        with urllib.request.urlopen(req) as r:
            assert r.status == 201 and json.loads(r.read())['status'] == 'QUEUED'
        with urllib.request.urlopen(f'{base}/api/v1/costs?month=2026-10') as r:
            assert 'spentUsd' in json.loads(r.read())
        # D9: bare try/except HTTPError can pass vacuously if nothing is
        # raised, so assert on pytest.raises itself, not just inside the block.
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(f'{base}/api/v1/jobs/' + '0' * 64)
        assert e.value.code == 404 and json.loads(e.value.read())['error']['code'] == 'not-found'
        big = urllib.request.Request(f'{base}/api/v1/jobs', method='POST', data=b'x' * 131073)
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(big)
        assert e.value.code == 413
    finally:
        server.shutdown()


def test_crashed_worker_is_failed_and_settled(tmp_path):
    store = FileStore(tmp_path / 'state')
    job = canonical_job('single', [[1, 0, 0, 0], [1, 0, 0, 0.74]], 0, 1)
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision={**DECISION, 'reservationMicros': 5}, name='H2',
                                formula='H2', electron_count=2, geometry_source={'kind': 'xyz'}, backend='local', now=NOW))
    # A "worker" that dies at once, as a segfault or a kill would.
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'import sys; sys.exit(9)'))
    runner.submit(store.get_job(key))
    for _ in range(100):
        rec = store.get_job(key)
        # D8: FAILED is written and settlement is a second, separate locked
        # write, so polling on status alone can observe FAILED-but-not-yet-settled.
        if rec['status'] == 'FAILED' and rec['settled']:
            break
        time.sleep(0.05)
    rec = store.get_job(key)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-crashed' and '9' in rec['error']['message']
    assert rec['settled'] and store.meter(rec['month'])['reserved'] == 0


def test_loop_survives_exception_and_keeps_processing(tmp_path, capfd):
    """Fix round 1, item 1: a bad interpreter path raises FileNotFoundError
    from subprocess.run, inside the loop body rather than the worker. Before
    the fix this killed the daemon thread outright: the first job stuck at
    STARTING forever, and every later submission just piled up QUEUED."""
    store = FileStore(tmp_path / 'state')
    rec1 = _h2_record(store, 0.74, name='H2-bad-interpreter')
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python='/no/such/python-xyz',
                         worker_args=('-c', 'pass'))
    runner.submit(rec1)
    rec1 = _wait_for(store, rec1['key'], lambda r: r['status'] == 'FAILED' and r['settled'])
    assert rec1['status'] == 'FAILED' and rec1['settled']
    assert rec1['error']['code'] == 'worker-crashed' and 'FileNotFoundError' in rec1['error']['message']

    # The loop thread must still be alive: a second job submitted afterwards
    # is still picked up (same bad interpreter, so it fails the same way,
    # but it must not stay QUEUED forever).
    rec2 = _h2_record(store, 0.9, name='H2-second')
    runner.submit(rec2)
    rec2 = _wait_for(store, rec2['key'], lambda r: r['status'] == 'FAILED' and r['settled'])
    assert rec2['status'] == 'FAILED' and rec2['settled']
    assert rec1['key'][:12] in capfd.readouterr().err       # one line saying what happened


def test_loop_error_does_not_overwrite_a_terminal_record(tmp_path, monkeypatch):
    """Fix round 1, item 1: the safety net marks FAILED only a job that has
    not already finished. Here the 'worker' finishes the job (DONE) and the
    runner then raises; the record must stay DONE, and still be settled."""
    import types
    import jobs.runner as runner_module
    store = FileStore(tmp_path / 'state')
    rec = _h2_record(store, 0.74)

    def finishes_then_raises(*args, **kwargs):
        store.update_job(rec['key'], {'status': 'DONE'})
        raise OSError('disk went away')
    monkeypatch.setattr(runner_module, 'subprocess', types.SimpleNamespace(run=finishes_then_raises))
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'pass'))
    runner.submit(rec)
    rec = _wait_for(store, rec['key'], lambda r: r['settled'])
    assert rec['status'] == 'DONE' and rec['error'] is None and rec['settled']


def test_loop_survives_vanished_record(tmp_path):
    """Fix round 1, item 1: a record deleted out from under a queued key
    (store.get_job returns None mid-loop) must not raise and stop the loop."""
    store = FileStore(tmp_path / 'state')
    rec1 = _h2_record(store, 0.74, name='H2-vanishes')
    key1 = rec1['key']
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'pass'))
    (store.root / 'jobs' / f'{key1}.json').unlink()      # vanished mid-queue
    runner.submit(rec1)

    rec2 = _h2_record(store, 0.9, name='H2-after-vanished')
    runner.submit(rec2)
    rec2 = _wait_for(store, rec2['key'], lambda r: r['status'] in ('DONE', 'FAILED'))
    assert rec2['status'] == 'FAILED' and rec2['settled']    # the stand-in process never calls back


def _raw_post(port, content_length):
    """POST with a hand-written Content-Length. The timeout turns a handler
    that hangs (read(-n) waits for EOF) into a failing test, not a frozen suite."""
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        conn.putrequest('POST', '/api/v1/jobs')
        conn.putheader('Content-Length', content_length)
        conn.endheaders()
        resp = conn.getresponse()
        return resp.status, json.loads(resp.read())
    finally:
        conn.close()


@pytest.mark.parametrize('content_length', ['not-a-number', '-5', '-1'])
def test_bad_content_length_is_an_ordinary_400(tmp_path, content_length):
    """Fix round 1, item 3: a non-numeric Content-Length must not raise out of
    int() and drop the connection; a negative one must not reach rfile.read()
    (-1 waits for EOF, below -1 raises). Non-numeric is invalid-request;
    negative is read as 0, an empty body, which is not JSON and so the same
    invalid-request."""
    api = Api(FileStore(tmp_path), NullRunner(), backend='local')
    server = make_server(api, port=0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        status, body = _raw_post(server.server_address[1], content_length)
        assert status == 400 and body['error']['code'] == 'invalid-request'
    finally:
        server.shutdown()


@pytest.fixture
def cli_env(tmp_path, monkeypatch):
    """The CLI pointed at a scratch store and output root, never the real
    tools/jobs/.state or tools/molecules/out."""
    import jobs.cli as cli
    monkeypatch.setattr(cli, 'STATE_ROOT', tmp_path / 'state')
    monkeypatch.setattr(cli, 'OUT_ROOT', tmp_path / 'out')
    monkeypatch.setenv('JOBS_GENERATOR_COMMIT', 'test')
    monkeypatch.setattr('tempfile.tempdir', str(tmp_path))
    xyz = tmp_path / 'water.xyz'
    xyz.write_text(WATER_XYZ)
    return cli, str(xyz), FileStore(tmp_path / 'state')


def test_cli_submit_wait_fails_and_settles_a_job_the_worker_raises_on(cli_env, monkeypatch, capsys):
    """Fix round 1, item 2: run_job runs in-process. render_input raising
    sits after the claim but before the worker's own try, so before the fix
    the exception escaped main() and left the job RUNNING and unsettled."""
    cli, xyz, store = cli_env
    import jobs.worker as worker

    def boom(*args, **kwargs):
        raise RuntimeError('template exploded')
    monkeypatch.setattr(worker, 'render_input', boom)
    assert cli.main(['submit', '--xyz', xyz, '--wait']) == 1
    out, err = capsys.readouterr()
    key = out.split()[0]
    rec = store.get_job(key)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-error'
    assert rec['error']['message'] == 'RuntimeError: template exploded'
    assert rec['settled'] and store.meter(rec['month'])['reserved'] == 0
    assert 'template exploded' in err


def test_cli_submit_of_an_already_failed_job_exits_1(cli_env, capsys):
    """Fix round 1, item 4: resubmitting (without retry) a job that already
    FAILED returns the existing record; the CLI must say it failed, and why,
    and exit 1 rather than print FAILED and exit 0."""
    cli, xyz, store = cli_env
    assert cli.main(['enqueue', '--xyz', xyz]) == 0
    key = capsys.readouterr().out.split()[0]
    store.update_job(key, {'status': 'FAILED', 'error': {'code': 'scf-not-converged', 'message': 'SCF gave up'}})
    store.settle(key, 0)
    assert cli.main(['submit', '--xyz', xyz, '--wait']) == 1
    out, err = capsys.readouterr()
    assert 'FAILED' in out and 'scf-not-converged' in err and 'SCF gave up' in err


# --- final-review fix wave -----------------------------------------------------

STALE = '2026-10-05T12:00:00Z'          # long past the 90 s a live heartbeat allows


def test_a_new_local_runner_recovers_what_the_last_one_left(tmp_path):
    """I1: the local server stopping mid-job used to leave records QUEUED,
    STARTING or RUNNING for ever, holding their reservations. A new runner
    sweeps every local record (all months) once, at start."""
    from jobs.model import iso, utc_now
    store = FileStore(tmp_path / 'state')
    queued = _h2_record(store, 0.70, name='queued')
    starting = _h2_record(store, 0.72, name='starting')
    stale = _h2_record(store, 0.74, name='running-stale')
    live = _h2_record(store, 0.76, name='running-live')
    done = _h2_record(store, 0.78, name='done-unsettled')
    failed = _h2_record(store, 0.80, name='failed-unsettled')
    aws = _h2_record(store, 0.82, name='aws-queued', backend='aws')
    store.update_job(starting['key'], {'status': 'STARTING'})
    store.update_job(stale['key'], {'status': 'RUNNING', 'heartbeatAt': STALE})
    store.update_job(live['key'], {'status': 'RUNNING', 'heartbeatAt': iso(utc_now())})
    store.update_job(done['key'], {'status': 'DONE'})
    store.update_job(failed['key'], {'status': 'FAILED', 'error': {'code': 'scf-not-converged', 'message': 'x'}})

    LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable, worker_args=('-c', 'pass'))

    for rec in (starting, stale):
        got = store.get_job(rec['key'])
        assert got['status'] == 'FAILED' and got['settled'], rec['name']
        assert got['error'] == {'code': 'worker-crashed',
                                'message': 'the local server stopped before this job finished'}
    got = store.get_job(done['key'])
    assert got['status'] == 'DONE' and got['settled'] and got['error'] is None
    got = store.get_job(failed['key'])
    assert got['status'] == 'FAILED' and got['settled'] and got['error']['code'] == 'scf-not-converged'
    got = store.get_job(live['key'])                 # another process (cli --wait) may own it
    assert got['status'] == 'RUNNING' and not got['settled']
    assert store.get_job(aws['key'])['status'] == 'QUEUED'          # not this runner's
    # The QUEUED one is run again: the stand-in worker exits without reporting.
    got = _wait_for(store, queued['key'], lambda r: r['status'] == 'FAILED' and r['settled'])
    assert got['status'] == 'FAILED' and 'worker exited with 0' in got['error']['message']
    assert store.meter('2026-10')['reserved'] == 5 + 5               # only the live RUNNING and the aws job


def _sentinel_then(store, runner, key):
    """Submit `key`, then a second job behind it; once the second has run,
    the runner has finished with the first (one job at a time)."""
    runner.submit(store.get_job(key))
    after = _h2_record(store, 1.10, name='sentinel')
    runner.submit(after)
    _wait_for(store, after['key'], lambda r: r['settled'])


def test_the_runner_leaves_alone_a_job_another_runner_already_has(tmp_path):
    """I4: a key already RUNNING (claimed by cli --wait) and then queued to
    the local runner too: the runner used to run its own worker anyway, see
    the record still RUNNING, and mark it FAILED under the live run."""
    from jobs.model import iso, utc_now
    store = FileStore(tmp_path / 'state')
    rec = _h2_record(store, 0.74)
    assert store.claim(rec['key'], 1, utc_now())
    store.update_job(rec['key'], {'heartbeatAt': iso(utc_now())})
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'pass'))
    _sentinel_then(store, runner, rec['key'])
    got = store.get_job(rec['key'])
    assert got['status'] == 'RUNNING' and got['error'] is None and not got['settled']


def test_the_runner_does_not_fail_a_job_its_worker_calls_a_duplicate(tmp_path):
    """I4: between the runner's STARTING and its worker's claim, cli --wait
    can claim the job; the worker then prints `duplicate` and exits 0. The
    job is the other run's, not a crash."""
    store = FileStore(tmp_path / 'state')
    rec = _h2_record(store, 0.74)
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'print("duplicate")'))
    _sentinel_then(store, runner, rec['key'])
    got = store.get_job(rec['key'])
    assert got['status'] != 'FAILED' and not got['settled']


def test_cli_wait_runs_a_retried_job_as_its_current_attempt(cli_env, monkeypatch, capsys):
    """I4: the CLI used to run every job as attempt 1, so a retried job
    (attempt 2) was claimed by a worker the store thought superseded."""
    cli, xyz, store = cli_env
    assert cli.main(['enqueue', '--xyz', xyz]) == 0
    key = capsys.readouterr().out.split()[0]
    store.update_job(key, {'status': 'FAILED'})
    store.settle(key, 0)
    store.requeue_failed(key, store.get_job(key)['sizing'] | {'reservationMicros': 0}, NOW)
    seen = []

    def fake_run_job(k, st, sink, attempt=1, **kwargs):
        seen.append(attempt)
        assert st.claim(k, attempt, NOW)
        st.update_job(k, {'status': 'DONE'}, attempt=attempt)
        return 'DONE'
    monkeypatch.setattr(cli, 'run_job', fake_run_job)
    assert cli.main(['submit', '--xyz', xyz, '--wait']) == 0
    assert seen == [2] and store.get_job(key)['status'] == 'DONE' and store.get_job(key)['settled']


def test_cli_wait_interrupted_fails_and_settles_then_reraises(cli_env, monkeypatch, capsys):
    """I1: Ctrl-C during submit --wait used to leave the job RUNNING and its
    reservation held until something noticed."""
    cli, xyz, store = cli_env

    def interrupted(k, st, sink, attempt=1, **kwargs):
        st.claim(k, attempt, NOW)
        raise KeyboardInterrupt
    monkeypatch.setattr(cli, 'run_job', interrupted)
    with pytest.raises(KeyboardInterrupt):
        cli.main(['submit', '--xyz', xyz, '--wait'])
    rec = store.get_job(capsys.readouterr().out.split()[0])
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-crashed'
    assert 'interrupted' in rec['error']['message']
    assert rec['settled'] and store.meter(rec['month'])['reserved'] == 0


def test_cli_passes_charge_multiplicity_and_retry(cli_env, capsys):
    """M6: the CLI can ask for everything the API takes."""
    cli, xyz, store = cli_env
    assert cli.main(['enqueue', '--xyz', xyz, '--charge', '1', '--multiplicity', '2']) == 0
    key = capsys.readouterr().out.split()[0]
    molecule = store.get_job(key)['job']['molecule']
    assert (molecule['charge'], molecule['multiplicity']) == (1, 2)
    store.update_job(key, {'status': 'FAILED'})
    store.settle(key, 0)
    assert cli.main(['enqueue', '--xyz', xyz, '--charge', '1', '--multiplicity', '2']) == 0
    assert store.get_job(key)['status'] == 'FAILED'                  # without --retry: the old record
    assert cli.main(['enqueue', '--xyz', xyz, '--charge', '1', '--multiplicity', '2', '--retry']) == 0
    rec = store.get_job(key)
    assert rec['status'] == 'QUEUED' and rec['attempt'] == 2


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='runs the real worker, PySCF and all, in a subprocess')
def test_local_runner_runs_the_real_worker_on_h2(tmp_path, monkeypatch):
    """M5: the real `python -m jobs.worker` command line, end to end, through
    the runner the local server uses."""
    monkeypatch.setenv('JOBS_GENERATOR_COMMIT', 'test')
    store = FileStore(tmp_path / 'state')
    rec = _h2_record(store, 0.74)
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', grid_points=(32,))
    runner.submit(rec)
    got = _wait_for(store, rec['key'], lambda r: r['settled'], tries=2400)
    assert got['status'] == 'DONE', got['error']
    root = tmp_path / 'out' / 'jobs' / rec['key']
    assert (root / 'done.json').exists() and got['actual']['wallSeconds'] > 0
    assert 'converged SCF energy' in (root / 'output.log').read_text()
    assert store.meter('2026-10')['reserved'] == 0
