from datetime import datetime, timedelta, timezone

import pytest

from jobs.model import iso, new_record
from jobs.prices import cost_micros
from jobs.reconcile import RUNNABLE_LIMIT_SECONDS, Reconciler, attempt_seconds, failure
from jobs.tests.stores import make_store

T0 = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
KEY = 'a' * 64
DECISION = {'version': 1, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot', 'attempts': 3,
            'basisFunctions': 58, 'predictedSeconds': 20.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 30_000, 'predictedCostMicros': 10}
TASK = 'arn:aws:ecs:us-east-1:123456789012:task/AWSBatch-spot-abc/0123456789abcdef'


def ms(dt):
    return int(dt.timestamp() * 1000)


class Throttled(Exception):
    pass


class FakeBatch:
    def __init__(self, jobs, before_describe=None, fail_describe=False, fail_terminate=()):
        self.jobs, self.terminated, self.calls, self.sizes = {j['jobId']: j for j in jobs}, [], 0, []
        self.before_describe, self.fail_describe, self.fail_terminate = before_describe, fail_describe, fail_terminate

    def describe_jobs(self, jobs):
        self.calls += 1
        self.sizes.append(len(jobs))
        if self.fail_describe:
            raise Throttled('Rate exceeded')
        if self.before_describe:                # what happens elsewhere between the sweep's read and its act
            self.before_describe()
        return {'jobs': [self.jobs[j] for j in jobs if j in self.jobs]}

    def terminate_job(self, jobId, reason):
        if jobId in self.fail_terminate:
            raise Throttled('Rate exceeded')
        self.terminated.append((jobId, reason))


class FakeEcs:
    def __init__(self, tasks=None, error=None):
        self.tasks, self.error = tasks or {}, error

    def describe_tasks(self, cluster, tasks):
        assert cluster == 'AWSBatch-spot-abc'
        if self.error:
            raise self.error
        return {'tasks': [self.tasks[t] for t in tasks if t in self.tasks]}


def batch_job(status, attempts=(), created=T0, reason=None):
    job = {'jobId': 'job-1', 'status': status, 'createdAt': ms(created), 'attempts': list(attempts),
           'container': {'environment': [{'name': 'JOB_KEY', 'value': KEY}]}}
    if reason:
        job['statusReason'] = reason
    return job


def attempt(start, seconds, reason='Essential container in task exited', container_reason=None, task=TASK):
    a = {'container': {'taskArn': task}, 'startedAt': ms(start), 'stoppedAt': ms(start + timedelta(seconds=seconds)),
         'statusReason': reason}
    if container_reason:
        a['container']['reason'] = container_reason
    return a


def water(now=T0, key=KEY):
    return new_record(key=key, job={'recipe': 'single'}, decision=DECISION, name='water', formula='H2O',
                      electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=now)


# Reconcile runs on DynamoStore in AWS and on FileStore in the tests' own
# terms; every store-backed test runs on both (preflight D25).
@pytest.fixture(params=['file', 'dynamo'])
def empty_store(request, tmp_path):
    with make_store(request.param, tmp_path, cap_micros=8_800_000) as s:
        yield s


@pytest.fixture
def store(empty_store):
    empty_store.create_job(water())
    empty_store.update_job(KEY, {'runnerJobId': 'job-1'})
    return empty_store


def reconciler(store, jobs, tasks=None, now=T0 + timedelta(minutes=10), notes=None):
    return Reconciler(store, FakeBatch(jobs), FakeEcs(tasks), now=lambda: now,
                      notify=(lambda s, m: notes.append((s, m))) if notes is not None else None)


def test_billed_seconds_come_from_the_ecs_pull_start():
    ecs = FakeEcs({TASK: {'pullStartedAt': T0, 'stoppedAt': T0 + timedelta(seconds=150.2)}})
    assert attempt_seconds(attempt(T0 + timedelta(seconds=40), 100), ecs) == 151
    # ECS forgot the task: Batch's run time plus a minute for the pull.
    assert attempt_seconds(attempt(T0, 100), FakeEcs()) == 160
    assert attempt_seconds({'container': {}}, FakeEcs()) == 0
    assert attempt_seconds(attempt(T0, 5), FakeEcs({TASK: {'pullStartedAt': T0, 'stoppedAt': T0 + timedelta(seconds=5)}})) == 60


def test_done_job_settles_at_billed_seconds_once(store):
    store.update_job(KEY, {'status': 'DONE'})
    job = batch_job('SUCCEEDED', [attempt(T0, 170)])
    tasks = {TASK: {'pullStartedAt': T0, 'stoppedAt': T0 + timedelta(seconds=200)}}
    r = reconciler(store, [job], tasks)
    assert r.on_event(job) == 'settled'
    assert r.on_event(job) == 'already-settled'                       # EventBridge delivers at least once
    expected = cost_micros('spot', 2, 8, 200)
    assert store.get_job(KEY)['actualMicros'] == expected
    assert store.meter('2026-10') == {'spent': expected, 'reserved': 0, 'committed': expected, 'cap': 8_800_000}


def test_spot_reclaimed_twice_then_ended_is_failed_with_batchs_reason_and_charged_for_all_three(store):
    store.claim(KEY, 3, T0)
    spot = 'Your Spot Task was interrupted.'
    job = batch_job('FAILED', [attempt(T0, 100, spot), attempt(T0, 100, spot), attempt(T0, 100, spot)], reason=spot)
    assert reconciler(store, [job]).on_event(job) == 'settled'
    rec = store.get_job(KEY)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'spot-interrupted'
    assert rec['actualMicros'] == 3 * cost_micros('spot', 2, 8, 160)


@pytest.mark.parametrize('reason,container,code', [
    ('Essential container in task exited', 'OutOfMemoryError: Container killed due to memory usage', 'out-of-memory'),
    ('Job attempt duration exceeded timeout', None, 'timed-out'),
    ('CannotPullContainerError: pull image manifest', None, 'batch-failed'),
])
def test_failure_codes(reason, container, code):
    assert failure(batch_job('FAILED', [attempt(T0, 10, reason, container)]))['code'] == code


def test_succeeded_without_a_report_is_a_lost_worker(store):
    store.claim(KEY, 1, T0)
    job = batch_job('SUCCEEDED', [attempt(T0, 30)])
    reconciler(store, [job]).on_event(job)
    assert store.get_job(KEY)['error']['code'] == 'worker-lost' and store.get_job(KEY)['settled']


def test_runnable_moves_queued_to_starting_and_leaves_a_spot_retry_alone(store):
    job = batch_job('RUNNABLE')
    assert reconciler(store, [job]).on_event(job) == 'waiting'
    assert store.get_job(KEY)['status'] == 'STARTING'
    store.claim(KEY, 1, T0)
    retry = batch_job('RUNNABLE', [attempt(T0, 100, 'Your Spot Task was interrupted.')])
    assert reconciler(store, [retry]).on_event(retry) == 'waiting'
    assert store.get_job(KEY)['status'] == 'RUNNING' and not store.get_job(KEY)['settled']


def test_stuck_runnable_is_cancelled_failed_and_settled_at_zero(store):
    job = batch_job('RUNNABLE')
    late = T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 1)
    r = reconciler(store, [job], now=late)
    assert r.on_event(job) == 'failed-no-capacity'
    assert r.batch.terminated and r.batch.terminated[0][0] == 'job-1'
    rec = store.get_job(KEY)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'no-capacity'
    assert 'nothing was charged' in rec['error']['message']
    assert rec['settled'] and rec['actualMicros'] == 0 and store.meter('2026-10')['reserved'] == 0


def test_stuck_runnable_after_a_reclaim_says_what_the_reclaimed_attempt_cost(store):
    store.claim(KEY, 1, T0)
    late = T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 200)
    retry = batch_job('RUNNABLE', [attempt(T0, 100, 'Your Spot Task was interrupted.')])
    assert reconciler(store, [retry], now=late).on_event(retry) == 'failed-no-capacity'
    rec = store.get_job(KEY)
    charged = cost_micros('spot', 2, 8, 160)
    assert rec['actualMicros'] == charged
    assert 'nothing was charged' not in rec['error']['message'] and f'${charged / 1e6:.6f}' in rec['error']['message']


def test_runnable_clock_restarts_after_a_reclaimed_attempt(store):
    store.claim(KEY, 1, T0)
    late = T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 600)
    retry = batch_job('RUNNABLE', [attempt(late - timedelta(seconds=700), 600, 'Your Spot Task was interrupted.')])
    assert reconciler(store, [retry], now=late).on_event(retry) == 'waiting'


def test_events_for_other_jobs_are_ignored(store):
    other = {**batch_job('FAILED'), 'jobId': 'job-0'}                 # an earlier Batch job of a retried key
    assert reconciler(store, [other]).on_event(other) == 'not-ours'
    assert reconciler(store, []).on_event({'jobId': 'x', 'status': 'FAILED', 'container': {}}) == 'not-ours'


def test_sweep_catches_a_missed_event_across_the_month_boundary_and_says_so(empty_store):
    store = empty_store
    september = datetime(2026, 9, 30, 23, 50, tzinfo=timezone.utc)
    store.create_job(water(now=september))
    store.update_job(KEY, {'runnerJobId': 'job-1'})
    store.claim(KEY, 1, september)
    job = batch_job('FAILED', [attempt(september, 300, container_reason='OutOfMemoryError: killed')], created=september)
    notes = []
    result = reconciler(store, [job], now=datetime(2026, 10, 1, 0, 15, tzinfo=timezone.utc), notes=notes).sweep()
    assert result['outcome'] == {KEY: 'settled'} and len(result['stale']) == 1
    assert 'event was missed' in result['stale'][0]
    assert store.get_job(KEY)['error']['code'] == 'out-of-memory'
    assert store.meter('2026-09')['spent'] == cost_micros('spot', 2, 8, 360) and store.meter('2026-10')['spent'] == 0
    assert notes and KEY in notes[0][1]


def test_sweep_fails_a_job_that_never_reached_batch(store):
    store.update_job(KEY, {'runnerJobId': None})
    result = reconciler(store, [], now=T0 + timedelta(minutes=11)).sweep()
    assert result['outcome'] == {KEY: 'failed-submit-lost'} and store.get_job(KEY)['settled']


def test_sweep_flags_a_silent_running_worker_without_failing_it(store):
    store.claim(KEY, 1, T0)
    notes = []
    result = reconciler(store, [batch_job('RUNNING')], now=T0 + timedelta(minutes=6), notes=notes).sweep()
    assert result['outcome'] == {KEY: 'running'} and len(result['stale']) == 1
    assert store.get_job(KEY)['status'] == 'RUNNING' and notes


def test_quiet_sweep_sends_nothing(store):
    notes = []
    store.update_job(KEY, {'status': 'DONE'})
    store.settle(KEY, 10)
    assert reconciler(store, [], notes=notes).sweep()['checked'] == 0 and notes == []


# Preflight D28: Batch forgets a job about a week after it ends. A record it
# no longer describes must not hold its reservation for ever.
def test_a_job_batch_has_forgotten_waits_a_day(store):
    result = reconciler(store, [], now=T0 + timedelta(hours=23)).sweep()
    assert result['outcome'] == {KEY: 'no-batch-job'} and result['stale'] == []
    assert not store.get_job(KEY)['settled'] and store.meter('2026-10')['reserved'] == 30_000


def test_a_job_batch_has_forgotten_for_a_day_is_failed_settled_at_zero_and_reported(store):
    notes = []
    result = reconciler(store, [], now=T0 + timedelta(hours=25), notes=notes).sweep()
    assert result['outcome'] == {KEY: 'failed-batch-lost'} and len(result['stale']) == 1
    rec = store.get_job(KEY)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'batch-lost'
    assert rec['settled'] and rec['actualMicros'] == 0
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 0, 'committed': 0, 'cap': 8_800_000}
    assert notes and KEY in notes[0][1]


def test_a_forgotten_job_is_charged_for_what_its_worker_reported_running(store):
    store.claim(KEY, 1, T0)
    store.update_job(KEY, {'heartbeatAt': iso(T0 + timedelta(seconds=100))})
    result = reconciler(store, [], now=T0 + timedelta(hours=25)).sweep()
    assert result['outcome'] == {KEY: 'failed-batch-lost'}
    # Its worker's own start to its last word, plus the pull allowance.
    assert store.get_job(KEY)['actualMicros'] == cost_micros('spot', 2, 8, 160)


def test_a_forgotten_job_its_worker_finished_stays_done_and_is_settled(store):
    store.claim(KEY, 1, T0)
    store.update_job(KEY, {'status': 'DONE', 'endedAt': iso(T0 + timedelta(seconds=200))})
    result = reconciler(store, [], now=T0 + timedelta(hours=25)).sweep()
    assert result['outcome'] == {KEY: 'settled-batch-lost'} and len(result['stale']) == 1
    rec = store.get_job(KEY)
    assert rec['status'] == 'DONE' and rec['error'] is None
    assert rec['settled'] and rec['actualMicros'] == cost_micros('spot', 2, 8, 260)


# Fix round 1 (review of Task 5).

def test_a_sweep_holding_a_copy_from_before_an_owner_retry_leaves_the_retry_alone(store):
    # The sweep lists attempt 1 RUNNING under job-1; before it acts, the event
    # settles attempt 1 and the owner retries it as attempt 2 under job-2.
    store.claim(KEY, 1, T0)
    ended = batch_job('FAILED', [attempt(T0, 100, container_reason='OutOfMemoryError: killed')])

    def meanwhile():
        assert reconciler(store, [ended]).on_event(ended) == 'settled'
        store.requeue_failed(KEY, DECISION, T0 + timedelta(minutes=5))
        store.update_job(KEY, {'runnerJobId': 'job-2'})

    r = Reconciler(store, FakeBatch([ended], before_describe=meanwhile), FakeEcs(),
                   now=lambda: T0 + timedelta(minutes=10))
    assert r.sweep()['outcome'] == {KEY: 'superseded'}
    rec = store.get_job(KEY)
    assert rec['attempt'] == 2 and rec['status'] == 'QUEUED' and rec['error'] is None and not rec['settled']
    once = cost_micros('spot', 2, 8, 160)
    assert rec['actualMicros'] == once                                 # attempt 1 charged once, not twice
    assert store.meter('2026-10') == {'spent': once, 'reserved': 30_000, 'committed': once + 30_000,
                                      'cap': 8_800_000}               # attempt 2's reservation still held


def test_ecs_refusing_to_describe_falls_back_to_batch_times():
    # e.g. ClusterNotFoundException once Batch has replaced its compute environment
    gone = FakeEcs(error=Throttled('ClusterNotFoundException: Cluster not found.'))
    assert attempt_seconds(attempt(T0, 100), gone) == 160


def test_one_job_failing_to_reconcile_does_not_stop_the_sweep_or_its_alert(empty_store):
    store, stuck, ended = empty_store, 'b' * 64, 'c' * 64            # the bad one is listed first
    for key, job_id in ((stuck, 'job-b'), (ended, 'job-c')):
        store.create_job(water(key=key))
        store.update_job(key, {'runnerJobId': job_id})
    jobs = [{**batch_job('RUNNABLE'), 'jobId': 'job-b'}, {**batch_job('FAILED', [attempt(T0, 100)]), 'jobId': 'job-c'}]
    notes = []
    r = Reconciler(store, FakeBatch(jobs, fail_terminate={'job-b'}), FakeEcs(),
                   now=lambda: T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 1),
                   notify=lambda s, m: notes.append((s, m)))
    result = r.sweep()
    assert result['outcome'][stuck].startswith('error: ') and 'Rate exceeded' in result['outcome'][stuck]
    assert result['outcome'][ended] == 'settled'
    assert not store.get_job(stuck)['settled'] and store.get_job(ended)['settled']
    assert len(notes) == 1 and stuck in notes[0][1] and ended in notes[0][1]


def test_describe_jobs_failing_is_reported_and_never_read_as_batch_forgetting(store):
    notes = []
    r = Reconciler(store, FakeBatch([], fail_describe=True), FakeEcs(), now=lambda: T0 + timedelta(hours=25),
                   notify=lambda s, m: notes.append((s, m)))
    result = r.sweep()
    assert result['outcome'][KEY].startswith('error: ') and len(result['stale']) == 1 and notes
    assert store.get_job(KEY)['status'] == 'QUEUED' and not store.get_job(KEY)['settled']


def test_a_charge_above_the_reservation_is_reported_from_the_event(store):
    store.update_job(KEY, {'status': 'DONE'})
    job = batch_job('SUCCEEDED', [attempt(T0, 3 * 3600)])
    notes = []
    assert reconciler(store, [job], notes=notes).on_event(job) == 'settled'
    over = cost_micros('spot', 2, 8, 3 * 3600 + 60)
    assert over > 30_000 and store.get_job(KEY)['actualMicros'] == over
    assert len(notes) == 1 and KEY in notes[0][1] and 'cap may have been passed' in notes[0][1]


def test_a_charge_above_the_reservation_is_reported_by_the_sweep(store):
    store.update_job(KEY, {'status': 'DONE'})
    job = batch_job('SUCCEEDED', [attempt(T0, 3 * 3600)])
    result = reconciler(store, [job]).sweep()
    assert result['outcome'] == {KEY: 'settled'} and len(result['stale']) == 1
    assert 'cap may have been passed' in result['stale'][0]


def test_a_charge_within_the_reservation_sends_nothing(store):
    store.update_job(KEY, {'status': 'DONE'})
    job = batch_job('SUCCEEDED', [attempt(T0, 100)])
    notes = []
    assert reconciler(store, [job], notes=notes).on_event(job) == 'settled' and notes == []


def test_each_stale_line_names_its_own_cause(empty_store):
    store, stuck, silent = empty_store, 'b' * 64, 'c' * 64
    for key, job_id in ((stuck, 'job-b'), (silent, 'job-c')):
        store.create_job(water(key=key))
        store.update_job(key, {'runnerJobId': job_id})
    store.claim(silent, 1, T0)
    jobs = [{**batch_job('RUNNABLE'), 'jobId': 'job-b'}, {**batch_job('RUNNING'), 'jobId': 'job-c'}]
    result = Reconciler(store, FakeBatch(jobs), FakeEcs(),
                        now=lambda: T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 1)).sweep()
    lines = dict(line.split(': ', 1) for line in result['stale'])
    assert 'no Fargate capacity' in lines[f'{stuck} H2O'] and 'missed' not in lines[f'{stuck} H2O']
    assert 'silent since' in lines[f'{silent} H2O'] and 'missed' not in lines[f'{silent} H2O']


def test_sweep_describes_batch_jobs_a_hundred_at_a_time(empty_store):
    store, keys = empty_store, [f'{i:064x}' for i in range(101)]
    for i, key in enumerate(keys):
        store.create_job(water(key=key))
        store.update_job(key, {'runnerJobId': f'job-{i}'})
    batch = FakeBatch([{**batch_job('RUNNABLE'), 'jobId': f'job-{i}'} for i in range(101)])
    result = Reconciler(store, batch, FakeEcs(), now=lambda: T0 + timedelta(minutes=10)).sweep()
    assert sorted(batch.sizes) == [1, 100]
    assert result['checked'] == 101 and set(result['outcome'].values()) == {'waiting'}


# Final review I1: each compute environment is capped at MAX_VCPUS, so a job
# can wait behind this app's own work; that wait is not AWS's want of capacity.

XL = {**DECISION, 'size': 'XL', 'vcpu': 32, 'memoryGB': 244}


def queued(store, key, job_id, decision=DECISION, now=T0):
    rec = new_record(key=key, job={'recipe': 'single'}, decision=decision, name='m', formula='H2O',
                     electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=now)
    store.create_job(rec)
    store.update_job(key, {'runnerJobId': job_id})


def test_a_job_queued_behind_this_apps_own_running_job_waits_on(empty_store):
    store, big, small = empty_store, 'b' * 64, 'c' * 64
    queued(store, big, 'job-b', XL)
    store.claim(big, 1, T0)
    late = T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 60)
    store.update_job(big, {'heartbeatAt': iso(late)})
    queued(store, small, 'job-c', now=T0 + timedelta(seconds=1))
    jobs = [{**batch_job('RUNNING'), 'jobId': 'job-b'}, {**batch_job('RUNNABLE'), 'jobId': 'job-c'}]
    r = Reconciler(store, FakeBatch(jobs), FakeEcs(), now=lambda: late)
    result = r.sweep()
    assert result['outcome'] == {big: 'running', small: 'waiting-own-jobs'} and result['stale'] == []
    assert r.batch.terminated == [] and not store.get_job(small)['settled']


def test_own_jobs_on_the_other_queue_do_not_excuse_the_wait(empty_store):
    store, big, small = empty_store, 'b' * 64, 'c' * 64
    queued(store, big, 'job-b', {**XL, 'capacity': 'on-demand'})
    store.claim(big, 1, T0)
    queued(store, small, 'job-c')
    jobs = [{**batch_job('RUNNING'), 'jobId': 'job-b'}, {**batch_job('RUNNABLE'), 'jobId': 'job-c'}]
    r = Reconciler(store, FakeBatch(jobs), FakeEcs(), now=lambda: T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 60))
    assert r.sweep()['outcome'][small] == 'failed-no-capacity'
    message = store.get_job(small)['error']['message']
    assert "this app's own jobs were not holding" in message and 'Fargate Spot' in message


def test_the_wait_clock_restarts_when_an_own_job_on_the_queue_ends(empty_store):
    store, big, small = empty_store, 'b' * 64, 'c' * 64
    queued(store, big, 'job-b', XL)
    store.claim(big, 1, T0)
    store.update_job(big, {'status': 'DONE', 'endedAt': iso(T0 + timedelta(minutes=40))})
    store.settle(big, 0)
    queued(store, small, 'job-c', now=T0 + timedelta(seconds=1))
    job = {**batch_job('RUNNABLE'), 'jobId': 'job-c', 'container': {'environment': [{'name': 'JOB_KEY', 'value': small}]}}
    assert reconciler(store, [job], now=T0 + timedelta(minutes=50)).on_event(job) == 'waiting'
    late = T0 + timedelta(minutes=40, seconds=RUNNABLE_LIMIT_SECONDS + 1)
    assert reconciler(store, [job], now=late).on_event(job) == 'failed-no-capacity'


def test_two_waiting_jobs_never_excuse_each_other(empty_store):
    # Both XL, neither started (AWS really has no capacity): the one ahead is
    # judged on AWS alone; the one behind waits for it, then for its own clock.
    store, first, second = empty_store, 'b' * 64, 'c' * 64
    queued(store, first, 'job-b', XL)
    queued(store, second, 'job-c', XL, now=T0 + timedelta(seconds=1))
    jobs = [{**batch_job('RUNNABLE'), 'jobId': 'job-b'}, {**batch_job('RUNNABLE'), 'jobId': 'job-c'}]
    late = T0 + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 60)
    r = Reconciler(store, FakeBatch(jobs), FakeEcs(), now=lambda: late)
    assert r.sweep()['outcome'] == {first: 'failed-no-capacity', second: 'waiting-own-jobs'}
    # The next sweep sees the first ended just now: the second's clock starts again from there.
    r.now = lambda: late + timedelta(minutes=15)
    assert r.sweep()['outcome'] == {second: 'waiting'}
    r.now = lambda: late + timedelta(seconds=RUNNABLE_LIMIT_SECONDS + 1)
    assert r.sweep()['outcome'] == {second: 'failed-no-capacity'}


# Final review M1/M2: a record whose Batch job id was never written.

def test_a_failed_record_whose_settle_was_lost_is_settled_at_zero(store):
    # The api's submit-failed write landed, its settle did not: the reservation
    # would otherwise be stranded and every owner retry refused for ever.
    store.update_job(KEY, {'runnerJobId': None, 'status': 'FAILED',
                           'error': {'code': 'submit-failed', 'message': 'Batch said no'}})
    assert reconciler(store, [], now=T0 + timedelta(minutes=5)).sweep()['outcome'] == {KEY: 'no-batch-job'}
    result = reconciler(store, [], now=T0 + timedelta(minutes=11)).sweep()
    assert result['outcome'] == {KEY: 'settled-no-batch-job'} and len(result['stale']) == 1
    rec = store.get_job(KEY)
    assert rec['settled'] and rec['actualMicros'] == 0 and rec['error']['code'] == 'submit-failed'
    assert store.meter('2026-10')['reserved'] == 0
    store.requeue_failed(KEY, DECISION, T0 + timedelta(minutes=12))          # the owner can retry again


def test_a_running_record_without_a_batch_job_id_is_left_to_its_worker(store):
    # The api timed out after SubmitJob (M2): the worker claimed the job, so
    # it is running even though the api never wrote the id down.
    store.update_job(KEY, {'runnerJobId': None})
    store.claim(KEY, 1, T0 + timedelta(minutes=9))
    result = reconciler(store, [], now=T0 + timedelta(minutes=20)).sweep()
    assert result['outcome'] == {KEY: 'no-batch-job'}
    assert store.get_job(KEY)['status'] == 'RUNNING' and not store.get_job(KEY)['settled']


def test_a_running_record_without_an_id_is_closed_out_after_a_day(store):
    store.update_job(KEY, {'runnerJobId': None})
    store.claim(KEY, 1, T0)
    store.update_job(KEY, {'heartbeatAt': iso(T0 + timedelta(seconds=100))})
    result = reconciler(store, [], now=T0 + timedelta(hours=25)).sweep()
    assert result['outcome'] == {KEY: 'failed-batch-lost'}
    rec = store.get_job(KEY)
    assert rec['settled'] and rec['actualMicros'] == cost_micros('spot', 2, 8, 160)
    assert 'None' not in rec['error']['message'] and 'None' not in result['stale'][0]


# Final review recommendation 5: an unsettled record older than last month.

def test_the_daily_sweep_finds_unsettled_records_from_older_months(empty_store):
    store, august = empty_store, datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
    store.create_job(water(now=august))
    store.update_job(KEY, {'runnerJobId': 'job-1', 'status': 'DONE', 'endedAt': iso(august + timedelta(seconds=100))})
    job = batch_job('SUCCEEDED', [attempt(august, 100)], created=august)
    midday = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
    assert Reconciler(store, FakeBatch([job]), FakeEcs(), now=lambda: midday).sweep()['checked'] == 0
    just_after_midnight = datetime(2026, 10, 6, 0, 7, tzinfo=timezone.utc)
    result = Reconciler(store, FakeBatch([job]), FakeEcs(), now=lambda: just_after_midnight).sweep()
    assert result['outcome'] == {KEY: 'settled'}
    assert store.get_job(KEY)['settled'] and store.meter('2026-08')['spent'] == cost_micros('spot', 2, 8, 160)


# --- Phase 6C quotes: a quoted job is charged line by line, never above its approved maximum; ---
# --- what AWS bills beyond it is absorbed by the app and reported. ---

def quoted_store(store_, option='spot'):
    from jobs import quotes
    from jobs.canonical import canonical_job
    job = canonical_job('single', [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]], 0, 1)
    chosen = quotes.find(quotes.quote(job, KEY, 'aws'), option)
    store_.create_job(new_record(key=KEY, job=job, decision=quotes.decision(chosen), name='water', formula='H2O',
                                 electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=T0,
                                 quote=quotes.approved(chosen, iso(T0))))
    store_.update_job(KEY, {'runnerJobId': 'job-1'})
    return chosen


def test_a_quoted_job_settles_at_billed_compute_plus_its_measured_storage_and_delivery(empty_store):
    from jobs.prices import delivery_micros, storage_micros
    quoted_store(empty_store)
    empty_store.update_job(KEY, {'status': 'DONE', 'actual': {'wallSeconds': 15.0, 'resultBytes': 1_450_955,
                                                              'resultObjects': 13}})
    job = batch_job('SUCCEEDED', [attempt(T0, 170)])
    notes = []
    assert reconciler(empty_store, [job], {TASK: {'pullStartedAt': T0, 'stoppedAt': T0 + timedelta(seconds=200)}},
                      notes=notes).on_event(job) == 'settled'
    rec = empty_store.get_job(KEY)
    compute = cost_micros('spot', 2, 8, 200)
    expected = compute + storage_micros(1_450_955, 12, 13) + delivery_micros(14_509_550, 130)
    assert rec['settlement']['costMicros'] == rec['settlement']['chargedMicros'] == expected == rec['actualMicros']
    assert notes == []


def test_a_quoted_job_billed_past_its_maximum_is_charged_the_maximum_and_reported(empty_store):
    chosen = quoted_store(empty_store, option='on-demand')
    empty_store.update_job(KEY, {'status': 'DONE', 'actual': {'resultBytes': 1_000_000, 'resultObjects': 13}})
    job = batch_job('SUCCEEDED', [attempt(T0, 3 * 3600)])
    notes = []
    assert reconciler(empty_store, [job], notes=notes).on_event(job) == 'settled'
    s = empty_store.get_job(KEY)['settlement']
    compute_max = chosen['lines'][0]['maximumMicros']
    assert s['lines'][0]['chargedMicros'] == compute_max and s['absorbedMicros'] > 0
    assert s['chargedMicros'] <= chosen['maximumMicros']
    assert len(notes) == 1 and 'approved maximum' in notes[0][1] and 'absorbs' in notes[0][1]


def test_the_sweep_reports_an_absorbed_charge_too(empty_store):
    quoted_store(empty_store, option='on-demand')
    empty_store.update_job(KEY, {'status': 'DONE', 'actual': {'resultBytes': 1_000_000, 'resultObjects': 13}})
    result = reconciler(empty_store, [batch_job('SUCCEEDED', [attempt(T0, 3 * 3600)])]).sweep()
    assert result['outcome'] == {KEY: 'settled'} and len(result['stale']) == 1 and 'absorbs' in result['stale'][0]
