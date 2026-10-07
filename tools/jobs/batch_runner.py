"""Submits a queued job to AWS Batch (spec §6.2, §7.4, §10.2).

Size and timeout come from the job's sizing decision, per submission: one
job definition serves every size. Retries happen only on a Spot
interruption; any other failure (out of memory, timeout, an SCF the worker
reported as failed) is final, because rerunning the same input on the same
size would fail the same way and bill again.
"""
TAGS = {'app': 'electron-orbital-viewer', 'component': 'compute'}
# Fargate's stopped reason for a reclaimed Spot task ("Your Spot Task was
# interrupted."); Batch copies it into the attempt's statusReason. Batch
# patterns allow letters, digits, spaces, '.', ':' and a trailing '*'.
SPOT_INTERRUPTION = 'Your Spot Task was interrupted*'
# Each compute environment's vCPU cap (infra/compute_stack.py imports it):
# reconcile reads it too, to tell a job waiting behind this app's own work
# on its queue from one AWS has no capacity for (final review I1).
MAX_VCPUS = 32


PYSCF_MEMORY_SHARE = 0.8     # PySCF's own cap; the rest is Python, the grids and the OS


def memory_mib(memory_gb: int) -> int:
    return int(memory_gb) * 1024


def pyscf_max_memory_mb(memory_gb: int) -> int:
    # PySCF limits itself to PYSCF_MAX_MEMORY (default 4000 MB) whatever the
    # container has, so an L or XL worker would compute out of core without it.
    return int(memory_mib(memory_gb) * PYSCF_MEMORY_SHARE)


def retry_strategy(attempts: int) -> dict:
    # Batch retries when no rule matches, so the catch-alls must say EXIT.
    return {'attempts': attempts, 'evaluateOnExit': [
        {'onStatusReason': SPOT_INTERRUPTION, 'action': 'RETRY'},
        {'onStatusReason': '*', 'action': 'EXIT'},
        {'onReason': '*', 'action': 'EXIT'},
        {'onExitCode': '*', 'action': 'EXIT'},
    ]}


class BatchRunner:
    def __init__(self, queues: dict, job_definition: str, client=None):
        if client is None:
            import boto3
            client = boto3.client('batch')
        self.queues, self.job_definition, self.batch = dict(queues), job_definition, client

    def submit(self, record: dict) -> str:
        s, key = record['sizing'], record['key']
        response = self.batch.submit_job(
            jobName=f'orbital-{key[:16]}-{record["attempt"]}',
            jobQueue=self.queues[s['capacity']],
            jobDefinition=self.job_definition,
            containerOverrides={
                'command': ['run', key, '--aws'],
                'resourceRequirements': [{'type': 'VCPU', 'value': str(s['vcpu'])},
                                         {'type': 'MEMORY', 'value': str(memory_mib(s['memoryGB']))}],
                'environment': [{'name': 'JOB_KEY', 'value': key},
                                {'name': 'OMP_NUM_THREADS', 'value': str(s['vcpu'])},
                                {'name': 'PYSCF_MAX_MEMORY', 'value': str(pyscf_max_memory_mb(s['memoryGB']))},
                                # Batch numbers attempts from 1 for every new Batch job; an owner's
                                # retry of a FAILED key is a new Batch job, so the worker adds this.
                                {'name': 'JOB_ATTEMPT_OFFSET', 'value': str(record['attempt'] - 1)}]},
            retryStrategy=retry_strategy(s['attempts']),
            timeout={'attemptDurationSeconds': int(s['timeoutSeconds'])},
            propagateTags=True,
            tags={**TAGS, 'jobKey': key})
        return response['jobId']
