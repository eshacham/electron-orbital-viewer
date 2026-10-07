import json
from pathlib import Path

import pytest

from jobs import sizing
from jobs.basis_counts import basis_functions
from jobs.canonical import canonical_job
from jobs.errors import JobRefused
from jobs.prices import CAP_MICROS, billed_seconds, cost_micros

WATER = [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]

# Caffeine's real atoms (the controller's Task 10 calibration job, f4e66d73…).
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


KEYS = {'m0', 'm2', 't0', 't3', 't3Step', 'g', 'f2', 'scfExponent', 'scfSaturation', 'filesExponent',
        'filesSaturation'}


def test_version_4_is_calibrated_on_aws():
    # Fitted from Fargate ARM64 runs (Phase 6B-3 Task 14, refitted with caffeine on M for version 3, and
    # the caffeine optimise-steps probe for version 4's t3Step); every constant is a measured, positive
    # number. D5: f2 stays (predict_parts reads it), and the two speedup laws are constants too (Ruling
    # T14-speedup).
    assert sizing.SIZING_VERSION == 4
    assert set(sizing.CONSTANTS) == KEYS
    assert all(isinstance(v, float) and v > 0 for v in sizing.CONSTANTS.values())
    assert sizing.CONSTANTS['m0'] >= 0.2 and sizing.CONSTANTS['t0'] >= 1.0


def test_caffeine_needs_a_bigger_worker_than_its_ceiling_timeout_would_allow(monkeypatch):
    # Ruling T11-a, pinned on the decision logic rather than on whichever
    # constants are live (D24): scale t3 so that S predicts caffeine between
    # the ceiling / TIME_HEADROOM and the 3600 s 'single' ceiling itself. S
    # then "fits under the ceiling", but a ceiling-clamped timeout would leave
    # less than TIME_HEADROOM of margin; decide() must pass over S for a size
    # with more vCPUs (so a faster predicted SCF) instead.
    job, small = canonical_job('single', CAFFEINE, 0, 1), sizing.SIZES[0]
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 'f2': 0.0})
    scale = 3000 / sizing.predict_seconds(job, small)          # 2400 s < 3000 s < 3600 s on S
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3': sizing.CONSTANTS['t3'] * scale})
    assert sizing.predict_seconds(job, small) == pytest.approx(3000)
    d = sizing.decide(job)
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
    # Pick t3 so that only the fastest sizes clear TIME_HEADROOM × predicted
    # ≤ the 2 h optimise ceiling (Ruling T11-a), landing the predicted
    # seconds just above the spot limit so the job still goes on-demand.
    # f2 = 0: this scaling argument assumes pure SCF scaling (Ruling D14).
    # With the SCF's speedup levelling off at scfSaturation, every size at or
    # past it is equally fast, and the cheapest of them is the one chosen.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': 1.0, 't3Step': 1.0, 'g': 0.0,
                                              'f2': 0.0})
    job = canonical_job('optimise', carbons(10), 0, 1)
    seconds = sizing.predict_seconds(job, sizing.SIZES[-1])
    scale = 4500 / seconds   # between the 3600 s spot limit and ceiling / TIME_HEADROOM = 4800 s
    # v4: carbons(10)'s def2-SVP steps fit in core, so they are priced by t3Step; scale both.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': scale, 't3Step': scale,
                                              'g': 0.0, 'f2': 0.0})
    d = sizing.decide(job)
    fastest = [s.name for s in sizing.SIZES if sizing.predict_seconds(job, s) == pytest.approx(4500)]
    assert d['size'] == fastest[0] and d['predictedSeconds'] == pytest.approx(4500)
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
    # f2 = 0: the file-writing term has its own speedup (Ruling T14-speedup),
    # so it is isolated out before comparing the SCF speedup ratio.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'f2': 0.0})
    job = canonical_job('single', carbons(20), 0, 1)
    s, m = sizing.predict_seconds(job, sizing.SIZES[0]), sizing.predict_seconds(job, sizing.SIZES[1])
    assert s / m == pytest.approx(sizing.speedup(4) / sizing.speedup(2))
    assert 1 < s / m < 2


def test_the_scf_speedup_levels_off_at_its_saturation():
    # The probe (Phase 6B-3 Task 12): benzene's SCF gains nearly linearly from
    # 4 to 16 threads and nothing from 16 to 32, so past scfSaturation more
    # vCPUs buy no SCF speed (Ruling T14-speedup).
    c = sizing.CONSTANTS['scfSaturation']
    assert sizing.speedup(c) == sizing.speedup(2 * c) == pytest.approx(c ** sizing.CONSTANTS['scfExponent'])
    assert sizing.speedup(c / 2) < sizing.speedup(c)
    assert sizing.speedup(1) == 1.0 and sizing.files_speedup(1) == 1.0


def test_the_files_term_divides_by_its_own_speedup():
    # The probe found the file write threaded (Phase 6B-3 Task 12): it keeps
    # improving to 32 threads, on a law of its own, separate from the SCF's.
    big = sizing.SIZES[-1]
    assert sizing.files_speedup(big.vcpu) == pytest.approx(
        min(big.vcpu, sizing.CONSTANTS['filesSaturation']) ** sizing.CONSTANTS['filesExponent'])
    assert sizing.files_speedup(32) > sizing.files_speedup(16) > sizing.files_speedup(4) > sizing.files_speedup(2)


def test_decision_is_deterministic():
    job = canonical_job('optimise', carbons(12), 0, 1)
    assert sizing.decide(job) == sizing.decide(job)


def test_files_term_scales_with_vcpu_and_is_counted_in_decide():
    # Ruling D14 kept the file write a separate term; Ruling T14-speedup
    # divides it by files_speedup, not the SCF's speedup.
    job = canonical_job('single', WATER, 0, 1)
    small = sizing.predict_parts(job, sizing.SIZES[0])
    big = sizing.predict_parts(job, sizing.SIZES[-1])
    assert small['filesSeconds'] / big['filesSeconds'] == pytest.approx(
        sizing.files_speedup(sizing.SIZES[-1].vcpu) / sizing.files_speedup(sizing.SIZES[0].vcpu))
    assert small['scfSeconds'] / big['scfSeconds'] == pytest.approx(
        sizing.speedup(sizing.SIZES[-1].vcpu) / sizing.speedup(sizing.SIZES[0].vcpu))

    d = sizing.decide(job)
    assert d['predictedSeconds'] == pytest.approx(round(small['scfSeconds'] + small['filesSeconds'], 1))


# What AWS measured (Phase 6B-3 Tasks 12-13 and the owner's caffeine): the
# ladder's four jobs, all on S (2 vCPU, Spot), caffeine single on M (4 vCPU,
# Spot), and the speedup probe's benzene at 4..32 threads on XL. Each job's
# job.json (key, job, sizing) and timings.json are in fixtures/aws/, as
# fetched from CloudFront; the probe's line is fixtures/aws/speedup-probe.json.
# Atoms as the jobs ran them; sizing reads only the elements and the count.
BENZENE = [[1, -2.1577, -1.2244, 0], [1, -2.1393, 1.2564, 0.0001], [1, -0.0184, -2.4809, -0.0001],
           [1, 0.0184, 2.4808, 0], [1, 2.1394, -1.2563, 0.0001], [1, 2.1577, 1.2245, 0],
           [6, -1.2131, -0.6884, 0], [6, -1.2028, 0.7064, 0.0001], [6, -0.0103, -1.3948, 0],
           [6, 0.0104, 1.3948, -0.0001], [6, 1.2028, -0.7063, 0], [6, 1.2131, 0.6884, 0]]
AWS_FIXTURES = Path(__file__).parent / 'fixtures' / 'aws'
AWS_JOBS = sorted(d for d in AWS_FIXTURES.iterdir() if d.is_dir())
# Ethanol's finishing attempt ran 124.9 s, resumed from the trajectory of an
# attempt a Spot reclaim stopped after about 4 minutes: 270 s is a floor.
WALL_FLOORS = {'2233f97f7719': 270.0}
PROBE = json.loads((AWS_FIXTURES / 'speedup-probe.json').read_text())
# Version 4: the owner-approved caffeine optimise-steps probe (2026-10-07, Batch job 039fdeca…, L Spot,
# 16 vCPU / 64 GB, job definition rev 7, image 2dd7873233c64661): three def2-SVP steps, SCF + gradient each.
OPTIMISE_PROBE = json.loads((AWS_FIXTURES / 'caffeine-optimise-probe.json').read_text())
LARGE = sizing.SIZES[2]


def test_the_aws_fixtures_are_the_five_jobs_and_two_probes_sizing_v4_was_fitted_on():
    names = {d.name[:12] for d in AWS_JOBS}
    assert names == {'22b6b939b8af', 'ffdaf035aee5', 'df22d76f6f7a', '2233f97f7719', 'f4e66d7330ed'}
    assert PROBE['n'] == [32, 16, 8, 4] and PROBE['basisFunctions'] == 276
    assert OPTIMISE_PROBE['probe'] == 'optimise-steps' and OPTIMISE_PROBE['vcpu'] == LARGE.vcpu == 16
    assert OPTIMISE_PROBE['basisFunctions'] == basis_functions(CAFFEINE, 'def2-SVP') == 246
    assert [s['seconds'] for s in OPTIMISE_PROBE['steps']] == [52.85, 44.534, 42.111]


@pytest.mark.parametrize('folder', AWS_JOBS, ids=lambda d: d.name[:12])
def test_every_aws_run_finishes_inside_the_time_headroom(folder):
    # An under-prediction past TIME_HEADROOM is the failure that costs money
    # (a timeout spends the attempt); an over-prediction only reserves more.
    # Each job is predicted on the size it ran on (caffeine: M).
    job = json.loads((folder / 'job.json').read_text())['job']
    timings = json.loads((folder / 'timings.json').read_text())
    size = next(s for s in sizing.SIZES if s.name == timings['size'])
    wall = WALL_FLOORS.get(folder.name[:12], timings['wallSeconds'])
    assert wall <= sizing.TIME_HEADROOM * sizing.predict_seconds(job, size)


def test_caffeine_on_m_is_no_longer_under_predicted():
    # Version 2 predicted 2275.5 s (SCF 1452, files 824) for a run of 3135 s
    # (SCF 2289, files 847): its SCF term missed, not its files term. Version
    # 3 takes t3 from this run's direct SCF (Ruling T14-speedup).
    folder = next(d for d in AWS_JOBS if d.name.startswith('f4e66d7330ed'))
    job = json.loads((folder / 'job.json').read_text())['job']
    timings = json.loads((folder / 'timings.json').read_text())
    parts = sizing.predict_parts(job, sizing.SIZES[1])
    stages = {s['name']: s['seconds'] for s in timings['stages']}
    assert parts['scfSeconds'] == pytest.approx(stages['SCF (DIIS)'], rel=0.05)
    assert parts['filesSeconds'] == pytest.approx(stages['writing files'], rel=0.05)
    assert parts['scfSeconds'] + parts['filesSeconds'] >= 0.99 * timings['wallSeconds']


def _caffeine_job(recipe):
    """The committed caffeine fixture's own molecule (f4e66d7330ed…, the
    owner's calibration job), re-wrapped for `recipe` by canonical_job --
    not CAFFEINE above, so this is pinned on the fixture itself."""
    folder = next(d for d in AWS_JOBS if d.name.startswith('f4e66d7330ed'))
    molecule = json.loads((folder / 'job.json').read_text())['job']['molecule']
    return canonical_job(recipe, molecule['atoms'], molecule['charge'], molecule['multiplicity'])


def test_caffeine_single_runs_on_l_spot_under_the_live_constants():
    # Review minor 4: pinned on the committed caffeine fixture and the live
    # sizing.CONSTANTS (not a monkeypatch), so a future constants change that
    # moves this must touch this test, not pass silently. Version 4 leaves
    # every single point as version 3 decided it.
    d = sizing.decide(_caffeine_job('single'))
    assert (d['size'], d['vcpu'], d['capacity']) == ('L', 16, 'spot')
    assert d['predictedSeconds'] == pytest.approx(1040.2, rel=0.01)
    assert d['version'] == 4


def test_caffeine_optimise_runs_on_l_on_demand_under_the_live_v4_constants():
    # Version 3 refused it too-long (1.4 h on XL, 2.1 h with the margin): it
    # priced the 58 def2-SVP steps by the direct-SCF t3. Version 4 prices a
    # step whose ERIs fit in core by t3Step, the caffeine probe's slowest
    # step: 1040 s for the final single point plus 58 steps of ~52.9 s on L.
    # Over the 3600 s Spot limit, so on-demand, one attempt; the timeout is
    # the 2 h ceiling (1.75x the prediction, more than TIME_HEADROOM).
    d = sizing.decide(_caffeine_job('optimise'))
    assert (d['size'], d['vcpu'], d['memoryGB']) == ('L', 16, 64)
    assert (d['capacity'], d['attempts']) == ('on-demand', 1)
    assert d['predictedSeconds'] == pytest.approx(1040.2 + 58 * 52.85, rel=0.005)
    assert d['timeoutSeconds'] == 7200 >= sizing.TIME_HEADROOM * d['predictedSeconds']
    assert d['reservationMicros'] == cost_micros('on-demand', 16, 64, 7200 + sizing.BILLING_ALLOWANCE_SECONDS)
    assert d['version'] == 4


def test_the_constants_are_what_calibrate_fits_from_the_fixtures():
    # Version 4 is reproducible: `python -m jobs.calibrate --aws --probe
    # fixtures/aws/speedup-probe.json --optimise-probe
    # fixtures/aws/caffeine-optimise-probe.json fixtures/aws/*/` prints these
    # constants, with only g's guard used (fitted negative: the ladder's few steps).
    from jobs.calibrate import aws_samples, fit_aws, guarded
    constants, guards = guarded(fit_aws(aws_samples(AWS_JOBS), PROBE, OPTIMISE_PROBE))
    assert constants == sizing.CONSTANTS
    assert [g.split(':')[0] for g in guards] == ['g']


def test_the_caffeine_probes_slowest_step_is_reproduced_on_l():
    # t3Step is fitted to the slowest of the three steps (the first, cold from
    # the minao guess, 14 SCF cycles), not their mean, through the SCF's own
    # law min(c, 16)^0.867 and the deployed g: so on L (16 vCPU, as the
    # probe ran) a caffeine def2-SVP step is predicted at 52.85 s, to the
    # rounding of three significant figures.
    slowest = max(s['seconds'] for s in OPTIMISE_PROBE['steps'])
    assert sizing.step_in_core(OPTIMISE_PROBE['basisFunctions'], LARGE)
    assert sizing.step_seconds(OPTIMISE_PROBE['basisFunctions'], LARGE) == pytest.approx(slowest, rel=0.002)


@pytest.mark.parametrize('step', range(3))
def test_every_caffeine_probe_step_finishes_inside_the_time_headroom(step):
    seconds = OPTIMISE_PROBE['steps'][step]['seconds']
    assert seconds <= sizing.TIME_HEADROOM * sizing.step_seconds(OPTIMISE_PROBE['basisFunctions'], LARGE)


@pytest.mark.parametrize('folder', [d for d in AWS_JOBS if d.name[:12] in ('df22d76f6f7a', '2233f97f7719')],
                         ids=lambda d: d.name[:12])
def test_every_aws_optimisation_step_finishes_inside_the_time_headroom(folder):
    # Water's and ethanol's def2-SVP steps on S, in core (N 24 and 72): each
    # step stage (the last runs on into the final SCF's setup, so it is left
    # out, as calibrate does) against v4's step on the size it ran on.
    job = json.loads((folder / 'job.json').read_text())['job']
    timings = json.loads((folder / 'timings.json').read_text())
    size = next(s for s in sizing.SIZES if s.name == timings['size'])
    n = basis_functions(job['molecule']['atoms'], job['method']['optimiseBasis'])
    steps = [s['seconds'] for s in timings['stages'] if s['name'].startswith('optimisation step')][:-1]
    assert steps and sizing.step_in_core(n, size)
    assert all(seconds <= sizing.TIME_HEADROOM * sizing.step_seconds(n, size) for seconds in steps)


def test_a_step_is_in_core_only_if_pyscfs_test_passes_with_a_margin():
    # PySCF keeps the ERIs in core when N^4/1e6 MB + its current RSS < 0.95 x
    # max_memory (scf.hf._is_mem_enough); BatchRunner sets max_memory to 80 %
    # of the size. Sizing stands HEADROOM x the predicted working set in for
    # the RSS, which was 191 MB at that check for caffeine def2-SVP in the
    # worker image: caffeine's steps are in core on every size; a C60-scale
    # molecule's (N 840 at def2-SVP, 498 GB of ERIs) on none.
    from jobs.batch_runner import pyscf_max_memory_mb
    assert all(sizing.step_in_core(246, s) for s in sizing.SIZES)
    assert not any(sizing.step_in_core(basis_functions(carbons(60), 'def2-SVP'), s) for s in sizing.SIZES)
    # The margin: N 265 passes PySCF's own test on S with caffeine's measured
    # 191 MB, but not with the allowance, so it is priced direct (the slower).
    small = sizing.SIZES[0]
    assert 265 ** 4 / 1e6 + 191 < 0.95 * pyscf_max_memory_mb(small.memory_gb)
    assert not sizing.step_in_core(265, small)


def test_a_direct_step_keeps_version_3s_price():
    # A step whose ERIs do not fit is priced as version 3 priced every step:
    # (1 + g) x the direct single point at the optimisation basis.
    n, xl = basis_functions(carbons(60), 'def2-SVP'), sizing.SIZES[-1]
    assert sizing.step_seconds(n, xl) == pytest.approx((1 + sizing.CONSTANTS['g']) * sizing.single_point_seconds(n, xl.vcpu))


def test_single_points_do_not_read_t3step(monkeypatch):
    # Version 4 changes how optimisation steps are priced, nothing else.
    jobs = [canonical_job('single', atoms, 0, 1) for atoms in (WATER, BENZENE, CAFFEINE, carbons(60))]
    before = [sizing.predict_parts(job, s) for job in jobs for s in sizing.SIZES]
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3Step': 1e9})
    assert [sizing.predict_parts(job, s) for job in jobs for s in sizing.SIZES] == before


# Version 3's decisions for every single point the reports track, recorded
# before version 4 was made: version 4 must not move any of them.
V3_SINGLE_POINTS = [
    (WATER, {'size': 'S', 'capacity': 'spot', 'attempts': 3, 'predictedSeconds': 15.4, 'timeoutSeconds': 600,
             'predictedMemoryGB': 0.49, 'reservationMicros': 17880, 'predictedCostMicros': 128}),
    (BENZENE, {'size': 'S', 'capacity': 'spot', 'attempts': 3, 'predictedSeconds': 520.7, 'timeoutSeconds': 1562,
               'predictedMemoryGB': 0.78, 'reservationMicros': 41772, 'predictedCostMicros': 4310}),
    (CAFFEINE, {'size': 'L', 'capacity': 'spot', 'attempts': 3, 'predictedSeconds': 1040.2, 'timeoutSeconds': 3121,
                'predictedMemoryGB': 1.98, 'reservationMicros': 643881, 'predictedCostMicros': 68885}),
]


@pytest.mark.parametrize('atoms,v3', V3_SINGLE_POINTS, ids=['water', 'benzene', 'caffeine'])
def test_every_v3_single_point_decision_is_unchanged(atoms, v3):
    d = sizing.decide(canonical_job('single', atoms, 0, 1))
    assert {k: d[k] for k in v3} == v3


def test_a_c60_scale_single_point_is_still_refused_as_version_3_refused_it():
    with pytest.raises(JobRefused) as e:
        sizing.decide(canonical_job('single', carbons(60), 0, 1))
    assert e.value.message == ('predicted 18.0 h on XL (the fastest size with enough memory); with the 1.5× margin '
                               'that is 27.0 h, longer than the 1 h limit for single')


@pytest.mark.parametrize('i', range(4))
def test_the_probe_is_never_under_predicted_and_its_files_within_15_percent(i):
    # Version 3's t3 is caffeine's (15 SCF cycles) where version 2's was the
    # probe's benzene (7 cycles; a different in-core benzene in the ladder on
    # S ran 9). Per Fock build the two direct SCFs scale as N^3.22, so the
    # N^3.5 form is conservative per cycle, and benzene's SCF is
    # over-predicted by the cycles.
    n = PROBE['n'][i]
    parts = sizing.predict_parts(canonical_job('single', BENZENE, 0, 1), sizing.Size('probe', n, 244))
    assert PROBE['scfSeconds'][i] <= parts['scfSeconds'] <= 1.7 * PROBE['scfSeconds'][i]
    assert parts['filesSeconds'] == pytest.approx(PROBE['filesSeconds'][i], rel=0.15)


def test_every_decision_says_it_is_a_fargate_estimate():
    """M1: a local run is sized and timed as if on Fargate (the Mac runs it
    single-threaded and without a time limit), so the figures say so."""
    job = canonical_job('single', WATER, 0, 1)
    assert sizing.decide(job)['estimateFor'] == 'fargate'
    assert sizing.decide(job, local=True)['estimateFor'] == 'fargate'


# Every AWS sample's working set (its peak less the two-electron integrals
# PySCF held in core only because they fitted; calibrate.incore_eri_gb), as
# Task 14 fitted memory on: the ladder on S (PYSCF_MAX_MEMORY 80 % of 8 GB),
# the probe's benzene at PySCF's default 4000 MB, where it ran direct, and
# caffeine on M (PYSCF_MAX_MEMORY 80 % of 16 GB), direct too.
AWS_PEAKS = [(58, 0.326, 8, None), (58, 0.351, 8, None), (168, 1.392, 8, None), (276, 6.104, 8, None),
             (276, 0.919, None, 4000), (276, 0.897, None, 4000), (276, 0.886, None, 4000), (276, 0.882, None, 4000),
             (614, 1.906, 16, None)]


@pytest.mark.parametrize('n,peak,memory_gb,max_memory_mb', AWS_PEAKS)
def test_the_memory_headroom_covers_every_aws_working_set(n, peak, memory_gb, max_memory_mb):
    # A size is chosen at HEADROOM × predicted memory, so that is what a job
    # may use before it is out of memory (Task 14 review minor).
    from jobs.calibrate import incore_eri_gb
    working_set = peak - incore_eri_gb(n, memory_gb, max_memory_mb)
    assert 0 < working_set <= sizing.HEADROOM * sizing.predicted_memory_gb(n)
