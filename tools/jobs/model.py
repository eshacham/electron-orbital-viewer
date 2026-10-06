from datetime import datetime, timezone

STATUSES = ('QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED')
ACTIVE = {'QUEUED', 'STARTING', 'RUNNING'}
# `charges` is the store's own ledger (fix round 1, Ruling T5-a): the meter is
# derived from it rather than kept in a side file, so it is bookkeeping, not
# anything a caller of the public API should see.
_HIDDEN = ('settled', 'runnerJobId', 'reservedMicros', 'actualMicros', 'charges')


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def month_of(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y-%m')


def usd(micros: int) -> float:
    return round(micros / 1_000_000, 6)


def new_record(*, key, job, decision, name, formula, electron_count, geometry_source, backend, now) -> dict:
    sizing = {k: v for k, v in decision.items() if k != 'reservationMicros'}
    return {'key': key, 'status': 'QUEUED', 'attempt': 1, 'recipe': job['recipe'], 'job': job, 'name': name,
            'formula': formula, 'electronCount': electron_count, 'basisFunctions': decision['basisFunctions'],
            'geometrySource': geometry_source, 'sizing': sizing, 'reservedMicros': decision['reservationMicros'],
            'actualMicros': 0, 'settled': False, 'charges': [], 'month': month_of(now), 'submittedAt': iso(now),
            'startedAt': None, 'endedAt': None, 'heartbeatAt': None, 'stage': None, 'latestEnergyHartree': None,
            'logTail': [], 'peakMemoryGB': None, 'actual': None, 'error': None, 'backend': backend,
            'runnerJobId': None}


def public_view(record: dict) -> dict:
    view = {k: v for k, v in record.items() if k not in _HIDDEN}
    view['reservedUsd'] = usd(record['reservedMicros'])
    view['actualUsd'] = usd(record['actualMicros']) if record['settled'] else None
    view['resultUrl'] = f'/molecules/jobs/{record["key"]}/'
    return view
