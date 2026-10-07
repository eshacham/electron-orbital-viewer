import threading
from datetime import datetime, timezone

import pytest

from jobs.errors import JobRefused
from jobs.model import new_record, public_view
from jobs.store import BudgetExhausted
from jobs.tests.stores import make_store

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot', 'attempts': 3,
            'basisFunctions': 58, 'predictedSeconds': 20.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 1_000, 'predictedCostMicros': 10}


def record(key='a' * 64, reservation=1_000, now=NOW):
    return new_record(key=key, job={'recipe': 'single'}, decision={**DECISION, 'reservationMicros': reservation},
                      name='water', formula='H2O', electron_count=10,
                      geometry_source={'kind': 'pubchem', 'cid': 962}, backend='local', now=now)


@pytest.fixture(params=['file', 'dynamo'])
def store(request, tmp_path):
    with make_store(request.param, tmp_path, cap_micros=10_000) as s:
        s.kind = request.param
        yield s


def file_only(store):
    if store.kind != 'file':
        pytest.skip('FileStore internals (its one-write crash model, its temp files); DynamoDB transactions '
                    'are all-or-nothing by construction')


def test_create_get_and_dedupe(store):
    created, rec = store.create_job(record())
    assert created and rec['status'] == 'QUEUED' and rec['month'] == '2026-10'
    created, again = store.create_job(record())
    assert not created and again['key'] == rec['key']
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 1_000, 'committed': 1_000, 'cap': 10_000}


def test_cap_is_inclusive_and_refusal_leaves_no_reservation(store):
    assert store.create_job(record('a' * 64, 9_000))[0]
    assert store.create_job(record('b' * 64, 1_000))[0]          # lands exactly on the cap: accepted
    with pytest.raises(BudgetExhausted) as e:
        store.create_job(record('c' * 64, 1))
    assert e.value.code == 'budget'
    assert store.get_job('c' * 64) is None
    assert store.meter('2026-10')['committed'] == 10_000


def test_concurrent_create_reserves_once(store):
    if store.kind == 'dynamo':
        pytest.skip("moto's backend is not thread-safe; DynamoDB's conditional Put is the guarantee, "
                    'and test_create_get_and_dedupe exercises the same refusal path')
    results = []
    threads = [threading.Thread(target=lambda: results.append(store.create_job(record())[0])) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(True) == 1
    assert store.meter('2026-10')['reserved'] == 1_000


def test_settle_exactly_once(store):
    store.create_job(record())
    assert store.settle('a' * 64, 300)
    assert not store.settle('a' * 64, 300)
    assert store.meter('2026-10') == {'spent': 300, 'reserved': 0, 'committed': 300, 'cap': 10_000}
    assert store.get_job('a' * 64)['actualMicros'] == 300


def test_settle_for_an_attempt_a_retry_has_replaced_is_refused(store):
    # A reconciler costs one attempt's Batch job; once the owner has retried,
    # that figure must not close out the new attempt's reservation.
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED'})
    assert store.settle('a' * 64, 300, attempt=1)
    store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert not store.settle('a' * 64, 300, attempt=1)
    assert store.meter('2026-10') == {'spent': 300, 'reserved': 500, 'committed': 800, 'cap': 10_000}
    assert store.settle('a' * 64, 200, attempt=2)
    assert store.get_job('a' * 64)['actualMicros'] == 500


def test_claim_rules(store):
    store.create_job(record())
    assert store.claim('a' * 64, 1, NOW)
    assert not store.claim('a' * 64, 1, NOW)                      # a duplicate copy of attempt 1
    assert store.claim('a' * 64, 2, NOW)                          # a Batch retry after a Spot reclaim
    assert store.get_job('a' * 64)['attempt'] == 2


def test_requeue_only_failed_and_reserves_again(store):
    store.create_job(record())
    with pytest.raises(JobRefused) as e:
        store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert e.value.status == 409
    store.update_job('a' * 64, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'y'}})
    store.settle('a' * 64, 100)
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert rec['status'] == 'QUEUED' and rec['attempt'] == 2 and rec['error'] is None and not rec['settled']
    assert store.meter('2026-10') == {'spent': 100, 'reserved': 500, 'committed': 600, 'cap': 10_000}


def test_a_retry_in_a_later_month_is_charged_to_that_month(store):
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED'})
    store.settle('a' * 64, 100)
    november = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, november)
    assert rec['month'] == '2026-11'
    assert store.meter('2026-10') == {'spent': 100, 'reserved': 0, 'committed': 100, 'cap': 10_000}
    assert store.meter('2026-11')['reserved'] == 500
    store.settle('a' * 64, 40)
    assert store.meter('2026-11') == {'spent': 40, 'reserved': 0, 'committed': 40, 'cap': 10_000}


def test_update_with_expected_status(store):
    store.create_job(record())
    assert not store.update_job('a' * 64, {'status': 'DONE'}, expect_status={'RUNNING'})
    assert store.update_job('a' * 64, {'stage': 'SCF'}, expect_status={'QUEUED'})
    assert store.get_job('a' * 64)['stage'] == 'SCF'


def test_list_resolution_config_billing(store):
    store.create_job(record('b' * 64, now=NOW.replace(second=0)))
    store.create_job(record('a' * 64, now=NOW.replace(second=1)))
    assert [r['key'] for r in store.list_jobs('2026-10')] == ['b' * 64, 'a' * 64]      # by submission time, not key
    assert store.list_jobs('2026-10', status='DONE') == [] and store.list_jobs('2026-09') == []
    store.put_resolution('name:water', {'cid': 962})
    assert store.get_resolution('name:water') == {'cid': 962} and store.get_resolution('name:x') is None
    assert store.generation_enabled()
    store.set_generation_enabled(False)
    assert not store.generation_enabled()
    assert store.get_billing('2026-10') is None
    store.put_billing('2026-10', {'usd': 0.12})
    assert store.get_billing('2026-10') == {'usd': 0.12}


def test_public_view_converts_money_and_hides_internals(store):
    store.create_job(record())
    view = public_view(store.get_job('a' * 64))
    assert view['reservedUsd'] == 0.001 and view['actualUsd'] is None
    assert view['resultUrl'] == '/molecules/jobs/' + 'a' * 64 + '/'
    for hidden in ('settled', 'runnerJobId', 'reservedMicros', 'actualMicros'):
        assert hidden not in view
    store.settle('a' * 64, 250)
    assert public_view(store.get_job('a' * 64))['actualUsd'] == 0.00025


# --- fix round 1 (Rulings T5-a, T5-b): the meter is derived from job records, ---
# --- so a crash can never land half of a two-write money operation. ---

def test_create_job_crash_before_its_one_write_leaves_no_trace(store, monkeypatch):
    file_only(store)
    real_write = store._write
    monkeypatch.setattr(store, '_write', lambda *a, **k: (_ for _ in ()).throw(OSError('simulated crash')))
    with pytest.raises(OSError):
        store.create_job(record())
    monkeypatch.setattr(store, '_write', real_write)
    # nothing was persisted: no job, no reservation anywhere
    assert store.get_job('a' * 64) is None
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 0, 'committed': 0, 'cap': 10_000}
    # a retry (the real caller behaviour after a crash) applies exactly once
    created, rec = store.create_job(record())
    assert created and rec['status'] == 'QUEUED'
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 1_000, 'committed': 1_000, 'cap': 10_000}


def test_settle_crash_before_its_one_write_leaves_the_reservation_intact(store, monkeypatch):
    file_only(store)
    store.create_job(record())
    real_write = store._write
    monkeypatch.setattr(store, '_write', lambda *a, **k: (_ for _ in ()).throw(OSError('simulated crash')))
    with pytest.raises(OSError):
        store.settle('a' * 64, 300)
    monkeypatch.setattr(store, '_write', real_write)
    # the crash happened before the record's one write landed: still reserved, not spent
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 1_000, 'committed': 1_000, 'cap': 10_000}
    # a retry applies exactly once
    assert store.settle('a' * 64, 300)
    assert not store.settle('a' * 64, 300)
    assert store.meter('2026-10') == {'spent': 300, 'reserved': 0, 'committed': 300, 'cap': 10_000}


def test_requeue_failed_crash_before_its_one_write_leaves_no_trace(store, monkeypatch):
    file_only(store)
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED'})
    store.settle('a' * 64, 100)
    real_write = store._write
    monkeypatch.setattr(store, '_write', lambda *a, **k: (_ for _ in ()).throw(OSError('simulated crash')))
    with pytest.raises(OSError):
        store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    monkeypatch.setattr(store, '_write', real_write)
    # still FAILED and settled, no second reservation anywhere
    rec = store.get_job('a' * 64)
    assert rec['status'] == 'FAILED' and rec['attempt'] == 1
    assert store.meter('2026-10') == {'spent': 100, 'reserved': 0, 'committed': 100, 'cap': 10_000}
    # a retry applies exactly once
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert rec['status'] == 'QUEUED' and rec['attempt'] == 2
    assert store.meter('2026-10') == {'spent': 100, 'reserved': 500, 'committed': 600, 'cap': 10_000}


def test_update_job_attempt_guard(store):
    store.create_job(record())
    assert store.claim('a' * 64, 2, NOW)                           # a Batch retry straight from QUEUED
    assert not store.update_job('a' * 64, {'stage': 'SCF'}, attempt=1)      # a superseded attempt
    assert store.get_job('a' * 64)['stage'] is None
    assert store.update_job('a' * 64, {'stage': 'SCF'}, attempt=2)
    assert store.get_job('a' * 64)['stage'] == 'SCF'


def test_requeue_failed_resets_latest_energy(store):
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED', 'latestEnergyHartree': -76.4})
    store.settle('a' * 64, 100)
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert rec['latestEnergyHartree'] is None


# --- final-review fix wave -----------------------------------------------------

def test_concurrent_writes_of_one_file_never_collide(store):
    """I3: every writer used to share one `<name>.tmp`, so two threads writing
    the same file raced: one's os.replace moved the other's temp file away
    and the loser raised FileNotFoundError."""
    file_only(store)
    errors = []

    def write_many(i):
        try:
            for n in range(40):
                store.put_resolution('name:water', {'cid': 962, 'writer': i, 'n': n})
        except Exception as e:                  # pragma: no cover - the failure being pinned
            errors.append(e)

    threads = [threading.Thread(target=write_many, args=(i,)) for i in range(12)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert errors == []
    assert store.get_resolution('name:water')['cid'] == 962
    assert not [p for p in (store.root / 'resolve').iterdir() if not p.name.endswith('.json')]   # no temp files left


def test_claim_refuses_an_attempt_older_than_the_record(store):
    """I4: a worker for attempt 1 must not run a job a retry has already
    moved to attempt 2, even while it is QUEUED."""
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED'})
    store.settle('a' * 64, 0)
    store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert not store.claim('a' * 64, 1, NOW)
    assert store.get_job('a' * 64)['status'] == 'QUEUED'
    assert store.claim('a' * 64, 2, NOW)


def test_peak_memory_starts_empty_and_resets_on_requeue(store):
    """M2: only a heartbeat writes peakMemoryGB; a new record has the field
    (as None) and a retry clears the failed attempt's figure."""
    store.create_job(record())
    assert store.get_job('a' * 64)['peakMemoryGB'] is None
    store.update_job('a' * 64, {'status': 'FAILED', 'peakMemoryGB': 1.25})
    store.settle('a' * 64, 0)
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert rec['peakMemoryGB'] is None


def test_jobs_with_backend_spans_every_month(store):
    """I1: the local runner's start-up sweep needs every record of its
    backend, whatever month it was submitted in."""
    store.create_job(record('a' * 64))
    store.create_job(record('b' * 64, now=datetime(2026, 9, 30, 23, 0, tzinfo=timezone.utc)))
    aws = record('c' * 64)
    aws['backend'] = 'aws'
    store.create_job(aws)
    assert sorted(r['key'] for r in store.jobs_with_backend('local')) == ['a' * 64, 'b' * 64]
    assert [r['key'] for r in store.jobs_with_backend('aws')] == ['c' * 64]


# --- Phase 6B-3: one contract for FileStore and DynamoStore ----------------------

def test_reservation_larger_than_the_whole_cap_is_refused_on_a_fresh_month(store):
    with pytest.raises(BudgetExhausted):
        store.create_job(record('a' * 64, 10_001))
    assert store.get_job('a' * 64) is None and store.meter('2026-10')['committed'] == 0


def test_settling_after_the_month_turned_charges_the_submit_month(store):
    store.create_job(record('a' * 64, 1_000, now=NOW.replace(month=9, day=30, hour=23, minute=59)))
    assert store.settle('a' * 64, 400)                     # settled "in October": the record says September
    assert store.meter('2026-09') == {'spent': 400, 'reserved': 0, 'committed': 400, 'cap': 10_000}
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 0, 'committed': 0, 'cap': 10_000}


def test_floats_and_nested_values_round_trip(store):
    """Real DynamoDB normalises numbers (20.0 is stored, and read back, as
    20), so only non-integral values may be pinned as float; 0.0 and -0.0
    compare equal whichever type they come back as (D17)."""
    rec = record()
    rec['job'] = {'recipe': 'single', 'molecule': {'atoms': [[8, 0.0, -0.0, 0.11779], [1, 1e-05, 0.75545, -0.47116]]}}
    store.create_job(rec)
    store.update_job(rec['key'], {'latestEnergyHartree': -76.4198721234, 'logTail': ['a', 'b'], 'actual': None})
    got = store.get_job(rec['key'])
    assert got['job'] == rec['job'] and got['latestEnergyHartree'] == -76.4198721234
    assert isinstance(got['attempt'], int) and isinstance(got['job']['molecule']['atoms'][0][3], float)
    assert isinstance(got['job']['molecule']['atoms'][1][1], float)
    assert got['logTail'] == ['a', 'b'] and got['actual'] is None


def test_update_job_attempt_guard_without_changes(store):
    """The no-changes branch answers the same question as a real write:
    does the record exist, in an expected status, under this attempt?"""
    store.create_job(record())
    assert store.update_job('a' * 64, {}, attempt=1)
    assert not store.update_job('a' * 64, {}, attempt=2)
    assert not store.update_job('a' * 64, {}, expect_status={'RUNNING'})
    assert not store.update_job('b' * 64, {})


def test_update_job_attempt_and_status_guards_combine(store):
    store.create_job(record())
    assert not store.update_job('a' * 64, {'stage': 'SCF'}, expect_status={'QUEUED'}, attempt=2)
    assert not store.update_job('a' * 64, {'stage': 'SCF'}, expect_status={'RUNNING'}, attempt=1)
    assert store.update_job('a' * 64, {'stage': 'SCF'}, expect_status={'QUEUED', 'STARTING'}, attempt=1)
    assert store.get_job('a' * 64)['stage'] == 'SCF'
    assert not store.update_job('b' * 64, {'stage': 'SCF'}, attempt=1)       # no record: nothing created
    assert store.get_job('b' * 64) is None


def test_settle_appends_a_dated_charge_to_the_ledger(store):
    """D16: every settlement leaves {month, micros, at} on the record, `at`
    being when the attempt ended, so the dashboard can date the month's
    spend charge by charge (a job may carry charges from two months)."""
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED', 'endedAt': '2026-10-09T08:00:00Z'})
    assert store.settle('a' * 64, 300)
    assert store.get_job('a' * 64)['charges'] == [{'month': '2026-10', 'micros': 300, 'at': '2026-10-09T08:00:00Z'}]
    november = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, november)
    store.update_job('a' * 64, {'status': 'DONE', 'endedAt': '2026-11-02T09:30:00Z'})
    assert store.settle('a' * 64, 40)
    rec = store.get_job('a' * 64)
    assert rec['charges'] == [{'month': '2026-10', 'micros': 300, 'at': '2026-10-09T08:00:00Z'},
                              {'month': '2026-11', 'micros': 40, 'at': '2026-11-02T09:30:00Z'}]
    assert rec['actualMicros'] == 340
    assert store.meter('2026-10')['spent'] == 300 and store.meter('2026-11')['spent'] == 40


def test_a_charge_without_an_end_time_is_dated_when_it_settles(store):
    store.create_job(record())
    assert store.settle('a' * 64, 0)
    [charge] = store.get_job('a' * 64)['charges']
    assert charge['month'] == '2026-10' and charge['micros'] == 0
    assert datetime.strptime(charge['at'], '%Y-%m-%dT%H:%M:%SZ')     # an ISO UTC instant, as iso() writes


def test_the_meter_is_the_sum_of_the_records(store):
    """The derived-meter contract (Ruling T5-a): whatever the backend keeps,
    spent is the month's charges and reserved its unsettled reservations."""
    store.create_job(record('a' * 64, 1_000))
    store.create_job(record('b' * 64, 2_000))
    store.create_job(record('c' * 64, 3_000, now=NOW.replace(month=9)))
    store.settle('a' * 64, 700)
    records = [store.get_job(k * 64) for k in 'abc']
    for month in ('2026-09', '2026-10'):
        spent = sum(c['micros'] for r in records for c in r['charges'] if c['month'] == month)
        reserved = sum(r['reservedMicros'] for r in records if not r['settled'] and r['month'] == month)
        assert store.meter(month) == {'spent': spent, 'reserved': reserved, 'committed': spent + reserved,
                                      'cap': 10_000}
        assert sum(c['micros'] for c in store.month_charges(month)) == spent


def test_month_charges_follow_the_charge_not_the_record(store):
    """Review fix 2: a job failed and settled in October, then retried in
    November, is a November record, but its first charge is October's spend:
    the month's charges come from every record, chosen by charge month."""
    store.create_job(record('a' * 64))
    store.update_job('a' * 64, {'status': 'FAILED', 'endedAt': '2026-10-09T08:00:00Z'})
    store.settle('a' * 64, 300)
    store.create_job(record('b' * 64, 2_000))
    store.update_job('b' * 64, {'status': 'DONE', 'endedAt': '2026-10-12T10:00:00Z'})
    store.settle('b' * 64, 700)
    november = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, november)
    store.update_job('a' * 64, {'status': 'DONE', 'endedAt': '2026-11-02T09:30:00Z'})
    store.settle('a' * 64, 40)
    assert [r['key'] for r in store.list_jobs('2026-10')] == ['b' * 64]          # the record moved on
    assert sorted(store.month_charges('2026-10'), key=lambda c: c['at']) == [
        {'month': '2026-10', 'micros': 300, 'at': '2026-10-09T08:00:00Z'},
        {'month': '2026-10', 'micros': 700, 'at': '2026-10-12T10:00:00Z'}]
    assert store.month_charges('2026-11') == [{'month': '2026-11', 'micros': 40, 'at': '2026-11-02T09:30:00Z'}]
    assert store.month_charges('2026-12') == []
    for month in ('2026-10', '2026-11'):
        assert sum(c['micros'] for c in store.month_charges(month)) == store.meter(month)['spent']


def test_a_worker_records_its_own_batch_job_id_only_where_none_is(store):
    # Final review M2: the api can lose the id SubmitJob returned (a timeout
    # after the call); the worker that claimed the job writes it instead.
    store.create_job(record())
    store.claim('a' * 64, 1, NOW)
    assert not store.note_runner_job_id('a' * 64, 'job-1', attempt=2)       # not this attempt's record
    assert store.note_runner_job_id('a' * 64, 'job-1', attempt=1)
    assert store.get_job('a' * 64)['runnerJobId'] == 'job-1'
    assert not store.note_runner_job_id('a' * 64, 'job-2', attempt=1)       # never replaces one
    assert store.get_job('a' * 64)['runnerJobId'] == 'job-1'
    assert not store.note_runner_job_id('b' * 64, 'job-3', attempt=1)       # no such record
