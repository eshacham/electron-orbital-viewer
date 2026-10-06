import boto3
import pytest
from botocore.stub import Stubber

from jobs.batch_runner import SPOT_INTERRUPTION, BatchRunner, memory_mib, retry_strategy

QUEUES = {'spot': 'arn:aws:batch:us-east-1:123456789012:job-queue/spot',
          'on-demand': 'arn:aws:batch:us-east-1:123456789012:job-queue/on-demand'}
JOBDEF = 'arn:aws:batch:us-east-1:123456789012:job-definition/orbital-worker'
KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'


def record(capacity='spot', attempts=3, attempt=1, size=('S', 2, 8), timeout=600):
    return {'key': KEY, 'attempt': attempt,
            'sizing': {'size': size[0], 'vcpu': size[1], 'memoryGB': size[2], 'capacity': capacity,
                       'attempts': attempts, 'timeoutSeconds': timeout}}


def expected(queue, vcpu, mib, attempts, timeout, offset):
    return {'jobName': f'orbital-{KEY[:16]}-{offset + 1}', 'jobQueue': queue, 'jobDefinition': JOBDEF,
            'containerOverrides': {
                'command': ['run', KEY, '--aws'],
                'resourceRequirements': [{'type': 'VCPU', 'value': str(vcpu)}, {'type': 'MEMORY', 'value': str(mib)}],
                'environment': [{'name': 'JOB_KEY', 'value': KEY}, {'name': 'OMP_NUM_THREADS', 'value': str(vcpu)},
                                {'name': 'PYSCF_MAX_MEMORY', 'value': str(int(mib * 0.8))},
                                {'name': 'JOB_ATTEMPT_OFFSET', 'value': str(offset)}]},
            'retryStrategy': retry_strategy(attempts), 'timeout': {'attemptDurationSeconds': timeout},
            'propagateTags': True,
            'tags': {'app': 'electron-orbital-viewer', 'component': 'compute', 'jobKey': KEY}}


@pytest.mark.parametrize('rec,queue,vcpu,mib,attempts,timeout,offset', [
    (record(), QUEUES['spot'], 2, 8192, 3, 600, 0),
    (record('on-demand', 1, 2, ('L', 16, 64), 5400), QUEUES['on-demand'], 16, 65536, 1, 5400, 1),
])
def test_submit_maps_the_decision_onto_the_batch_call(rec, queue, vcpu, mib, attempts, timeout, offset):
    client = boto3.client('batch', region_name='us-east-1')
    with Stubber(client) as stub:
        stub.add_response('submit_job', {'jobName': 'n', 'jobId': 'job-123'},
                          expected(queue, vcpu, mib, attempts, timeout, offset))
        assert BatchRunner(QUEUES, JOBDEF, client=client).submit(rec) == 'job-123'
        stub.assert_no_pending_responses()


def test_only_a_spot_interruption_is_retried():
    rules = retry_strategy(3)['evaluateOnExit']
    assert rules[0] == {'onStatusReason': SPOT_INTERRUPTION, 'action': 'RETRY'}
    assert all(r['action'] == 'EXIT' for r in rules[1:]) and len(rules) <= 5
    assert {k for r in rules[1:] for k in r} >= {'onStatusReason', 'onReason', 'onExitCode'}


def test_fargate_memory_values():
    # Batch takes Fargate memory in MiB, and only the listed values per vCPU.
    assert [memory_mib(g) for g in (8, 16, 64, 244)] == [8192, 16384, 65536, 249856]


def test_a_batch_refusal_propagates():
    client = boto3.client('batch', region_name='us-east-1')
    with Stubber(client) as stub:
        stub.add_client_error('submit_job', 'AccessDeniedException',
                              'explicit deny in an identity-based policy (budget action)')
        with pytest.raises(Exception) as e:
            BatchRunner(QUEUES, JOBDEF, client=client).submit(record())
        assert 'AccessDenied' in str(e.value)
