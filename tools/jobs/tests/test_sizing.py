import pytest

from jobs import sizing
from jobs.canonical import canonical_job
from jobs.errors import JobRefused
from jobs.prices import CAP_MICROS, billed_seconds, cost_micros

WATER = [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]


def carbons(n):
    return [[6, 0.0, 0.0, 1.5 * i] for i in range(n)]


def test_prices():
    assert cost_micros('on-demand', 2, 8, 3600) == 93_240         # 2·0.03238 + 8·0.00356 = $0.09324
    assert cost_micros('spot', 2, 8, 3600) == 29_800              # 2·0.01034 + 8·0.00114 = $0.02980
    assert cost_micros('local', 32, 244, 3600) == 0
    assert cost_micros('on-demand', 2, 8, 1) == 26                # rounds up, never down
    assert billed_seconds(5) == 60 and billed_seconds(60.2) == 61
    assert CAP_MICROS == 8_800_000


def test_water_single_is_small_spot_with_the_floor_timeout():
    d = sizing.decide(canonical_job('single', WATER, 0, 1))
    assert (d['size'], d['vcpu'], d['memoryGB'], d['capacity'], d['attempts']) == ('S', 2, 8, 'spot', 3)
    assert d['basisFunctions'] == 58 and d['timeoutSeconds'] == 600
    assert d['reservationMicros'] == 3 * cost_micros('spot', 2, 8, 600)
    assert d['version'] == sizing.SIZING_VERSION


def test_local_backend_reserves_nothing_but_still_sizes():
    d = sizing.decide(canonical_job('single', WATER, 0, 1), local=True)
    assert d['capacity'] == 'local' and d['attempts'] == 1 and d['reservationMicros'] == 0 and d['size'] == 'S'


def test_memory_picks_the_smallest_size_with_headroom(monkeypatch):
    # f2 = 0: at N = 4440 the files term alone (3000·4.44² ≈ 16 h) would trip the
    # 1 h "single" ceiling regardless of t3, long before the memory check can be
    # observed in isolation (Ruling D14).
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'm0': 0.0, 'm2': 4.0, 't3': 1.0, 'f2': 0.0})
    # 120 carbons → N = 4440 (def2-TZVPD) → 4·4.44² = 78.9 GB predicted → needs 157.7 GB → XL
    assert sizing.decide(canonical_job('single', carbons(120), 0, 1))['size'] == 'XL'
    # 30 carbons → N = 1110 → 4.93 GB → 9.86 GB → M
    assert sizing.decide(canonical_job('single', carbons(30), 0, 1))['size'] == 'M'


def test_too_large_for_xl(monkeypatch):
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'm0': 0.0, 'm2': 20.0, 't3': 1.0})
    with pytest.raises(JobRefused) as e:
        sizing.decide(canonical_job('single', carbons(120), 0, 1))
    assert e.value.code == 'too-large' and 'largest Fargate worker' in e.value.message


def test_too_long_for_the_recipe_ceiling(monkeypatch):
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3': 1e7})
    with pytest.raises(JobRefused) as e:
        sizing.decide(canonical_job('single', carbons(40), 0, 1))
    assert e.value.code == 'too-long'


def test_long_jobs_run_on_demand_with_one_attempt(monkeypatch):
    # Pick t3 so the prediction lands between 1 h and the 2 h optimise ceiling.
    # f2 = 0: this scaling argument assumes pure SCF scaling (Ruling D14).
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': 1.0, 'g': 0.0, 'f2': 0.0})
    job = canonical_job('optimise', carbons(10), 0, 1)
    seconds = sizing.predict_seconds(job, sizing.SIZES[0])
    scale = 5400 / seconds
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': scale, 'g': 0.0, 'f2': 0.0})
    d = sizing.decide(job)
    assert d['capacity'] == 'on-demand' and d['attempts'] == 1 and d['timeoutSeconds'] == 7200


def test_open_shell_takes_longer(monkeypatch):
    # f2 = 0: the files term does not scale with the open-shell factor (Ruling D14),
    # so comparing the raw 1.5× ratio needs it isolated out.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'f2': 0.0})
    closed = sizing.predict_seconds(canonical_job('single', WATER, 0, 1), sizing.SIZES[0])
    opened = sizing.predict_seconds(canonical_job('single', WATER, 1, 2), sizing.SIZES[0])
    assert opened == pytest.approx(1.5 * closed)


def test_optimise_costs_more_than_single_and_steps_are_capped():
    single = sizing.predict_seconds(canonical_job('single', WATER, 0, 1), sizing.SIZES[0])
    optimise = sizing.predict_seconds(canonical_job('optimise', WATER, 0, 1), sizing.SIZES[0])
    assert optimise > single
    assert sizing.optimisation_steps(3) == 16 and sizing.optimisation_steps(200) == 100


def test_more_vcpus_are_faster_but_not_linearly(monkeypatch):
    # f2 = 0: the file-writing term is deliberately vCPU-independent (Ruling D14),
    # so it must be isolated out before comparing the SCF speedup ratio.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'f2': 0.0})
    job = canonical_job('single', carbons(20), 0, 1)
    s, m = sizing.predict_seconds(job, sizing.SIZES[0]), sizing.predict_seconds(job, sizing.SIZES[1])
    assert s / m == pytest.approx(2 ** 0.8)


def test_decision_is_deterministic():
    job = canonical_job('optimise', carbons(12), 0, 1)
    assert sizing.decide(job) == sizing.decide(job)


def test_files_term_is_independent_of_vcpu_and_counted_in_decide():
    # Ruling D14: the grid/file-writing code is not threaded, so its predicted
    # seconds must not depend on vCPU count, and still has to show up in decide().
    job = canonical_job('single', WATER, 0, 1)
    small = sizing.predict_parts(job, sizing.SIZES[0])
    big = sizing.predict_parts(job, sizing.SIZES[-1])
    assert small['filesSeconds'] == big['filesSeconds'] > 0
    assert small['scfSeconds'] != big['scfSeconds']        # vCPU still speeds up the SCF part

    d = sizing.decide(job)
    assert d['predictedSeconds'] == pytest.approx(round(small['scfSeconds'] + small['filesSeconds'], 1))
