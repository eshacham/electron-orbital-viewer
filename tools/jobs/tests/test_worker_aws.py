# tools/jobs/tests/test_worker_aws.py
"""The worker's --aws wiring and attempt numbering; no PySCF runs here
(run_job itself is replaced), so these take milliseconds."""
import hashlib
import json
from datetime import datetime, timezone

import boto3
import pytest
from moto import mock_aws

from jobs import worker
from jobs.dynamo_store import DynamoStore, table_definition
from jobs.model import new_record
from jobs.s3_sink import S3Sink

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
KEY = 'a' * 64
DECISION = {'version': 1, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot', 'attempts': 3,
            'basisFunctions': 58, 'predictedSeconds': 20.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 1_000, 'predictedCostMicros': 10}


@pytest.fixture
def store():
    with mock_aws():
        client = boto3.client('dynamodb', region_name='us-east-1')
        client.create_table(**table_definition('jobs-test'))
        s = DynamoStore('jobs-test', client=client)
        s.create_job(new_record(key=KEY, job={'recipe': 'single'}, decision=DECISION, name='water', formula='H2O',
                                electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=NOW))
        yield s


def test_aws_attempt_adds_the_offset():
    assert worker.aws_attempt({}) == 1
    assert worker.aws_attempt({'AWS_BATCH_JOB_ATTEMPT': '2'}) == 2
    assert worker.aws_attempt({'AWS_BATCH_JOB_ATTEMPT': '2', 'JOB_ATTEMPT_OFFSET': '1'}) == 3


def test_image_digest_prefers_the_env_then_the_task_metadata():
    assert worker.image_digest({'JOBS_IMAGE_DIGEST': 'sha256:abc'}) == 'sha256:abc'
    meta = {'ECS_CONTAINER_METADATA_URI_V4': 'http://169.254.170.2/v4/x'}
    assert worker.image_digest(meta, fetch=lambda url: json.dumps({'ImageID': 'sha256:def'}).encode()) == 'sha256:def'
    assert worker.image_digest(meta, fetch=lambda url: (_ for _ in ()).throw(OSError('down'))) == 'unknown'
    assert worker.image_digest({}) == 'unknown'


def test_aws_mode_builds_dynamo_and_s3_from_the_environment(monkeypatch, capsys):
    seen = {}

    def fake_run_job(key, store, sink, attempt, backend, grid_points, image_digest):
        seen.update(key=key, store=store, sink=sink, attempt=attempt, backend=backend, digest=image_digest)
        return 'DONE'
    monkeypatch.setattr(worker, 'run_job', fake_run_job)
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    env = {'JOBS_TABLE': 'jobs-test', 'DATA_BUCKET': 'bucket', 'AWS_BATCH_JOB_ATTEMPT': '3',
           'JOB_ATTEMPT_OFFSET': '0', 'JOBS_IMAGE_DIGEST': 'sha256:abc'}
    assert worker.main(['run', KEY, '--aws'], environ=env) == 0
    assert isinstance(seen['store'], DynamoStore) and seen['store'].table == 'jobs-test'
    assert isinstance(seen['sink'], S3Sink) and seen['sink'].bucket == 'bucket'
    assert (seen['attempt'], seen['backend'], seen['digest']) == (3, 'aws', 'sha256:abc')
    assert json.loads(capsys.readouterr().out) == {'key': KEY, 'attempt': 3, 'status': 'DONE'}


def test_local_mode_still_needs_state():
    with pytest.raises(SystemExit):
        worker.main(['run', KEY, '--local', '/tmp/out'], environ={})


def test_spot_retry_claims_while_the_reclaimed_attempt_still_says_running(store):
    # Attempt 1 claimed, then Fargate reclaimed the task: the record still says RUNNING.
    assert store.claim(KEY, 1, NOW)
    assert not store.claim(KEY, 1, NOW)                                  # a duplicate copy of attempt 1
    assert store.claim(KEY, worker.aws_attempt({'AWS_BATCH_JOB_ATTEMPT': '2'}), NOW)
    assert store.get_job(KEY)['attempt'] == 2 and store.get_job(KEY)['status'] == 'RUNNING'


def test_owner_retry_then_spot_retry_keeps_attempts_rising(store):
    store.claim(KEY, 1, NOW)
    store.update_job(KEY, {'status': 'FAILED'})
    store.settle(KEY, 0)
    rec = store.requeue_failed(KEY, DECISION, NOW)                       # record attempt 2
    offset = {'JOB_ATTEMPT_OFFSET': str(rec['attempt'] - 1)}             # what BatchRunner sends
    assert store.claim(KEY, worker.aws_attempt({**offset, 'AWS_BATCH_JOB_ATTEMPT': '1'}), NOW)
    assert store.claim(KEY, worker.aws_attempt({**offset, 'AWS_BATCH_JOB_ATTEMPT': '2'}), NOW)
    assert store.get_job(KEY)['attempt'] == 3


def test_h2_end_to_end_on_dynamodb_and_s3():
    """The whole worker against the AWS adapters on moto; PySCF runs for real
    (H₂ at def2-SVP on a 32³ grid, as test_worker.py's local end-to-end)."""
    from jobs.canonical import canonical_job, job_key
    bucket = 'molecule-data-test'
    with mock_aws():
        ddb = boto3.client('dynamodb', region_name='us-east-1')
        ddb.create_table(**table_definition('jobs-test'))
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket=bucket)
        store, sink = DynamoStore('jobs-test', client=ddb), S3Sink(bucket, client=s3)
        job = canonical_job('single', [[1, 0, 0, 0], [1, 0, 0, 0.74]], 0, 1,
                            method={'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': None})
        key = job_key(job)
        store.create_job(new_record(key=key, job=job, decision={**DECISION, 'basisFunctions': 10}, name='hydrogen',
                                    formula='H2', electron_count=2, geometry_source={'kind': 'xyz'}, backend='aws',
                                    now=NOW))
        assert worker.run_job(key, store, sink, attempt=1, backend='aws', grid_points=(32,), heartbeat_seconds=0.2,
                              image_digest='sha256:test') == 'DONE'
        prefix = f'molecules/jobs/{key}/'
        names = {o['Key'][len(prefix):] for o in s3.list_objects_v2(Bucket=bucket, Prefix=prefix)['Contents']}
        assert {'done.json', 'meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz', 'job.json', 'input.py',
                'output.log', 'geometry.xyz', 'timings.json', 'attempts/1/input.py', 'attempts/1/output.log',
                'attempts/1/timings.json'} <= names

        def read(name):
            return s3.get_object(Bucket=bucket, Key=prefix + name)['Body'].read()
        done = json.loads(read('done.json'))
        for name, digest in done['files'].items():
            assert hashlib.sha256(read(name)).hexdigest() == digest, name
        assert json.loads(read('meta.json'))['provenance']['imageDigest'] == 'sha256:test'
        assert json.loads(read('timings.json'))['backend'] == 'aws'
        rec = store.get_job(key)
        assert rec['status'] == 'DONE' and rec['actual']['wallSeconds'] > 0 and rec['error'] is None


def test_local_mode_keeps_its_local_provenance_label(monkeypatch, tmp_path, capsys):
    # D18: only --aws asks ECS for the image; a local run is labelled 'local'
    # (or JOBS_IMAGE_DIGEST, when set) and still prints the bare status.
    seen = []
    monkeypatch.setattr(worker, 'run_job', lambda key, store, sink, **kw: seen.append(kw) or 'DONE')
    roots = ['--local', str(tmp_path / 'o'), '--state', str(tmp_path / 's')]
    assert worker.main(['run', KEY, *roots], environ={}) == 0
    assert worker.main(['run', KEY, *roots], environ={'JOBS_IMAGE_DIGEST': 'sha256:abc'}) == 0
    assert [(kw['image_digest'], kw['attempt'], kw['backend']) for kw in seen] == [('local', 1, 'local'),
                                                                                    ('sha256:abc', 1, 'local')]
    assert capsys.readouterr().out == 'DONE\nDONE\n'
