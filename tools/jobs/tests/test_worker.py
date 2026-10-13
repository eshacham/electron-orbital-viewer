import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest

from jobs.canonical import canonical_job, job_key
from jobs.model import new_record
from jobs.sink import LocalSink
from jobs.store import FileStore
from jobs import quotes, worker
from jobs.worker import _classify, _resume_atoms, run_job

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
SVP = {'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': None}
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'local', 'attempts': 1,
            'basisFunctions': 10, 'predictedSeconds': 5.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 0, 'predictedCostMicros': 0}
H2 = [[1, 0, 0, 0], [1, 0, 0, 0.74]]
TOOLS = Path(__file__).resolve().parents[2]


def queue(store, atoms, charge=0, mult=1, method=SVP, recipe='single', decision=DECISION, compute_version=None):
    job = canonical_job(recipe, atoms, charge, mult, method=method)
    if compute_version is not None:
        job = {**job, 'computeVersion': compute_version}
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision=decision, name='hydrogen', formula='H2', electron_count=2,
                                geometry_source={'kind': 'xyz'}, backend='local', now=NOW))
    return key


def slow_writes(monkeypatch, seconds, before=None):
    """Delay write_molecule_files, so heartbeats land while the job runs."""
    import build_library
    real = build_library.write_molecule_files

    def slow(*args, **kwargs):
        if before:
            before(*args)
        time.sleep(seconds)
        return real(*args, **kwargs)

    monkeypatch.setattr(build_library, 'write_molecule_files', slow)


@pytest.fixture
def env(tmp_path, monkeypatch):
    # Scratch folders go under tmp_path, so a test can see that none is left behind (D18).
    scratch = tmp_path / 'scratch'
    scratch.mkdir()
    monkeypatch.setattr('tempfile.tempdir', str(scratch))
    return FileStore(tmp_path / 'state'), LocalSink(tmp_path / 'out'), tmp_path / 'out' / 'jobs'


def test_h2_end_to_end(env):
    store, sink, jobs = env
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.2) == 'DONE'
    root = jobs / key
    names = {p.name for p in root.iterdir() if p.is_file()}
    assert names == {'meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz', 'job.json', 'input.py',
                     'output.log', 'geometry.xyz', 'timings.json', 'done.json'}
    done = json.loads((root / 'done.json').read_text())
    for name, digest in done['files'].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
    assert set(done['files']) == names - {'done.json'}
    meta = json.loads((root / 'meta.json').read_text())
    assert meta['tier'] == 'computed' and meta['id'] == key and meta['provenance']['costUsd'] is None
    assert meta['provenance']['caveats'] and meta['geometrySource'] == 'pasted XYZ'
    rec = store.get_job(key)
    assert rec['status'] == 'DONE' and rec['actual']['wallSeconds'] > 0 and rec['error'] is None
    assert rec['logTail'] and len('\n'.join(rec['logTail']).encode()) <= 4096
    timings = json.loads((root / 'timings.json').read_text())
    assert timings['backend'] == 'local' and timings['attempt'] == 1 and timings['stages'][0]['name'].startswith('SCF')
    assert (root / 'attempts' / '1' / 'input.py').exists()


def test_the_worker_reports_the_bytes_and_objects_it_stored(env):
    # Phase 6C: storage and delivery are charged on what was really written, every attempt file and result.
    store, sink, jobs = env
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.2) == 'DONE'
    stored = [p for p in (jobs / key).rglob('*') if p.is_file()]
    actual = store.get_job(key)['actual']
    assert actual['resultObjects'] == len(stored) == 13
    assert actual['resultBytes'] == sum(p.stat().st_size for p in stored)


def test_a_failed_run_reports_only_its_attempt_files(env, monkeypatch):
    store, sink, jobs = env
    key = queue(store, H2)
    import build_library

    def broken(*a, **k):
        raise RuntimeError('no files today')
    monkeypatch.setattr(build_library, 'write_molecule_files', broken)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.2) == 'FAILED'
    stored = [p for p in (jobs / key).rglob('*') if p.is_file()]
    actual = store.get_job(key)['actual']
    assert actual['resultObjects'] == len(stored) == 3
    assert actual['resultBytes'] == sum(p.stat().st_size for p in stored)


def test_timings_record_the_converged_scfs_cycle_count(env):
    # v4 prep (Phase 6B-3 follow-up, Task 6): the SCF stage that converged
    # carries PySCF's own mf.cycles, the same figure probe.py's measure()
    # and sizing's t3 fit already use. Stages before it (a failed rung, or
    # 'writing files') carry no 'cycles' key.
    store, sink, jobs = env
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE'
    timings = json.loads((jobs / key / 'timings.json').read_text())
    scf_stages = [s for s in timings['stages'] if s['name'].startswith('SCF')]
    assert scf_stages and 'cycles' in scf_stages[-1]
    assert isinstance(scf_stages[-1]['cycles'], int) and scf_stages[-1]['cycles'] >= 1
    assert all('cycles' not in s for s in timings['stages'] if not s['name'].startswith('SCF'))
    assert all('cycles' not in s for s in scf_stages[:-1])


def test_progress_puts_a_reported_cycle_count_on_the_stage_it_names():
    # v5 (Phase 6B-3 follow-up): input.py reports each optimisation step's
    # SCF cycles through on_stage's third argument, on the stage it names.
    progress = worker.Progress()
    progress.on_stage('optimisation step 1')
    progress.on_stage('optimisation step 1', -1.0, 14)
    progress.on_stage('optimisation step 2', -1.1)
    progress.on_stage('optimisation step 2', -1.2, 11)
    progress.on_stage('optimisation step 3', -1.2)
    progress.on_stage('SCF (DIIS)')
    out = progress.durations(time.monotonic(), scf_cycles=15)
    assert [(s['name'], s.get('cycles')) for s in out] == [
        ('optimisation step 1', 14), ('optimisation step 2', 11), ('optimisation step 3', None), ('SCF (DIIS)', 15)]
    assert progress.energy == -1.2


def test_timings_record_each_optimisation_steps_scf_cycles(env):
    # v5 (Phase 6B-3 follow-up): every 'optimisation step k' stage now times
    # step k itself (from the optimisation's start, so step 1's cold SCF is
    # counted) and carries its SCF's cycle count, as the final SCF stage
    # does. The one stage after the last step (geomeTRIC's wrap-up) carries
    # none, so the steps are exactly the stages with cycles.
    store, sink, jobs = env
    key = queue(store, [[1, 0, 0, 0], [1, 0, 0, 0.80]], method=None, recipe='optimise')
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    timings = json.loads((jobs / key / 'timings.json').read_text())
    meta = json.loads((jobs / key / 'meta.json').read_text())
    steps = [s for s in timings['stages'] if s['name'].startswith('optimisation step')]
    counted = [s for s in steps if 'cycles' in s]
    assert timings['stages'][0]['name'] == 'optimisation step 1'
    assert len(counted) == meta['geometryOptimisation']['steps'] >= 1
    assert steps[:-1] == counted and 'cycles' not in steps[-1]
    assert [s['name'] for s in steps] == [f'optimisation step {i}' for i in range(1, len(steps) + 1)]
    assert all(isinstance(s['cycles'], int) and s['cycles'] >= 1 for s in counted)
    assert 'cycles' in [s for s in timings['stages'] if s['name'].startswith('SCF')][-1]


def test_meta_records_method_commit_and_a_flushed_log(env, monkeypatch):
    store, sink, jobs = env
    monkeypatch.setenv('JOBS_GENERATOR_COMMIT', 'abc123')    # D2: the container has no git
    import jobs.input_template as template
    marked = template.TEMPLATE.replace("    if _log:\n        _log.close()",
                                       "    if _log:\n        _log.write('log closed\\n')\n        _log.close()")
    assert marked != template.TEMPLATE
    monkeypatch.setattr(template, 'TEMPLATE', marked)
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE'
    root = jobs / key
    meta = json.loads((root / 'meta.json').read_text())
    assert meta['method'] == {'density': 'B3LYP/def2-SVP', 'energies': 'B3LYP/def2-SVP'}
    assert meta['generator']['commit'] == 'abc123' and meta['provenance']['generatorCommit'] == 'abc123'
    assert json.loads((root / 'job.json').read_text())['generatorCommit'] == 'abc123'
    # close_log (Task 8 carry): the log is closed before the worker copies it.
    log = (root / 'output.log').read_text()
    assert 'converged SCF energy' in log and log.endswith('log closed\n')


def test_provenance_wall_seconds_include_writing_the_files(env, monkeypatch):
    # D14: the files stage is part of the run's cost, so provenance counts it.
    store, sink, jobs = env
    import build_library
    real = build_library.write_molecule_files

    def slow(*args, **kwargs):
        time.sleep(1.0)
        return real(*args, **kwargs)

    monkeypatch.setattr(build_library, 'write_molecule_files', slow)
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE'
    meta = json.loads((jobs / key / 'meta.json').read_text())
    timings = json.loads((jobs / key / 'timings.json').read_text())
    assert timings['stages'][-1]['name'] == 'writing files' and timings['stages'][-1]['seconds'] >= 1.0
    assert meta['provenance']['wallSeconds'] >= 1.0
    assert meta['provenance']['wallSeconds'] <= timings['wallSeconds']


def test_every_store_write_carries_the_attempt(env, monkeypatch):
    # Ruling T5-b: a superseded attempt can never clobber the current one.
    store, sink, jobs = env
    key = queue(store, H2)
    calls = []
    real = store.update_job

    def spy(k, changes, expect_status=None, attempt=None):
        calls.append(attempt)
        return real(k, changes, expect_status=expect_status, attempt=attempt)

    monkeypatch.setattr(store, 'update_job', spy)
    import build_library
    real_write = build_library.write_molecule_files

    def slow(*args, **kwargs):
        time.sleep(0.5)                          # long enough for a heartbeat or two
        return real_write(*args, **kwargs)

    monkeypatch.setattr(build_library, 'write_molecule_files', slow)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.1) == 'DONE'
    assert len(calls) >= 2 and set(calls) == {1}


def test_a_duplicate_copy_does_no_work(env):
    store, sink, jobs = env
    key = queue(store, H2)
    store.claim(key, 1, NOW)
    assert run_job(key, store, sink, grid_points=(32,)) == 'duplicate'
    assert not (jobs / key).exists()


def test_scf_failure_keeps_the_attempt_files_and_writes_no_result(env, monkeypatch):
    store, sink, jobs = env
    key = queue(store, H2)
    import jobs.input_template as template
    monkeypatch.setattr(template, 'TEMPLATE', template.TEMPLATE.replace('MAX_CYCLES = (100, 200, 50)', 'MAX_CYCLES = (1, 1, 1)'))
    assert run_job(key, store, sink, grid_points=(32,)) == 'FAILED'
    rec = store.get_job(key)
    assert rec['error']['code'] == 'scf-not-converged' and rec['status'] == 'FAILED'
    assert (jobs / key / 'attempts' / '1' / 'output.log').exists()
    assert not (jobs / key / 'done.json').exists() and not (jobs / key / 'meta.json').exists()


@pytest.mark.parametrize('done', [
    lambda key: {'key': key, 'files': {'meta.json': hashlib.sha256(b'other').hexdigest()}},     # tampered
    lambda key: {'key': key, 'files': {'meta.json': hashlib.sha256(b'{}').hexdigest(),
                                       'basis.json': hashlib.sha256(b'{}').hexdigest()}},     # a file missing
    lambda key: None,                                                                          # unreadable
], ids=['tampered', 'missing', 'unreadable'])
def test_a_leftover_result_file_fails_the_job_rather_than_leaving_it_running(env, done):
    # D17: a result folder the worker cannot use must end the job FAILED, not
    # leave it RUNNING. Since D7 a half-written root is cleared, and since the
    # Task 4 follow-up a complete one is accepted; what is left is a done.json
    # whose files do not match it, which is never touched.
    store, sink, jobs = env
    key = queue(store, H2)
    sink.put_result(key, 'meta.json', b'{}')
    written = json.dumps(done(key)).encode() if done(key) else b'not json'
    sink.put_done(key, written)
    assert run_job(key, store, sink, grid_points=(32,)) == 'FAILED'
    rec = store.get_job(key)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-error'
    assert 'done.json' in rec['error']['message'] and 'does not match' in rec['error']['message']
    assert (jobs / key / 'meta.json').read_bytes() == b'{}' and (jobs / key / 'done.json').read_bytes() == written
    assert not (jobs / key / 'basis.json').exists()


class Reclaimed(BaseException):
    """Fargate stopping the task: nothing in the worker catches it."""


def test_a_complete_root_left_by_a_reclaimed_attempt_ends_done(env, monkeypatch):
    # Task 4 follow-up: a Spot reclaim between put_done and the final
    # update_job leaves a complete root and a RUNNING record. The key is
    # content-addressed, so that root is this job's answer: the retry checks
    # it against done.json and ends DONE rather than failing for ever.
    store, sink, jobs = env
    key = queue(store, H2)
    real = store.update_job

    def reclaimed(k, changes, **kwargs):
        if changes.get('status') == 'DONE':
            raise Reclaimed
        return real(k, changes, **kwargs)
    monkeypatch.setattr(store, 'update_job', reclaimed)
    with pytest.raises(Reclaimed):
        run_job(key, store, sink, grid_points=(32,))
    monkeypatch.setattr(store, 'update_job', real)
    done = (jobs / key / 'done.json').read_bytes()
    assert store.get_job(key)['status'] == 'RUNNING'
    assert run_job(key, store, sink, attempt=2, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    rec = store.get_job(key)
    assert rec['status'] == 'DONE' and rec['attempt'] == 2 and rec['error'] is None
    assert (jobs / key / 'done.json').read_bytes() == done


def test_a_root_an_earlier_attempt_completed_is_counted_with_every_attempt_of_the_batch_job(env, monkeypatch):
    # Review minor 5: the attempt that finds a complete root used to report only its own attempt files (a few
    # kB), and a Spot job's earlier attempts' files went uncounted: both undercharged storage and delivery.
    store, sink, jobs = env
    key = queue(store, H2)
    real = store.update_job

    def reclaimed(k, changes, **kwargs):
        if changes.get('status') == 'DONE':
            raise Reclaimed
        return real(k, changes, **kwargs)
    monkeypatch.setattr(store, 'update_job', reclaimed)
    with pytest.raises(Reclaimed):
        run_job(key, store, sink, grid_points=(32,))
    monkeypatch.setattr(store, 'update_job', real)
    assert run_job(key, store, sink, attempt=2, first_attempt=1, grid_points=(32,)) == 'DONE'
    stored = [p for p in (jobs / key).rglob('*') if p.is_file()]
    actual = store.get_job(key)['actual']
    assert actual['resultObjects'] == len(stored) and actual['resultBytes'] == sum(p.stat().st_size for p in stored)


def test_an_owner_retry_does_not_count_the_earlier_approvals_attempt_files(env, monkeypatch):
    # Attempt 1 belongs to an earlier approval, whose own settlement charged its files.
    store, sink, jobs = env
    key = queue(store, H2)
    import build_library

    def broken(*a, **k):
        raise RuntimeError('no files today')
    monkeypatch.setattr(build_library, 'write_molecule_files', broken)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.2) == 'FAILED'
    monkeypatch.undo()
    store.update_job(key, {'status': 'QUEUED', 'attempt': 2})
    assert run_job(key, store, sink, attempt=2, first_attempt=2, grid_points=(32,)) == 'DONE'
    mine = [p for p in (jobs / key).rglob('*') if p.is_file() and 'attempts/1/' not in p.as_posix()]
    assert store.get_job(key)['actual']['resultBytes'] == sum(p.stat().st_size for p in mine)


@pytest.mark.parametrize('moved', [{'attempt': 2}, {'status': 'FAILED'}], ids=['retried', 'failed'])
def test_an_attempt_that_no_longer_owns_the_job_writes_no_root(env, monkeypatch, moved):
    # Task 4 follow-up: ownership is checked again right before the root
    # writes; an attempt that has lost it keeps its attempt files but leaves
    # the root to the owner, and says it was superseded.
    store, sink, jobs = env
    key = queue(store, H2)
    slow_writes(monkeypatch, 0, before=lambda *a: store.update_job(key, moved))
    assert run_job(key, store, sink, grid_points=(32,)) == 'superseded'
    assert [p.name for p in (jobs / key).iterdir() if p.is_file()] == []
    assert (jobs / key / 'attempts' / '1' / 'output.log').exists()
    assert {k: store.get_job(key)[k] for k in moved} == moved and store.get_job(key)['endedAt'] is None


def test_a_result_file_another_attempt_wrote_meanwhile_is_explained():
    # Task 4 follow-up: since D7 clears a partial root and a complete one is
    # accepted, FileExistsError means a second writer raced this one.
    message = _classify(FileExistsError(17, 'File exists', '/out/jobs/k/meta.json'))['message']
    assert 'meta.json' in message and 'while this attempt was writing' in message
    assert 'Clear the folder' not in message


def test_a_partial_root_from_an_earlier_attempt_is_cleared_then_written(env):
    # D7: attempt 1 was reclaimed part-way through writing its results (no
    # done.json). Attempt 2 owns the job, so it clears that root and writes its own.
    store, sink, jobs = env
    key = queue(store, H2)
    assert store.claim(key, 1, NOW)
    sink.put_result(key, 'meta.json', b'{}')
    sink.put_result(key, 'job.json', b'{}')
    assert run_job(key, store, sink, attempt=2, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    done = json.loads((jobs / key / 'done.json').read_text())
    for name, digest in done['files'].items():
        assert hashlib.sha256((jobs / key / name).read_bytes()).hexdigest() == digest, name
    assert json.loads((jobs / key / 'meta.json').read_text())['id'] == key
    assert json.loads((jobs / key / 'job.json').read_text())['key'] == key


def test_a_superseded_worker_does_not_clear_the_root(env, monkeypatch):
    # D7: the root belongs to whichever attempt owns the record; one that a
    # retry has moved past must not delete what the current attempt may be writing.
    store, sink, jobs = env
    key = queue(store, H2)
    sink.put_result(key, 'meta.json', b'{}')
    slow_writes(monkeypatch, 0, before=lambda *a: store.update_job(key, {'attempt': 2}))
    assert run_job(key, store, sink, grid_points=(32,)) == 'superseded'
    assert (jobs / key / 'meta.json').read_bytes() == b'{}'
    assert not (jobs / key / 'done.json').exists()


def test_the_scratch_folder_is_removed(env, tmp_path):
    store, sink, jobs = env
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE'
    assert list((tmp_path / 'scratch').iterdir()) == []


def test_result_files_are_never_overwritten(env):
    store, sink, jobs = env
    sink.put_result('k' * 64, 'meta.json', b'{}')
    with pytest.raises(FileExistsError):
        sink.put_result('k' * 64, 'meta.json', b'{}')


def test_attempt_files_round_trip(env):
    store, sink, jobs = env
    assert sink.get_attempt('k' * 64, 1, 'trajectory.xyz') is None
    sink.put_attempt('k' * 64, 1, 'trajectory.xyz', b'2\n\n')
    sink.put_attempt('k' * 64, 1, 'trajectory.xyz', b'3\n\n')        # attempt files may be rewritten
    assert sink.get_attempt('k' * 64, 1, 'trajectory.xyz') == b'3\n\n'


def test_a_diffuse_anion_is_box_too_small_not_a_worker_error():
    # D15: check_box's message is for a developer; the job record speaks to the owner.
    e = RuntimeError('density 1.9e-05 at the box face: the 0.001 surface may be cut off; widen SURFACE_MARGIN_BOHR')
    assert _classify(e) == {'code': 'box-too-small', 'message': 'the electron density reaches the edge of the '
                                                                'sampling box (a diffuse anion); this phase cannot draw it'}
    assert _classify(MemoryError())['code'] == 'out-of-memory'
    assert _classify(ValueError('x'))['code'] == 'worker-error'


def test_the_worker_imports_build_library_without_pythonpath():
    # D1: `python -m jobs.cli … --wait` starts from tools/ with nothing else on sys.path.
    code = 'import jobs.worker, build_library'
    result = subprocess.run([sys.executable, '-c', code], cwd=TOOLS, capture_output=True, text=True,
                            env={'PATH': '/usr/bin:/bin'})
    assert result.returncode == 0, result.stderr


# --- fix round 1 -------------------------------------------------------------

def test_relative_roots_survive_the_chdir_into_scratch(tmp_path, monkeypatch):
    # The worker runs input.py from its scratch folder; roots given relative
    # to the caller's directory must still mean the caller's directory.
    monkeypatch.setattr('tempfile.tempdir', str(tmp_path / 'scratch'))
    (tmp_path / 'scratch').mkdir()
    monkeypatch.chdir(tmp_path)
    store, sink = FileStore('state'), LocalSink('out')
    key = queue(store, [[1, 0, 0, 0], [1, 0, 0, 0.80]], method=None, recipe='optimise')
    slow_writes(monkeypatch, 0.5)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.1) == 'DONE'
    rec = FileStore(tmp_path / 'state').get_job(key)
    assert rec['peakMemoryGB'] is not None                  # only a heartbeat writes this field
    assert (tmp_path / 'out' / 'jobs' / key / 'attempts' / '1' / 'trajectory.xyz').exists()


def test_a_store_error_does_not_stop_the_heartbeat(env, monkeypatch, capsys):
    store, sink, jobs = env
    key = queue(store, H2)
    real, failed, landed = store.update_job, [], []

    def flaky(k, changes, expect_status=None, attempt=None):
        if 'heartbeatAt' in changes and not failed:
            failed.append(1)
            raise OSError('store briefly unavailable')
        if 'heartbeatAt' in changes:
            landed.append(1)
        return real(k, changes, expect_status=expect_status, attempt=attempt)

    monkeypatch.setattr(store, 'update_job', flaky)
    slow_writes(monkeypatch, 0.6)
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.1) == 'DONE'
    assert failed and landed
    assert 'store briefly unavailable' in capsys.readouterr().err


def test_writing_the_files_may_print_to_the_molecule_stdout(env, monkeypatch):
    # close_log closes the handle PySCF's objects print to; anything that
    # prints while the files are written must find somewhere harmless.
    store, sink, jobs = env
    key = queue(store, H2)

    def chatter(out, mol, mf, *rest):
        mol.stdout.write('grid chatter\n')
        mf.stdout.write('grid chatter\n')

    slow_writes(monkeypatch, 0, before=chatter)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']


def test_a_superseded_attempt_says_so(env, monkeypatch):
    # Ruling T5-b: the final write is refused when a later attempt owns the
    # job; the worker must not report DONE for a record it did not change.
    store, sink, jobs = env
    key = queue(store, H2)
    slow_writes(monkeypatch, 0, before=lambda *a: store.update_job(key, {'attempt': 2}))
    assert run_job(key, store, sink, grid_points=(32,)) == 'superseded'
    assert store.get_job(key)['status'] == 'RUNNING' and store.get_job(key)['attempt'] == 2


def test_cli_exits_zero_when_superseded(monkeypatch, tmp_path):
    monkeypatch.setattr(worker, 'run_job', lambda *a, **k: 'superseded')
    assert worker.main(['run', 'k' * 64, '--local', str(tmp_path / 'o'), '--state', str(tmp_path / 's')]) == 0


def test_resume_reads_the_last_frame_and_ignores_a_damaged_trajectory(env):
    store, sink, jobs = env
    key = 'k' * 64
    sink.put_attempt(key, 1, 'trajectory.xyz',
                     b'2\nstep 1\nH 0.0 0.0 0.0\nH 0.0 0.0 0.8\n2\nstep 2\nH -0.000000 0.0 0.0\nH 0.0 0.0 0.75\n')
    atoms = _resume_atoms(sink, key, 2)
    assert atoms == [('H', (0.0, 0.0, 0.0)), ('H', (0.0, 0.0, 0.75))]
    assert str(atoms[0][1][0]) == '0.0'                     # not -0.0 (Task 8 carry)
    for damaged in (b'2\nstep 1\nH 0.0 0.0', b'two\n', b'2\nstep 1\nH 0.0 0.0 x\nH 0 0 1\n', b'\n'):
        sink.put_attempt(key, 1, 'trajectory.xyz', damaged)
        assert _resume_atoms(sink, key, 2) is None, damaged


# --- final-review fix wave -----------------------------------------------------

def test_a_resumed_optimisation_is_recorded_as_resumed(env):
    """M4: attempt 2 of an optimise job starts from attempt 1's last frame;
    both input.py and meta.json's geometryOptimisation say so."""
    store, sink, jobs = env
    key = queue(store, [[1, 0, 0, 0], [1, 0, 0, 0.80]], method=None, recipe='optimise')
    sink.put_attempt(key, 1, 'trajectory.xyz', b'2\nstep 1\nH 0.0 0.0 0.0\nH 0.0 0.0 0.76\n')
    store.update_job(key, {'attempt': 2})
    assert run_job(key, store, sink, attempt=2, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    assert meta['geometryOptimisation']['resumedFrom'] == 1 and meta['geometryOptimisation']['converged']
    text = (jobs / key / 'input.py').read_text()
    assert "# Resumed from attempt 1's last trajectory frame" in text and '0.76' in text


def test_an_interrupted_worker_marks_its_attempt_failed(env, monkeypatch):
    """I1: Ctrl-C (or the local server stopping) reaches the worker as
    KeyboardInterrupt, which its `except Exception` does not catch; the
    record used to stay RUNNING for ever. It now ends FAILED (worker-crashed)
    under its own attempt, and the interrupt still propagates. Settling stays
    with the runner (Ruling T5-b)."""
    store, sink, jobs = env
    key = queue(store, H2)

    def interrupted(*args, **kwargs):
        raise KeyboardInterrupt
    monkeypatch.setattr(worker, 'render_input', interrupted)
    with pytest.raises(KeyboardInterrupt):
        run_job(key, store, sink, grid_points=(32,))
    rec = store.get_job(key)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-crashed'
    assert 'interrupted' in rec['error']['message'] and not rec['settled']


# --- Phase 6D: compute version 2 -------------------------------------------------

DECISION_V6 = {**DECISION, 'version': 6,
               'parts': {'stepSeconds': 1.0, 'frequencySeconds': 1.0, 'finalScfSeconds': 1.0, 'labellingSeconds': 1.0,
                         'filesSeconds': 1.0}}
STRETCHED_H2 = [[1, 0, 0, 0], [1, 0, 0, 0.80]]


def test_an_optimise_job_checks_its_structure_and_writes_frequencies(env):
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise')
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    root = jobs / key
    assert 'frequencies.json' in json.loads((root / 'done.json').read_text())['files']
    meta = json.loads((root / 'meta.json').read_text())
    assert meta['method'] == {'density': 'B3LYP-D3(BJ)/def2-TZVPD', 'energies': 'B3LYP-D3(BJ)/def2-TZVPD'}
    assert meta['dispersion']['model'] == 'D3(BJ)'
    assert meta['frequencyCheck']['result'] == 'minimum' and meta['frequencyCheck']['method'] == 'B3LYP-D3(BJ)/def2-SVP'
    assert meta['geometrySource'] == ('B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; '
                                      'true minimum (no imaginary frequencies)')
    assert set(meta['geometryOptimisation']) == {'steps', 'converged'} and meta['geometryOptimisation']['converged']
    provenance = meta['provenance']
    assert provenance['computeVersion'] == 2 and provenance['geometryMethod'] == 'B3LYP-D3(BJ)/def2-SVP'
    assert provenance['frequencyCheck'] == 'true minimum (no imaginary frequencies)'
    assert provenance['timeLimitSeconds'] is None and provenance['caveats'] == worker.CAVEATS['optimise']
    frequencies = json.loads((root / 'frequencies.json').read_text())
    assert frequencies['method'] == 'B3LYP-D3(BJ)/def2-SVP' and len(frequencies['wavenumbers']) == 1
    assert frequencies['geometryAngstrom'][0][0] == 'H' and frequencies['zeroPointEnergyHartree'] > 0
    assert len(frequencies['normalModes'][0]) == 2 and frequencies['result'] == 'minimum'
    # Preflight D10: written compactly, every number rounded.
    text = (root / 'frequencies.json').read_text()
    assert text == json.dumps(frequencies, separators=(',', ':'), ensure_ascii=False)
    assert all(len(repr(v).split('.')[-1]) <= 6 for v in frequencies['geometryAngstrom'][1][1:])
    # Task 7 review M4/M5: which geometry the analysis belongs to, and the conventions of modes and masses.
    assert frequencies['analysedGeometry'] == 'the final geometry' and frequencies['atSaddlePoint'] is False
    assert frequencies['massesAmu'] == [1.008, 1.008] and 'zeroPointEnergyNote' not in frequencies
    assert any('isotope_avg=True' in n for n in frequencies['notes'])
    assert any('not mass-weighted' in n and '1/mu' in n for n in frequencies['notes'])
    assert provenance['frequencyMasses'].startswith('standard atomic weights')
    # The optimised geometry is symmetrised before the final SCF (Task 7); provenance says so, and by how much.
    final = provenance['finalGeometry']
    assert final['symmetrised'] and final['pointGroup'] == 'Dooh' and final['maxDisplacementAngstrom'] < 1e-3
    assert final['summary'].startswith('symmetrised to Dooh before the final SCF (largest move ')
    assert 'openShell' not in provenance
    # Every object this optimisation stored is within the quote's object count (Phase 6C; 16 -> 17).
    actual = store.get_job(key)['actual']
    assert actual['resultObjects'] == 16 <= quotes.STORED_OBJECTS == 17


def test_frequencies_json_is_written_before_the_files_so_the_result_budget_counts_it(env, monkeypatch):
    # Task 7 carry (preflight D10): write_molecule_files's 3 MB budget sums every file in its folder.
    store, sink, jobs = env
    seen = []
    slow_writes(monkeypatch, 0, before=lambda out, *rest: seen.append((Path(out) / 'frequencies.json').exists()))
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise')
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    assert seen == [True]


def test_a_forced_short_time_limit_ends_done_not_converged_with_files(env):
    # Spec §12 / Review Focus 4: the budget refuses the next step; the job still ends DONE, with every file.
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise', decision=DECISION_V6)
    assert run_job(key, store, sink, grid_points=(32,), time_limit_seconds=1.0) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    optimisation = meta['geometryOptimisation']
    assert optimisation['converged'] is False and optimisation['stoppedBy'] == 'time-limit' and optimisation['steps'] == 1
    assert meta['frequencyCheck']['result'] == 'not-run'
    assert 'optimisation stopped by its time limit, not converged (max force' in meta['geometrySource']
    # Task 6 review: maxGradient is the largest Cartesian component, not geomeTRIC's per-atom norm; say which.
    assert 'the largest Cartesian gradient component: ' in meta['geometrySource']
    assert meta['provenance']['timeLimitSeconds'] == 1.0
    names = set(json.loads((jobs / key / 'done.json').read_text())['files'])
    assert {'meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz', 'trajectory.xyz'} <= names
    assert 'frequencies.json' not in names and store.get_job(key)['status'] == 'DONE'


def test_a_record_sized_before_version_6_has_no_time_budget():
    assert worker.TimeBudget(1.0, None)('step') and worker.TimeBudget(1.0, None)('frequency check')
    assert worker.TimeBudget(None, DECISION_V6['parts'])('step')


def test_the_budget_counts_the_step_the_check_the_final_scf_the_labels_and_the_files():
    now = [0.0]
    parts = {'stepSeconds': 10.0, 'frequencySeconds': 20.0, 'finalScfSeconds': 30.0, 'filesSeconds': 40.0,
             'labellingSeconds': 5.0}
    budget = worker.TimeBudget(1000.0, parts, clock=lambda: now[0])
    # Left = 1000 - 30 (start-up) - elapsed; a step needs 1.2 x (10 + 20 + 30 + 5 + 40) = 126, the check 1.2 x 95 = 114.
    now[0] = 1000 - 30 - 126
    assert budget('step')
    now[0] += 0.01
    assert not budget('step') and budget('frequency check')
    now[0] = 1000 - 30 - 114 + 0.01
    assert not budget('frequency check')


def test_a_displacement_asks_for_two_scfs_and_a_step_on_top_of_the_tail():
    # Deferred minor (Task 8): leaving a saddle point runs two displaced SCFs (both signs) and the
    # re-optimisation's first step, which no later question covers; each costs at most one step's price.
    parts = {'stepSeconds': 10.0, 'frequencySeconds': 20.0, 'finalScfSeconds': 30.0, 'filesSeconds': 40.0,
             'labellingSeconds': 5.0}
    budget = worker.TimeBudget(1000.0, parts)
    assert budget.remaining('displacement') == pytest.approx(budget.remaining('frequency check') + 3 * 10.0)


def test_geometry_source_says_a_time_limit_stop_once():
    # Deferred minor (Task 8): the stop and the check's "not checked: the optimisation stopped at its time limit"
    # said the same thing twice in one sentence.
    method = {'xc': 'B3LYP-D3BJ', 'optimiseBasis': 'def2-SVP'}
    stopped = {'stoppedBy': 'time-limit', 'maxGradient': 0.012,
               'frequencyCheck': {'result': 'not-run', 'summary': 'not checked: the optimisation stopped at its time limit'}}
    text = worker._geometry_source_text({'kind': 'xyz'}, 'optimise', method, stopped)
    assert text == ('B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; optimisation stopped by its time limit, not '
                    'converged (max force, the largest Cartesian gradient component: 1.2e-02 Ha/bohr); not checked '
                    'for imaginary frequencies')
    again = {'stoppedBy': 'time-limit', 'maxGradient': 0.012, 'displacedFrom': 1,
             'frequencyCheck': {'result': 'not-rechecked', 'imaginaryCount': 1, 'summary': (
                 'displaced from a saddle point (1 imaginary); the re-optimisation stopped at its time limit, '
                 'not converged, and was not checked again')}}
    text = worker._geometry_source_text({'kind': 'xyz'}, 'optimise', method, again)
    assert text == ('B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; displaced from a saddle point (1 imaginary); '
                    're-optimisation stopped by its time limit, not converged (max force, the largest Cartesian '
                    'gradient component: 1.2e-02 Ha/bohr); not checked again')
    assert text.count('time limit') == 1
    checked = {'frequencyCheck': {'result': 'minimum', 'summary': 'true minimum (no imaginary frequencies)'}}
    assert worker._geometry_source_text({'kind': 'xyz'}, 'optimise', method, checked) == (
        'B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; true minimum (no imaginary frequencies)')


def test_the_budget_reads_the_labelling_term_sizing_prices():
    # Ruling D7: labelling runs inside the files stage, after the budget's last decision; sizing version 6
    # prices it as its own figure (sizing.labelling_seconds), which replaced Task 8's stand-in share of the
    # final SCF.
    from jobs import sizing
    parts = sizing.decide(canonical_job('optimise', STRETCHED_H2, 0, 1))['parts']
    budget = worker.TimeBudget(1000.0, parts)
    assert parts['labellingSeconds'] > 0
    assert budget.remaining('frequency check') == pytest.approx(
        parts['frequencySeconds'] + parts['finalScfSeconds'] + parts['labellingSeconds'] + parts['filesSeconds'])
    assert budget.remaining('step') == pytest.approx(budget.remaining('frequency check') + parts['stepSeconds'])


def test_the_time_limit_is_the_batch_timeout_on_aws_and_none_on_this_mac():
    assert worker.time_limit('aws', {'timeoutSeconds': 600}) == 600.0
    assert worker.time_limit('local', {'timeoutSeconds': 600}) is None
    assert worker.time_limit('local', {'timeoutSeconds': 600}, 5) == 5.0


def test_on_aws_a_given_limit_never_runs_past_the_batch_timeout():
    # Deferred minor (Task 8): Batch ends the attempt at its timeout whatever JOBS_TIME_LIMIT_SECONDS says.
    assert worker.time_limit('aws', {'timeoutSeconds': 600}, 900) == 600.0
    assert worker.time_limit('aws', {'timeoutSeconds': 600}, 300) == 300.0


def test_on_aws_the_budget_clock_starts_with_the_process(monkeypatch):
    # Deferred minor (Task 8): Batch's timeout runs from the attempt's start; the claim, the resume frame and
    # input.py's imports all come before the budget is built, so its clock starts with the process.
    monkeypatch.setattr(worker, 'PROCESS_STARTED', 100.0)
    sizing = {'timeoutSeconds': 600, 'parts': DECISION_V6['parts']}
    aws = worker.make_budget('aws', sizing, None, clock=lambda: 400.0)
    assert aws.began == 100.0 and aws.limit == 600.0
    # This Mac's local server runs many jobs from one process: its clock starts with the job.
    local = worker.make_budget('local', sizing, 5, clock=lambda: 400.0)
    assert local.began == 400.0 and local.limit == 5.0


def test_a_record_without_budget_figures_records_no_time_limit(env):
    # Deferred minor (Task 8): a record sized before version 6 has no figures, so no budget runs; provenance must
    # not show a time limit the run never worked to.
    store, sink, jobs = env
    key = queue(store, H2)
    assert run_job(key, store, sink, grid_points=(32,), time_limit_seconds=600.0) == 'DONE', store.get_job(key)['error']
    assert json.loads((jobs / key / 'meta.json').read_text())['provenance']['timeLimitSeconds'] is None


def test_the_cli_reads_a_time_limit_from_the_environment(monkeypatch, tmp_path):
    seen = {}
    monkeypatch.setattr(worker, 'run_job', lambda *a, **k: seen.update(k) or 'DONE')
    args = ['run', 'k' * 64, '--local', str(tmp_path / 'o'), '--state', str(tmp_path / 's')]
    assert worker.main(args, environ={'JOBS_TIME_LIMIT_SECONDS': '90'}) == 0 and seen['time_limit_seconds'] == 90.0
    assert worker.main(args, environ={}) == 0 and seen['time_limit_seconds'] is None


def test_a_compute_version_1_job_keeps_its_recipe(env):
    # An owner's retry of a job approved before Phase 6D: its own method, no check, its old caveats.
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method={'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': 'def2-SVP'},
                recipe='optimise', compute_version=1)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    assert 'frequencyCheck' not in meta and 'FREQUENCY_CHECK = False' in (jobs / key / 'input.py').read_text()
    assert meta['provenance']['caveats'] == worker.LEGACY_OPTIMISE_CAVEATS
    assert meta['geometrySource'] == 'B3LYP/def2-SVP optimised from pasted XYZ'
    assert not (jobs / key / 'frequencies.json').exists()


def test_the_geometry_source_says_how_the_structure_was_checked():
    method = {'xc': 'B3LYP-D3BJ', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'}
    saddle = {'frequencyCheck': {'summary': 'saddle point (2 imaginary frequencies), not a minimum'}}
    assert worker._geometry_source_text({'kind': 'xyz'}, 'optimise', method, saddle) == (
        'B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; saddle point (2 imaginary frequencies), not a minimum')
    assert worker._geometry_source_text({'kind': 'xyz'}, 'single', method, {}) == 'pasted XYZ'


def test_an_open_shell_says_which_parts_ran_uks_and_which_roks(env):
    # Task 6 review: PySCF 2.8 has no ROKS Hessian, so geometry and frequencies run UKS, properties ROKS.
    store, sink, jobs = env
    # NH2 (2B1): OH's degenerate pi3 does not converge in ROKS with symmetry on at def2-TZVPD (a separate,
    # older matter, in the Task 8 report).
    nh2 = [[7, 0.0, 0.0, 0.14], [1, 0.0, 0.80, -0.42], [1, 0.0, -0.80, -0.42]]
    key = queue(store, nh2, charge=0, mult=2, method=None, recipe='optimise')
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    shell = meta['provenance']['openShell']
    assert shell['methods'] == 'geometry and frequencies: UKS; properties: ROKS'
    assert shell['expectedS2'] == 0.75 and abs(shell['geometryS2'] - 0.75) < 0.01 and not shell['contaminated']
    assert set(meta['geometryOptimisation']) == {'steps', 'converged'}
    assert json.loads((jobs / key / 'frequencies.json').read_text())['spinSquaredUKS'] == pytest.approx(0.75, abs=0.01)


def test_frequencies_at_a_saddle_point_say_so_and_caveat_the_zero_point_energy():
    # Task 7 review M4: the analysis behind a not-rechecked displacement is the saddle point's, not the final
    # geometry's; a zero-point energy summed without the imaginary modes is not a minimum's.
    check = {'atoms': [('H', (0.0, 0.0, 0.0)), ('H', (0.0, 0.0, 0.74))], 'wavenumbers': [-300.0, 4000.0],
             'reducedMasses': [1.0, 0.5], 'normalModes': [[[0, 0, 1], [0, 0, -1]]] * 2, 'imaginary': [-300.0],
             'zeroPointEnergyHartree': 0.0091, 'massesAmu': [1.008, 1.008]}
    summary = {'result': 'not-rechecked', 'summary': 'displaced from a saddle point (1 imaginary); …'}
    out = worker.frequencies_payload(check, summary, 'B3LYP-D3(BJ)/def2-SVP')
    assert out['atSaddlePoint'] is True and out['analysedGeometry'].startswith('the saddle point the run displaced from')
    assert 'not the zero-point energy of a minimum' in out['zeroPointEnergyNote']
    saddle = worker.frequencies_payload(check, {'result': 'saddle-point', 'summary': 's'}, 'm')
    assert saddle['analysedGeometry'] == 'the final geometry, a saddle point'


RESUMED_SADDLE = ('step 4 E=-1.1000000000 check={"displacedFrom":1,"checkHistory":[{"result":"saddle-point",'
                  '"summary":"saddle point (1 imaginary frequency), not a minimum","imaginaryCount":1}]}')


def test_a_spot_resume_after_a_displacement_keeps_the_displacement_and_the_check_history(env):
    # Preflight D16: attempt 1 had displaced off a saddle point when Spot reclaimed it. Its last frame's
    # comment says so; attempt 2 re-optimises from that frame, rechecks, and reports the displacement.
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise')
    sink.put_attempt(key, 1, 'trajectory.xyz',
                     f'2\n{RESUMED_SADDLE}\nH 0.0 0.0 0.0\nH 0.0 0.0 0.76\n'.encode())
    store.update_job(key, {'attempt': 2})
    assert run_job(key, store, sink, attempt=2, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    assert 'RESUMED_CHECK = {' in (jobs / key / 'input.py').read_text()
    assert meta['geometryOptimisation']['displacedFrom'] == 1 and meta['geometryOptimisation']['resumedFrom'] == 1
    assert meta['frequencyCheck']['result'] == 'minimum-after-displacement'
    assert meta['frequencyCheck']['history'][0]['result'] == 'saddle-point'
    assert 'reached by displacing a saddle point (1 imaginary)' in meta['geometrySource']
    # This attempt's own frames carry the record on, for a second reclaim.
    frames = (jobs / key / 'attempts' / '2' / 'trajectory.xyz').read_text().splitlines()
    assert ' check={"displacedFrom":1,' in frames[1]


def test_a_frame_before_any_displacement_resumes_as_a_plain_optimisation(env):
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise')
    sink.put_attempt(key, 1, 'trajectory.xyz', b'2\nstep 1 E=-1.1\nH 0.0 0.0 0.0\nH 0.0 0.0 0.76\n')
    store.update_job(key, {'attempt': 2})
    assert run_job(key, store, sink, attempt=2, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    assert 'RESUMED_CHECK = None' in (jobs / key / 'input.py').read_text()
    assert json.loads((jobs / key / 'meta.json').read_text())['frequencyCheck']['result'] == 'minimum'
    frames = (jobs / key / 'attempts' / '2' / 'trajectory.xyz').read_text().splitlines()
    assert frames[1].startswith('step 1 E=') and 'check=' not in frames[1]


WATER = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]


def test_a_final_scf_without_symmetry_keeps_its_orbital_labels(env, monkeypatch):
    # Controller ruling (Task 8): when PySCF cannot build symmetry-adapted orbitals and the final SCF runs
    # without symmetry, the labels come from the geometry's own point group, and provenance carries the note.
    store, sink, jobs = env
    import jobs.input_template as template
    broken = template.TEMPLATE.replace("        mol = molecule(atoms, BASIS)\n",
                                       "        raise IndexError('index 2 is out of bounds for axis 0 with size 2')\n")
    assert broken != template.TEMPLATE
    monkeypatch.setattr(template, 'TEMPLATE', broken)
    key = queue(store, WATER)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    occupied = [row['label'] for row in meta['orbitals'] if row['occupation'] > 0]
    assert occupied == ['1a1', '2a1', '1b2', '3a1', '1b1']
    assert meta['symmetry']['pointGroup'] == 'C2v' and meta['symmetry']['labels'] == 'full-group'
    assert "labelled from the geometry's own point group" in meta['symmetry']['labelNote']
    final = meta['provenance']['finalGeometry']
    assert final['symmetry'] == 'off' and final['summary'] == final['note']


OH = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.97]]


def test_a_final_scf_retried_without_symmetry_finishes_done_and_says_so(env):
    # Ruling OH-retry: OH's ROKS SCF does not converge with symmetry on (at 6-31G as at def2-TZVPD); the
    # retry without it converges, the orbitals are labelled from the geometry's own point group (C∞v), and the
    # provenance says what happened.
    store, sink, jobs = env
    key = queue(store, OH, mult=2, method={'xc': 'B3LYP', 'basis': '6-31g', 'optimiseBasis': None})
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    retry = meta['provenance']['finalScf']
    assert retry['symmetry'] == 'off' and retry['retried'] is True
    assert retry['summary'].startswith('the final SCF did not converge with point-group symmetry')
    assert 'geometryOptimisation' not in meta
    # 96da650: point_group labels a linear molecule's orbitals without symmetry too (σ/π by character).
    assert meta['symmetry']['pointGroup'] == 'Coov' and meta['symmetry']['labels'] == 'full-group'
    assert [o['label'] for o in meta['orbitals'][:5]] == ['1σ', '2σ', '3σ', '1π', '1π']
