"""DynamoDB-only behaviour; the shared contract is test_store.py."""
import hashlib
from datetime import datetime, timezone

import boto3
import pytest
from botocore.exceptions import ClientError
from moto import mock_aws

from jobs import dynamo_store
from jobs.dynamo_store import DynamoStore, table_definition
from jobs.model import new_record

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
DECISION = {'version': 1, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot', 'attempts': 3,
            'basisFunctions': 58, 'predictedSeconds': 20.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 1_000, 'predictedCostMicros': 10}


def record(key='a' * 64):
    return new_record(key=key, job={'recipe': 'single'}, decision=DECISION, name='water', formula='H2O',
                      electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=NOW)


@pytest.fixture
def client():
    with mock_aws():
        c = boto3.client('dynamodb', region_name='us-east-1')
        c.create_table(**table_definition('jobs-test'))
        yield c


class Conflicts:
    """Lets the first `n` TransactWriteItems fail as a concurrent transaction
    on the meter would make them fail in DynamoDB (moto never produces this)."""

    def __init__(self, client, n=1):
        self.client, self.conflicts = client, n

    def transact_write_items(self, **kwargs):
        if self.conflicts:
            self.conflicts -= 1
            raise ClientError({'Error': {'Code': 'TransactionCanceledException', 'Message': 'conflict'},
                               'CancellationReasons': [{'Code': 'None'}, {'Code': 'TransactionConflict'}]},
                              'TransactWriteItems')
        return self.client.transact_write_items(**kwargs)

    def __getattr__(self, name):
        return getattr(self.client, name)


class Recording(Conflicts):
    """Keeps every TransactWriteItems request, conflicted ones included."""

    def __init__(self, client, n=0):
        super().__init__(client, n)
        self.calls = []

    def transact_write_items(self, **kwargs):
        self.calls.append(kwargs)
        return super().transact_write_items(**kwargs)


def test_a_transaction_conflict_on_the_meter_is_retried(client):
    store = DynamoStore('jobs-test', client=Conflicts(client), cap_micros=10_000)
    assert store.create_job(record())[0]
    assert store.meter('2026-10')['reserved'] == 1_000


def test_a_conflict_that_never_clears_is_an_error_not_a_budget_refusal(client, monkeypatch):
    monkeypatch.setattr(dynamo_store.time, 'sleep', lambda s: None)
    store = DynamoStore('jobs-test', client=Conflicts(client, n=dynamo_store.TRANSACTION_TRIES), cap_micros=10_000)
    with pytest.raises(RuntimeError, match='TransactionConflict'):
        store.create_job(record())
    assert store.get_job('a' * 64) is None and store.meter('2026-10')['committed'] == 0


def test_item_layout_matches_the_spec(client):
    store = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    store.create_job(record())
    store.put_resolution('name:water', {'cid': 962})
    store.set_generation_enabled(False)
    store.put_billing('2026-10', {'usd': 0.12})
    keys = {i['pk']['S'] for i in client.scan(TableName='jobs-test')['Items']}
    assert keys == {'a' * 64, 'METER#2026-10', 'CONFIG', 'BILLING#2026-10',
                    'RESOLVE#' + hashlib.sha256(b'name:water').hexdigest()}
    meter = client.get_item(TableName='jobs-test', Key={'pk': {'S': 'METER#2026-10'}})['Item']
    assert meter['spent'] == {'N': '0'} and meter['reserved'] == {'N': '1000'} and meter['committed'] == {'N': '1000'}
    # Only job records are in the month index.
    index = client.query(TableName='jobs-test', IndexName='byMonth', KeyConditionExpression='#m = :m',
                         ExpressionAttributeNames={'#m': 'month'}, ExpressionAttributeValues={':m': {'S': '2026-10'}})
    assert [i['pk']['S'] for i in index['Items']] == ['a' * 64]


def test_two_reconcilers_settle_once(client):
    a = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    b = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    a.create_job(record())
    assert [a.settle('a' * 64, 300), b.settle('a' * 64, 300)] == [True, False]
    assert a.meter('2026-10') == {'spent': 300, 'reserved': 0, 'committed': 300, 'cap': 10_000}
    assert len(a.get_job('a' * 64)['charges']) == 1


def test_two_reconcilers_with_the_same_read_settle_once(client):
    """Both read the record unsettled; the second's transaction, not its
    read, is what refuses it, and nothing moves on the meter."""
    a = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    b = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    a.create_job(record())
    stale = b.get_job('a' * 64)
    b.get_job = lambda key: stale
    assert a.settle('a' * 64, 300)
    assert not b.settle('a' * 64, 300)
    assert a.meter('2026-10') == {'spent': 300, 'reserved': 0, 'committed': 300, 'cap': 10_000}
    assert len(a.get_job('a' * 64)['charges']) == 1


def test_a_settle_from_a_read_before_a_retry_is_refused(client):
    """Review fix 1: reconciler B reads attempt 1 (October, 1000 reserved);
    A settles it; the owner retries in November with the same reservation.
    B's settle must not pass on `settled = false AND reservedMicros = 1000`:
    it would release October's reservation a second time and charge the
    retry to October, leaving November's 1000 reserved for ever."""
    a = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    b = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    a.create_job(record())
    stale = b.get_job('a' * 64)
    a.update_job('a' * 64, {'status': 'FAILED', 'endedAt': '2026-10-05T12:30:00Z'})
    assert a.settle('a' * 64, 100)
    a.requeue_failed('a' * 64, DECISION, datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc))
    b.get_job = lambda key: stale
    assert not b.settle('a' * 64, 300)
    assert a.meter('2026-10') == {'spent': 100, 'reserved': 0, 'committed': 100, 'cap': 10_000}
    assert a.meter('2026-11') == {'spent': 0, 'reserved': 1_000, 'committed': 1_000, 'cap': 10_000}
    rec = a.get_job('a' * 64)
    assert rec['status'] == 'QUEUED' and rec['attempt'] == 2 and not rec['settled']
    assert rec['actualMicros'] == 100 and len(rec['charges']) == 1


def test_every_transaction_carries_its_own_request_token(client, monkeypatch):
    """Review fix 5: a token per request, so a retry of a request whose
    commit answer was lost is a no-op, not a false 409 or created=False.
    One per request, not per job: the same token on a second, identical
    submission would make DynamoDB answer it with success and nothing
    written, and the runner would be started twice."""
    monkeypatch.setattr(dynamo_store.time, 'sleep', lambda s: None)
    recording = Recording(client, n=1)
    store = DynamoStore('jobs-test', client=recording, cap_micros=10_000)
    assert store.create_job(record())[0]                     # one conflict, then through
    store.update_job('a' * 64, {'status': 'FAILED'})
    assert store.settle('a' * 64, 100)
    store.requeue_failed('a' * 64, DECISION, NOW)
    tokens = [c['ClientRequestToken'] for c in recording.calls]
    assert len(tokens) == 4 and len(set(tokens)) == 4 and all(1 <= len(t) <= 36 for t in tokens)
    assert store.create_job(record())[0] is False            # still a dedupe, not an idempotent "success"


def test_jobs_with_backend_pages_through_the_scan(client, monkeypatch):
    """The scan is paginated: a table past 1 MB answers in pages, and the
    local sweep's contract is every record of the backend."""
    store = DynamoStore('jobs-test', client=client, cap_micros=10_000)
    for k in 'abcde':
        store.create_job(record(k * 64))
    real_scan, pages = client.scan, []

    def small_pages(**kwargs):
        page = real_scan(**kwargs, Limit=2)
        pages.append(page)
        return page
    monkeypatch.setattr(client, 'scan', small_pages)
    assert sorted(r['key'] for r in store.jobs_with_backend('aws')) == [k * 64 for k in 'abcde']
    assert len(pages) > 1 and store.jobs_with_backend('local') == []
