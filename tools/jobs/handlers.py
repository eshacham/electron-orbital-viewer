"""The job API's routes (spec §4), independent of any web framework.

The local server and the api Lambda both call Api.handle, so local and AWS
answer identically by construction.
"""
import calendar
import json
import re
import sys
import traceback

from jobs import pubchem, sizing
from jobs.basis_counts import basis_functions
from jobs.canonical import (RECIPES, canonical_job, check_atoms, electron_count, formula, job_key,
                             multiplicity_for, parse_xyz)
from jobs.errors import JobRefused
from jobs.model import ACTIVE, STATUSES, iso, month_of, new_record, public_view, usd, utc_now
from jobs.prices import RETRIEVED
from jobs.store import BudgetExhausted

KEY = re.compile(r'^[0-9a-f]{64}$')
JOB_PATH = re.compile(r'^/api/v1/jobs/([^/]+)$')
MONTH = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
MAX_NAME = 200
_FIELDS = {'recipe', 'molecule', 'charge', 'multiplicity', 'retry'}


def _bad(message):
    return JobRefused('invalid-request', message, 400)


class Api:
    def __init__(self, store, runner, resolve=pubchem.resolve, now=utc_now, backend='local'):
        self.store, self.runner, self.resolve, self.now, self.backend = store, runner, resolve, now, backend

    # -- routing -----------------------------------------------------------
    def handle(self, method, path, query, body):
        try:
            if method == 'POST' and path == '/api/v1/jobs/preview':
                return 200, self.preview(self._json(body))
            if method == 'POST' and path == '/api/v1/jobs':
                return self.submit(self._json(body))
            if method == 'GET' and path == '/api/v1/jobs':
                return 200, self.list(query)
            job_path = JOB_PATH.match(path)
            if method == 'GET' and job_path:
                return 200, self.get(job_path.group(1))
            if method == 'GET' and path == '/api/v1/costs':
                return 200, self.costs(query)
            raise JobRefused('not-found', f'no route {method} {path}', 404)
        except JobRefused as e:
            return e.status, {'error': {'code': e.code, 'message': e.message}}
        except Exception as e:
            # Last resort (I2): a bug must still answer in the API's own error
            # shape. Raised out of here, the local server drops the connection
            # and the UI sees a network error with no reason; the traceback
            # goes to stderr, where the owner looks for the cause.
            traceback.print_exc(file=sys.stderr)
            lines = str(e).strip().splitlines()
            message = f'{type(e).__name__}: {lines[-1]}' if lines else type(e).__name__
            return 500, {'error': {'code': 'internal-error', 'message': message[:300]}}

    @staticmethod
    def _json(body):
        try:
            value = json.loads(body or b'')
        except (ValueError, UnicodeDecodeError):
            raise _bad('the request body is not JSON')
        if not isinstance(value, dict):
            raise _bad('the request body must be a JSON object')
        return value

    # -- request → canonical job ---------------------------------------------
    def _request(self, body):
        unknown = set(body) - _FIELDS
        if unknown:
            raise _bad(f'unknown field(s): {", ".join(sorted(unknown))}')
        recipe = body.get('recipe')
        if not (isinstance(recipe, str) and recipe in RECIPES):
            # Checked before any geometry parsing or PubChem lookup: a bad
            # recipe is a client mistake worth 400, not a reason to spend a
            # network round trip resolving a molecule that will be refused anyway.
            raise _bad(f'recipe must be one of {", ".join(RECIPES)}')
        molecule = body.get('molecule')
        if not isinstance(molecule, dict) or len(molecule) != 1 or next(iter(molecule)) not in ('name', 'smiles', 'xyz'):
            raise _bad('molecule must be exactly one of {"name"}, {"smiles"} or {"xyz"}')
        kind, text = next(iter(molecule.items()))
        if not isinstance(text, str) or not text.strip():
            raise _bad(f'molecule.{kind} must be a non-empty string')
        if kind != 'xyz' and len(text) > MAX_NAME:
            raise _bad(f'molecule.{kind} is over {MAX_NAME} characters')
        for field in ('charge', 'multiplicity'):
            if body.get(field) is not None and (not isinstance(body[field], int) or isinstance(body[field], bool)):
                raise _bad(f'{field} must be an integer')
        if not isinstance(body.get('retry', False), bool):
            raise _bad('retry must be true or false')
        return recipe, kind, text, body.get('charge'), body.get('multiplicity'), body.get('retry', False)

    def _geometry(self, kind, text):
        if kind == 'xyz':
            atoms = parse_xyz(text)
            return atoms, 0, {'kind': 'xyz'}, None
        query = pubchem.normalise_query(kind, text)
        found = self.store.get_resolution(query)
        if found is None:
            found = self.resolve(kind, text)
            self.store.put_resolution(query, found)
        source = {'kind': 'pubchem', 'cid': found['cid'], 'title': found['title'], 'query': text.strip(),
                  'retrievedAt': found['retrievedAt']}
        return found['atoms'], found['charge'], source, found['title']

    def _prepare(self, body):
        recipe, kind, text, charge, multiplicity, retry = self._request(body)
        atoms, default_charge, source, title = self._geometry(kind, text)
        check_atoms(atoms)
        charge = default_charge if charge is None else charge
        electrons = electron_count(atoms, charge)
        # An occupation the property basis cannot hold at all (each basis
        # function seats at most two electrons) — most often a charge typo
        # with a stray digit or two, not a real molecule.
        n_property = basis_functions(atoms, RECIPES[recipe]['basis'])
        if electrons > 2 * n_property:
            raise JobRefused('bad-multiplicity',
                              f'{electrons} electrons cannot occupy {n_property} basis functions '
                              f'({RECIPES[recipe]["basis"]}, at most {2 * n_property})')
        multiplicity = multiplicity_for(electrons, multiplicity)
        job = canonical_job(recipe, atoms, charge, multiplicity)
        f = formula(atoms)
        return {'job': job, 'key': job_key(job), 'formula': f, 'name': title or f, 'electrons': electrons,
                'source': source, 'retry': retry}

    def _decide(self, job):
        return sizing.decide(job, local=self.backend == 'local')

    def _meter(self, month):
        m = self.store.meter(month)
        return {'month': month, 'capUsd': usd(m['cap']), 'spentUsd': usd(m['spent']),
                'reservedUsd': usd(m['reserved']), 'remainingUsd': usd(max(m['cap'] - m['committed'], 0))}

    # -- routes ------------------------------------------------------------
    def preview(self, body):
        p = self._prepare(body)
        month = month_of(self.now())
        existing = self.store.get_job(p['key'])
        try:
            d = self._decide(p['job'])
            # A known job that is already active or finished costs nothing
            # new to submit (dedupe, not a fresh reservation), so a tight
            # budget must not make its preview look refused.
            if existing is None or existing['status'] == 'FAILED':
                meter = self.store.meter(month)
                if meter['committed'] + d['reservationMicros'] > meter['cap']:
                    raise BudgetExhausted(meter)
            decision = {'ok': True, 'sizing': {k: v for k, v in d.items() if k != 'reservationMicros'},
                        'reservedUsd': usd(d['reservationMicros'])}
        except JobRefused as e:
            decision = {'ok': False, 'error': {'code': e.code, 'message': e.message}}
        mol = p['job']['molecule']
        return {'key': p['key'], 'job': p['job'], 'name': p['name'], 'formula': p['formula'],
                'electronCount': p['electrons'],
                'basisFunctions': basis_functions(mol['atoms'], p['job']['method']['basis']),
                'atoms': mol['atoms'], 'charge': mol['charge'], 'multiplicity': mol['multiplicity'],
                'geometrySource': p['source'], 'decision': decision,
                'existing': public_view(existing) if existing else None,
                'meter': self._meter(month), 'generationEnabled': self.store.generation_enabled()}

    def submit(self, body):
        p = self._prepare(body)
        existing = self.store.get_job(p['key'])
        if existing is not None and not (existing['status'] == 'FAILED' and p['retry']):
            return 200, public_view(existing)
        if not self.store.generation_enabled():
            raise JobRefused('paused', 'Generation is paused by the owner (infra/jobs.sh resume)', 503)
        decision = self._decide(p['job'])
        if existing is not None:
            try:
                record, status = self.store.requeue_failed(p['key'], decision, self.now()), 200
            except JobRefused:
                # Another caller's retry (or the worker settling the old
                # attempt) may have already moved the job on by the time
                # ours lands; the store's 409 is real only if the job is
                # still the FAILED one we looked at above — otherwise we
                # simply lost a race with an equivalent retry and should
                # hand back whatever it left behind.
                current = self.store.get_job(p['key'])
                if current is not None and current['status'] != 'FAILED':
                    return 200, public_view(current)
                raise
        else:
            created, record = self.store.create_job(new_record(
                key=p['key'], job=p['job'], decision=decision, name=p['name'], formula=p['formula'],
                electron_count=p['electrons'], geometry_source=p['source'], backend=self.backend, now=self.now()))
            if not created:
                return 200, public_view(record)     # lost a race with an identical submission
            status = 201
        try:
            self.store.update_job(p['key'], {'runnerJobId': self.runner.submit(record)})
        except Exception as e:                       # the runner's own error, shown to the owner verbatim
            # Guarded: only mark FAILED (and release the reservation) if the
            # job is still the one we just queued, under this same attempt —
            # never clobber a worker that has since claimed or finished it.
            failed = self.store.update_job(
                p['key'], {'status': 'FAILED', 'endedAt': iso(self.now()),
                           'error': {'code': 'submit-failed', 'message': str(e)}},
                expect_status={'QUEUED', 'STARTING'}, attempt=record['attempt'])
            if failed:
                self.store.settle(p['key'], 0)
        return status, public_view(self.store.get_job(p['key']))

    def get(self, key):
        record = self.store.get_job(key) if KEY.match(key) else None
        if record is None:
            raise JobRefused('not-found', f'no job {key}', 404)
        return public_view(record)

    def _month(self, query):
        month = query.get('month') or month_of(self.now())
        if not MONTH.match(month):
            raise _bad('month must be YYYY-MM')
        return month

    def list(self, query):
        month, status = self._month(query), query.get('status')
        if status is not None and status not in STATUSES:
            raise _bad(f'status must be one of {", ".join(STATUSES)}')
        return {'month': month, 'jobs': [public_view(r) for r in self.store.list_jobs(month, status)]}

    def costs(self, query):
        month = self._month(query)
        records = self.store.list_jobs(month)
        meter = self.store.meter(month)
        daily = {}
        for r in records:
            if r['settled'] and r['actualMicros'] and r['endedAt']:
                day = r['endedAt'][:10]
                daily[day] = daily.get(day, 0) + r['actualMicros']
        now = self.now()
        year, mon = map(int, month.split('-'))
        days = calendar.monthrange(year, mon)[1]
        elapsed = days if month < month_of(now) else max(now.day, 1)
        queued = sum(r['sizing']['predictedCostMicros'] for r in records if r['status'] in ACTIVE)
        return {**self._meter(month), 'projectionUsd': usd(round(meter['spent'] * days / elapsed) + queued),
                'daily': [{'date': d, 'usd': usd(v)} for d, v in sorted(daily.items())],
                'billing': self.store.get_billing(month), 'pricesRetrieved': RETRIEVED}
