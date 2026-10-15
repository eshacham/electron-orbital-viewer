import base64
import json

import pytest

from jobs.handlers import Api
from jobs.lambdas import handle_http
from jobs.runner import NullRunner
from jobs.tests.stores import make_store

WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'


def event(method, path, body=None, query=None, b64=False, groups='[owners]', claims=None, authorizer=True):
    """An HTTP API v2 Lambda proxy event. Defaults to an owner token (every
    other test in this file is a route test, not an owner-check test, so it
    should see the request reach `api.handle` as before); `groups`/`claims`/
    `authorizer` let the owner-check tests below pick a specific shape of
    the real `requestContext.authorizer.jwt.claims` the HTTP API JWT
    authorizer hands the Lambda."""
    raw = json.dumps(body) if body is not None else None
    if raw is not None and b64:
        raw = base64.b64encode(raw.encode()).decode()
    request_context = {'http': {'method': method}, 'requestId': 'r1'}
    if authorizer:
        request_context['authorizer'] = {'jwt': {'claims': claims if claims is not None else {'cognito:groups': groups}}}
    return {'version': '2.0', 'rawPath': path, 'queryStringParameters': query, 'body': raw, 'isBase64Encoded': b64,
            'requestContext': request_context}


def approved(api, body):
    """Phase 6C: the body with the preview's recommended option and its quote id."""
    preview = json.loads(handle_http(api, event('POST', '/api/v1/jobs/preview', body))['body'])
    quote = preview['decision']['quote']
    option = next(o for o in quote['options'] if o['option'] == quote['recommended'])
    return {**body, 'option': option['option'], 'quoteId': option['quoteId']}


@pytest.fixture
def api(tmp_path):
    with make_store('dynamo', tmp_path, cap_micros=8_800_000) as store:
        yield Api(store, NullRunner(), backend='aws')


@pytest.mark.parametrize('b64', [False, True])
def test_submit_through_the_http_api_payload(api, b64):
    body = approved(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    out = handle_http(api, event('POST', '/api/v1/jobs', body, b64=b64))
    assert out['statusCode'] == 201 and out['headers']['content-type'] == 'application/json'
    view = json.loads(out['body'])
    assert view['status'] == 'QUEUED' and view['sizing']['capacity'] in ('spot', 'on-demand')
    listing = handle_http(api, event('GET', '/api/v1/jobs', query={'month': view['month']}))
    assert [j['key'] for j in json.loads(listing['body'])['jobs']] == [view['key']]


def test_oversized_body_is_413(api):
    out = handle_http(api, {**event('POST', '/api/v1/jobs'), 'body': 'x' * 131073})
    assert out['statusCode'] == 413 and json.loads(out['body'])['error']['code'] == 'body-too-large'


def test_unexpected_error_is_a_logged_json_500(api, monkeypatch):
    def boom(*a):
        raise RuntimeError('DynamoDB unavailable')
    monkeypatch.setattr(api, 'handle', boom)
    out = handle_http(api, event('GET', '/api/v1/costs'))
    assert out['statusCode'] == 500 and json.loads(out['body'])['error']['code'] == 'internal-error'


def test_bad_base64_body_is_a_400_invalid_request(api):
    out = handle_http(api, {**event('POST', '/api/v1/jobs'), 'body': 'a', 'isBase64Encoded': True})
    assert out['statusCode'] == 400
    assert json.loads(out['body'])['error']['code'] == 'invalid-request'


def test_budget_action_deny_fails_the_job_and_releases_the_reservation(api):
    def denied(record):
        raise RuntimeError('AccessDeniedException: explicit deny (budget action)')
    api.runner.submit = denied
    out = handle_http(api, event('POST', '/api/v1/jobs', approved(api, {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})))
    view = json.loads(out['body'])
    assert view['status'] == 'FAILED' and view['error']['code'] == 'submit-failed'
    assert api.store.meter(view['month'])['reserved'] == 0


def test_body_limit_matches_the_local_server():
    from jobs.lambdas import MAX_BODY
    from jobs.local_server import MAX_BODY as LOCAL_MAX_BODY
    assert MAX_BODY == LOCAL_MAX_BODY


# -- the owner check (the brief, 2026-10-15) ---------------------------------

NOT_OWNER = {'code': 'not-owner', 'message': 'This account is not allowed to use the jobs API.'}


def test_the_owner_is_allowed_on_every_route(api):
    """Every route `compute_stack.ROUTES` names, with a default (owner) event."""
    body = {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}}
    preview = handle_http(api, event('POST', '/api/v1/jobs/preview', body))
    assert preview['statusCode'] == 200
    submitted = handle_http(api, event('POST', '/api/v1/jobs', approved(api, body)))
    assert submitted['statusCode'] == 201
    key = json.loads(submitted['body'])['key']
    assert handle_http(api, event('GET', '/api/v1/jobs'))['statusCode'] == 200
    assert handle_http(api, event('GET', f'/api/v1/jobs/{key}'))['statusCode'] == 200
    assert handle_http(api, event('GET', '/api/v1/costs'))['statusCode'] == 200


@pytest.mark.parametrize('claim', [
    '[owners]',          # HTTP API v2's own stringified single-value array
    '[owners admin]',    # stringified multi-value array, space-joined
    'owners',            # a bare group name, no brackets
    '["owners"]',        # a JSON-ish array string
    ['owners'],          # a real list (e.g. a non-stringifying authorizer)
    ['admin', 'owners'],
])
def test_group_claim_shapes_that_name_the_owner_are_allowed(api, claim):
    out = handle_http(api, event('GET', '/api/v1/costs', groups=claim))
    assert out['statusCode'] == 200


@pytest.mark.parametrize('claim', [
    '[admin]', 'admin', ['admin'], '[]', '', '["admin"]',
])
def test_group_claim_shapes_without_the_owner_are_refused(api, claim):
    out = handle_http(api, event('GET', '/api/v1/costs', groups=claim))
    assert out['statusCode'] == 403
    assert json.loads(out['body'])['error'] == NOT_OWNER


def test_non_owner_is_refused_before_the_api_is_called(api, monkeypatch):
    calls = []
    monkeypatch.setattr(api, 'handle', lambda *a, **k: calls.append((a, k)))
    out = handle_http(api, event('GET', '/api/v1/costs', groups='[admin]'))
    assert out['statusCode'] == 403 and json.loads(out['body'])['error'] == NOT_OWNER
    assert calls == []


def test_no_groups_claim_is_refused_before_the_api_is_called(api, monkeypatch):
    """claims present (a real token), but no cognito:groups key at all."""
    calls = []
    monkeypatch.setattr(api, 'handle', lambda *a, **k: calls.append((a, k)))
    out = handle_http(api, event('GET', '/api/v1/costs', claims={'sub': 'abc-123'}))
    assert out['statusCode'] == 403 and json.loads(out['body'])['error'] == NOT_OWNER
    assert calls == []


def test_missing_authorizer_is_refused_before_the_api_is_called(api, monkeypatch):
    calls = []
    monkeypatch.setattr(api, 'handle', lambda *a, **k: calls.append((a, k)))
    out = handle_http(api, event('GET', '/api/v1/costs', authorizer=False))
    assert out['statusCode'] == 403 and json.loads(out['body'])['error'] == NOT_OWNER
    assert calls == []


def test_the_403_is_logged_without_the_token_or_an_email(api, capsys):
    handle_http(api, event('GET', '/api/v1/costs', groups='[admin]'))
    logged = capsys.readouterr().out
    assert '"status":403' in logged and '"route":"GET /api/v1/costs"' in logged and '"requestId":"r1"' in logged
    assert 'admin' not in logged and '@' not in logged


def test_owner_group_name_is_configurable(api, monkeypatch):
    """OWNER_GROUP (set by the compute stack on the api Lambda) names the
    group that counts as the owner; it defaults to 'owners'."""
    monkeypatch.setenv('OWNER_GROUP', 'admins')
    assert handle_http(api, event('GET', '/api/v1/costs', groups='[admins]'))['statusCode'] == 200
    assert handle_http(api, event('GET', '/api/v1/costs', groups='[owners]'))['statusCode'] == 403
