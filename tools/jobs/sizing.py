"""The app chooses the worker, deterministically (spec §7).

Memory ~ N² (matrices, DIIS history, the integration grid); one DFT single
point ~ N^3.5 on one vCPU, sped up on c vCPUs by speedup(c) = min(c, C)^a:
PySCF's threading gains nearly linearly to C threads and nothing beyond
(the speedup probe, Phase 6B-3). Writing the grid files is a second,
separate cost (Ruling D14): it scales with N² like memory, and on Linux it
is threaded too, by a law of its own, files_speedup(c), which levels off
later than the SCF's. (Version 1 left it undivided: this Mac's PySCF has no
OpenMP, so nothing local could show it.) The open-shell factor applies only
to the SCF part: writing files does not care how many electrons were
unpaired. Version 1 was fitted from local runs (6B-1 Task 11); version 2
from the AWS ladder and the speedup probe (6B-3 Task 14); version 3 adds the
owner's caffeine single point on M, the first real direct SCF (6B-3
follow-up); version 4 prices an optimisation step by its regime: a step
whose ERIs fit in core (step_in_core) by t3Step, from the caffeine
optimise-steps probe, and otherwise by the direct t3, as before. Every job
records the version and the prediction so the fit can be checked.
"""
import math
from dataclasses import dataclass

from jobs.basis_counts import basis_functions
from jobs.batch_runner import pyscf_max_memory_mb
from jobs.errors import JobRefused
from jobs.prices import cost_micros


@dataclass(frozen=True)
class Size:
    name: str
    vcpu: int
    memory_gb: int


SIZES = (Size('S', 2, 8), Size('M', 4, 16), Size('L', 16, 64), Size('XL', 32, 244))
SIZING_VERSION = 4
# Version 4, fitted 2026-10-07 (Phase 6B-3 follow-up): version 3's constants and forms, plus t3Step, with
# `python -m jobs.calibrate --aws --probe tests/fixtures/aws/speedup-probe.json
#  --optimise-probe tests/fixtures/aws/caffeine-optimise-probe.json tests/fixtures/aws/*/`.
# Version 3 priced every optimisation step by the direct-SCF t3 (42 000) and so refused caffeine optimise
# (1.4 h on XL, 2.1 h with the margin, over 2 h), though its def2-SVP steps (N 246) fit in core on every size.
# - t3Step: the owner-approved caffeine optimise-steps probe (Batch job 039fdeca..., L Spot, 16 vCPU / 64 GB,
#   job definition rev 7, image 2dd7873233c64661): three def2-SVP steps (SCF + gradient) of 52.85 s (14 SCF
#   cycles, cold from the minao guess), 44.53 s (11) and 42.11 s (10). The slowest, through the SCF's law
#   min(c, 16)^0.867 and the deployed g (1.5) and t0: (52.85 x 16^0.867 / 2.5 - 4.84) / 0.246^3.5 = 31 026
#   -> 31 000. Water's and ethanol's steps on S (N 24 and 72) offer at most -8 845 (t0 dominates them).
#   Caveat: the probe ran without PYSCF_MAX_MEMORY (PySCF's default 4000 MB), and in the worker image
#   caffeine def2-SVP's ERIs (3662 MB) plus the RSS at the check (191 MB) miss 0.95 x 4000, so its SCFs ran
#   DIRECT. 31 000 is therefore a direct step's cost, an upper bound for an in-core one (which a real job
#   gets: BatchRunner gives PySCF 80 % of the size). The direct t3 for a step stays version 3's (1 + g) x
#   42 000 form, 71.2 s on L for caffeine: 35 % over this probe, so it too is conservative here.
# - step_in_core: PySCF's own test with HEADROOM x the predicted working set standing in for its RSS
#   (1.54 GB at N 246 against the 191 MB measured), so in core up to N 260 on S, 320 on M, 465 on L, 655 on
#   XL. Wrongly assuming in core prices a direct step by t3Step: at caffeine's N that matches its measured
#   direct step (the probe), 1.35x below the direct price. The margin is for larger N, where no def2-SVP
#   step has been measured; the worst case there is t3 / the ladder's in-core t3, 42 000 / 9 050 = 4.6x.
# - g and the step count are unchanged: g fits -0.29 (guarded to 1.5) and water ran 3 steps of 16 predicted;
#   nothing measured at caffeine's size contradicts either (3 steps were run, not a whole optimisation).
# Residuals (predicted / measured - 1): the probe's steps on L -0.08 %, +18.6 %, +25.4 %; water's steps on S
# +608 % and +701 %, ethanol's +101 %; water optimise +435 % (123.0 s against 23.0 s), ethanol optimise +67 %
# against its 270 s floor. Every single point predicts as in version 3 (single points never read t3Step).
# Every AWS job, every step of theirs, and every probe step finishes inside TIME_HEADROOM x its v4
# prediction (tests/test_sizing.py, which also checks calibrate reproduces these constants).
#
# Version 3, fitted 2026-10-07 from 5 AWS Batch jobs on Fargate Linux/ARM64 (Graviton) with
# `python -m jobs.calibrate --aws --probe tests/fixtures/aws/speedup-probe.json tests/fixtures/aws/*/`
# (Phase 6B-3 follow-up): version 2's four ladder jobs on S (2 vCPU, Spot; water and benzene single
# points, water and ethanol optimisations), the owner's caffeine single point on M (4 vCPU, Spot; N 614,
# 3135 s), and the speedup probe (benzene's SCF and file write at 4, 8, 16 and 32 threads on XL).
# The forms are version 2's; only t3, f2, m0 and m2 moved. One guard used: g fitted -0.29 (the ladder's
# few optimisation steps ran faster than the single-point rule predicts), so it keeps 1.5.
# How each was got (Ruling T14-speedup; the slower prediction wherever the data allow two):
# - scfExponent, scfSaturation: the probe's SCF, min(c, 16)^0.867 to within 5.2 % at every thread count.
#   One power law (0.596) misses by up to 30 %: 4 -> 16 threads gained 3.5x, 16 -> 32 nothing.
# - filesExponent, filesSaturation: the probe's file write, on its own law, min(c, 32)^0.631, within
#   10 % (a plateau at 16 fits worse and would promise L more); undivided misses by up to 2.1x.
# - t3: caffeine's direct SCF (42 000), the slowest of three: the probe's direct SCF gives 27 700 (the
#   slowest of its four points, not their mean -- a weighted average would let a fast large sample
#   outvote a slow one) and the in-core ladder 9 050. Version 2 took the probe's and predicted caffeine's
#   SCF at 1452 s on M; it took 2289 s. Caffeine needed 15 SCF cycles to the probe's own benzene's 7 (a
#   different in-core benzene, in the ladder on S, ran 9 cycles; the ladder's benzene and the probe's are
#   two different runs). Per Fock build (cycles + init + extra: 17 vs 9), the two direct SCFs scale as
#   N^3.22, so N^3.5 is conservative per cycle, and the gap is cycle count, which a larger molecule is
#   likelier to share with caffeine than with benzene. Benzene's direct SCF (the probe) is now
#   over-predicted by 51-65 % (safe).
# - t0: the in-core ladder's intercept alone (4.84, as version 2). One line through in-core and direct
#   runs together fits -100.5: a direct SCF is slower per (N/1000)^3.5 at every N.
# - f2: the ladder, the probe and caffeine, each multiplied back up by files_speedup (5240 -> 5360).
#   Version 2's files term was right on M: 824 s predicted, 847 s measured.
# - m0, m2: the working set, i.e. the peak less the in-core ERIs PySCF kept only because they fitted
#   (benzene's 6.1 GB peak on S is 5.4 GB of them), with the probe's direct-SCF peaks (0.9 GB) and
#   caffeine's (1.906 GB at N 614, predicted 1.98): m2 6.77 -> 3.98.
# Residuals (predicted / measured - 1): caffeine on M -0.04 % in all (SCF +0.1 %, files -0.5 %); the
# ladder on S (wall) water single +2.3 %, benzene single +98 %, water optimise +437 %, ethanol optimise
# +82 % against its 270 s floor; the probe's files -10.3 to +7.3 %, its SCF +51 to +65 %; working sets
# -15 % (the probe's) to +56 % (water's), caffeine's +3.7 %. Every AWS job finishes inside TIME_HEADROOM x
# its v3 prediction on the size it ran on, and HEADROOM x the v3 memory covers every working set
# (tests/test_sizing.py, which also checks calibrate reproduces these constants from the fixtures).
# Versions 1 (6B-1 Task 11, this Mac) and 2 (6B-3 Task 14) stay in git history; version 3 is version 4
# without t3Step (every step priced direct).
CONSTANTS = {'m0': 0.477, 'm2': 3.98, 't0': 4.84, 't3': 42000.0, 't3Step': 31000.0, 'g': 1.5, 'f2': 5360.0,
             'scfExponent': 0.867, 'scfSaturation': 16.0, 'filesExponent': 0.631, 'filesSaturation': 32.0}
HEADROOM = 2.0
TIME_HEADROOM = 1.5
TIMEOUT_FACTOR = 3.0
MIN_TIMEOUT_SECONDS = 600
CEILING_SECONDS = {'single': 3600, 'optimise': 7200}
SPOT_LIMIT_SECONDS = 3600
SPOT_ATTEMPTS = 3
OPEN_SHELL_FACTOR = 1.5
# Fargate Spot runs Linux/ARM64 Batch jobs (AWS What's New 2025-08-14; checked 2026-10-05, Phase 6B-3
# Task 1, and proven by Task 12's first job). False sends everything on-demand with one attempt.
SPOT_AVAILABLE = True
# D6 (preflight): Fargate bills from pullStartedAt to stoppedAt, which covers
# the image pull and the stop grace -- neither counted by attemptDurationSeconds
# (the timeout). Reserving only attempts x cost(timeout) under-reserves every
# non-local job by that much; add this allowance before pricing the reservation.
# Local runs have no Fargate bill, so they are untouched (cost_micros('local', ...) is 0 either way).
BILLING_ALLOWANCE_SECONDS = 120


def speedup(vcpu: int) -> float:
    """How much faster the SCF runs on vcpu threads than on one."""
    return min(vcpu, CONSTANTS['scfSaturation']) ** CONSTANTS['scfExponent']


def files_speedup(vcpu: int) -> float:
    """How much faster the file write runs on vcpu threads than on one."""
    return min(vcpu, CONSTANTS['filesSaturation']) ** CONSTANTS['filesExponent']


def single_point_seconds(n: int, vcpu: int) -> float:
    c = CONSTANTS
    return (c['t0'] + c['t3'] * (n / 1000) ** 3.5) / speedup(vcpu)


def predicted_memory_gb(n: int) -> float:
    return CONSTANTS['m0'] + CONSTANTS['m2'] * (n / 1000) ** 2


def optimisation_steps(atom_count: int) -> int:
    return min(10 + 2 * atom_count, 100)


# MB (1e6 bytes, what PySCF's lib.current_memory and N^4/1e6 count) per GiB
# (what predicted_memory_gb and every peakMemoryGB count).
_MB_PER_GIB = 1024 ** 3 / 1e6


def step_in_core(n: int, size: Size) -> bool:
    """Whether an optimisation step at N basis functions keeps its ERIs in
    core on `size` (version 4).

    PySCF's own test (scf.hf._is_mem_enough): N^4/1e6 MB of 8-fold ERIs plus
    its current RSS under 0.95 x max_memory, which BatchRunner sets to 80 %
    of the size (pyscf_max_memory_mb). Sizing cannot know the RSS, so it
    stands HEADROOM x the predicted working set in for it: 1.54 GB for
    caffeine at def2-SVP, where the worker image measured 191 MB at that
    check. The margin errs towards "direct", the slower price: wrongly
    assuming in core would price a direct step by t3Step, under-predicting it.
    """
    allowance = HEADROOM * predicted_memory_gb(n) * _MB_PER_GIB
    return n ** 4 / 1e6 + allowance < 0.95 * pyscf_max_memory_mb(size.memory_gb)


def step_seconds(n: int, size: Size) -> float:
    """One optimisation step (SCF + gradient) at N basis functions on `size`:
    (1 + g) x a single point, whose t3 is t3Step when the step's ERIs fit in
    core (step_in_core) and the direct-SCF t3 otherwise, as version 3 priced
    every step."""
    c = CONSTANTS
    if not step_in_core(n, size):
        return (1 + c['g']) * single_point_seconds(n, size.vcpu)
    return (1 + c['g']) * (c['t0'] + c['t3Step'] * (n / 1000) ** 3.5) / speedup(size.vcpu)


def predict_parts(job: dict, size: Size) -> dict:
    """The SCF estimate and the file-writing estimate, kept apart (Ruling D14).

    `scfSeconds` is the brief's original model: the final single point at
    the property basis, plus (for `optimise`) the optimisation steps at the
    optimisation basis (step_seconds: priced by regime since version 4), all
    sped up by vCPU count and then scaled by the open-shell factor. `filesSeconds` is the grid the worker writes out at
    the property basis (def2-TZVPD), divided by its own files_speedup and
    not scaled by the open-shell factor, because writing files is
    indifferent to spin.
    """
    atoms, method = job['molecule']['atoms'], job['method']
    scf = single_point_seconds(basis_functions(atoms, method['basis']), size.vcpu)
    if method['optimiseBasis']:
        scf += optimisation_steps(len(atoms)) * step_seconds(basis_functions(atoms, method['optimiseBasis']), size)
    if job['molecule']['multiplicity'] > 1:
        scf *= OPEN_SHELL_FACTOR
    n_property = basis_functions(atoms, method['basis'])
    files = CONSTANTS['f2'] * (n_property / 1000) ** 2 / files_speedup(size.vcpu)
    return {'scfSeconds': scf, 'filesSeconds': files}


def predict_seconds(job: dict, size: Size) -> float:
    parts = predict_parts(job, size)
    return parts['scfSeconds'] + parts['filesSeconds']


def decide(job: dict, local: bool = False) -> dict:
    """Pick the smallest worker with enough memory and enough time (Ruling T11-a).

    A worker must clear two independent bars: memory ≥ HEADROOM × predicted,
    and predicted time × TIME_HEADROOM ≤ the recipe's ceiling. The second bar
    exists because a bigger worker is also a faster one (more vCPUs speed up
    both the SCF and the file write), so a job too slow
    for a small worker's ceiling may still fit on a larger one. Sizes are
    tried smallest first; predicted seconds is non-increasing in vCPU count,
    so the first one to clear both bars is the cheapest that works. If none
    does, even the fastest memory-qualifying size is reported as too-long.
    """
    n = basis_functions(job['molecule']['atoms'], job['method']['basis'])
    memory = predicted_memory_gb(n)
    memory_fitting = [s for s in SIZES if s.memory_gb >= HEADROOM * memory]
    if not memory_fitting:
        raise JobRefused('too-large', f'predicted {memory:.0f} GB of memory (N = {n}): beyond the largest Fargate '
                                      f'worker ({SIZES[-1].memory_gb} GB with {HEADROOM:g}× headroom)')
    ceiling = CEILING_SECONDS[job['recipe']]
    size = seconds = None
    for candidate in memory_fitting:
        candidate_seconds = predict_seconds(job, candidate)
        if candidate_seconds * TIME_HEADROOM <= ceiling:
            size, seconds = candidate, candidate_seconds
            break
    if size is None:
        best = memory_fitting[-1]
        best_seconds = predict_seconds(job, best)
        margined_hours = best_seconds * TIME_HEADROOM / 3600
        raise JobRefused('too-long', f'predicted {best_seconds / 3600:.1f} h on {best.name} (the fastest size with '
                                     f'enough memory); with the {TIME_HEADROOM:g}× margin that is {margined_hours:.1f} h, '
                                     f'longer than the {ceiling / 3600:g} h limit for {job["recipe"]}')
    timeout = int(min(max(math.ceil(TIMEOUT_FACTOR * seconds), MIN_TIMEOUT_SECONDS), ceiling))
    if local:
        capacity, attempts = 'local', 1
    elif SPOT_AVAILABLE and seconds <= SPOT_LIMIT_SECONDS:
        capacity, attempts = 'spot', SPOT_ATTEMPTS
    else:
        capacity, attempts = 'on-demand', 1
    # D6: reserve against the bill, not just the timeout -- see
    # BILLING_ALLOWANCE_SECONDS. A local run bills nothing, so it keeps the
    # bare timeout (cost_micros('local', ...) is 0 regardless).
    reservation_seconds = timeout if local else timeout + BILLING_ALLOWANCE_SECONDS
    # estimateFor (M1): size, time and timeout are Fargate figures even for a
    # local run, which this Mac runs single-threaded (macOS PySCF has no
    # OpenMP) and with no time limit; the field lets 6B-2 label them
    # "Fargate estimate" rather than a promise.
    return {'version': SIZING_VERSION, 'estimateFor': 'fargate', 'size': size.name, 'vcpu': size.vcpu,
            'memoryGB': size.memory_gb, 'capacity': capacity, 'attempts': attempts, 'basisFunctions': n,
            'predictedSeconds': round(seconds, 1), 'predictedMemoryGB': round(memory, 2),
            'timeoutSeconds': timeout,
            'reservationMicros': attempts * cost_micros(capacity, size.vcpu, size.memory_gb, reservation_seconds),
            'predictedCostMicros': cost_micros(capacity, size.vcpu, size.memory_gb, seconds)}
