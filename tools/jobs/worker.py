"""Runs one job: claim it, execute input.py, write Phase 6's files plus the
provenance record, done.json last (spec §6.5, §8).

Imports PySCF (through input.py and build_library) and so is excluded from
the no-chemistry rule the api modules keep.
"""
import argparse
import hashlib
import json
import os
import resource
import runpy
import shutil
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

# D1 (preflight controller correction): tools/molecules is a folder of flat
# modules, not a package, so make build_library importable however the
# worker starts (cli --wait, LocalRunner, the image). Appended rather than
# inserted, so nothing already on the path is shadowed.
_MOLECULES = str(Path(__file__).resolve().parents[1] / 'molecules')
if _MOLECULES not in sys.path:
    sys.path.append(_MOLECULES)

from jobs.input_template import render_input  # noqa: E402
from jobs.model import iso, utc_now  # noqa: E402
from jobs.sink import LocalSink  # noqa: E402
from jobs.store import FileStore  # noqa: E402

LOG_TAIL_LINES = 20
LOG_TAIL_BYTES = 4096
RESULT_FILES = ('meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz')
CAVEATS = {
    'single': ['The geometry is not optimised: it is PubChem\'s computed 3D conformer or as pasted.'],
    'optimise': ['B3LYP/def2-SVP optimisation without a dispersion correction.',
                 'No frequency check: the structure is not confirmed to be a minimum.'],
}
BOX_TOO_SMALL = ('the electron density reaches the edge of the sampling box (a diffuse anion); '
                 'this phase cannot draw it')
INTERRUPTED = 'the worker was interrupted (KeyboardInterrupt) before this job finished'


def _peak_memory_gb():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(rss / 1024 ** 3 if sys.platform == 'darwin' else rss / 1024 ** 2, 3)   # bytes on macOS, KiB on Linux


def _tail(path: Path):
    if not path.exists():
        return []
    lines = path.read_text(errors='replace').splitlines()[-LOG_TAIL_LINES:]
    while lines and len('\n'.join(lines).encode()) > LOG_TAIL_BYTES:
        lines = lines[1:]
    return lines


def _xyz(atoms, comment):
    return '\n'.join([str(len(atoms)), comment] + [f'{s} {x:.6f} {y:.6f} {z:.6f}' for s, (x, y, z) in atoms]) + '\n'


def _geometry_source_text(source, recipe):
    origin = f'PubChem CID {source["cid"]} 3D conformer (retrieved {source["retrievedAt"]})' \
        if source['kind'] == 'pubchem' else 'pasted XYZ'
    return f'B3LYP/def2-SVP optimised from {origin}' if recipe == 'optimise' else origin


def _commit():
    try:
        from build_library import _commit as commit
        return commit()
    except Exception:
        return 'unknown'


def _resume_atoms(sink, key, attempt):
    """The last geometry a reclaimed optimise attempt reached, so a Spot
    reclaim costs the steps since the last frame rather than the whole run.
    A trajectory cut off mid-write (the reclaim can land during put_attempt)
    or otherwise unreadable means starting again from the submitted
    geometry: slower, never wrong."""
    previous = sink.get_attempt(key, attempt - 1, 'trajectory.xyz')
    if not previous:
        return None
    try:
        lines = previous.decode().strip().splitlines()
        count = int(lines[0])
        frame = [line.split() for line in lines[-count:]]
        if count < 1 or len(lines) < count + 2 or any(len(p) != 4 for p in frame):
            return None
        # + 0.0: the %.6f text can carry -0.000000, which input.py would show as -0.0
        return [(p[0], (float(p[1]) + 0.0, float(p[2]) + 0.0, float(p[3]) + 0.0)) for p in frame]
    except (ValueError, IndexError, UnicodeDecodeError):
        return None


def _patch_wall_seconds(meta_path: Path, wall):
    # D14 (Ruling D14): writing Phase 6's grids can take longer than the SCF
    # (benzene: 204 s against 150 s), so the run's wall time is taken after
    # the files exist. write_molecule_files wrote meta.json before that
    # moment, so the figure is patched in here, in the same format, before
    # anything is copied to the sink or hashed for done.json.
    meta = json.loads(meta_path.read_text())
    meta['provenance']['wallSeconds'] = wall
    meta_path.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')


class Progress:
    """What the heartbeat reports, updated from PySCF's callbacks."""

    def __init__(self):
        self.lock = threading.Lock()
        self.stage, self.energy, self.stages = None, None, []

    def on_stage(self, stage, energy=None):
        with self.lock:
            if stage != self.stage:
                self.stages.append({'name': stage, 'start': time.monotonic()})
                self.stage = stage
            if energy is not None:
                self.energy = float(energy)

    def durations(self, end):
        out = []
        for i, s in enumerate(self.stages):
            stop = self.stages[i + 1]['start'] if i + 1 < len(self.stages) else end
            out.append({'name': s['name'], 'seconds': round(stop - s['start'], 2)})
        return out


def run_job(key, store, sink, attempt=1, backend='local', grid_points=None, heartbeat_seconds=30, image_digest='local',
            runner_job_id=None):
    if not store.claim(key, attempt, utc_now()):
        return 'duplicate'
    if runner_job_id:
        # Final review M2: the api can lose the id SubmitJob returned (its
        # Lambda timing out after the call), and reconcile finds a run by
        # that id; written only where none is. A failure here costs that
        # safety net, not the run.
        try:
            store.note_runner_job_id(key, runner_job_id, attempt)
        except Exception as e:
            print(f'worker: could not record Batch job {runner_job_id} for {key[:8]} ({type(e).__name__}: {e})',
                  file=sys.stderr)
    work = Path(tempfile.mkdtemp(prefix=f'job-{key[:8]}-'))
    try:
        return _run(key, store, sink, attempt, backend, grid_points, heartbeat_seconds, image_digest, work)
    except KeyboardInterrupt:
        # I1: Ctrl-C, or the local server stopping (its worker subprocess
        # shares the terminal's SIGINT), skips `_run`'s `except Exception`
        # and would leave the record RUNNING for ever. Say so on the record,
        # under this attempt only, then let the interrupt go on. Settling is
        # still the runner's (Ruling T5-b): cli --wait does it at once, the
        # local runner's start-up sweep does it otherwise. SIGTERM is left
        # alone: on AWS it means a Spot reclaim, and the retry must find the
        # job still claimable.
        store.update_job(key, {'status': 'FAILED', 'endedAt': iso(utc_now()), 'stage': None,
                               'error': {'code': 'worker-crashed', 'message': INTERRUPTED}},
                         expect_status={'RUNNING'}, attempt=attempt)
        raise
    finally:
        # D18: the scratch copy is only a staging area; everything worth
        # keeping is in the sink by now (or the job has failed).
        shutil.rmtree(work, ignore_errors=True)


def _run(key, store, sink, attempt, backend, grid_points, heartbeat_seconds, image_digest, work):
    import pyscf
    from build_library import GRID_POINTS_TRIES, write_molecule_files

    record = store.get_job(key)
    job, recipe, sizing = record['job'], record['recipe'], record['sizing']
    # D2: the image has no git (nor a .git), so it is told its commit; a
    # local run asks git. Once, so meta.json, provenance and job.json agree.
    commit = os.environ.get('JOBS_GENERATOR_COMMIT') or _commit()
    progress, stop = Progress(), threading.Event()
    log = work / 'output.log'
    frames = []

    start = _resume_atoms(sink, key, attempt) if recipe == 'optimise' and attempt > 1 else None
    input_text = render_input(job, key, start=start, resumed_from=attempt - 1 if start else None)
    (work / 'input.py').write_text(input_text)

    def beat():
        while not stop.wait(heartbeat_seconds):
            with progress.lock:
                stage, energy = progress.stage, progress.energy
            try:
                # Ruling T5-b: every write names this attempt, so one that a
                # reclaim or retry has moved past cannot overwrite the current one.
                store.update_job(key, {'heartbeatAt': iso(utc_now()), 'stage': stage,
                                       'latestEnergyHartree': energy, 'logTail': _tail(log),
                                       'peakMemoryGB': _peak_memory_gb()},
                                 expect_status={'RUNNING'}, attempt=attempt)
            except Exception as e:
                # One missed beat is harmless; a dead heartbeat thread would
                # leave the record frozen for the rest of the run.
                print(f'worker: heartbeat for {key[:8]} failed ({type(e).__name__}: {e}); retrying',
                      file=sys.stderr)

    def on_step(step, energy, atoms):
        frames.append(_xyz(atoms, f'step {step} E={energy:.10f}'))
        sink.put_attempt(key, attempt, 'trajectory.xyz', ''.join(frames).encode())

    heart = threading.Thread(target=beat, daemon=True)
    heart.start()
    began, cwd = time.monotonic(), os.getcwd()
    error, ns, final_atoms, devnull = None, {}, None, None
    try:
        os.chdir(work)                              # geomeTRIC writes its scratch files to the working directory
        ns = runpy.run_path(str(work / 'input.py'), run_name='jobs_input')
        try:
            mol, mf, info = ns['build'](on_stage=progress.on_stage, on_step=on_step)
        finally:
            # Task 8 carry: input.py holds output.log open across every
            # molecule it builds; closing it flushes the log before the
            # worker reads it for logTail and copies it to the sink.
            ns['close_log']()
        # The PySCF objects still hold the closed log as their stdout: point
        # them somewhere open and quiet them, so anything that prints while
        # the files are written neither fails nor lands after the log's end.
        devnull = open(os.devnull, 'w')
        mol.stdout = mf.stdout = devnull
        mol.verbose = mf.verbose = 0
        progress.on_stage('writing files')
        source = record['geometrySource']
        coords = mol.atom_coords(unit='Angstrom')
        final_atoms = [(mol.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(mol.natm)]
        fields = {
            'id': key, 'name': record['name'], 'formula': record['formula'],
            'geometrySource': _geometry_source_text(source, recipe), 'references': [],
            'method': f"{job['method']['xc']}/{job['method']['basis']}",
            'multiplicity': job['molecule']['multiplicity'], 'tier': 'computed',
            'provenance': {'jobKey': key, 'computeVersion': job['computeVersion'], 'recipe': recipe,
                           'geometrySource': source, 'caveats': CAVEATS[recipe], 'generatorCommit': commit,
                           'imageDigest': image_digest, 'pyscfVersion': pyscf.__version__,
                           'sizingVersion': sizing['version'], 'size': sizing['size'],
                           'capacity': sizing['capacity'],
                           # provisional, so the budget check sees a number of
                           # about the final width; replaced below (D14)
                           'wallSeconds': round(time.monotonic() - began, 2),
                           'costUsd': None},
        }
        if info:
            # Ruling D13: {steps, converged}; 6B-2 widens the TS type. A
            # resumed run (M4) also names the attempt whose last frame it
            # started from: its `steps` count only this attempt's.
            fields['geometryOptimisation'] = {**info, 'resumedFrom': attempt - 1} if start else info
        write_molecule_files(work / 'result', mol, mf, fields, grid_points or GRID_POINTS_TRIES, commit=commit)
        _patch_wall_seconds(work / 'result' / 'meta.json', round(time.monotonic() - began, 2))
    except Exception as e:
        error = _classify(e)
    finally:
        stop.set()                                  # first: no beat should start while the cwd changes
        os.chdir(cwd)
        heart.join()
        if devnull:
            devnull.close()

    ended = time.monotonic()
    actual = {'wallSeconds': round(ended - began, 2), 'peakMemoryGB': _peak_memory_gb(), 'threads': _threads()}
    timings = {'attempt': attempt, 'backend': backend, 'size': sizing['size'], 'vcpu': sizing['vcpu'],
               'memoryGB': sizing['memoryGB'], 'capacity': sizing['capacity'],
               'stages': progress.durations(ended), **actual,
               'startedAt': record['startedAt'], 'endedAt': iso(utc_now())}
    # D17: copying the files out is protected too. A result file the worker
    # cannot write (FileExistsError) must end the job FAILED saying so, not
    # leave it RUNNING until something notices the worker has gone.
    try:
        log_bytes = log.read_bytes() if log.exists() else b''
        for name, data in (('input.py', input_text.encode()), ('output.log', log_bytes),
                           ('timings.json', json.dumps(timings, indent=1).encode())):
            sink.put_attempt(key, attempt, name, data)
        if error is None:
            # Ownership again, right before the root writes: the root belongs
            # to whichever attempt owns the record, and one that a retry (or a
            # sweep marking it FAILED) has moved past must neither clear nor
            # write it. Its final write would be refused anyway (Ruling T5-b).
            current = store.get_job(key) or {}
            if current.get('attempt') != attempt or current.get('status') != 'RUNNING':
                return 'superseded'
            existing = sink.get_result(key, 'done.json')
            if existing is not None:
                # A complete root already: an earlier attempt was reclaimed
                # between put_done and its final record write. The key is
                # content-addressed, so that set is this job's answer if its
                # files still match done.json; clear_partial never clears it,
                # so failing here would fail the key for ever.
                error = _check_complete(sink, key, existing)
            else:
                files = {name: (work / 'result' / name).read_bytes() for name in RESULT_FILES}
                files.update({'job.json': json.dumps({'key': key, 'job': job,
                                                      'geometrySource': record['geometrySource'],
                                                      'sizing': sizing, 'imageDigest': image_digest,
                                                      'generatorCommit': commit}, indent=1).encode(),
                              'input.py': input_text.encode(), 'output.log': log_bytes,
                              'geometry.xyz': _xyz(final_atoms, f'{record["formula"]} job {key}').encode(),
                              'timings.json': json.dumps(timings, indent=1).encode()})
                if frames:
                    files['trajectory.xyz'] = ''.join(frames).encode()
                # D7: an earlier attempt reclaimed part-way through these
                # writes leaves a root without done.json, which would refuse
                # every name it already has. Ownership was checked just above.
                sink.clear_partial(key)
                for name, data in files.items():
                    sink.put_result(key, name, data)
                # done.json last: its presence is what says the set is complete.
                sink.put_done(key, json.dumps({'key': key,
                                               'files': {n: hashlib.sha256(d).hexdigest() for n, d in files.items()},
                                               'writtenAt': iso(utc_now())}, indent=1).encode())
    except Exception as e:
        error = error or _classify(e)               # the run's own failure is the more useful reason

    written = store.update_job(key, {'status': 'FAILED' if error else 'DONE', 'endedAt': iso(utc_now()),
                                     'stage': None, 'actual': actual, 'error': error, 'logTail': _tail(log)},
                               expect_status={'RUNNING'}, attempt=attempt)
    if not written:
        # A later attempt owns the record now (Ruling T5-b): its outcome, not
        # this one's, is the job's. Like a duplicate, this is not a failure.
        return 'superseded'
    return 'FAILED' if error else 'DONE'


def _check_complete(sink, key, done_bytes):
    """None if the root's files match the done.json found there (and it lists
    every file the app reads), else the error that says which do not."""
    try:
        listed = json.loads(done_bytes)['files']
        problems = [f'{name} is not listed' for name in RESULT_FILES if name not in listed]
        for name, digest in listed.items():
            data = sink.get_result(key, name)
            if data is None:
                problems.append(f'{name} is missing')
            elif hashlib.sha256(data).hexdigest() != digest:
                problems.append(f'{name} has changed')
    except (ValueError, KeyError, TypeError, AttributeError):
        problems = ['done.json itself cannot be read']
    if not problems:
        return None
    return {'code': 'worker-error',
            'message': (f'the result folder already holds a done.json that does not match its files '
                        f'({"; ".join(problems)}). Results are never overwritten: clear the folder, then retry.')[:500]}


def _threads():
    try:
        from pyscf import lib
        return lib.num_threads()
    except Exception:
        return os.cpu_count()


def _classify(e):
    name = type(e).__name__
    if name == 'SCFNotConverged':
        return {'code': 'scf-not-converged', 'message': str(e)}
    if name == 'OptimisationNotConverged':
        return {'code': 'optimisation-not-converged', 'message': str(e)}
    if name == 'BudgetExceeded':
        return {'code': 'output-too-large', 'message': str(e)}
    if isinstance(e, MemoryError):
        return {'code': 'out-of-memory', 'message': 'the calculation ran out of memory'}
    if isinstance(e, RuntimeError) and 'at the box face' in str(e):
        # D15: build_library.check_box's message is addressed to whoever
        # maintains the grid ("widen SURFACE_MARGIN_BOHR"); small anions such
        # as F⁻ trip it, and the owner needs to be told what happened instead.
        return {'code': 'box-too-small', 'message': BOX_TOO_SMALL}
    if isinstance(e, FileExistsError):
        # D7 clears a partial root and a complete one is accepted, so this
        # now means a second writer raced this attempt (Task 4 follow-up).
        found = Path(e.filename).name if e.filename else 'a result file'
        return {'code': 'worker-error',
                'message': f'{found} appeared in the result folder while this attempt was writing it: another '
                           'attempt wrote the same job at the same time, and results are never overwritten. Retry: '
                           'the retry accepts a complete set or clears a partial one.'}
    last = traceback.format_exception_only(e)[-1].strip()
    return {'code': 'worker-error', 'message': last[:500]}


def image_digest(environ, fetch=None) -> str:
    """The image this attempt runs: JOBS_IMAGE_DIGEST if set (tests, local
    runs), else the digest ECS reports in the task metadata endpoint."""
    if environ.get('JOBS_IMAGE_DIGEST'):
        return environ['JOBS_IMAGE_DIGEST']
    uri = environ.get('ECS_CONTAINER_METADATA_URI_V4')
    if not uri:
        return 'unknown'
    try:
        if fetch is None:
            import urllib.request
            fetch = lambda url: urllib.request.urlopen(url, timeout=2).read()
        return json.loads(fetch(uri)).get('ImageID') or 'unknown'
    except Exception:
        return 'unknown'


def aws_attempt(environ) -> int:
    """Batch numbers attempts from 1 within one Batch job; JOB_ATTEMPT_OFFSET
    (set by BatchRunner from the record) keeps them rising across the
    owner's retries, which are new Batch jobs."""
    return int(environ.get('JOB_ATTEMPT_OFFSET', '0')) + int(environ.get('AWS_BATCH_JOB_ATTEMPT', '1'))


def main(argv=None, environ=None):
    environ = os.environ if environ is None else environ
    argv = sys.argv[1:] if argv is None else list(argv)
    if argv[:1] == ['probe']:
        # Ruling D15: the speedup probe rides in the worker's image, whose
        # entry point is this module, so a Batch command override of
        # ["probe", …] reaches it. It needs no table, bucket or job key.
        from jobs.probe import main as probe_main
        return probe_main(argv[1:])
    parser = argparse.ArgumentParser(prog='python -m jobs.worker')
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('run')
    run.add_argument('key')
    where = run.add_mutually_exclusive_group(required=True)
    where.add_argument('--local', help='out root, e.g. tools/molecules/out')
    where.add_argument('--aws', action='store_true',
                       help='DynamoDB table JOBS_TABLE and bucket DATA_BUCKET from the environment (AWS Batch)')
    run.add_argument('--state', help='FileStore root, e.g. tools/jobs/.state (with --local)')
    run.add_argument('--attempt', type=int, default=None)
    run.add_argument('--grid-points', default=None, help='comma-separated, e.g. 96,88,80')
    args = parser.parse_args(argv)
    grid = tuple(int(v) for v in args.grid_points.split(',')) if args.grid_points else None
    if args.aws:
        from jobs.dynamo_store import DynamoStore
        from jobs.s3_sink import S3Sink
        store, sink, backend = DynamoStore(environ['JOBS_TABLE']), S3Sink(environ['DATA_BUCKET']), 'aws'
        attempt = args.attempt or aws_attempt(environ)
        digest = image_digest(environ)
    else:
        if not args.state:
            parser.error('--local needs --state')
        store, sink, backend = FileStore(args.state), LocalSink(args.local), 'local'
        attempt = args.attempt or 1
        # D18: a local run has no task metadata to ask; it stays labelled 'local'.
        digest = environ.get('JOBS_IMAGE_DIGEST', 'local')
    status = run_job(args.key, store, sink, attempt=attempt, backend=backend, grid_points=grid,
                     image_digest=digest, runner_job_id=environ.get('AWS_BATCH_JOB_ID') if args.aws else None)
    # In AWS the line lands in CloudWatch: structured, with the job key (spec §11).
    print(json.dumps({'key': args.key, 'attempt': attempt, 'status': status}) if args.aws else status)
    # D3: a superseded attempt is not a failure (Ruling T5-b); on AWS a
    # non-zero exit would end its Batch job FAILED and send a spurious alert.
    return 0 if status in ('DONE', 'duplicate', 'superseded') else 1


if __name__ == '__main__':
    sys.exit(main())
