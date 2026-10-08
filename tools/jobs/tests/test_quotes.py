"""Phase 6C quotes: two priced options per job, a binding quote id, line
items for compute, storage and delivery, and settlement capped by the
approved maximum (owner decision 2026-10-08)."""
import json
from pathlib import Path

import pytest

from jobs import quotes, sizing
from jobs.canonical import canonical_job, job_key
from jobs.prices import (BYTES_PER_GB, CLOUDFRONT_OUT_GB, PRICES_VERSION, S3_STANDARD_GB_MONTH, cost_micros,
                         delivery_micros, storage_micros)

WATER = [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]
FIXTURES = Path(__file__).parent / 'fixtures' / 'aws'


def carbons(n):
    return [[6, 0.0, 0.0, 1.5 * i] for i in range(n)]


def water_quote(backend='aws', recipe='single'):
    job = canonical_job(recipe, WATER, 0, 1)
    return job, quotes.quote(job, job_key(job), backend)


def by_option(q):
    return {o['option']: o for o in q['options']}


def test_an_aws_quote_offers_spot_and_on_demand_on_the_same_size_and_timeout():
    _, q = water_quote()
    spot, on_demand = by_option(q)['spot'], by_option(q)['on-demand']
    assert [o['option'] for o in q['options']] == ['spot', 'on-demand'] and q['recommended'] == 'spot'
    assert spot['available'] and on_demand['available']
    assert (spot['attempts'], on_demand['attempts']) == (3, 1)
    assert spot['size'] == on_demand['size'] == 'S' and spot['timeoutSeconds'] == on_demand['timeoutSeconds'] == 600
    assert spot['sizingVersion'] == sizing.SIZING_VERSION and spot['pricesVersion'] == PRICES_VERSION
    assert [line['item'] for line in spot['lines']] == ['compute', 'storage', 'delivery', 'platform']


def test_compute_maximum_is_attempts_times_the_timeout_plus_the_billing_allowance():
    _, q = water_quote()
    spot, on_demand = by_option(q)['spot'], by_option(q)['on-demand']
    line = {o['option']: {l['item']: l for l in o['lines']} for o in (spot, on_demand)}
    allowance = sizing.BILLING_ALLOWANCE_SECONDS
    assert line['spot']['compute']['maximumMicros'] == 3 * cost_micros('spot', 2, 8, 600 + allowance)
    assert line['on-demand']['compute']['maximumMicros'] == cost_micros('on-demand', 2, 8, 600 + allowance)
    # The estimate is one attempt: the prediction plus a start-up minute, at Fargate's one-minute minimum.
    assert line['spot']['compute']['estimateMicros'] == cost_micros('spot', 2, 8, 76)
    assert spot['estimateMicros'] == sum(l['estimateMicros'] for l in spot['lines'])
    assert spot['maximumMicros'] == sum(l['maximumMicros'] for l in spot['lines'])
    assert line['spot']['platform'] == {'item': 'platform', 'estimateMicros': 0, 'maximumMicros': 0}


def test_the_timeout_is_what_the_approved_compute_maximum_buys():
    # Requirement 2: the approved maximum converts back into the job's time limit.
    for recipe in ('single', 'optimise'):
        _, q = water_quote(recipe=recipe)
        for o in q['options']:
            assert quotes.timeout_from_maximum(o) == o['timeoutSeconds']


def test_the_timeout_is_never_below_the_sizings_conservative_timeout():
    job, q = water_quote(recipe='optimise')
    d = sizing.decide(job)
    for o in q['options']:
        assert o['timeoutSeconds'] == d['timeoutSeconds'] >= sizing.TIMEOUT_FACTOR * d['predictedSeconds']


def test_storage_and_delivery_use_the_list_prices_for_12_months_and_10_downloads():
    _, q = water_quote()
    o = by_option(q)['spot']
    lines = {l['item']: l for l in o['lines']}
    n = 58
    estimate = quotes.RESULT_FIXED_BYTES + round(quotes.BASIS_BYTES_PER_N2 * n * n)
    assert o['resultBytes'] == estimate and o['resultBytesMax'] == 2 * estimate
    assert (quotes.RETENTION_MONTHS, quotes.DOWNLOADS) == (12, 10)
    assert lines['storage']['estimateMicros'] == storage_micros(estimate, 12, quotes.STORED_OBJECTS)
    assert lines['storage']['maximumMicros'] == storage_micros(2 * estimate, 12, quotes.STORED_OBJECTS)
    assert lines['delivery']['estimateMicros'] == delivery_micros(10 * estimate, 10 * quotes.STORED_OBJECTS)
    assert lines['delivery']['maximumMicros'] == delivery_micros(20 * estimate, 10 * quotes.STORED_OBJECTS)
    # $0.023 per GB-month and $0.085 per GB out: water's ~1.5 MB is a fraction of a cent each.
    assert S3_STANDARD_GB_MONTH == 0.023 and CLOUDFRONT_OUT_GB == 0.085 and BYTES_PER_GB == 2 ** 30
    assert 300 < lines['storage']['estimateMicros'] < 600 and 1000 < lines['delivery']['estimateMicros'] < 1500


@pytest.mark.parametrize('folder', sorted(p.name for p in FIXTURES.iterdir() if p.is_dir()))
def test_the_result_size_maximum_covers_every_measured_done_job(folder):
    # The six DONE jobs' objects under molecules/jobs/<key>/ (aws s3 ls, 2026-10-08), every attempt included.
    measured = {'09ae0fa051c6': 1_917_397, '2233f97f7719': 1_247_850, '22b6b939b8af': 1_450_955,
                'df22d76f6f7a': 1_475_369, 'f4e66d7330ed': 1_725_285, 'ffdaf035aee5': 1_140_677}[folder[:12]]
    n = json.loads((FIXTURES / folder / 'job.json').read_text())['sizing']['basisFunctions']
    assert quotes.result_bytes(n) <= measured * 1.5        # the estimate is near what was stored...
    assert quotes.result_bytes_max(n) >= measured * 1.5    # ...and the maximum well above it


def test_spot_is_unavailable_past_the_spot_limit_and_says_why(monkeypatch):
    monkeypatch.setattr(sizing, 'SPOT_LIMIT_SECONDS', 1)
    _, q = water_quote()
    spot = by_option(q)['spot']
    assert not spot['available'] and spot['quoteId'] is None
    assert spot['unavailableReason'].startswith('Spot is offered only for runs predicted at 0 min or less')
    assert q['recommended'] == 'on-demand' and by_option(q)['on-demand']['available']


def test_the_interruption_note_says_how_each_recipe_resumes():
    _, single = water_quote()
    _, optimise = water_quote(recipe='optimise')
    assert 'from scratch' in by_option(single)['spot']['interruption']
    assert 'last completed step' in by_option(optimise)['spot']['interruption']
    assert by_option(single)['on-demand']['interruption'] is None


def test_the_quote_id_binds_every_term():
    job, q = water_quote()
    o = by_option(q)['spot']
    assert len(o['quoteId']) == 64 and o['quoteId'] == quotes.quote_id(o)
    again = quotes.quote(job, job_key(job), 'aws')
    assert by_option(again)['spot']['quoteId'] == o['quoteId']                   # deterministic
    assert by_option(q)['on-demand']['quoteId'] != o['quoteId']
    for change in ({'timeoutSeconds': 601}, {'attempts': 2}, {'size': 'M'}, {'sizingVersion': 4},
                   {'pricesVersion': 1}, {'key': 'b' * 64},
                   {'lines': [{**o['lines'][0], 'maximumMicros': o['lines'][0]['maximumMicros'] + 1}, *o['lines'][1:]]}):
        assert quotes.quote_id({**o, **change}) != o['quoteId'], change


def test_a_local_quote_is_one_free_option_with_the_aws_options_for_reference():
    _, q = water_quote(backend='local')
    assert [o['option'] for o in q['options']] == ['local'] and q['recommended'] == 'local'
    local = q['options'][0]
    assert local['available'] and local['maximumMicros'] == 0 and local['estimateMicros'] == 0
    assert [o['option'] for o in q['reference']] == ['spot', 'on-demand']
    assert q['reference'][0]['maximumMicros'] > 0


def test_a_too_large_job_is_refused_by_the_quote():
    from jobs.errors import JobRefused
    with pytest.raises(JobRefused) as e:
        quotes.quote(canonical_job('single', carbons(200), 0, 1), 'a' * 64, 'aws')
    assert e.value.code == 'too-large'


def test_a_c60_scale_quote_is_on_demand_only():
    q = quotes.quote(canonical_job('single', carbons(60), 0, 1), 'a' * 64, 'aws')
    spot, on_demand = by_option(q)['spot'], by_option(q)['on-demand']
    assert not spot['available'] and on_demand['available'] and q['recommended'] == 'on-demand'
    assert on_demand['maximumMicros'] > 8_800_000            # more than the whole monthly cap


# -- the approved quote and settlement ----------------------------------------------------------------------

def approved_record(option='spot', status='DONE', actual=None):
    job, q = water_quote()
    o = by_option(q)[option]
    return {'status': status, 'quote': quotes.approved(o, '2026-10-10T12:00:00Z'), 'actual': actual,
            'reservedMicros': o['maximumMicros']}


def test_the_approved_quote_keeps_every_line_and_when():
    rec = approved_record()
    q = rec['quote']
    assert q['approvedAt'] == '2026-10-10T12:00:00Z' and q['option'] == 'spot' and len(q['quoteId']) == 64
    assert [l['item'] for l in q['lines']] == ['compute', 'storage', 'delivery', 'platform']
    assert q['maximumMicros'] == rec['reservedMicros'] and q['timeoutSeconds'] == 600


def test_settlement_charges_actual_compute_storage_and_delivery():
    rec = approved_record(actual={'wallSeconds': 15.0, 'peakMemoryGB': 0.3, 'threads': 2,
                                  'resultBytes': 1_450_955, 'resultObjects': 13})
    s = quotes.settlement(rec, 497)
    lines = {l['item']: l for l in s['lines']}
    assert lines['compute'] == {'item': 'compute', 'costMicros': 497, 'chargedMicros': 497}
    assert lines['storage']['costMicros'] == storage_micros(1_450_955, 12, 13)
    assert lines['delivery']['costMicros'] == delivery_micros(10 * 1_450_955, 130)
    assert s['costMicros'] == s['chargedMicros'] == sum(l['costMicros'] for l in s['lines'])
    assert s['absorbedMicros'] == 0 and s['resultBytes'] == 1_450_955


def test_settlement_never_charges_a_line_above_its_approved_maximum():
    rec = approved_record(actual={'resultBytes': 10 ** 9, 'resultObjects': 13})
    q = {l['item']: l for l in rec['quote']['lines']}
    over = q['compute']['maximumMicros'] + 5_000
    s = quotes.settlement(rec, over)
    lines = {l['item']: l for l in s['lines']}
    assert lines['compute']['chargedMicros'] == q['compute']['maximumMicros'] and lines['compute']['costMicros'] == over
    assert lines['storage']['chargedMicros'] == q['storage']['maximumMicros']
    assert s['chargedMicros'] <= rec['quote']['maximumMicros']
    assert s['absorbedMicros'] == s['costMicros'] - s['chargedMicros'] > 5_000


def test_a_failed_job_pays_no_delivery_and_stores_only_what_its_worker_wrote():
    rec = approved_record(status='FAILED', actual={'resultBytes': 7_000, 'resultObjects': 3})
    lines = {l['item']: l for l in quotes.settlement(rec, 300)['lines']}
    assert lines['delivery']['costMicros'] == 0 and lines['storage']['costMicros'] == storage_micros(7_000, 12, 3)
    # A worker that never reported (timed out, killed, never started) wrote nothing.
    lines = {l['item']: l for l in quotes.settlement(approved_record(status='FAILED'), 300)['lines']}
    assert lines['storage']['costMicros'] == lines['delivery']['costMicros'] == 0


def test_a_done_job_without_a_measured_size_is_charged_its_estimate():
    rec = approved_record(actual={'wallSeconds': 15.0})
    lines = {l['item']: l for l in quotes.settlement(rec, 300)['lines']}
    assert lines['storage']['costMicros'] == storage_micros(rec['quote']['resultBytes'], 12, quotes.STORED_OBJECTS)


def test_a_legacy_record_has_no_settlement_lines():
    assert quotes.settlement({'status': 'DONE', 'actual': None, 'reservedMicros': 10}, 5) is None


def test_a_local_settlement_is_free():
    job, q = water_quote(backend='local')
    rec = {'status': 'DONE', 'quote': quotes.approved(q['options'][0], '2026-10-10T12:00:00Z'),
           'actual': {'resultBytes': 1_000_000, 'resultObjects': 13}, 'reservedMicros': 0}
    s = quotes.settlement(rec, 0)
    assert s['costMicros'] == s['chargedMicros'] == s['absorbedMicros'] == 0


def test_public_views_are_in_usd_with_labels():
    _, q = water_quote()
    view = quotes.public_quote(q)
    spot = view['options'][0]
    assert spot['option'] == 'spot' and spot['quoteId'] and spot['estimateUsd'] > 0
    assert spot['maximumUsd'] == round(by_option(q)['spot']['maximumMicros'] / 1e6, 6)
    assert [l['label'] for l in spot['lines']] == ['Compute (AWS Fargate)', 'Result storage (S3, 12 months)',
                                                   'Delivery (CloudFront, 10 full downloads)', 'Platform fee']
    assert all(l['note'] for l in spot['lines'])
    assert spot['sizing']['capacity'] == 'spot' and 'reservationMicros' not in spot['sizing']
    rec = approved_record(actual={'resultBytes': 1_000_000, 'resultObjects': 13})
    approved = quotes.public_approved(rec['quote'])
    assert approved['maximumUsd'] == round(rec['quote']['maximumMicros'] / 1e6, 6) and approved['option'] == 'spot'
    charged = quotes.public_settlement(quotes.settlement(rec, 497))
    assert charged['lines'][0] == {'item': 'compute', 'label': 'Compute (AWS Fargate)', 'costUsd': 0.000497,
                                   'chargedUsd': 0.000497}
    assert quotes.public_approved(None) is None and quotes.public_settlement(None) is None
