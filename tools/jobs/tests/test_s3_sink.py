import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import Stubber
from moto import mock_aws

from jobs.s3_sink import S3Sink
from jobs.sink import ROOT_RESULT_NAMES

BUCKET = 'molecule-data-test'
KEY = 'k' * 64


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client('s3', region_name='us-east-1')
        client.create_bucket(Bucket=BUCKET)
        client.put_bucket_versioning(Bucket=BUCKET, VersioningConfiguration={'Status': 'Enabled'})
        yield client


def test_layout_and_headers(s3):
    sink = S3Sink(BUCKET, client=s3)
    sink.put_attempt(KEY, 2, 'output.log', b'log')
    sink.put_result(KEY, 'meta.json', b'{}')
    sink.put_result(KEY, 'density.bin.gz', b'\x1f\x8b')
    sink.put_done(KEY, b'{"files": {}}')
    head = s3.head_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/attempts/2/output.log')
    assert head['ContentType'] == 'text/plain; charset=utf-8' and head['CacheControl'] == 'no-cache'
    meta = s3.head_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/meta.json')
    assert meta['ContentType'] == 'application/json' and 'immutable' in meta['CacheControl']
    gz = s3.head_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/density.bin.gz')
    assert gz['ContentType'] == 'application/octet-stream' and 'ContentEncoding' not in gz
    assert s3.get_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/done.json')['Body'].read() == b'{"files": {}}'
    assert sink.get_attempt(KEY, 2, 'output.log') == b'log' and sink.get_attempt(KEY, 1, 'output.log') is None


def test_a_root_file_is_never_overwritten(s3):
    sink = S3Sink(BUCKET, client=s3)
    sink.put_result(KEY, 'meta.json', b'first')
    with pytest.raises(FileExistsError):
        sink.put_result(KEY, 'meta.json', b'second')
    sink.put_done(KEY, b'x')
    with pytest.raises(FileExistsError):
        sink.put_done(KEY, b'y')
    assert s3.get_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/meta.json')['Body'].read() == b'first'
    sink.put_attempt(KEY, 1, 'trajectory.xyz', b'1')
    sink.put_attempt(KEY, 1, 'trajectory.xyz', b'2')                # attempt files do change
    assert sink.get_attempt(KEY, 1, 'trajectory.xyz') == b'2'


# D7: a reclaimed or killed attempt can leave a root half-written (no
# done.json), which makes every retry fail "already in the result folder".
# clear_partial deletes exactly the fixed root names, and only when
# done.json is absent.

def test_clear_partial_removes_a_half_written_root_so_the_retry_can_write(s3):
    sink = S3Sink(BUCKET, client=s3)
    sink.put_result(KEY, 'meta.json', b'stale')
    sink.put_result(KEY, 'job.json', b'stale')
    sink.clear_partial(KEY)
    sink.put_result(KEY, 'meta.json', b'fresh')          # would raise FileExistsError if not cleared
    assert s3.get_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/meta.json')['Body'].read() == b'fresh'
    for name in ROOT_RESULT_NAMES:
        if name != 'meta.json':
            with pytest.raises(ClientError):
                s3.head_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/{name}')


def test_clear_partial_leaves_a_completed_root_alone(s3):
    sink = S3Sink(BUCKET, client=s3)
    sink.put_result(KEY, 'meta.json', b'final')
    sink.put_done(KEY, b'{"files": {}}')
    sink.clear_partial(KEY)
    assert s3.get_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/meta.json')['Body'].read() == b'final'
    assert s3.get_object(Bucket=BUCKET, Key=f'molecules/jobs/{KEY}/done.json')['Body'].read() == b'{"files": {}}'


# D8: without s3:ListBucket, S3 answers 403 AccessDenied (not NoSuchKey) for
# a missing key on the real worker role. moto does not enforce IAM, so this
# needs a Stubber to simulate the real account's answer.

def test_get_attempt_treats_access_denied_as_missing():
    client = boto3.client('s3', region_name='us-east-1')
    with Stubber(client) as stub:
        stub.add_client_error('get_object', service_error_code='AccessDenied',
                              service_message='Access Denied', http_status_code=403)
        assert S3Sink(BUCKET, client=client).get_attempt(KEY, 1, 'trajectory.xyz') is None
        stub.assert_no_pending_responses()
