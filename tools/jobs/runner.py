"""Starts a queued job somewhere. LocalRunner (Task 10) runs the worker as a
subprocess; BatchRunner (Phase 6B-3) submits to AWS Batch."""
import os
import queue
import subprocess
import sys
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Protocol

from jobs.model import iso, utc_now

# Three missed 30 s heartbeats: a RUNNING record quieter than this has no
# live worker behind it (a cli --wait in another process beats every 30 s).
STALE_HEARTBEAT = timedelta(seconds=90)
STOPPED = 'the local server stopped before this job finished'

TOOLS = Path(__file__).resolve().parents[1]


class Runner(Protocol):
    def submit(self, record: dict) -> str: ...


class NullRunner:
    """Accepts jobs and runs nothing: tests, and `cli enqueue` for the container smoke test."""

    def __init__(self):
        self.submitted = []

    def submit(self, record):
        self.submitted.append(record['key'])
        return 'null'


class LocalRunner:
    """One job at a time on this Mac: a second PySCF run beside the first
    would only make both slower and spoil the timings sizing learns from.
    Plays the part reconcile plays in AWS: a worker that dies without
    reporting is marked FAILED here, and every local job settles at $0.

    `grid_points` is forwarded to the worker as --grid-points (a quick, coarse
    run for tests); `worker_args` replaces the worker command altogether."""

    def __init__(self, store, out_root, state_root, python=sys.executable, worker_args=(), grid_points=None,
                 now=utc_now):
        self.store, self.out_root, self.state_root = store, Path(out_root), Path(state_root)
        self.python, self.worker_args, self.grid_points, self.now = python, tuple(worker_args), grid_points, now
        self.queue = queue.Queue()
        self._recover()
        threading.Thread(target=self._loop, daemon=True).start()

    def _recover(self):
        """What the last local server left behind (I1, spec §6.6's "never
        stuck"): its queue was in memory, and its worker may have died with
        it. Run once, before the loop starts, over every local record in
        every month. A RUNNING record with a recent heartbeat is left alone:
        cli --wait, in another process, may be running it."""
        now = self.now()
        for rec in sorted(self.store.jobs_with_backend('local'), key=lambda r: (r['submittedAt'], r['key'])):
            key, status = rec['key'], rec['status']
            try:
                if status == 'QUEUED':
                    self.queue.put(key)
                elif status == 'STARTING' or (status == 'RUNNING' and self._stale(rec, now)):
                    if self.store.update_job(key, {'status': 'FAILED', 'endedAt': iso(now), 'stage': None,
                                                   'error': {'code': 'worker-crashed', 'message': STOPPED}},
                                             expect_status={status}, attempt=rec['attempt']):
                        self.store.settle(key, 0)
                elif status in ('DONE', 'FAILED') and not rec['settled']:
                    self.store.settle(key, 0)
            except Exception as e:      # one bad record must not stop the server starting
                print(f'jobs: local runner: could not recover job {key[:12]} ({type(e).__name__}: {e})',
                      file=sys.stderr)

    @staticmethod
    def _stale(rec, now):
        beat = rec.get('heartbeatAt') or rec.get('startedAt')
        if not beat:
            return True
        return now - datetime.strptime(beat, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=now.tzinfo) > STALE_HEARTBEAT

    def submit(self, record):
        self.queue.put(record['key'])
        return f'local-{record["key"][:12]}'

    def _command(self, key):
        if self.worker_args:             # tests substitute a stand-in process
            return [self.python, *self.worker_args]
        attempt = self.store.get_job(key)['attempt']
        grid = ['--grid-points', ','.join(str(g) for g in self.grid_points)] if self.grid_points else []
        return [self.python, '-m', 'jobs.worker', 'run', key, '--local', str(self.out_root),
                '--state', str(self.state_root), '--attempt', str(attempt), *grid]

    def _loop(self):
        # Fix round 1: this thread is the only thing that ever runs a local
        # job, so nothing may end it. Anything one job throws (a bad
        # interpreter, a failed store write, a record gone missing) fails
        # that job and settles it; the loop goes on to the next.
        while True:
            key = self.queue.get()
            try:
                self._run_one(key)
            except Exception as e:
                self._runner_failed(key, e)

    def _run_one(self, key):
        if self.store.get_job(key) is None:
            print(f'jobs: local runner: job {key[:12]} has no record; skipped', file=sys.stderr)
            return
        if not self.store.update_job(key, {'status': 'STARTING'}, expect_status={'QUEUED'}):
            # I4: not QUEUED any more, so not ours — cli --wait has it RUNNING,
            # or a second submit of the same key already ran. Running a worker
            # anyway would see the other run's RUNNING record as a crash and
            # fail it under that run; the job's owner settles it, not us.
            return
        env = {**os.environ, 'PYTHONPATH': f'{TOOLS}:{TOOLS / "molecules"}'}
        result = subprocess.run(self._command(key), cwd=TOOLS, env=env, capture_output=True, text=True)
        rec = self.store.get_job(key)
        if rec is None:
            print(f'jobs: local runner: job {key[:12]} lost its record while running', file=sys.stderr)
            return
        if (result.stdout.strip().splitlines() or [''])[-1] == 'duplicate':
            # Its claim failed: between our STARTING and that claim another
            # run (cli --wait) claimed the job, and owns its outcome (I4).
            return
        if rec['status'] not in ('DONE', 'FAILED'):
            last = (result.stderr.strip().splitlines() or [''])[-1][:300]
            self._fail(key, 'worker-crashed', f'worker exited with {result.returncode}: {last}')
        self.store.settle(key, 0)

    def _fail(self, key, code, message):
        # Guarded: a record the worker already finished is never overwritten.
        self.store.update_job(key, {'status': 'FAILED', 'endedAt': iso(utc_now()), 'stage': None,
                                    'error': {'code': code, 'message': message}},
                              expect_status={'QUEUED', 'STARTING', 'RUNNING'})

    def _runner_failed(self, key, e):
        what = f'{type(e).__name__}: {e}'[:300]
        print(f'jobs: local runner: job {key[:12]} failed in the runner ({what}); continuing', file=sys.stderr)
        try:
            self._fail(key, 'worker-crashed', f'local runner error: {what}')
            self.store.settle(key, 0)
        except Exception as e2:      # the store itself is failing: say so, and keep the loop alive
            print(f'jobs: local runner: could not record that failure ({type(e2).__name__}: {e2})',
                  file=sys.stderr)
