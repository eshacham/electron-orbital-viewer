"""The AWS Store (spec §6.2–6.4, §10.2): one DynamoDB table, key `pk`.

Items: a job record under its 64-hex key; the month's meter under
`METER#YYYY-MM` (`spent`, `reserved`, `committed`, integer micro-dollars);
PubChem resolutions under `RESOLVE#<sha256 of the normalised query>`; the
kill switch under `CONFIG`; Cost Explorer's figure under `BILLING#YYYY-MM`.
Only job records carry `month` and `submittedAt`, so only they appear in the
`byMonth` index.

Every method keeps FileStore's semantics (tests/test_store.py runs the same
contract against both). The money-moving ones are single transactions:
create = Put-if-absent + reserve; requeue = reset-if-still-failed + reserve;
settle = flip `settled` and append the charge + move the money. FileStore
derives its meter from the records (Ruling T5-a); here the meter item is
that same sum kept up to date inside each transaction, because a DynamoDB
condition cannot add attributes across items, so the cap check needs
`committed` stored (spec §6.4). Each record still keeps its `charges`
ledger, so the two agree record for record.

Numbers: DynamoDB keeps a number's value, not its spelling. Real DynamoDB
returns 20.0 as 20 (moto keeps "20.0"), and `from_attr` then gives an int.
Nothing may rely on `isinstance(x, float)` for an integral value; JSON
clients cannot tell the difference.
"""
import hashlib
import json
import time
import uuid
from decimal import Decimal

from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError

from jobs.errors import JobRefused
from jobs.model import iso, month_of
from jobs.prices import CAP_MICROS
from jobs.store import BudgetExhausted, charge

_SER, _DES = TypeSerializer(), TypeDeserializer()
TRANSACTION_TRIES = 5


def _plain(value):
    """DynamoDB numbers come back as Decimal: integers stay int, the rest float."""
    if isinstance(value, Decimal):
        return int(value) if value.as_tuple().exponent >= 0 else float(value)
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    return value


def to_attr(value) -> dict:
    # JSON round trip turns every float into a Decimal (boto3 refuses floats).
    return _SER.serialize(json.loads(json.dumps(value), parse_float=Decimal))


def from_attr(attr: dict):
    return _plain(_DES.deserialize(attr))


def _n(micros: int) -> dict:
    return {'N': str(int(micros))}


def table_definition(name: str) -> dict:
    """The table as CreateTable takes it: tests create it on moto from here;
    infra/compute_stack.py declares the same schema (its test pins the same
    literals)."""
    return {'TableName': name, 'BillingMode': 'PAY_PER_REQUEST',
            'AttributeDefinitions': [{'AttributeName': 'pk', 'AttributeType': 'S'},
                                     {'AttributeName': 'month', 'AttributeType': 'S'},
                                     {'AttributeName': 'submittedAt', 'AttributeType': 'S'}],
            'KeySchema': [{'AttributeName': 'pk', 'KeyType': 'HASH'}],
            'GlobalSecondaryIndexes': [{'IndexName': 'byMonth',
                                        'KeySchema': [{'AttributeName': 'month', 'KeyType': 'HASH'},
                                                      {'AttributeName': 'submittedAt', 'KeyType': 'RANGE'}],
                                        'Projection': {'ProjectionType': 'ALL'}}]}


def _set(changes: dict, names: dict, values: dict) -> str:
    parts = []
    for i, (field, value) in enumerate(changes.items()):
        names[f'#f{i}'] = field
        values[f':v{i}'] = to_attr(value)
        parts.append(f'#f{i} = :v{i}')
    return 'SET ' + ', '.join(parts)


def _record(item: dict) -> dict:
    return {k: from_attr(v) for k, v in item.items() if k != 'pk'}


class DynamoStore:
    def __init__(self, table: str, client=None, cap_micros: int = CAP_MICROS):
        if client is None:
            import boto3
            client = boto3.client('dynamodb')
        self.table, self.db, self.cap = table, client, cap_micros

    # -- helpers -------------------------------------------------------------
    def _get(self, pk):
        item = self.db.get_item(TableName=self.table, Key={'pk': {'S': pk}}, ConsistentRead=True).get('Item')
        return None if item is None else _record(item)

    def _reserve(self, month, micros):
        return {'Update': {
            'TableName': self.table, 'Key': {'pk': {'S': f'METER#{month}'}},
            'UpdateExpression': 'ADD #c :w, #r :w, #s :zero',
            'ConditionExpression': 'attribute_not_exists(#c) OR #c <= :room',
            'ExpressionAttributeNames': {'#c': 'committed', '#r': 'reserved', '#s': 'spent'},
            'ExpressionAttributeValues': {':w': _n(micros), ':zero': _n(0), ':room': _n(self.cap - micros)}}}

    def _transact(self, items):
        """Runs one transaction; returns None, or the cancellation codes when a
        condition failed. A TransactionConflict (another transaction on the
        meter at that instant: a settlement, a second submission) is retried.

        Each request carries its own ClientRequestToken: botocore resends a
        request whose answer was lost with the same token, and DynamoDB then
        answers success without applying it twice (instead of a false 409 or
        `created=False` from our own condition). It is per request, never
        derived from the job: an identical second submission within the
        10-minute token window would otherwise be answered "success" with
        nothing written, and the caller would start the runner twice. (botocore
        also injects one when absent; setting it here keeps the guarantee
        explicit and tested.)"""
        for i in range(TRANSACTION_TRIES):
            try:
                self.db.transact_write_items(TransactItems=items, ClientRequestToken=str(uuid.uuid4()))
                return None
            except ClientError as e:
                if e.response['Error']['Code'] != 'TransactionCanceledException':
                    raise
                codes = [r.get('Code', 'None') for r in e.response.get('CancellationReasons', [])]
                if 'ConditionalCheckFailed' in codes or i == TRANSACTION_TRIES - 1:
                    return codes
                time.sleep(0.05 * 2 ** i)
        return None

    def _refuse_over_cap(self, month, micros):
        # The meter's condition cannot see a reservation larger than the whole
        # cap on a month with no meter item yet (attribute_not_exists passes).
        if micros > self.cap:
            raise BudgetExhausted(self.meter(month))

    # -- Store ---------------------------------------------------------------
    def get_job(self, key):
        return self._get(key)

    def create_job(self, record):
        self._refuse_over_cap(record['month'], record['reservedMicros'])
        item = {'pk': {'S': record['key']}, **{k: to_attr(v) for k, v in record.items()}}
        codes = self._transact([
            {'Put': {'TableName': self.table, 'Item': item, 'ConditionExpression': 'attribute_not_exists(pk)'}},
            self._reserve(record['month'], record['reservedMicros'])])
        if codes is None:
            return True, record
        if codes[0] == 'ConditionalCheckFailed':
            return False, self.get_job(record['key'])
        if codes[1] == 'ConditionalCheckFailed':
            raise BudgetExhausted(self.meter(record['month']))
        raise RuntimeError(f'create_job transaction cancelled: {codes}')

    def requeue_failed(self, key, decision, now):
        rec = self.get_job(key)
        if rec is None or rec['status'] != 'FAILED':
            raise JobRefused('invalid-request', 'only a failed job can be retried', 409)
        if not rec['settled']:
            raise JobRefused('invalid-request', 'the failed attempt is still being settled; retry in a minute', 409)
        month = month_of(now)                     # a retry is charged to the month it is made in (spec §6.4)
        self._refuse_over_cap(month, decision['reservationMicros'])
        # The same fields FileStore resets, the failed attempt's peak memory
        # and last energy included (6B-1 M2, T5-b): a retry starts clean.
        changes = {'status': 'QUEUED', 'attempt': rec['attempt'] + 1, 'error': None, 'settled': False, 'month': month,
                   'peakMemoryGB': None, 'reservedMicros': decision['reservationMicros'],
                   'sizing': {k: v for k, v in decision.items() if k != 'reservationMicros'},
                   'submittedAt': iso(now), 'startedAt': None, 'endedAt': None, 'heartbeatAt': None,
                   'stage': None, 'latestEnergyHartree': None, 'logTail': [], 'actual': None, 'runnerJobId': None}
        names, values = {'#st': 'status', '#se': 'settled', '#at': 'attempt'}, {
            ':failed': {'S': 'FAILED'}, ':true': {'BOOL': True}, ':attempt': _n(rec['attempt'])}
        update = _set(changes, names, values)
        codes = self._transact([
            {'Update': {'TableName': self.table, 'Key': {'pk': {'S': key}}, 'UpdateExpression': update,
                        'ConditionExpression': '#st = :failed AND #se = :true AND #at = :attempt',
                        'ExpressionAttributeNames': names, 'ExpressionAttributeValues': values}},
            self._reserve(month, decision['reservationMicros'])])
        if codes is None:
            rec.update(changes)
            return rec
        if codes[0] == 'ConditionalCheckFailed':
            raise JobRefused('invalid-request', 'the job changed while it was being retried; try again', 409)
        if codes[1] == 'ConditionalCheckFailed':
            raise BudgetExhausted(self.meter(month))
        raise RuntimeError(f'requeue transaction cancelled: {codes}')

    def claim(self, key, attempt, now):
        rec = self.get_job(key)
        # Never an attempt older than the record's: a retry has moved the job
        # on, and a worker started for the earlier attempt must not run it
        # under the newer number (I4). The condition's `#at = :old` keeps
        # this true if a retry lands between the read and the write.
        if rec is None or attempt < rec['attempt']:
            return False
        try:
            self.db.update_item(
                TableName=self.table, Key={'pk': {'S': key}},
                UpdateExpression='SET #st = :running, #at = :new, #sa = :now, #hb = :now',
                ConditionExpression='(#st IN (:queued, :starting) OR (#st = :running AND #at < :attempt)) AND #at = :old',
                ExpressionAttributeNames={'#st': 'status', '#at': 'attempt', '#sa': 'startedAt', '#hb': 'heartbeatAt'},
                ExpressionAttributeValues={':running': {'S': 'RUNNING'}, ':queued': {'S': 'QUEUED'},
                                           ':starting': {'S': 'STARTING'}, ':attempt': _n(attempt),
                                           ':new': _n(max(attempt, rec['attempt'])), ':old': _n(rec['attempt']),
                                           ':now': {'S': iso(now)}})
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return False
            raise
        return True

    def update_job(self, key, changes, expect_status=None, attempt=None):
        if not changes:
            # Nothing to write: answer the question the write's condition would.
            rec = self.get_job(key)
            return (rec is not None and (expect_status is None or rec['status'] in expect_status)
                    and (attempt is None or rec['attempt'] == attempt))
        names, values = {}, {}
        condition = 'attribute_exists(pk)'
        if expect_status is not None:
            names['#st'] = 'status'
            allowed = sorted(expect_status)
            for i, s in enumerate(allowed):
                values[f':es{i}'] = {'S': s}
            condition += f' AND #st IN ({", ".join(f":es{i}" for i in range(len(allowed)))})'
        if attempt is not None:
            # The worker passes its own attempt on every heartbeat and on its
            # final status write, so a superseded attempt never clobbers the
            # current one (FileStore's guard, Task 9 of 6B-1).
            names['#ag'] = 'attempt'
            values[':ag'] = _n(attempt)
            condition += ' AND #ag = :ag'
        update = _set(changes, names, values)
        try:
            self.db.update_item(TableName=self.table, Key={'pk': {'S': key}}, UpdateExpression=update,
                                ConditionExpression=condition, ExpressionAttributeNames=names,
                                ExpressionAttributeValues=values)
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return False
            raise
        return True

    def settle(self, key, actual_micros, attempt=None):
        rec = self.get_job(key)
        # The condition below pins the attempt read here, so checking it
        # against the caller's is enough to keep the two the same.
        if rec is None or rec['settled'] or (attempt is not None and rec['attempt'] != attempt):
            return False
        w = rec['reservedMicros']
        codes = self._transact([
            {'Update': {'TableName': self.table, 'Key': {'pk': {'S': key}},
                        'UpdateExpression': 'SET #se = :true, #am = #am + :a, '
                                            '#ch = list_append(if_not_exists(#ch, :none), :charge)',
                        # The meter key and the charge come from the read
                        # above, so the condition pins everything they were
                        # derived from: a reconciler whose read predates a
                        # settle-and-retry (same reservation, a new attempt,
                        # perhaps a new month) must not settle the retry
                        # against the old month's meter (review fix 1).
                        'ConditionExpression': '#se = :false AND #rm = :w AND #ag = :attempt AND #mo = :month',
                        'ExpressionAttributeNames': {'#se': 'settled', '#am': 'actualMicros', '#rm': 'reservedMicros',
                                                     '#ch': 'charges', '#ag': 'attempt', '#mo': 'month'},
                        'ExpressionAttributeValues': {':true': {'BOOL': True}, ':false': {'BOOL': False},
                                                      ':a': _n(actual_micros), ':w': _n(w), ':none': {'L': []},
                                                      ':attempt': _n(rec['attempt']), ':month': {'S': rec['month']},
                                                      ':charge': to_attr([charge(rec, actual_micros)])}}},
            {'Update': {'TableName': self.table, 'Key': {'pk': {'S': f'METER#{rec["month"]}'}},
                        'UpdateExpression': 'ADD #s :a, #r :minus_w, #c :delta',
                        'ExpressionAttributeNames': {'#s': 'spent', '#r': 'reserved', '#c': 'committed'},
                        'ExpressionAttributeValues': {':a': _n(actual_micros), ':minus_w': _n(-w),
                                                      ':delta': _n(actual_micros - w)}}}])
        if codes is None:
            return True
        if codes[0] == 'ConditionalCheckFailed':
            return False                     # another reconcile settled it first
        raise RuntimeError(f'settle transaction cancelled: {codes}')

    def list_jobs(self, month, status=None):
        # The byMonth index is eventually consistent (a GSI has no consistent
        # read): a job submitted a moment ago may be missing from the list
        # for a second or so. get_job, which every money decision uses, reads
        # the table itself, consistently.
        records, start = [], None
        while True:
            kwargs = {'TableName': self.table, 'IndexName': 'byMonth', 'KeyConditionExpression': '#m = :m',
                      'ExpressionAttributeNames': {'#m': 'month'}, 'ExpressionAttributeValues': {':m': {'S': month}}}
            if start:
                kwargs['ExclusiveStartKey'] = start
            page = self.db.query(**kwargs)
            records += [_record(item) for item in page['Items']]
            start = page.get('LastEvaluatedKey')
            if not start:
                break
        chosen = [r for r in records if status is None or r['status'] == status]
        return sorted(chosen, key=lambda r: (r['submittedAt'], r['key']))

    def jobs_with_backend(self, backend):
        # Every month's records of one backend: a Scan, which the table's size
        # (one owner, a capped budget) keeps cheap. Only job records carry
        # `backend`, so the filter also drops the meter and config items.
        records, start = [], None
        while True:
            kwargs = {'TableName': self.table, 'FilterExpression': '#b = :b', 'ConsistentRead': True,
                      'ExpressionAttributeNames': {'#b': 'backend'}, 'ExpressionAttributeValues': {':b': {'S': backend}}}
            if start:
                kwargs['ExclusiveStartKey'] = start
            page = self.db.scan(**kwargs)
            records += [_record(item) for item in page['Items']]
            start = page.get('LastEvaluatedKey')
            if not start:
                return records

    def month_charges(self, month):
        # Chosen by charge month, so a Scan, not the byMonth index (which keys
        # on the record's current month); only `charges` is read back. Every
        # charge written here is dated.
        found, start = [], None
        while True:
            kwargs = {'TableName': self.table, 'FilterExpression': 'attribute_exists(#ch)', 'ConsistentRead': True,
                      'ProjectionExpression': '#ch', 'ExpressionAttributeNames': {'#ch': 'charges'}}
            if start:
                kwargs['ExclusiveStartKey'] = start
            page = self.db.scan(**kwargs)
            found += [c for item in page['Items'] for c in from_attr(item['charges']) if c['month'] == month]
            start = page.get('LastEvaluatedKey')
            if not start:
                return found

    def meter(self, month):
        m = self._get(f'METER#{month}') or {}
        return {'spent': m.get('spent', 0), 'reserved': m.get('reserved', 0), 'committed': m.get('committed', 0),
                'cap': self.cap}

    def _put_value(self, pk, value):
        self.db.put_item(TableName=self.table, Item={'pk': {'S': pk}, 'value': to_attr(value)})

    def _value(self, pk):
        item = self._get(pk)
        return None if item is None else item['value']

    def get_resolution(self, query):
        return self._value(f'RESOLVE#{hashlib.sha256(query.encode()).hexdigest()}')

    def put_resolution(self, query, value):
        self._put_value(f'RESOLVE#{hashlib.sha256(query.encode()).hexdigest()}', value)

    def generation_enabled(self):
        item = self._get('CONFIG')
        return True if item is None else bool(item.get('generationEnabled', True))

    def set_generation_enabled(self, enabled):
        self.db.update_item(TableName=self.table, Key={'pk': {'S': 'CONFIG'}},
                            UpdateExpression='SET generationEnabled = :e',
                            ExpressionAttributeValues={':e': {'BOOL': bool(enabled)}})

    def get_billing(self, month):
        return self._value(f'BILLING#{month}')

    def put_billing(self, month, value):
        self._put_value(f'BILLING#{month}', value)
