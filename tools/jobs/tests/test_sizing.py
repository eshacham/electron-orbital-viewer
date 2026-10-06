import pytest

from jobs import sizing
from jobs.canonical import canonical_job
from jobs.errors import JobRefused
from jobs.prices import CAP_MICROS, billed_seconds, cost_micros

WATER = [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]

# Caffeine's real atoms (the controller's Task 10 calibration job,
# f4e66d73…), used to exercise Ruling T11-a with the v1 constants themselves
# rather than a monkeypatch.
CAFFEINE = [[1, -2.9346, 2.1021, -0.8849], [1, -2.9322, 2.1027, 0.8881], [1, -2.5186, -2.7596, 0.0011],
            [1, -1.8087, 3.1651, -0.0003], [1, -1.0451, -3.1973, -0.8937], [1, -1.0447, -3.1963, 0.8957],
            [1, 3.0466, 1.8083, 0.9004], [1, 3.0468, 1.8092, -0.8992], [1, 3.5163, -1.5787, 0.0008],
            [1, 4.1992, 0.7801, 0.0002], [6, -2.2969, 2.1881, 0.0007], [6, -1.9061, -0.2495, -0.0004],
            [6, -1.4276, -2.696, 0.0008], [6, 0.0307, 1.422, -0.0006], [6, 0.3897, -1.0264, -0.0004],
            [6, 0.8579, 0.2592, -0.0008], [6, 2.5032, -1.1998, 0.0003], [6, 3.1926, 1.2061, 0.0003],
            [7, -1.3477, 1.0797, -0.0001], [7, -0.9686, -1.3125, 0.0], [7, 1.4119, -1.9372, 0.0002],
            [7, 2.2182, 0.1412, -0.0003], [8, -3.1271, -0.4436, -0.0003], [8, 0.47, 2.5688, 0.0006]]


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
    # D6: billing runs pullStartedAt -> stoppedAt, which includes the image
    # pull and the stop grace the timeout does not count, so the reservation
    # covers timeout + BILLING_ALLOWANCE_SECONDS, not the bare timeout.
    assert d['reservationMicros'] == 3 * cost_micros('spot', 2, 8, 720) == 17_880
    assert d['version'] == sizing.SIZING_VERSION


def test_version_1_is_calibrated():
    assert sizing.SIZING_VERSION == 1 and sizing.CONSTANTS['t0'] == 5.0 and sizing.CONSTANTS['g'] == 1.5


def test_caffeine_needs_a_bigger_worker_than_its_ceiling_timeout_would_allow():
    # Ruling T11-a: with v1 constants, S predicts 2959 s for caffeine, under
    # the 3600 s 'single' ceiling, but the timeout the ceiling would clamp to
    # is below caffeine's measured single-threaded wall time (4466 s) — every
    # attempt would time out. decide() must require TIME_HEADROOM margin
    # against the ceiling, not just "fits under it", and pick a size with
    # more vCPUs (so a faster predicted SCF) instead.
    d = sizing.decide(canonical_job('single', CAFFEINE, 0, 1))
    assert d['size'] != 'S'
    assert d['timeoutSeconds'] >= sizing.TIME_HEADROOM * d['predictedSeconds']


def test_too_slow_for_every_size_within_the_ceiling_is_too_long(monkeypatch):
    # Even the fastest memory-qualifying size (XL) cannot clear
    # TIME_HEADROOM × predicted ≤ ceiling: refuse too-long rather than ever
    # handing out a timeout shorter than the job needs.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3': 1e9})
    with pytest.raises(JobRefused) as e:
        sizing.decide(canonical_job('single', carbons(10), 0, 1))
    assert e.value.code == 'too-long' and 'XL' in e.value.message


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
    # Pick t3 so that only XL — the fastest memory-qualifying size — clears
    # TIME_HEADROOM × predicted ≤ the 2 h optimise ceiling (Ruling T11-a),
    # landing its own predicted seconds just above the spot limit so the job
    # still goes on-demand. f2 = 0: this scaling argument assumes pure SCF
    # scaling (Ruling D14).
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': 1.0, 'g': 0.0, 'f2': 0.0})
    job = canonical_job('optimise', carbons(10), 0, 1)
    seconds = sizing.predict_seconds(job, sizing.SIZES[-1])
    scale = 4500 / seconds   # between the 3600 s spot limit and ceiling / TIME_HEADROOM = 4800 s
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': scale, 'g': 0.0, 'f2': 0.0})
    d = sizing.decide(job)
    assert d['size'] == 'XL'
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


def test_every_decision_says_it_is_a_fargate_estimate():
    """M1: a local run is sized and timed as if on Fargate (the Mac runs it
    single-threaded and without a time limit), so the figures say so."""
    job = canonical_job('single', WATER, 0, 1)
    assert sizing.decide(job)['estimateFor'] == 'fargate'
    assert sizing.decide(job, local=True)['estimateFor'] == 'fargate'
