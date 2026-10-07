"""Never stuck, settled once (spec §6.4, §6.6).

Batch tells us when a job's state changes (EventBridge), and a sweep every
15 minutes catches anything an event missed. Either way the truth is read
from Batch (DescribeJobs) and ECS (DescribeTasks), never from the event
alone, because events can arrive late or out of order.

Rules:
- Batch job ended (SUCCEEDED/FAILED) and the worker never wrote DONE or
  FAILED → FAILED with Batch's reason. Then settle at billed seconds.
- Batch job waiting (SUBMITTED/PENDING/RUNNABLE) for over RUNNABLE_LIMIT
  since it was created, since its last attempt stopped, or since this app's
  own last job on the same queue ended → terminated, FAILED `no-capacity`,
  settled at what its attempts cost (usually $0). Unless the wait is this
  app's own doing: each compute environment holds MAX_VCPUS, so a job
  queued behind the owner's own running jobs (one XL fills a queue) waits
  on, however long (final review I1). Only jobs running or ahead of it in
  the queue count, so two waiting jobs never excuse each other.
- Batch waiting or starting while the record says RUNNING is a Spot retry
  in progress: the record is left alone (the worker's claim admits the next
  attempt; rewriting the status here would race that claim).
- A record still QUEUED with no Batch job id ten minutes after submission
  (the api Lambda died between the transaction and SubmitJob) → FAILED,
  settled at $0. A worker that starts after all finds the record FAILED
  and runs nothing. One that claimed it records its own Batch job id
  (AWS_BATCH_JOB_ID), so a RUNNING record without one is a worker whose
  write failed: left alone, like a forgotten Batch job, for a day.
- A FAILED or DONE record with no Batch job id that was never settled (the
  api's submit-failed write landed and its settle did not) → settled ten
  minutes after submission at what its worker reported running (nothing,
  for a submit Batch refused). Its reservation would otherwise be held,
  and every owner retry refused, for ever (final review M1).
- A record with a Batch job id that Batch no longer describes, a day after
  submission (Batch forgets a job about a week after it ends, so an event
  and every sweep since were missed) → FAILED `batch-lost`, or left DONE if
  its worker finished, and settled at what its worker reported running
  (preflight D28). Without this it would hold its reservation for ever.
- Billed seconds per attempt = ECS pullStartedAt → stoppedAt; when ECS has
  forgotten the task (about an hour after it stops), Batch's startedAt →
  stoppedAt plus 60 s for the image pull. Each attempt at the job's
  capacity price, with Fargate's one-minute minimum.

The sweep reads the current and the previous month; once a day (its run in
the first quarter hour after midnight UTC) it also scans every month for an
unsettled record, so one that a month-long reconcile outage left behind is
still closed out (final review recommendation 5).

Every decision is taken on a fresh read of the record, and only about the
Batch job the evidence describes, for the attempt that read found: the
sweep's list can predate an event's settlement and an owner's retry, and
its copy must never fail or settle the retry (fix round 1). One job that
cannot be reconciled (a throttle, ECS gone with its compute environment) is
reported and skipped; the rest of the sweep and its alert carry on.
"""
from datetime import datetime, timedelta, timezone

from jobs.batch_runner import MAX_VCPUS
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
# The sweep's once-a-day look across every month runs in this UTC hour's
# first quarter: the 15-minute schedule puts exactly one sweep there.
DEEP_SWEEP_HOUR = 0


def _ms(value):
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


def _parse(text):
    return datetime.strptime(text, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def attempt_seconds(attempt: dict, ecs) -> int:
    """Billed seconds for one Batch attempt (0 if it never got a task)."""
    task_arn = (attempt.get('container') or {}).get('taskArn')
    if task_arn:
        cluster = task_arn.split('/')[1]          # arn:aws:ecs:<region>:<account>:task/<cluster>/<id>
        try:
            tasks = ecs.describe_tasks(cluster=cluster, tasks=[task_arn]).get('tasks', [])
        except Exception:
            # ECS refusing to answer (ClusterNotFoundException once Batch has
            # replaced its compute environment, a throttle) is ECS having
            # forgotten the task as far as the bill goes: Batch's times stand.
            tasks = []
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


def own_queue(rec: dict, others: list) -> tuple[int, str | None]:
    """What this app's own jobs are doing on `rec`'s queue: the vCPUs held
    by those running there or queued ahead of it, and when the last one
    there to end ended (None if none has). A job behind `rec` holds nothing
    it needs, so two waiting jobs never excuse each other for ever."""
    capacity, place = rec['sizing']['capacity'], (rec['submittedAt'], rec['key'])
    held, freed = 0, None
    for o in others:
        if o['key'] == rec['key'] or o['sizing']['capacity'] != capacity:
            continue
        if o['status'] in ACTIVE:
            if o['status'] == 'RUNNING' or (o['submittedAt'], o['key']) < place:
                held += o['sizing']['vcpu']
        elif o.get('endedAt') and (freed is None or o['endedAt'] > freed):
            freed = o['endedAt']
    return held, freed


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


def _usd(micros: int) -> str:
    return f'${micros / 1e6:.6f}'


class Reconciler:
    def __init__(self, store, batch, ecs, now=utc_now, notify=None):
        self.store, self.batch, self.ecs, self.now = store, batch, ecs, now
        self.notify = notify or (lambda subject, message: None)

    def _describe(self, job_ids, errors=None):
        """DescribeJobs, 100 ids a call (its limit). With `errors`, a call
        that fails marks its ids there instead of raising: the sweep must
        not read "Batch did not answer" as "Batch has forgotten the job"."""
        found = {}
        ids = list(dict.fromkeys(j for j in job_ids if j))
        for i in range(0, len(ids), 100):
            chunk = ids[i:i + 100]
            try:
                jobs = self.batch.describe_jobs(jobs=chunk)['jobs']
            except Exception as e:
                if errors is None:
                    raise
                errors.update({j: f'error: DescribeJobs: {type(e).__name__}: {e}' for j in chunk})
                continue
            found.update({job['jobId']: job for job in jobs})
        return found

    def _settle(self, rec, cost):
        """Settles the attempt `rec` was read at, and no other; returns
        (settled, a line for the alert when the charge passed the reservation)."""
        if not self.store.settle(rec['key'], cost, attempt=rec['attempt']):
            return False, None
        if cost > rec['reservedMicros']:
            # The cap admits a job by its reservation, so a charge above it
            # is spending the cap never agreed to (a timeout's stop grace, a
            # slow pull): the month's meter may now be over its cap.
            return True, (f'charged {_usd(cost)} against a reservation of {_usd(rec["reservedMicros"])}; '
                          "the month's cap may have been passed")
        return True, None

    def _fail_and_settle(self, rec, error, cost):
        self.store.update_job(rec['key'], {'status': 'FAILED', 'endedAt': iso(self.now()), 'stage': None,
                                           'error': error}, expect_status=ACTIVE, attempt=rec['attempt'])
        return self._settle(rec, cost)

    def _no_batch_job(self, rec, now):
        age = now - _parse(rec['submittedAt'])
        job_id = rec.get('runnerJobId')
        if not job_id and rec['status'] in ('QUEUED', 'STARTING'):
            if age > timedelta(seconds=SUBMIT_GRACE_SECONDS):
                _, over = self._fail_and_settle(rec, {'code': 'submit-lost', 'message':
                                                      'no AWS Batch job was recorded for it within '
                                                      f'{SUBMIT_GRACE_SECONDS // 60} minutes of submission'}, 0)
                return 'failed-submit-lost', over
            return 'no-batch-job', None
        if not job_id and rec['status'] not in ACTIVE:
            # M1: ended but never settled, and no claim can run it now (a
            # claim needs QUEUED or STARTING): close the money out.
            if age > timedelta(seconds=SUBMIT_GRACE_SECONDS):
                _, over = self._settle(rec, _reported_cost_micros(rec))
                return 'settled-no-batch-job', over
            return 'no-batch-job', None
        # A Batch job id Batch no longer describes, or (M2) a RUNNING record
        # whose worker could not write its id down: a day outlasts any
        # job's every attempt, after which nothing of it can still run.
        if age <= timedelta(seconds=BATCH_LOST_SECONDS):
            return 'no-batch-job', None
        cost = _reported_cost_micros(rec)
        if rec['status'] in ACTIVE:
            which = f'AWS Batch no longer knows job {job_id}' if job_id else \
                'its AWS Batch job id was never recorded and its worker has gone quiet'
            _, over = self._fail_and_settle(rec, {'code': 'batch-lost', 'message':
                                                  f'{which}, so how it ended is unknown; charged for what the '
                                                  'worker reported running.'}, cost)
            return 'failed-batch-lost', over
        # The worker wrote its result but the settlement was missed: the
        # result stands, only the money is closed out.
        _, over = self._settle(rec, cost)
        return 'settled-batch-lost', over

    def _months(self, now):
        return sorted({month_of(now), month_of(now.replace(day=1) - timedelta(days=1))})

    def _reconcile(self, record, batch_job, others=None):
        """Returns (outcome, the record as re-read before acting, the
        over-reservation line or None). `others` is the sweep's list of this
        and last month's records; an event lists them only if it needs them."""
        now = self.now()
        # The caller's copy may predate an event's settlement and an owner's
        # retry (the sweep lists, describes, then acts): decide on a fresh
        # read, and only about the Batch job the evidence was looked up for.
        rec = self.store.get_job(record['key'])
        if rec is None:
            return 'not-ours', record, None
        if rec['settled']:
            return 'already-settled', rec, None
        looked_up = batch_job['jobId'] if batch_job is not None else record.get('runnerJobId')
        if rec.get('runnerJobId') != looked_up:
            return 'superseded', rec, None
        if batch_job is None:
            outcome, over = self._no_batch_job(rec, now)
            return outcome, rec, over
        key, status = rec['key'], batch_job['status']
        if status in ENDED:
            cost = job_cost_micros(rec, batch_job, self.ecs)
            if rec['status'] in ACTIVE:
                self.store.update_job(key, {'status': 'FAILED', 'endedAt': iso(now), 'stage': None,
                                            'error': failure(batch_job)}, expect_status=ACTIVE, attempt=rec['attempt'])
            settled, over = self._settle(rec, cost)
            return ('settled' if settled else 'already-settled'), rec, over
        if status in WAITING or status == 'STARTING':
            self.store.update_job(key, {'status': 'STARTING'}, expect_status={'QUEUED'}, attempt=rec['attempt'])
            stops = [a['stoppedAt'] for a in batch_job.get('attempts', []) if a.get('stoppedAt')]
            since = _ms(max([batch_job['createdAt'], *stops]))
            limit = timedelta(seconds=RUNNABLE_LIMIT_SECONDS)
            if status in WAITING and now - since > limit:
                if others is None:
                    others = [r for m in self._months(now) for r in self.store.list_jobs(m)]
                held, freed = own_queue(rec, others)
                if held + rec['sizing']['vcpu'] > MAX_VCPUS:
                    return 'waiting-own-jobs', rec, None     # the queue is full of our own work
                if freed:
                    since = max(since, _parse(freed))         # room may only just have been made
            if status in WAITING and now - since > limit:
                s, minutes = rec['sizing'], RUNNABLE_LIMIT_SECONDS // 60
                self.batch.terminate_job(jobId=batch_job['jobId'],
                                         reason=f'No Fargate capacity for {minutes} minutes (reconcile)')
                cost = job_cost_micros(rec, batch_job, self.ecs)
                spent = ('nothing ran, so nothing was charged' if cost == 0 else
                         f'only its earlier, interrupted attempts ran, and they were charged {_usd(cost)}')
                fargate = 'Fargate Spot' if s['capacity'] == 'spot' else 'Fargate'
                _, over = self._fail_and_settle(rec, {'code': 'no-capacity', 'message':
                                                      f'AWS Batch could not start it for {minutes} minutes: '
                                                      f'{fargate} had no room for {s["vcpu"]} vCPU / '
                                                      f'{s["memoryGB"]} GB (AWS capacity, or the account\'s '
                                                      "Fargate vCPU quota; this app's own jobs were not holding "
                                                      f'the queue\'s {MAX_VCPUS} vCPUs); {spent}. Retry later.'},
                                                cost)
                return 'failed-no-capacity', rec, over
            return 'waiting', rec, None
        return 'running', rec, None

    def reconcile(self, record: dict, batch_job: dict | None) -> str:
        """One job; returns what it did (tests and logs read this)."""
        return self._reconcile(record, batch_job)[0]

    def on_event(self, detail: dict) -> str:
        """A "Batch Job State Change" event's detail (the DescribeJobs shape).
        An exception here is left to propagate: the Lambda's own retry runs
        the event again, and the sweep catches it if those fail too."""
        env = {e['name']: e['value'] for e in (detail.get('container') or {}).get('environment', [])}
        key = env.get('JOB_KEY') or (detail.get('tags') or {}).get('jobKey')
        record = self.store.get_job(key) if key else None
        if record is None or record.get('runnerJobId') != detail['jobId']:
            return 'not-ours'           # another app's job, or an earlier Batch job of a retried key
        outcome, rec, over = self._reconcile(record, self._describe([detail['jobId']]).get(detail['jobId']))
        if over:
            # The sweep never sees a job the event settled, so the event says it.
            self.notify('Orbital viewer: a job cost more than it reserved', f'{key} {rec["formula"]}: {over}')
        return outcome

    @staticmethod
    def _why(rec, result, now):
        """The alert's line for one job, by what actually happened to it."""
        if result.startswith('error: '):
            return f'reconcile could not check it ({result[len("error: "):]}); the next sweep tries again'
        if result == 'failed-no-capacity':
            return (f'no Fargate capacity for {RUNNABLE_LIMIT_SECONDS // 60} minutes, with none of this app\'s own '
                    'jobs holding its queue: its Batch job was terminated and the job FAILED no-capacity')
        if result == 'failed-submit-lost':
            return ('no AWS Batch job recorded (the api stopped between its transaction and SubmitJob, or before '
                    'writing the id down): FAILED submit-lost')
        if result == 'settled-no-batch-job':
            return (f'{rec["status"]} with no AWS Batch job recorded and never settled (a settle that failed): '
                    'settled now at what its worker reported running')
        known = f'job {rec["runnerJobId"]}' if rec.get('runnerJobId') else 'its job (its id was never recorded)'
        if result == 'failed-batch-lost':
            return f'AWS Batch no longer knows {known}: FAILED batch-lost, charged what its worker reported running'
        if result == 'settled-batch-lost':
            return (f'AWS Batch no longer knows {known} and the {rec["status"]} job was never '
                    'settled: settled now at what its worker reported running')
        if result == 'settled' and rec['status'] in ACTIVE:
            return ('Batch ended it without the worker reporting, and no Batch event settled it (an event was '
                    'missed): FAILED and settled now')
        if result == 'running' and rec.get('heartbeatAt') and \
                now - _parse(rec['heartbeatAt']) > timedelta(seconds=STALE_HEARTBEAT_SECONDS):
            # Not de-duplicated (that needs state the sweep does not keep):
            # repeated each sweep until the job's timeout ends it.
            return (f'Batch says RUNNING but its worker has been silent since {rec["heartbeatAt"]}; left for its '
                    'timeout to end, and reported at each sweep until then')
        return None

    def sweep(self) -> dict:
        now = self.now()
        months = self._months(now)
        everything = [r for m in months for r in self.store.list_jobs(m)]
        records = [r for r in everything if r['status'] in ACTIVE or not r['settled']]
        if now.hour == DEEP_SWEEP_HOUR and now.minute < 15:
            # Recommendation 5: a Scan, so once a day, not every sweep.
            records += [r for r in self.store.jobs_with_backend('aws')
                        if r['month'] < months[0] and (r['status'] in ACTIVE or not r['settled'])]
        errors = {}
        jobs = self._describe([r.get('runnerJobId') for r in records], errors)
        outcome, stale = {}, []
        for r in records:
            rec, over = r, None
            if r.get('runnerJobId') in errors:
                result = errors[r['runnerJobId']]
            else:
                try:
                    result, rec, over = self._reconcile(r, jobs.get(r.get('runnerJobId')), everything)
                except Exception as e:
                    # One job's failure (a throttle, ECS gone with its compute
                    # environment) must not cost every later job its check
                    # and the alert its message: the oldest bad record would
                    # otherwise be hit first on every sweep, for ever.
                    result = f'error: {type(e).__name__}: {e}'
            outcome[r['key']] = result
            for line in (self._why(rec, result, now), over):
                if line:
                    stale.append(f'{r["key"]} {r["formula"]}: {line}')
        if stale:
            self.notify('Orbital viewer: reconcile found jobs that need a look',
                        'The 15-minute reconcile sweep acted on or flagged these jobs:\n' + '\n'.join(stale))
        return {'checked': len(records), 'outcome': outcome, 'stale': stale}
