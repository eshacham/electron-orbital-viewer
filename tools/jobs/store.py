"""Where job records and the meter live (spec §6).

Store is the contract both backends meet: FileStore here (local), DynamoDB
in Phase 6B-3. Its methods are the conditional operations the AWS version
makes in one DynamoDB transaction, so the local backend exercises the same
semantics: create-if-absent together with the reservation, settle exactly
once, claim only from a state that allows it.

Fix round 1 (Ruling T5-a): the meter used to be a second file, written
alongside the job record, so a crash between the two writes could double-
reserve on retry or drive the meter negative (the review reproduced both).
There is now no meter file at all: each record already carries its own
unsettled reservation (`reservedMicros`/`settled`/`month`) and a ledger of
its settled charges (`charges`), and `meter()` sums these over every record
under the lock. Every money-moving method (`create_job`, `requeue_failed`,
`settle`) becomes exactly one atomic record write, so there is no window in
which a crash can land half of an operation: either the write lands (via
`os.replace`) and the meter reflects it, or it does not and the meter is as
if the call never happened. DynamoStore (6B-3) keeps its own transactional
meter item, already atomic by a different mechanism, and runs this same
test file as its contract.
"""
import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

from jobs.errors import JobRefused
from jobs.model import iso, month_of
from jobs.prices import CAP_MICROS


class BudgetExhausted(JobRefused):
    def __init__(self, meter: dict):
        super().__init__('budget', f'Monthly budget reached: ${meter["spent"] / 1e6:.2f} spent, '
                                   f'${meter["reserved"] / 1e6:.2f} reserved of ${meter["cap"] / 1e6:.2f}')


class Store(Protocol):
    def get_job(self, key: str) -> dict | None: ...
    def create_job(self, record: dict) -> tuple[bool, dict]: ...
    def requeue_failed(self, key: str, decision: dict, now) -> dict: ...
    def claim(self, key: str, attempt: int, now) -> bool: ...
    def update_job(self, key: str, changes: dict, expect_status: set | None = None,
                    attempt: int | None = None) -> bool: ...
    def settle(self, key: str, actual_micros: int) -> bool: ...
    def list_jobs(self, month: str, status: str | None = None) -> list[dict]: ...
    def meter(self, month: str) -> dict: ...
    def get_resolution(self, query: str) -> dict | None: ...
    def put_resolution(self, query: str, value: dict) -> None: ...
    def generation_enabled(self) -> bool: ...
    def set_generation_enabled(self, enabled: bool) -> None: ...
    def get_billing(self, month: str) -> dict | None: ...
    def put_billing(self, month: str, value: dict) -> None: ...


class FileStore:
    """JSON files under one directory, every read-modify-write under one
    flock: the local server's threads and the worker subprocess (or a
    container with the directory mounted) all write here."""

    def __init__(self, root, cap_micros: int = CAP_MICROS):
        # Resolved now: the worker chdirs into its scratch folder while the
        # heartbeat thread keeps writing here, so a relative root must keep
        # meaning the directory it was given in.
        self.root = Path(root).resolve()
        self.cap = cap_micros
        for sub in ('jobs', 'resolve'):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _locked(self):
        with open(self.root / '.lock', 'a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def _read(self, path: Path, default=None):
        return json.loads(path.read_text()) if path.exists() else default

    def _write(self, path: Path, value) -> None:
        tmp = path.with_suffix(path.suffix + '.tmp')
        tmp.write_text(json.dumps(value, indent=1, ensure_ascii=False))
        os.replace(tmp, path)          # atomic: a reader never sees half a record

    def _job_path(self, key):
        return self.root / 'jobs' / f'{key}.json'

    def _all_records(self):
        return [json.loads(p.read_text()) for p in (self.root / 'jobs').glob('*.json')]

    def _meter(self, month):
        # Derived, not stored: spent is every settled charge billed to this
        # month (a job may carry charges from more than one month, across
        # retries); reserved is every unsettled record currently sitting in
        # it. Nothing here is written, so a reader never needs the lock to
        # get a consistent snapshot beyond what a single `glob` gives it.
        records = self._all_records()
        spent = sum(charge['micros'] for r in records for charge in r.get('charges', ())
                    if charge['month'] == month)
        reserved = sum(r['reservedMicros'] for r in records if not r['settled'] and r['month'] == month)
        return {'spent': spent, 'reserved': reserved, 'committed': spent + reserved, 'cap': self.cap}

    def get_job(self, key):
        return self._read(self._job_path(key))

    def create_job(self, record):
        with self._locked():
            existing = self.get_job(record['key'])
            if existing is not None:
                return False, existing
            m = self._meter(record['month'])
            if m['committed'] + record['reservedMicros'] > self.cap:
                raise BudgetExhausted(m)
            self._write(self._job_path(record['key']), record)      # the one write: job and reservation together
            return True, record

    def requeue_failed(self, key, decision, now):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or rec['status'] != 'FAILED':
                raise JobRefused('invalid-request', 'only a failed job can be retried', 409)
            if not rec['settled']:
                raise JobRefused('invalid-request', 'the failed attempt is still being settled; retry in a minute', 409)
            # A retry is a new submission: it is charged to the month it is made in (spec §6.4).
            month = month_of(now)
            m = self._meter(month)
            if m['committed'] + decision['reservationMicros'] > self.cap:
                raise BudgetExhausted(m)
            rec.update({'status': 'QUEUED', 'attempt': rec['attempt'] + 1, 'error': None, 'settled': False,
                        'month': month,
                        'reservedMicros': decision['reservationMicros'],
                        'sizing': {k: v for k, v in decision.items() if k != 'reservationMicros'},
                        'submittedAt': iso(now), 'startedAt': None, 'endedAt': None, 'heartbeatAt': None,
                        'stage': None, 'latestEnergyHartree': None, 'logTail': [], 'actual': None,
                        'runnerJobId': None})
            self._write(self._job_path(key), rec)                   # the one write: job and reservation together
            return rec

    def claim(self, key, attempt, now):
        with self._locked():
            rec = self.get_job(key)
            allowed = rec is not None and (rec['status'] in ('QUEUED', 'STARTING') or
                                           (rec['status'] == 'RUNNING' and rec['attempt'] < attempt))
            if not allowed:
                return False
            rec.update({'status': 'RUNNING', 'attempt': max(attempt, rec['attempt']), 'startedAt': iso(now),
                        'heartbeatAt': iso(now)})
            self._write(self._job_path(key), rec)
            return True

    def update_job(self, key, changes, expect_status=None, attempt=None):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or (expect_status is not None and rec['status'] not in expect_status):
                return False
            # The worker passes its own attempt on every heartbeat and on its
            # final status write (Task 9), so a superseded attempt — one a
            # Spot reclaim or a Batch retry has already moved past — can
            # never clobber the current one.
            if attempt is not None and rec['attempt'] != attempt:
                return False
            rec.update(changes)
            self._write(self._job_path(key), rec)
            return True

    def settle(self, key, actual_micros):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or rec['settled']:
                return False
            # Settling is appending one charge and flipping `settled`, in the
            # same write as the reservation it closes out: the meter can
            # never see the charge without the reservation going away, or
            # the other way round.
            rec.update({'settled': True, 'actualMicros': rec['actualMicros'] + actual_micros,
                        'charges': rec.get('charges', []) + [{'month': rec['month'], 'micros': actual_micros}]})
            self._write(self._job_path(key), rec)
            return True

    def list_jobs(self, month, status=None):
        chosen = [r for r in self._all_records() if r['month'] == month and (status is None or r['status'] == status)]
        return sorted(chosen, key=lambda r: (r['submittedAt'], r['key']))

    def meter(self, month):
        return self._meter(month)

    def _resolve_path(self, query):
        return self.root / 'resolve' / f'{hashlib.sha256(query.encode()).hexdigest()}.json'

    def get_resolution(self, query):
        return self._read(self._resolve_path(query))

    def put_resolution(self, query, value):
        self._write(self._resolve_path(query), value)

    def generation_enabled(self):
        return self._read(self.root / 'config.json', {'generationEnabled': True})['generationEnabled']

    def set_generation_enabled(self, enabled):
        self._write(self.root / 'config.json', {'generationEnabled': bool(enabled)})

    def get_billing(self, month):
        return self._read(self.root / f'billing-{month}.json')

    def put_billing(self, month, value):
        self._write(self.root / f'billing-{month}.json', value)
