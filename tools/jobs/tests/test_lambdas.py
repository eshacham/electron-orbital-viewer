import base64
import json

import pytest

from jobs.handlers import Api
from jobs.lambdas import handle_http
from jobs.runner import NullRunner
from jobs.tests.stores import make_store

WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'


def event(method, path, body=None, query=None, b64=False):
    raw = json.dumps(body) if body is not None else None
    if raw is not None and b64:
        raw = base64.b64encode(raw.encode()).decode()
    return {'version': '2.0', 'rawPath': path, 'queryStringParameters': query, 'body': raw, 'isBase64Encoded': b64,
            'requestContext': {'http': {'method': method}, 'requestId': 'r1'}}


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
