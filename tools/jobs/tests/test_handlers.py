import json
from datetime import datetime, timezone

import pytest

from jobs.handlers import Api
from jobs.runner import NullRunner
from jobs.store import FileStore
from jobs.tests.stores import make_store

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'
WATER_KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'


def fake_resolve(kind, text, *a, **k):
    if text.strip().lower() == 'water':
        return {'cid': 962, 'title': 'Water', 'charge': 0, 'retrievedAt': '2026-10-10',
                'atoms': [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]}
    from jobs.errors import JobRefused
    raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')


@pytest.fixture(params=['file', 'dynamo'])
def api(request, tmp_path):
    with make_store(request.param, tmp_path, cap_micros=8_800_000) as store:
        yield Api(store, NullRunner(), resolve=fake_resolve, now=lambda: NOW, backend='aws')


def call(api, method, path, body=None, query=None):
    raw = json.dumps(body).encode() if body is not None else None
    return api.handle(method, path, query or {}, raw)


def test_preview_by_xyz_writes_nothing(api):
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['key'] == WATER_KEY
    assert body['formula'] == 'H2O' and body['electronCount'] == 10 and body['basisFunctions'] == 58
    assert body['decision']['ok'] and body['decision']['sizing']['size'] == 'S'
    assert body['existing'] is None and body['geometrySource'] == {'kind': 'xyz'}
    assert body['meter'] == {'month': '2026-10', 'capUsd': 8.8, 'spentUsd': 0.0, 'reservedUsd': 0.0, 'remainingUsd': 8.8}
    assert api.store.get_job(WATER_KEY) is None


def test_submit_by_name_then_dedupe(api):
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'name': 'water'}})
    assert status == 201 and view['key'] == WATER_KEY and view['status'] == 'QUEUED'
    assert view['geometrySource'] == {'kind': 'pubchem', 'cid': 962, 'title': 'Water', 'query': 'water',
                                      'retrievedAt': '2026-10-10'}
    assert api.runner.submitted == [WATER_KEY] and api.store.get_job(WATER_KEY)['runnerJobId'] == 'null'
    status, again = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and again['key'] == WATER_KEY and api.runner.submitted == [WATER_KEY]


def test_cached_name_needs_no_pubchem(api):
    call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': 'Water'}})

    def down(*a, **k):
        from jobs.errors import JobRefused
        raise JobRefused('pubchem-unavailable', 'down', 503)
    api.resolve = down
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': ' water '}})
    assert status == 200 and body['key'] == WATER_KEY


def test_failed_job_is_retried_only_on_request(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'scf-not-converged', 'message': 'm'}})
    api.store.settle(WATER_KEY, 10)
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and view['status'] == 'FAILED' and len(api.runner.submitted) == 1
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 200 and view['status'] == 'QUEUED' and view['attempt'] == 2 and len(api.runner.submitted) == 2


def test_runner_failure_marks_the_job_failed_and_releases_the_money(api):
    def broken(record):
        raise RuntimeError('Batch said no')
    api.runner.submit = broken
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 201 and view['status'] == 'FAILED' and view['error']['code'] == 'submit-failed'
    assert api.store.meter('2026-10')['reserved'] == 0


def test_paused_refuses_new_jobs_but_not_known_ones(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.set_generation_enabled(False)
    assert call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})[0] == 200
    status, body = call(api, 'POST', '/api/v1/jobs', {'recipe': 'optimise', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 503 and body['error']['code'] == 'paused'


def test_budget_refusal(api):
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 422 and body['error']['code'] == 'budget'
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision'] == {'ok': False, 'error': {'code': 'budget', 'message': body['decision']['error']['message']}}


@pytest.mark.parametrize('body,code,status', [
    ({'recipe': 'single'}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'name': 'water', 'xyz': WATER_XYZ}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'name': 'x' * 201}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'colour': 'red'}, 'invalid-request', 400),
    ({'recipe': 'scan', 'molecule': {'xyz': WATER_XYZ}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'charge': 'one'}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'multiplicity': 2}, 'bad-multiplicity', 422),
    ({'recipe': 'single', 'molecule': {'name': 'unobtainium'}}, 'unknown-compound', 422),
    ({'recipe': 'single', 'molecule': {'xyz': 'Rb 0 0 0'}}, 'element-out-of-range', 422),
    ({'recipe': ['single'], 'molecule': {'xyz': WATER_XYZ}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': 'water'}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'charge': True}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'charge': -100000}, 'bad-multiplicity', 422),
])
def test_refusals(api, body, code, status):
    got_status, got = call(api, 'POST', '/api/v1/jobs', body)
    assert (got_status, got['error']['code']) == (status, code)


def test_malformed_json_and_routes(api):
    assert api.handle('POST', '/api/v1/jobs', {}, b'{not json')[1]['error']['code'] == 'invalid-request'
    assert api.handle('POST', '/api/v1/jobs', {}, b'[1, 2, 3]')[1]['error']['code'] == 'invalid-request'
    assert api.handle('GET', '/api/v1/jobs/' + 'f' * 64, {}, None)[0] == 404
    assert api.handle('GET', '/api/v1/jobs/not-a-key', {}, None)[0] == 404
    assert api.handle('DELETE', '/api/v1/jobs', {}, None)[0] == 404
    assert api.handle('GET', '/api/v1/jobs', {'month': '2026-13x'}, None)[0] == 400


def test_job_route_requires_an_exact_path(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert api.handle('GET', f'/api/v1/jobs/x/{WATER_KEY}', {}, None)[0] == 404
    assert api.handle('GET', f'/api/v1/jobs/{WATER_KEY}/x', {}, None)[0] == 404


def test_bad_recipe_with_a_name_never_calls_pubchem(api):
    def must_not_be_called(*a, **k):
        raise AssertionError('resolve should not have been called for a recipe this invalid')
    api.resolve = must_not_be_called
    status, body = call(api, 'POST', '/api/v1/jobs', {'recipe': 'scan', 'molecule': {'name': 'water'}})
    assert status == 400 and body['error']['code'] == 'invalid-request'


def test_runner_failure_write_is_guarded_against_a_race(api):
    def broken(record):
        # Simulates something else (a worker claiming a retried attempt,
        # say) moving the job on before the runner's own failure write
        # would otherwise land.
        api.store.update_job(record['key'], {'status': 'RUNNING', 'attempt': 2})
        raise RuntimeError('Batch said no')
    api.runner.submit = broken
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 201
    record = api.store.get_job(WATER_KEY)
    assert record['status'] == 'RUNNING' and record['attempt'] == 2
    assert api.store.meter('2026-10')['reserved'] == record['reservedMicros']


def test_preview_skips_budget_refusal_for_an_existing_active_job(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision']['ok'] is True and body['existing']['status'] == 'QUEUED'


def test_preview_skips_budget_refusal_for_an_existing_done_job(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-09T08:00:00Z'})
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision']['ok'] is True and body['existing']['status'] == 'DONE'


def test_retry_that_loses_the_race_to_another_retry_returns_200(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'm'}})
    api.store.settle(WATER_KEY, 10)
    real_requeue = api.store.requeue_failed

    def requeue_then_report_losing_the_race(key, decision, now):
        real_requeue(key, decision, now)      # our own write lands...
        from jobs.errors import JobRefused
        raise JobRefused('invalid-request', 'only a failed job can be retried', 409)   # ...but we're told we lost

    api.store.requeue_failed = requeue_then_report_losing_the_race
    status, view = call(api, 'POST', '/api/v1/jobs',
                         {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 200 and view['status'] == 'QUEUED' and view['attempt'] == 2


def test_retry_while_still_unsettled_keeps_409(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'm'}})
    status, body = call(api, 'POST', '/api/v1/jobs',
                         {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 409 and body['error']['code'] == 'invalid-request'


def test_costs_for_a_past_month_with_no_records(api):
    status, costs = api.handle('GET', '/api/v1/costs', {'month': '2026-09'}, None)
    assert status == 200 and costs['month'] == '2026-09'
    assert costs['spentUsd'] == 0.0 and costs['daily'] == [] and costs['projectionUsd'] == 0.0


def test_get_and_list(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    status, view = api.handle('GET', f'/api/v1/jobs/{WATER_KEY}', {}, None)
    assert status == 200 and view['key'] == WATER_KEY
    status, listing = api.handle('GET', '/api/v1/jobs', {'month': '2026-10'}, None)
    assert listing['month'] == '2026-10' and [j['key'] for j in listing['jobs']] == [WATER_KEY]
    assert api.handle('GET', '/api/v1/jobs', {'month': '2026-10', 'status': 'DONE'}, None)[1]['jobs'] == []


def test_costs_projection_and_daily(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-09T08:00:00Z'})
    api.store.settle(WATER_KEY, 100_000)                         # $0.10 spent by day 10 of 31
    status, costs = api.handle('GET', '/api/v1/costs', {}, None)
    assert status == 200 and costs['month'] == '2026-10' and costs['spentUsd'] == 0.1
    assert costs['daily'] == [{'date': '2026-10-09', 'usd': 0.1}]
    assert costs['projectionUsd'] == pytest.approx(0.1 * 31 / 10, abs=1e-6)
    assert costs['billing'] is None and costs['pricesRetrieved'] == '2026-10-04'


def test_costs_daily_matches_spent_after_a_retry_in_a_later_month(api):
    """D16: daily used to add a record's whole actualMicros on its endedAt,
    so a job failed in October and retried in November put October's charge
    on a November day, and November's daily no longer summed to spentUsd."""
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'endedAt': '2026-10-10T12:30:00Z',
                                     'error': {'code': 'scf-not-converged', 'message': 'm'}})
    api.store.settle(WATER_KEY, 100_000)
    api.now = lambda: datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-11-02T09:40:00Z'})
    api.store.settle(WATER_KEY, 50_000)
    status, costs = api.handle('GET', '/api/v1/costs', {'month': '2026-11'}, None)
    assert status == 200 and costs['spentUsd'] == 0.05
    assert costs['daily'] == [{'date': '2026-11-02', 'usd': 0.05}]


# --- final-review fix wave (I2) --------------------------------------------------

def test_pubchem_html_with_200_is_a_503_not_a_dropped_connection(tmp_path):
    from jobs import pubchem
    api = Api(FileStore(tmp_path), NullRunner(), now=lambda: NOW, backend='local',
              resolve=lambda kind, text: pubchem.resolve(kind, text, fetch=lambda url, data=None: (200, b'<html>')))
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': 'water'}})
    assert status == 503 and body['error']['code'] == 'pubchem-unavailable'


def test_an_unexpected_error_is_a_500_json_answer(api, monkeypatch, capsys):
    """A bug in a handler must still answer: the local server otherwise
    drops the connection, and the UI sees a network error with no reason."""
    def broken(body):
        raise ZeroDivisionError('division by zero\nsecond line names the culprit')
    monkeypatch.setattr(api, 'preview', broken)
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 500
    assert body == {'error': {'code': 'internal-error',
                              'message': 'ZeroDivisionError: second line names the culprit'}}
    assert 'Traceback' in capsys.readouterr().err          # the owner can still find the cause
