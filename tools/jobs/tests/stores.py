"""Builds each Store backend for the shared contract (test_store.py) and
the handler tests: FileStore on a temp dir, DynamoStore on moto."""
from contextlib import contextmanager

TABLE = 'jobs-test'


@contextmanager
def make_store(kind, tmp_path, cap_micros):
    if kind == 'file':
        from jobs.store import FileStore
        yield FileStore(tmp_path, cap_micros=cap_micros)
        return
    import boto3
    from moto import mock_aws
    from jobs.dynamo_store import DynamoStore, table_definition
    with mock_aws():
        client = boto3.client('dynamodb', region_name='us-east-1')
        client.create_table(**table_definition(TABLE))
        yield DynamoStore(TABLE, client=client, cap_micros=cap_micros)
