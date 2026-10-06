"""Starts a queued job somewhere. LocalRunner (Task 10) runs the worker as a
subprocess; BatchRunner (Phase 6B-3) submits to AWS Batch."""
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path
from typing import Protocol

from jobs.model import iso, utc_now

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
    reporting is marked FAILED here, and every local job settles at $0."""

    def __init__(self, store, out_root, state_root, python=sys.executable, worker_args=()):
        self.store, self.out_root, self.state_root = store, Path(out_root), Path(state_root)
        self.python, self.worker_args = python, tuple(worker_args)
        self.queue = queue.Queue()
        threading.Thread(target=self._loop, daemon=True).start()

    def submit(self, record):
        self.queue.put(record['key'])
        return f'local-{record["key"][:12]}'

    def _command(self, key):
        if self.worker_args:             # tests substitute a stand-in process
            return [self.python, *self.worker_args]
        attempt = self.store.get_job(key)['attempt']
        return [self.python, '-m', 'jobs.worker', 'run', key, '--local', str(self.out_root),
                '--state', str(self.state_root), '--attempt', str(attempt)]

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
        self.store.update_job(key, {'status': 'STARTING'}, expect_status={'QUEUED'})
        env = {**os.environ, 'PYTHONPATH': f'{TOOLS}:{TOOLS / "molecules"}'}
        result = subprocess.run(self._command(key), cwd=TOOLS, env=env, capture_output=True, text=True)
        rec = self.store.get_job(key)
        if rec is None:
            print(f'jobs: local runner: job {key[:12]} lost its record while running', file=sys.stderr)
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
