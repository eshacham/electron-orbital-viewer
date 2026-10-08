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
from jobs import worker
from jobs.worker import _classify, _resume_atoms, run_job

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
SVP = {'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': None}
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'local', 'attempts': 1,
            'basisFunctions': 10, 'predictedSeconds': 5.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 0, 'predictedCostMicros': 0}
H2 = [[1, 0, 0, 0], [1, 0, 0, 0.74]]
TOOLS = Path(__file__).resolve().parents[2]


def queue(store, atoms, charge=0, mult=1, method=SVP, recipe='single'):
    job = canonical_job(recipe, atoms, charge, mult, method=method)
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision=DECISION, name='hydrogen', formula='H2', electron_count=2,
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
