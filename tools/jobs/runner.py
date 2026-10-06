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
        while True:
            key = self.queue.get()
            self.store.update_job(key, {'status': 'STARTING'}, expect_status={'QUEUED'})
            env = {**os.environ, 'PYTHONPATH': f'{TOOLS}:{TOOLS / "molecules"}'}
            result = subprocess.run(self._command(key), cwd=TOOLS, env=env, capture_output=True, text=True)
            rec = self.store.get_job(key)
            if rec['status'] not in ('DONE', 'FAILED'):
                last = (result.stderr.strip().splitlines() or [''])[-1][:300]
                self.store.update_job(key, {'status': 'FAILED', 'endedAt': iso(utc_now()), 'stage': None,
                                            'error': {'code': 'worker-crashed',
                                                      'message': f'worker exited with {result.returncode}: {last}'}})
            self.store.settle(key, 0)
