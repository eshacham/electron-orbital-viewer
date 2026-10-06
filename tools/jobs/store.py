"""Where job records and the meter live (spec §6).

Store is the contract both backends meet: FileStore here (local), DynamoDB
in Phase 6B-3. Its methods are the conditional operations the AWS version
makes in one DynamoDB transaction, so the local backend exercises the same
semantics: create-if-absent together with the reservation, settle exactly
once, claim only from a state that allows it.
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
    def update_job(self, key: str, changes: dict, expect_status: set | None = None) -> bool: ...
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
        self.root = Path(root)
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

    def _meter_path(self, month):
        return self.root / f'meter-{month}.json'

    def _meter(self, month):
        m = self._read(self._meter_path(month), {'spent': 0, 'reserved': 0, 'committed': 0})
        return {**m, 'cap': self.cap}

    def _reserve(self, month, micros):
        m = self._meter(month)
        if m['committed'] + micros > self.cap:
            raise BudgetExhausted(m)
        self._write(self._meter_path(month), {'spent': m['spent'], 'reserved': m['reserved'] + micros,
                                              'committed': m['committed'] + micros})

    def get_job(self, key):
        return self._read(self._job_path(key))

    def create_job(self, record):
        with self._locked():
            existing = self.get_job(record['key'])
            if existing is not None:
                return False, existing
            self._reserve(record['month'], record['reservedMicros'])
            self._write(self._job_path(record['key']), record)
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
            self._reserve(month, decision['reservationMicros'])
            rec.update({'status': 'QUEUED', 'attempt': rec['attempt'] + 1, 'error': None, 'settled': False,
                        'month': month,
                        'reservedMicros': decision['reservationMicros'],
                        'sizing': {k: v for k, v in decision.items() if k != 'reservationMicros'},
                        'submittedAt': iso(now), 'startedAt': None, 'endedAt': None, 'heartbeatAt': None,
                        'stage': None, 'logTail': [], 'actual': None, 'runnerJobId': None})
            self._write(self._job_path(key), rec)
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

    def update_job(self, key, changes, expect_status=None):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or (expect_status is not None and rec['status'] not in expect_status):
                return False
            rec.update(changes)
            self._write(self._job_path(key), rec)
            return True

    def settle(self, key, actual_micros):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or rec['settled']:
                return False
            m = self._meter(rec['month'])
            self._write(self._meter_path(rec['month']), {
                'spent': m['spent'] + actual_micros, 'reserved': m['reserved'] - rec['reservedMicros'],
                'committed': m['committed'] + actual_micros - rec['reservedMicros']})
            rec.update({'settled': True, 'actualMicros': rec['actualMicros'] + actual_micros})
            self._write(self._job_path(key), rec)
            return True

    def list_jobs(self, month, status=None):
        records = [json.loads(p.read_text()) for p in (self.root / 'jobs').glob('*.json')]
        chosen = [r for r in records if r['month'] == month and (status is None or r['status'] == status)]
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
