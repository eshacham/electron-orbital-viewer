"""The three Lambda entry points (spec §10.2): thin adapters from AWS
events to the plain functions in handlers.py, reconcile.py and billing.py,
which are tested without AWS. Clients are built once per container, from
the environment the compute stack sets."""
import base64
import binascii
import json
import logging
import os
import sys

MAX_BODY = 131072       # local_server.MAX_BODY: the same limit on both backends (test_lambdas pins it)
NOT_OWNER = {'error': {'code': 'not-owner', 'message': 'This account is not allowed to use the jobs API.'}}

log = logging.getLogger('jobs')
log.setLevel(logging.INFO)
_cache = {}


def _claimed_groups(claim) -> list:
    """`cognito:groups` as the HTTP API v2 JWT authorizer actually hands a
    Lambda: API Gateway's $context mapping stringifies array claims, so a
    real token with more than one group shows up as a Go-style bracketed,
    space-joined string ("[owners admin]"), and a single group may arrive
    bracketed ("[owners]") or bare ("owners"). A hand-built or test event may
    still pass a real list, or a JSON array string -- accept every shape
    rather than assume the API Gateway quirk is the only caller."""
    if claim is None:
        return []
    if isinstance(claim, list):
        return [str(g) for g in claim]
    if not isinstance(claim, str):
        return []
    text = claim.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        parsed = None
    if isinstance(parsed, list):
        return [str(g) for g in parsed]
    if text.startswith('[') and text.endswith(']'):
        inner = text[1:-1].strip()
        return inner.split() if inner else []
    return [text]


def _is_owner(event: dict) -> bool:
    """OWNER_GROUP (default 'owners', set by the compute stack): every route
    is refused to a token without it, not only the ones that spend money --
    today's pool has one user, but the server must not trust the client to
    enforce this (the brief, 2026-10-15)."""
    owner_group = os.environ.get('OWNER_GROUP', 'owners')
    claims = event['requestContext'].get('authorizer', {}).get('jwt', {}).get('claims') or {}
    return owner_group in _claimed_groups(claims.get('cognito:groups'))


def _store():
    from jobs.dynamo_store import DynamoStore
    return DynamoStore(os.environ['JOBS_TABLE'])


def _api():
    if 'api' not in _cache:
        from jobs.batch_runner import BatchRunner
        from jobs.handlers import Api
        runner = BatchRunner({'spot': os.environ['SPOT_QUEUE'], 'on-demand': os.environ['ON_DEMAND_QUEUE']},
                             os.environ['JOB_DEFINITION'])
        _cache['api'] = Api(_store(), runner, backend='aws')
    return _cache['api']


def _json_log(**fields):
    print(json.dumps(fields, separators=(',', ':')), file=sys.stdout, flush=True)


def handle_http(api, event: dict) -> dict:
    """HTTP API payload 2.0 → Api.handle → the Lambda proxy response.

    The Cognito JWT authorizer only proves the token is signed by this pool;
    it says nothing about who the signer is. Every route first checks that
    the token's `cognito:groups` claim names the owner group (`_is_owner`,
    the brief 2026-10-15) -- `api.handle` is never reached for anyone else,
    so a non-owner cannot list, preview, submit or read costs regardless of
    what the UI shows.

    The base64 decode lives inside the same try as the call to Api.handle
    (D19): bad base64 from a misbehaving client is a 400 the caller can fix,
    not a 500 that pages the owner over the API's own unexpected-failure
    alarm. Api's own catch-all already answers `internal-error` (I2), so the
    Lambda's own fallback uses the same code for one error vocabulary across
    both backends.
    """
    method = event['requestContext']['http']['method']
    path = event['rawPath']
    try:
        if not _is_owner(event):
            status, payload = 403, NOT_OWNER
        else:
            body = event.get('body')
            if body is not None:
                body = base64.b64decode(body, validate=True) if event.get('isBase64Encoded') else body.encode()
            if body is not None and len(body) > MAX_BODY:
                status, payload = 413, {'error': {'code': 'body-too-large', 'message': f'over {MAX_BODY} bytes'}}
            else:
                status, payload = api.handle(method, path, event.get('queryStringParameters') or {}, body)
    except binascii.Error:
        status, payload = 400, {'error': {'code': 'invalid-request', 'message': 'the request body is not valid base64'}}
    except Exception as e:      # an AWS error the handlers do not expect: 500, logged; the 5xx alarm sees it
        log.exception('unhandled')
        status, payload = 500, {'error': {'code': 'internal-error', 'message': type(e).__name__}}
    _json_log(route=f'{method} {path}', status=status, key=payload.get('key') if isinstance(payload, dict) else None,
              requestId=event['requestContext'].get('requestId'))
    return {'statusCode': status, 'headers': {'content-type': 'application/json', 'cache-control': 'no-store'},
            'body': json.dumps(payload)}


def api_handler(event, context):
    return handle_http(_api(), event)


def _reconciler():
    if 'reconcile' not in _cache:
        import boto3
        from jobs.reconcile import Reconciler
        sns, topic = boto3.client('sns'), os.environ['ALERT_TOPIC_ARN']
        _cache['reconcile'] = Reconciler(_store(), boto3.client('batch'), boto3.client('ecs'),
                                         notify=lambda subject, message: sns.publish(
                                             TopicArn=topic, Subject=subject[:100], Message=message))
    return _cache['reconcile']


def reconcile_handler(event, context):
    r = _reconciler()
    if event.get('source') == 'aws.batch':
        result = r.on_event(event['detail'])
        _json_log(event='batch', jobId=event['detail'].get('jobId'), status=event['detail'].get('status'), result=result)
        return result
    result = r.sweep()
    _json_log(event='sweep', checked=result['checked'], stale=len(result['stale']))
    return {'checked': result['checked'], 'stale': len(result['stale'])}


def billing_handler(event, context):
    import boto3
    from jobs.billing import run_billing
    result = run_billing(_store(), boto3.client('ce', region_name='us-east-1'))
    _json_log(event='billing', **result)
    return result
