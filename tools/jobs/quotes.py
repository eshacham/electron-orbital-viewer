"""Binding price quotes (Phase 6C, owner decision 2026-10-08).

Every preview prices the job twice -- Fargate Spot and Fargate on-demand,
on the same size and with the same time limit -- and the owner approves
one. A quote's money is split into line items, each with an estimate and a
maximum:

- compute: estimate = one attempt of the predicted run plus a start-up
  minute (ESTIMATE_OVERHEAD_SECONDS), at Fargate's one-minute minimum;
  maximum = attempts x the time limit plus the billing allowance
  (sizing.decide's reservation, D6). The time limit is TIMEOUT_FACTOR x the
  prediction (never clamped since 6C), so the maximum is computed FROM the
  conservative timeout, and the timeout is what the maximum buys
  (timeout_from_maximum): the job can never run, and so never bill, past it.
- storage: the result files in S3 Standard for RETENTION_MONTHS, plus a
  PUT request per object. Policy (review minor 8): the data bucket has no
  lifecycle rule, so a result outlives its 12 paid months and the app pays
  for it from month 13 (about $0.0004 a year for a typical 1.5 MB job).
  Whether results are then deleted or re-charged is the owner's decision
  before end users are billed; until then they are kept, at the app's cost;
- delivery: DOWNLOADS full downloads of the result through CloudFront,
  plus an HTTPS request per object per download;
- platform: a placeholder for a fee the business model may add; $0 now.

Prices and their sources are in prices.py. The result's size is estimated
from N (result_bytes): the grids are a fixed 96^3 / 48^3 (build_library's
first GRID_POINTS_TRIES), so the density and ESP files do not grow with N;
basis.json (the MO coefficients) grows with N^2.

The quote id is a SHA-256 over every term the owner approves (the key, the
option, size, time limit, attempts, every line item, the sizing and prices
versions) and the minute the server issued it (`issuedAt`). It is not a
secret-keyed MAC: the server never trusts it, it recomputes the quote at
submit, for each minute of the last QUOTE_TTL_MINUTES, and refuses (409
quote-changed) unless the id matches one, so an id binds exactly the terms
the owner was shown, and only for an hour (fix round 1, review minor 1: a
replayed old approval no longer re-authorises a submit or a retry). Each
approval is kept on the job's ledger (store.charge: quote id, option,
approved maximum, cost, charge, line items). Before end users are billed,
the id must also become an HMAC under a server secret over the payer, the
terms and issuedAt, so a dispute can prove what was shown, to whom and
when; with one owner and no secret store, that is recorded as a
requirement, not built.

Settlement (settlement): each line is charged its actual cost, but never
more than its approved maximum; whatever AWS bills beyond that is absorbed
by the app, recorded (absorbedMicros) and reported by reconcile.
"""
import hashlib
import json
import math

from jobs import sizing
from jobs.errors import JobRefused
from jobs.prices import PRICES_VERSION, billed_seconds, cost_micros, delivery_micros, storage_micros

RETENTION_MONTHS = 12
# Ten full downloads of every result object: the owner's own views, a share link or two, a collaborator.
DOWNLOADS = 10
# Result size, fitted on the six DONE AWS jobs (aws s3 ls of molecules/jobs/, 2026-10-08; every object,
# attempts/ included): 1.14 to 1.92 MB. Less basis.json, they span 0.93 to 1.46 MB whatever N (the grids
# are fixed; water's density compresses worst); RESULT_FIXED_BYTES rounds the largest up. basis.json is
# 15.6 kB at N 58, 75 kB at 168, 173 kB at 276 and 796 kB at 614: 2.1 to 2.7 x N^2 above N 100.
RESULT_FIXED_BYTES = 1_500_000
BASIS_BYTES_PER_N2 = 2.3
RESULT_BYTES_HEADROOM = 2.0
# Objects per job: 13 for a single point (10 at the root, 3 under attempts/), 15-16 for an optimisation.
STORED_OBJECTS = 16
QUOTE_TTL_MINUTES = 60
ESTIMATE_OVERHEAD_SECONDS = 60      # image pull and stop: caffeine optimise billed 1057 s for 1022 s of run
ITEMS = ('compute', 'storage', 'delivery', 'platform')
LABELS = {'compute': 'Compute (AWS Fargate)', 'storage': f'Result storage (S3, {RETENTION_MONTHS} months)',
          'delivery': f'Delivery (CloudFront, {DOWNLOADS} full downloads)', 'platform': 'Platform fee'}
INTERRUPTION = {
    'single': 'A Spot interruption restarts the job from scratch; up to {n} attempts, each billed.',
    'optimise': 'A Spot interruption resumes the optimisation from its last completed step; up to {n} attempts, '
                'each billed.',
}
# The terms a quote id binds, in this order.
_BOUND = ('key', 'option', 'size', 'vcpu', 'memoryGB', 'capacity', 'attempts', 'timeoutSeconds', 'sizingVersion',
          'pricesVersion', 'resultBytes', 'resultBytesMax', 'retentionMonths', 'downloads', 'lines', 'issuedAt')


def result_bytes(n: int) -> int:
    return RESULT_FIXED_BYTES + round(BASIS_BYTES_PER_N2 * n * n)


def result_bytes_max(n: int) -> int:
    return math.ceil(RESULT_BYTES_HEADROOM * result_bytes(n))


def _storage(nbytes: int, objects: int) -> int:
    return storage_micros(nbytes, RETENTION_MONTHS, objects)


def _delivery(nbytes: int, objects: int) -> int:
    return delivery_micros(DOWNLOADS * nbytes, DOWNLOADS * objects)


def quote_id(option: dict) -> str:
    terms = {k: option[k] for k in _BOUND}
    terms['lines'] = [{'item': l['item'], 'estimateMicros': l['estimateMicros'], 'maximumMicros': l['maximumMicros']}
                      for l in option['lines']]
    return hashlib.sha256(json.dumps(terms, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def issued_minute(dt) -> str:
    """The minute a quote is issued in, as its id binds it (UTC)."""
    from datetime import timezone
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')


def _option(job: dict, key: str, capacity: str, local: bool, issued_at: str | None) -> dict:
    d = sizing.decide(job, local=local, capacity=None if local else capacity)
    n = d['basisFunctions']
    estimate_bytes, max_bytes = result_bytes(n), result_bytes_max(n)
    if local:
        costs = {item: (0, 0) for item in ITEMS}
    else:
        run = billed_seconds(d['predictedSeconds'] + ESTIMATE_OVERHEAD_SECONDS)
        costs = {'compute': (cost_micros(d['capacity'], d['vcpu'], d['memoryGB'], run), d['reservationMicros']),
                 'storage': (_storage(estimate_bytes, STORED_OBJECTS), _storage(max_bytes, STORED_OBJECTS)),
                 'delivery': (_delivery(estimate_bytes, STORED_OBJECTS), _delivery(max_bytes, STORED_OBJECTS)),
                 'platform': (0, 0)}
    lines = [{'item': item, 'estimateMicros': costs[item][0], 'maximumMicros': costs[item][1]} for item in ITEMS]
    option = {'key': key, 'option': d['capacity'], 'available': True, 'unavailableReason': None,
              'size': d['size'], 'vcpu': d['vcpu'], 'memoryGB': d['memoryGB'], 'capacity': d['capacity'],
              'attempts': d['attempts'], 'timeoutSeconds': d['timeoutSeconds'],
              'predictedSeconds': d['predictedSeconds'], 'sizingVersion': d['version'],
              'pricesVersion': PRICES_VERSION, 'resultBytes': estimate_bytes, 'resultBytesMax': max_bytes,
              'retentionMonths': RETENTION_MONTHS, 'downloads': DOWNLOADS, 'lines': lines, 'issuedAt': issued_at,
              'estimateMicros': sum(l['estimateMicros'] for l in lines),
              'maximumMicros': sum(l['maximumMicros'] for l in lines),
              'interruption': INTERRUPTION[job['recipe']].format(n=d['attempts']) if d['capacity'] == 'spot' else None,
              'sizing': {k: v for k, v in d.items() if k != 'reservationMicros'},
              'reservationMicros': d['reservationMicros']}
    option['quoteId'] = quote_id(option)
    return option


def _aws_options(job: dict, key: str, issued_at: str | None) -> list:
    options = []
    for capacity in ('spot', 'on-demand'):
        try:
            options.append(_option(job, key, capacity, local=False, issued_at=issued_at))
        except JobRefused as e:
            if e.code != 'option-unavailable':
                raise
            options.append({'key': key, 'option': capacity, 'available': False, 'unavailableReason': e.message,
                            'quoteId': None, 'capacity': capacity})
    return options


def quote(job: dict, key: str, backend: str, issued_at: str | None = None) -> dict:
    """The options a job can run under, as sizing.decide refuses or prices
    them. On AWS: Spot (unavailable, with its reason, past the Spot limit)
    and on-demand. On This Mac: one free 'local' option, with the AWS
    options alongside as `reference` ("on AWS this would cost ...")."""
    if backend == 'local':
        return {'options': [_option(job, key, 'local', local=True, issued_at=issued_at)], 'recommended': 'local',
                'reference': _aws_options(job, key, issued_at)}
    options = _aws_options(job, key, issued_at)
    return {'options': options, 'recommended': 'spot' if options[0]['available'] else 'on-demand', 'reference': None}


def find(q: dict, option: str) -> dict | None:
    return next((o for o in q['options'] if o['option'] == option), None)


def reissued(option: dict, given_id: str, now) -> dict | None:
    """The option as it was issued in one of the last QUOTE_TTL_MINUTES
    minutes under the id `given_id`, or None: the terms are recomputed now,
    only the issue minute is searched."""
    from datetime import timedelta
    for back in range(QUOTE_TTL_MINUTES + 1):
        candidate = {**option, 'issuedAt': issued_minute(now - timedelta(minutes=back))}
        if quote_id(candidate) == given_id:
            return {**candidate, 'quoteId': given_id}
    return None


def decision(option: dict) -> dict:
    """What a store reserves and a record keeps as its sizing: the approved
    option's sizing, reserving the option's whole maximum."""
    return {**option['sizing'], 'reservationMicros': option['maximumMicros']}


def timeout_from_maximum(option: dict) -> int:
    """The time limit an option's compute maximum buys: maximum / attempts at
    the size's per-second rate, less the billing allowance (D6)."""
    compute = next(l['maximumMicros'] for l in option['lines'] if l['item'] == 'compute')
    rate = cost_micros(option['capacity'], option['vcpu'], option['memoryGB'], 3600) / 3600
    if rate == 0:
        return option['timeoutSeconds']                  # This Mac: free, and no time limit of its own
    return math.floor(compute / option['attempts'] / rate + 1e-6) - sizing.BILLING_ALLOWANCE_SECONDS


def approved(option: dict, approved_at: str) -> dict:
    """The quote a record keeps once the owner approved it (micro-dollars)."""
    keep = ('option', 'quoteId', 'capacity', 'size', 'vcpu', 'memoryGB', 'attempts', 'timeoutSeconds',
            'sizingVersion', 'pricesVersion', 'resultBytes', 'resultBytesMax', 'retentionMonths', 'downloads',
            'estimateMicros', 'maximumMicros', 'issuedAt')
    return {**{k: option[k] for k in keep}, 'lines': [dict(l) for l in option['lines']], 'approvedAt': approved_at}


def settlement(record: dict, compute_micros: int) -> dict | None:
    """What a quoted job is charged when it settles: each line its actual
    cost, capped at its approved maximum. Storage and delivery are priced on
    the size the worker reported writing (`actual.resultBytes`); a DONE job
    from a worker that did not report it is priced on the quote's estimate.
    Only a DONE job is downloaded. None for a record from before quotes."""
    q = record.get('quote')
    if not q:
        return None
    actual = record.get('actual') or {}
    done = record['status'] == 'DONE'
    nbytes, objects = actual.get('resultBytes'), actual.get('resultObjects')
    if nbytes is None:
        nbytes, objects = (q['resultBytes'], STORED_OBJECTS) if done else (0, 0)
    objects = STORED_OBJECTS if objects is None else objects
    local = q['option'] == 'local'
    cost = {'compute': compute_micros,
            'storage': 0 if local or not nbytes else _storage(nbytes, objects),
            'delivery': _delivery(nbytes, objects) if done and not local and nbytes else 0,
            'platform': 0}
    maxima = {l['item']: l['maximumMicros'] for l in q['lines']}
    lines = [{'item': item, 'costMicros': cost[item], 'chargedMicros': min(cost[item], maxima.get(item, 0))}
             for item in ITEMS]
    total, charged = sum(cost.values()), sum(l['chargedMicros'] for l in lines)
    return {'lines': lines, 'costMicros': total, 'chargedMicros': charged, 'absorbedMicros': total - charged,
            'resultBytes': nbytes}


# -- the API's views, in USD -------------------------------------------------------------------------------

def _usd(micros: int) -> float:
    return round(micros / 1_000_000, 6)


def _mb(nbytes: int) -> str:
    return f'{nbytes / 1e6:.1f} MB'


def _note(item: str, o: dict) -> str:
    if o['option'] == 'local':
        return 'This Mac: nothing is billed.'
    if item == 'compute':
        run = f'{o["timeoutSeconds"]} s time limit + {sizing.BILLING_ALLOWANCE_SECONDS} s to start and stop'
        bound = f'{o["attempts"]} attempts × ({run})' if o['attempts'] > 1 else run
        capacity = 'Spot' if o['capacity'] == 'spot' else 'on-demand'
        return (f'Estimate: one run of the predicted {o["predictedSeconds"]:g} s plus a minute to start. '
                f'Maximum: {bound}, at {capacity} prices for {o["size"]} ({o["vcpu"]} vCPU, {o["memoryGB"]} GB).')
    if item == 'storage':
        return (f'About {_mb(o["resultBytes"])} of results (at most {_mb(o["resultBytesMax"])}) kept '
                f'{o["retentionMonths"]} months in S3 Standard at $0.023 per GB-month, plus $0.005 per 1,000 writes.')
    if item == 'delivery':
        return (f'{o["downloads"]} full downloads through CloudFront at $0.085 per GB, plus $0.01 per 10,000 '
                'requests.')
    return 'No platform fee yet.'


def public_option(o: dict) -> dict:
    if not o['available']:
        return {'option': o['option'], 'capacity': o['capacity'], 'available': False,
                'unavailableReason': o['unavailableReason'], 'quoteId': None}
    return {'option': o['option'], 'capacity': o['capacity'], 'available': True, 'unavailableReason': None,
            'quoteId': o['quoteId'], 'size': o['size'], 'vcpu': o['vcpu'], 'memoryGB': o['memoryGB'],
            'attempts': o['attempts'], 'timeoutSeconds': o['timeoutSeconds'], 'predictedSeconds': o['predictedSeconds'],
            'sizingVersion': o['sizingVersion'], 'pricesVersion': o['pricesVersion'],
            'resultBytes': o['resultBytes'], 'resultBytesMax': o['resultBytesMax'],
            'retentionMonths': o['retentionMonths'], 'downloads': o['downloads'], 'issuedAt': o['issuedAt'],
            'estimateUsd': _usd(o['estimateMicros']), 'maximumUsd': _usd(o['maximumMicros']),
            'lines': [{'item': l['item'], 'label': LABELS[l['item']], 'estimateUsd': _usd(l['estimateMicros']),
                       'maximumUsd': _usd(l['maximumMicros']), 'note': _note(l['item'], o)} for l in o['lines']],
            'interruption': o['interruption'], 'sizing': o['sizing']}


def public_quote(q: dict) -> dict:
    return {'options': [public_option(o) for o in q['options']], 'recommended': q['recommended'],
            'reference': None if q['reference'] is None else [public_option(o) for o in q['reference']]}


def public_approved(q: dict | None) -> dict | None:
    if not q:
        return None
    return {'option': q['option'], 'quoteId': q['quoteId'], 'attempts': q['attempts'],
            'timeoutSeconds': q['timeoutSeconds'], 'sizingVersion': q['sizingVersion'],
            'pricesVersion': q['pricesVersion'], 'approvedAt': q['approvedAt'], 'issuedAt': q.get('issuedAt'),
            'estimateUsd': _usd(q['estimateMicros']), 'maximumUsd': _usd(q['maximumMicros']),
            'lines': [{'item': l['item'], 'label': LABELS[l['item']], 'estimateUsd': _usd(l['estimateMicros']),
                       'maximumUsd': _usd(l['maximumMicros'])} for l in q['lines']]}


def public_settlement(s: dict | None) -> dict | None:
    if not s:
        return None
    return {'costUsd': _usd(s['costMicros']), 'chargedUsd': _usd(s['chargedMicros']),
            'absorbedUsd': _usd(s['absorbedMicros']), 'resultBytes': s['resultBytes'],
            'lines': [{'item': l['item'], 'label': LABELS[l['item']], 'costUsd': _usd(l['costMicros']),
                       'chargedUsd': _usd(l['chargedMicros'])} for l in s['lines']]}


def public_ledger(charges: list) -> list:
    """A job's ledger, one entry per settled attempt, in USD (fix round 1, review I2). Entries from before
    quotes (and from This Mac's free runs alike, when unquoted) carry their cost alone."""
    def usd(value):
        return None if value is None else _usd(value)
    return [{'quoteId': c.get('quoteId'), 'option': c.get('option'),
             'approvedMaximumUsd': usd(c.get('approvedMaximumMicros')), 'costUsd': _usd(c['micros']),
             'chargedUsd': usd(c.get('chargedMicros')), 'absorbedUsd': usd(c.get('absorbedMicros')),
             'lines': None if c.get('lines') is None else [
                 {'item': l['item'], 'label': LABELS[l['item']], 'costUsd': _usd(l['costMicros']),
                  'chargedUsd': _usd(l['chargedMicros'])} for l in c['lines']],
             'month': c['month'], 'at': c.get('at')} for c in charges]
