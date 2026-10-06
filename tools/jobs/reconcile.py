"""Never stuck, settled once (spec §6.4, §6.6).

Batch tells us when a job's state changes (EventBridge), and a sweep every
15 minutes catches anything an event missed. Either way the truth is read
from Batch (DescribeJobs) and ECS (DescribeTasks), never from the event
alone, because events can arrive late or out of order.

Rules:
- Batch job ended (SUCCEEDED/FAILED) and the worker never wrote DONE or
  FAILED → FAILED with Batch's reason. Then settle at billed seconds.
- Batch job waiting (SUBMITTED/PENDING/RUNNABLE) for over RUNNABLE_LIMIT
  since it was created or since its last attempt stopped → terminated,
  FAILED `no-capacity`, settled at what its attempts cost (usually $0).
- Batch waiting or starting while the record says RUNNING is a Spot retry
  in progress: the record is left alone (the worker's claim admits the next
  attempt; rewriting the status here would race that claim).
- A record still QUEUED with no Batch job id ten minutes after submission
  (the api Lambda died between the transaction and SubmitJob) → FAILED,
  settled at $0.
- A record with a Batch job id that Batch no longer describes, a day after
  submission (Batch forgets a job about a week after it ends, so an event
  and every sweep since were missed) → FAILED `batch-lost`, or left DONE if
  its worker finished, and settled at what its worker reported running
  (preflight D28). Without this it would hold its reservation for ever.
- Billed seconds per attempt = ECS pullStartedAt → stoppedAt; when ECS has
  forgotten the task (about an hour after it stops), Batch's startedAt →
  stoppedAt plus 60 s for the image pull. Each attempt at the job's
  capacity price, with Fargate's one-minute minimum.
"""
from datetime import datetime, timedelta, timezone

from jobs.model import ACTIVE, iso, month_of, utc_now
from jobs.prices import billed_seconds, cost_micros

RUNNABLE_LIMIT_SECONDS = 1800
STALE_HEARTBEAT_SECONDS = 300
SUBMIT_GRACE_SECONDS = 600
PULL_ALLOWANCE_SECONDS = 60
# Batch keeps an ended job describable for at least a day (about a week in
# practice); a job it cannot describe after that has gone for good.
BATCH_LOST_SECONDS = 24 * 3600
WAITING = {'SUBMITTED', 'PENDING', 'RUNNABLE'}
ENDED = {'SUCCEEDED', 'FAILED'}


def _ms(value):
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


def _parse(text):
    return datetime.strptime(text, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def attempt_seconds(attempt: dict, ecs) -> int:
    """Billed seconds for one Batch attempt (0 if it never got a task)."""
    task_arn = (attempt.get('container') or {}).get('taskArn')
    if task_arn:
        cluster = task_arn.split('/')[1]          # arn:aws:ecs:<region>:<account>:task/<cluster>/<id>
        tasks = ecs.describe_tasks(cluster=cluster, tasks=[task_arn]).get('tasks', [])
        if tasks and tasks[0].get('pullStartedAt') and tasks[0].get('stoppedAt'):
            return billed_seconds((tasks[0]['stoppedAt'] - tasks[0]['pullStartedAt']).total_seconds())
    if attempt.get('startedAt') and attempt.get('stoppedAt'):
        return billed_seconds((attempt['stoppedAt'] - attempt['startedAt']) / 1000 + PULL_ALLOWANCE_SECONDS)
    return 0


def job_cost_micros(record: dict, batch_job: dict, ecs) -> int:
    s = record['sizing']
    return sum(cost_micros(s['capacity'], s['vcpu'], s['memoryGB'], attempt_seconds(a, ecs))
               for a in batch_job.get('attempts', []))


def _reported_cost_micros(record: dict) -> int:
    """What ran by the worker's own account, when Batch and ECS have both
    forgotten the job: its claim to its last word (end, else last heartbeat)
    plus the pull allowance. Only the latest attempt leaves a trace on the
    record, so an earlier reclaimed attempt goes uncharged; 0 when the worker
    never claimed the job."""
    start, last = record.get('startedAt'), record.get('endedAt') or record.get('heartbeatAt')
    if not (start and last):
        return 0
    s = record['sizing']
    seconds = max(0.0, (_parse(last) - _parse(start)).total_seconds()) + PULL_ALLOWANCE_SECONDS
    return cost_micros(s['capacity'], s['vcpu'], s['memoryGB'], billed_seconds(seconds))


def failure(batch_job: dict) -> dict:
    """The error a person reads when Batch, not the worker, ended the job."""
    attempts = batch_job.get('attempts') or [{}]
    last = attempts[-1]
    reason = last.get('statusReason') or batch_job.get('statusReason') or 'no reason given'
    container = (last.get('container') or {}).get('reason') or ''
    text = f'{reason} {container}'.strip()
    if 'OutOfMemory' in text:
        code = 'out-of-memory'
    elif 'timeout' in text.lower():
        code = 'timed-out'
    elif 'Spot Task was interrupted' in text:
        code = 'spot-interrupted'
    elif batch_job['status'] == 'SUCCEEDED':
        code, text = 'worker-lost', 'the worker ended without reporting a result'
    else:
        code = 'batch-failed'
    return {'code': code, 'message': text[:500]}


class Reconciler:
    def __init__(self, store, batch, ecs, now=utc_now, notify=None):
        self.store, self.batch, self.ecs, self.now = store, batch, ecs, now
        self.notify = notify or (lambda subject, message: None)

    def _describe(self, job_ids):
        found = {}
        ids = [j for j in job_ids if j]
        for i in range(0, len(ids), 100):
            for job in self.batch.describe_jobs(jobs=ids[i:i + 100])['jobs']:
                found[job['jobId']] = job
        return found

    def _fail_and_settle(self, record, error, cost):
        self.store.update_job(record['key'], {'status': 'FAILED', 'endedAt': iso(self.now()), 'stage': None,
                                              'error': error}, expect_status=ACTIVE)
        return self.store.settle(record['key'], cost)

    def _no_batch_job(self, record, now) -> str:
        age = now - _parse(record['submittedAt'])
        if not record.get('runnerJobId'):
            if record['status'] in ACTIVE and age > timedelta(seconds=SUBMIT_GRACE_SECONDS):
                self._fail_and_settle(record, {'code': 'submit-lost',
                                               'message': 'the job was never handed to AWS Batch'}, 0)
                return 'failed-submit-lost'
            return 'no-batch-job'
        if age <= timedelta(seconds=BATCH_LOST_SECONDS):
            return 'no-batch-job'
        cost = _reported_cost_micros(record)
        if record['status'] in ACTIVE:
            self._fail_and_settle(record, {'code': 'batch-lost', 'message':
                                           f'AWS Batch no longer knows job {record["runnerJobId"]}, so how it ended '
                                           'is unknown; charged for what the worker reported running.'}, cost)
            return 'failed-batch-lost'
        # The worker wrote its result but the settlement was missed: the
        # result stands, only the money is closed out.
        self.store.settle(record['key'], cost)
        return 'settled-batch-lost'

    def reconcile(self, record: dict, batch_job: dict | None) -> str:
        """One job; returns what it did (tests and logs read this)."""
        key, now = record['key'], self.now()
        if record['settled']:
            return 'already-settled'
        if batch_job is None:
            return self._no_batch_job(record, now)
        status = batch_job['status']
        if status in ENDED:
            cost = job_cost_micros(record, batch_job, self.ecs)
            if record['status'] in ACTIVE:
                self.store.update_job(key, {'status': 'FAILED', 'endedAt': iso(now), 'stage': None,
                                            'error': failure(batch_job)}, expect_status=ACTIVE)
            settled = self.store.settle(key, cost)
            return 'settled' if settled else 'already-settled'
        if status in WAITING or status == 'STARTING':
            self.store.update_job(key, {'status': 'STARTING'}, expect_status={'QUEUED'})
            stops = [a['stoppedAt'] for a in batch_job.get('attempts', []) if a.get('stoppedAt')]
            since = _ms(max([batch_job['createdAt'], *stops]))
            if status in WAITING and now - since > timedelta(seconds=RUNNABLE_LIMIT_SECONDS):
                minutes = RUNNABLE_LIMIT_SECONDS // 60
                self.batch.terminate_job(jobId=batch_job['jobId'],
                                         reason=f'No Fargate capacity for {minutes} minutes (reconcile)')
                cost = job_cost_micros(record, batch_job, self.ecs)
                self._fail_and_settle(record, {'code': 'no-capacity', 'message':
                                               f'AWS had no Fargate capacity for this size for {minutes} minutes; '
                                               'nothing ran, so nothing was charged. Retry later.'}, cost)
                return 'failed-no-capacity'
            return 'waiting'
        return 'running'

    def on_event(self, detail: dict) -> str:
        """A "Batch Job State Change" event's detail (the DescribeJobs shape)."""
        env = {e['name']: e['value'] for e in (detail.get('container') or {}).get('environment', [])}
        key = env.get('JOB_KEY') or (detail.get('tags') or {}).get('jobKey')
        record = self.store.get_job(key) if key else None
        if record is None or record.get('runnerJobId') != detail['jobId']:
            return 'not-ours'           # another app's job, or an earlier Batch job of a retried key
        return self.reconcile(record, self._describe([detail['jobId']]).get(detail['jobId']))

    def sweep(self) -> dict:
        now = self.now()
        months = sorted({month_of(now), month_of(now.replace(day=1) - timedelta(days=1))})
        records = [r for m in months for r in self.store.list_jobs(m)
                   if r['status'] in ACTIVE or not r['settled']]
        jobs = self._describe([r.get('runnerJobId') for r in records])
        outcome, stale = {}, []
        for r in records:
            batch_job = jobs.get(r.get('runnerJobId'))
            result = self.reconcile(r, batch_job)
            outcome[r['key']] = result
            if result.startswith('failed') or result.endswith('batch-lost') or \
                    (result == 'settled' and r['status'] in ACTIVE):
                stale.append(f'{r["key"]} {r["formula"]}: {result}')
            elif result == 'running' and r.get('heartbeatAt') and \
                    now - _parse(r['heartbeatAt']) > timedelta(seconds=STALE_HEARTBEAT_SECONDS):
                stale.append(f'{r["key"]} {r["formula"]}: Batch says RUNNING, last heartbeat {r["heartbeatAt"]}')
        if stale:
            self.notify('Orbital viewer: reconcile found stale jobs',
                        'The 15-minute sweep acted on or flagged these jobs (an event was missed, or a worker '
                        'stopped reporting):\n' + '\n'.join(stale))
        return {'checked': len(records), 'outcome': outcome, 'stale': stale}
