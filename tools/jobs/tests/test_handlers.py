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


def submit(api, body, option=None):
    """Phase 6C: a submit names the option the owner approved and its quote
    id, taken from a fresh preview of the same request (the UI's own path)."""
    request = {k: v for k, v in body.items() if k != 'retry'}
    status, preview = call(api, 'POST', '/api/v1/jobs/preview', request)
    assert status == 200, preview
    quote = preview['decision']['quote']
    chosen = next(o for o in quote['options'] if o['option'] == (option or quote['recommended']))
    return call(api, 'POST', '/api/v1/jobs', {**body, 'option': chosen['option'], 'quoteId': chosen['quoteId']})


def booked_usd(api, key=WATER_KEY):
    """What the store booked for the latest settlement (compute plus, for a quoted job, storage and delivery)."""
    return round(api.store.get_job(key)['charges'][-1]['micros'] / 1e6, 6)


def test_preview_by_xyz_writes_nothing(api):
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['key'] == WATER_KEY
    assert body['formula'] == 'H2O' and body['electronCount'] == 10 and body['basisFunctions'] == 58
    assert body['decision']['ok'] and [o['option'] for o in body['decision']['quote']['options']] == ['spot', 'on-demand']
    assert all(o['size'] == 'S' and o['approvable'] for o in body['decision']['quote']['options'])
    assert body['existing'] is None and body['geometrySource'] == {'kind': 'xyz'}
    assert body['meter'] == {'month': '2026-10', 'capUsd': 8.8, 'spentUsd': 0.0, 'reservedUsd': 0.0, 'remainingUsd': 8.8}
    assert api.store.get_job(WATER_KEY) is None


def test_submit_by_name_then_dedupe(api):
    status, view = submit(api, {'recipe': 'single', 'molecule': {'name': 'water'}})
    assert status == 201 and view['key'] == WATER_KEY and view['status'] == 'QUEUED'
    assert view['geometrySource'] == {'kind': 'pubchem', 'cid': 962, 'title': 'Water', 'query': 'water',
                                      'retrievedAt': '2026-10-10'}
    assert api.runner.submitted == [WATER_KEY] and api.store.get_job(WATER_KEY)['runnerJobId'] == 'null'
    status, again = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and again['key'] == WATER_KEY and api.runner.submitted == [WATER_KEY]


def test_cached_name_needs_no_pubchem(api):
    call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': 'Water'}})

    def down(*a, **k):
        from jobs.errors import JobRefused
        raise JobRefused('pubchem-unavailable', 'down', 424)
    api.resolve = down
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': ' water '}})
    assert status == 200 and body['key'] == WATER_KEY


def test_failed_job_is_retried_only_on_request(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'scf-not-converged', 'message': 'm'}})
    api.store.settle(WATER_KEY, 10)
    status, view = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and view['status'] == 'FAILED' and len(api.runner.submitted) == 1
    status, view = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 200 and view['status'] == 'QUEUED' and view['attempt'] == 2 and len(api.runner.submitted) == 2


def test_runner_failure_marks_the_job_failed_and_releases_the_money(api):
    def broken(record):
        raise RuntimeError('Batch said no')
    api.runner.submit = broken
    status, view = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 201 and view['status'] == 'FAILED' and view['error']['code'] == 'submit-failed'
    assert api.store.meter('2026-10')['reserved'] == 0


def test_a_failure_to_record_the_batch_job_id_is_not_a_submit_failure(api):
    # Final review M2: SubmitJob succeeded, so the job will run (its worker
    # records its own id); marking it submit-failed would discard that run.
    original = api.store.update_job

    def flaky(key, changes, *a, **k):
        if 'runnerJobId' in changes:
            raise RuntimeError('DynamoDB timed out')
        return original(key, changes, *a, **k)
    api.store.update_job = flaky
    status, body = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 500 and body['error']['code'] == 'internal-error'
    rec = api.store.get_job(WATER_KEY)
    assert rec['status'] == 'QUEUED' and rec['error'] is None and not rec['settled']


def test_paused_refuses_new_jobs_but_not_known_ones(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.set_generation_enabled(False)
    assert submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})[0] == 200
    status, body = submit(api, {'recipe': 'optimise', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 409 and body['error']['code'] == 'paused'          # not 5xx: the Api5xx alarm (M3)


def test_budget_refusal(api):
    # Phase 6C: a quote over what is left of the cap is still shown, but cannot be approved; a submit of it
    # (approved before the cap filled, say) is still refused by the store's own cap check.
    status, preview = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    spot = preview['decision']['quote']['options'][0]
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ},
                                                       'option': 'spot', 'quoteId': spot['quoteId']})
    assert status == 422 and body['error']['code'] == 'budget'
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision']['ok'] is True
    for option in body['decision']['quote']['options']:
        assert option['approvable'] is False
        assert option['blockedReason'] == (f'Up to ${option["maximumUsd"]:.2f} is more than the $0.000001 left of '
                                           "this month's $0.000001 compute cap: the monthly cap would need raising "
                                           'to approve it.')


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
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
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
    status, view = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 201
    record = api.store.get_job(WATER_KEY)
    assert record['status'] == 'RUNNING' and record['attempt'] == 2
    assert api.store.meter('2026-10')['reserved'] == record['reservedMicros']


def test_preview_skips_budget_refusal_for_an_existing_active_job(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision']['ok'] is True and body['existing']['status'] == 'QUEUED'


def test_preview_skips_budget_refusal_for_an_existing_done_job(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-09T08:00:00Z'})
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision']['ok'] is True and body['existing']['status'] == 'DONE'


def test_retry_that_loses_the_race_to_another_retry_returns_200(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'm'}})
    api.store.settle(WATER_KEY, 10)
    real_requeue = api.store.requeue_failed

    def requeue_then_report_losing_the_race(key, decision, now, quote=None):
        real_requeue(key, decision, now, quote=quote)      # our own write lands...
        from jobs.errors import JobRefused
        raise JobRefused('invalid-request', 'only a failed job can be retried', 409)   # ...but we're told we lost

    api.store.requeue_failed = requeue_then_report_losing_the_race
    status, view = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 200 and view['status'] == 'QUEUED' and view['attempt'] == 2


def test_retry_while_still_unsettled_keeps_409(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'm'}})
    status, body = submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 409 and body['error']['code'] == 'invalid-request'


def test_costs_for_a_past_month_with_no_records(api):
    status, costs = api.handle('GET', '/api/v1/costs', {'month': '2026-09'}, None)
    assert status == 200 and costs['month'] == '2026-09'
    assert costs['spentUsd'] == 0.0 and costs['daily'] == [] and costs['projectionUsd'] == 0.0


def test_get_and_list(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    status, view = api.handle('GET', f'/api/v1/jobs/{WATER_KEY}', {}, None)
    assert status == 200 and view['key'] == WATER_KEY
    status, listing = api.handle('GET', '/api/v1/jobs', {'month': '2026-10'}, None)
    assert listing['month'] == '2026-10' and [j['key'] for j in listing['jobs']] == [WATER_KEY]
    assert api.handle('GET', '/api/v1/jobs', {'month': '2026-10', 'status': 'DONE'}, None)[1]['jobs'] == []


def test_costs_projection_and_daily(api):
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-09T08:00:00Z'})
    api.store.settle(WATER_KEY, 100_000)                         # $0.10 of compute by day 10 of 31
    # Phase 6C: a quoted DONE job also books its storage and delivery (~$0.0018 for water).
    booked = booked_usd(api)
    assert 0.1 < booked < 0.103
    status, costs = api.handle('GET', '/api/v1/costs', {}, None)
    assert status == 200 and costs['month'] == '2026-10' and costs['spentUsd'] == booked
    assert costs['daily'] == [{'date': '2026-10-09', 'usd': booked}]
    assert costs['projectionUsd'] == pytest.approx(booked * 31 / 10, abs=1e-6)
    assert costs['billing'] is None and costs['pricesRetrieved'] == '2026-10-04'


def test_costs_daily_matches_spent_after_a_retry_in_a_later_month(api):
    """D16: daily used to add a record's whole actualMicros on its endedAt,
    so a job failed in October and retried in November put October's charge
    on a November day, and November's daily no longer summed to spentUsd."""
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'endedAt': '2026-10-10T12:30:00Z',
                                     'error': {'code': 'scf-not-converged', 'message': 'm'}})
    api.store.settle(WATER_KEY, 100_000)
    api.now = lambda: datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-11-02T09:40:00Z'})
    api.store.settle(WATER_KEY, 50_000)
    booked = booked_usd(api)                    # Phase 6C: $0.05 of compute plus the DONE job's storage and delivery
    status, costs = api.handle('GET', '/api/v1/costs', {'month': '2026-11'}, None)
    assert status == 200 and costs['spentUsd'] == booked
    assert costs['daily'] == [{'date': '2026-11-02', 'usd': booked}]
    # October keeps its own charge although the record is November's now (review fix 2).
    status, costs = api.handle('GET', '/api/v1/costs', {'month': '2026-10'}, None)
    assert status == 200 and costs['spentUsd'] == 0.1
    assert costs['daily'] == [{'date': '2026-10-10', 'usd': 0.1}]


def test_a_charge_dated_after_its_month_lands_on_the_months_last_day(api):
    """Review fix 3: a September job that ends just after midnight on
    1 October is September's spend; its bar belongs at the end of September,
    not on a "day 1" the chart would read as 1 September."""
    api.now = lambda: datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)
    submit(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-01T00:10:00Z'})
    api.store.settle(WATER_KEY, 100_000)
    booked = booked_usd(api)                    # Phase 6C: plus the DONE job's storage and delivery
    api.now = lambda: NOW
    status, costs = api.handle('GET', '/api/v1/costs', {'month': '2026-09'}, None)
    assert status == 200 and costs['spentUsd'] == booked
    assert costs['daily'] == [{'date': '2026-09-30', 'usd': booked}]


# --- final-review fix wave (I2) --------------------------------------------------

def test_pubchem_html_with_200_is_a_424_not_a_dropped_connection(tmp_path):
    from jobs import pubchem
    api = Api(FileStore(tmp_path), NullRunner(), now=lambda: NOW, backend='local',
              resolve=lambda kind, text: pubchem.resolve(kind, text, fetch=lambda url, data=None: (200, b'<html>')))
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': 'water'}})
    # 424, not 5xx (final review M3): a PubChem outage is not this API failing,
    # and the Api5xx alarm emails the owner for every 5xx.
    assert status == 424 and body['error']['code'] == 'pubchem-unavailable'


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


# --- Phase 6C quotes -------------------------------------------------------------------------------------

WATER = {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}}


def quote_of(api, body=WATER):
    status, preview = call(api, 'POST', '/api/v1/jobs/preview', body)
    assert status == 200
    return {o['option']: o for o in preview['decision']['quote']['options']}


def test_a_preview_prices_two_options_with_line_items_and_quote_ids(api):
    options = quote_of(api)
    spot, on_demand = options['spot'], options['on-demand']
    assert spot['attempts'] == 3 and on_demand['attempts'] == 1 and spot['timeoutSeconds'] == on_demand['timeoutSeconds']
    assert [l['item'] for l in spot['lines']] == ['compute', 'storage', 'delivery', 'platform']
    assert spot['maximumUsd'] == pytest.approx(sum(l['maximumUsd'] for l in spot['lines']), abs=1e-6)
    assert len(spot['quoteId']) == 64 and spot['quoteId'] != on_demand['quoteId']
    assert spot['interruption'] and on_demand['interruption'] is None
    assert spot['approvable'] and spot['blockedReason'] is None


def test_a_submit_must_name_an_approved_option_and_its_quote(api):
    status, body = call(api, 'POST', '/api/v1/jobs', WATER)
    assert status == 400 and body['error']['code'] == 'invalid-request'
    assert 'preview the job and approve one of its options' in body['error']['message']
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'reserved', 'quoteId': 'f' * 64})
    assert status == 400 and body['error']['code'] == 'invalid-request'
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'spot', 'quoteId': 7})
    assert status == 400 and body['error']['code'] == 'invalid-request'
    assert api.store.get_job(WATER_KEY) is None


def test_a_tampered_or_stale_quote_is_refused_as_changed(api):
    spot = quote_of(api)['spot']
    tampered = ('0' if spot['quoteId'][0] != '0' else '1') + spot['quoteId'][1:]
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'spot', 'quoteId': tampered})
    assert status == 409 and body['error']['code'] == 'quote-changed'
    assert 'preview again' in body['error']['message']
    # The on-demand quote's id does not approve Spot either.
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'spot', 'quoteId': quote_of(api)['on-demand']['quoteId']})
    assert status == 409 and body['error']['code'] == 'quote-changed'
    assert api.store.get_job(WATER_KEY) is None and api.runner.submitted == []


def test_a_tampered_quote_is_refused_even_for_a_known_job(api):
    # The live check's case: a DONE key would dedupe, but the quote is checked first.
    submit(api, WATER)
    api.store.update_job(WATER_KEY, {'status': 'DONE'})
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'spot', 'quoteId': 'f' * 64})
    assert status == 409 and body['error']['code'] == 'quote-changed'
    status, view = submit(api, WATER)
    assert status == 200 and view['status'] == 'DONE'


def test_a_changed_price_changes_the_quote(api, monkeypatch):
    from jobs import quotes
    spot = quote_of(api)['spot']
    monkeypatch.setattr(quotes, 'PRICES_VERSION', 99)
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'spot', 'quoteId': spot['quoteId']})
    assert status == 409 and body['error']['code'] == 'quote-changed'


def test_the_record_keeps_the_approved_quote_and_reserves_its_maximum(api):
    on_demand = quote_of(api)['on-demand']
    status, view = submit(api, WATER, option='on-demand')
    assert status == 201
    rec = api.store.get_job(WATER_KEY)
    assert rec['sizing']['capacity'] == 'on-demand' and rec['sizing']['attempts'] == 1
    assert rec['quote']['quoteId'] == on_demand['quoteId'] and rec['quote']['approvedAt'] == '2026-10-10T12:00:00Z'
    assert rec['reservedMicros'] == rec['quote']['maximumMicros']
    # The Batch timeout (BatchRunner reads sizing.timeoutSeconds) is the approved quote's time limit.
    assert rec['sizing']['timeoutSeconds'] == rec['quote']['timeoutSeconds'] == on_demand['timeoutSeconds']
    assert view['approvedQuote']['maximumUsd'] == on_demand['maximumUsd'] == view['reservedUsd']
    assert [l['item'] for l in view['approvedQuote']['lines']] == ['compute', 'storage', 'delivery', 'platform']
    assert api.store.meter('2026-10')['reserved'] == rec['quote']['maximumMicros']


def test_spot_cannot_be_approved_when_it_is_unavailable(api, monkeypatch):
    from jobs import sizing
    monkeypatch.setattr(sizing, 'SPOT_LIMIT_SECONDS', 1)
    options = quote_of(api)
    assert not options['spot']['available'] and options['spot']['unavailableReason']
    assert options['spot']['approvable'] is False and options['on-demand']['approvable']
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'option': 'spot', 'quoteId': 'f' * 64})
    assert status == 409 and body['error']['code'] == 'option-unavailable'


def test_a_retry_needs_a_fresh_approved_quote(api):
    submit(api, WATER)
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'm'}})
    api.store.settle(WATER_KEY, 10)
    status, body = call(api, 'POST', '/api/v1/jobs', {**WATER, 'retry': True})
    assert status == 400 and body['error']['code'] == 'invalid-request'
    status, view = submit(api, {**WATER, 'retry': True}, option='on-demand')
    assert status == 200 and view['attempt'] == 2 and view['approvedQuote']['option'] == 'on-demand'
    assert view['charged'] is None


def test_a_preview_past_the_old_ceiling_is_priced_and_one_past_48_hours_is_refused(api, monkeypatch):
    from jobs import sizing
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3': 2e9})        # ~2.3 h for water on L
    status, body = call(api, 'POST', '/api/v1/jobs/preview', WATER)
    assert status == 200 and body['decision']['ok'] is True
    options = {o['option']: o for o in body['decision']['quote']['options']}
    assert not options['spot']['available'] and options['on-demand']['available']
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3': 1e12})
    status, body = call(api, 'POST', '/api/v1/jobs/preview', WATER)
    assert status == 200 and body['decision']['ok'] is False and body['decision']['error']['code'] == 'too-long'


def test_records_from_before_quotes_still_get_list_and_settle(api):
    from jobs.model import new_record
    from jobs.canonical import canonical_job
    job = canonical_job('single', [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]], 0, 1)
    legacy = new_record(key=WATER_KEY, job=job, decision={**{'version': 5, 'estimateFor': 'fargate', 'size': 'S',
                        'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot', 'attempts': 3, 'basisFunctions': 58,
                        'predictedSeconds': 15.5, 'predictedMemoryGB': 0.47, 'timeoutSeconds': 600,
                        'predictedCostMicros': 129}, 'reservationMicros': 17_880}, name='water', formula='H2O',
                        electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=NOW)
    for field in ('quote', 'settlement'):
        del legacy[field]                                       # exactly what 6B-3 wrote
    api.store.create_job(legacy)
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-10T12:01:00Z'})
    assert api.store.settle(WATER_KEY, 497)
    status, view = api.handle('GET', f'/api/v1/jobs/{WATER_KEY}', {}, None)
    assert status == 200 and view['approvedQuote'] is None and view['charged'] is None
    assert view['actualUsd'] == 0.000497 and view['reservedUsd'] == 0.01788
    status, listing = api.handle('GET', '/api/v1/jobs', {'month': '2026-10'}, None)
    assert [j['key'] for j in listing['jobs']] == [WATER_KEY]
    status, preview = call(api, 'POST', '/api/v1/jobs/preview', WATER)
    assert preview['existing']['approvedQuote'] is None


def test_a_local_preview_is_one_free_option_with_the_aws_price_for_reference(tmp_path):
    api = Api(FileStore(tmp_path), NullRunner(), resolve=fake_resolve, now=lambda: NOW, backend='local')
    status, body = call(api, 'POST', '/api/v1/jobs/preview', WATER)
    quote = body['decision']['quote']
    assert [o['option'] for o in quote['options']] == ['local'] and quote['options'][0]['maximumUsd'] == 0
    assert quote['options'][0]['approvable'] and [o['option'] for o in quote['reference']] == ['spot', 'on-demand']
    assert quote['reference'][0]['maximumUsd'] > 0
    status, view = submit(api, WATER)
    assert status == 201 and view['approvedQuote']['option'] == 'local' and view['reservedUsd'] == 0
