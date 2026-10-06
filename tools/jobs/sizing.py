"""The app chooses the worker, deterministically (spec §7).

Memory ~ N² (matrices, DIIS history, the integration grid); one DFT single
point ~ N^3.5 on one vCPU, sped up by c^0.8 on c vCPUs (PySCF's threading is
good, not perfect). Writing the grid files is a second, separate cost: it
scales with N² like memory, but it is single-threaded regardless of vCPU
count (Phase 6's grid-writing code has no threading), so it is added after
speedup rather than divided by it (Ruling D14). The open-shell factor
applies only to the SCF part: writing files does not care how many
electrons were unpaired. Version 0 carries seed constants; Task 11 fits
version 1 from local runs (water, benzene) and Phase 6B-3 refits version 2
from the AWS ladder. Every job records the version and the prediction so
the fit can be checked.
"""
import math
from dataclasses import dataclass

from jobs.basis_counts import basis_functions
from jobs.errors import JobRefused
from jobs.prices import cost_micros


@dataclass(frozen=True)
class Size:
    name: str
    vcpu: int
    memory_gb: int


SIZES = (Size('S', 2, 8), Size('M', 4, 16), Size('L', 16, 64), Size('XL', 32, 244))
SIZING_VERSION = 1
# Fitted 2026-10-06 on an Apple M2 Pro (single-threaded PySCF on this Mac;
# threads == 1 in every timing) from three local jobs: water (N 58), benzene
# (N 276) and caffeine (N 614), all B3LYP/def2-TZVPD single points
# (tools/jobs/calibrate.py; Phase 6B-1 Task 11). m0, m2 and f2 came out
# positive, so no clamp applied; t0 and g keep their seeds for 6B-3's AWS fit.
CONSTANTS = {'m0': 0.412, 'm2': 3.73, 't0': 5.0, 't3': 19400.0, 'g': 1.5, 'f2': 2480.0}
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


def speedup(vcpu: int) -> float:
    return vcpu ** 0.8


def single_point_seconds(n: int, vcpu: int) -> float:
    c = CONSTANTS
    return (c['t0'] + c['t3'] * (n / 1000) ** 3.5) / speedup(vcpu)


def predicted_memory_gb(n: int) -> float:
    return CONSTANTS['m0'] + CONSTANTS['m2'] * (n / 1000) ** 2


def optimisation_steps(atom_count: int) -> int:
    return min(10 + 2 * atom_count, 100)


def predict_parts(job: dict, size: Size) -> dict:
    """The SCF estimate and the file-writing estimate, kept apart (Ruling D14).

    `scfSeconds` is the brief's original model: the final single point at
    the property basis, plus (for `optimise`) the optimisation steps at the
    optimisation basis, all sped up by vCPU count and then scaled by the
    open-shell factor. `filesSeconds` is the grid the worker writes out at
    the property basis (def2-TZVPD); it is neither divided by speedup nor
    scaled by the open-shell factor, because writing files is single-threaded
    and indifferent to spin.
    """
    atoms, method = job['molecule']['atoms'], job['method']
    scf = single_point_seconds(basis_functions(atoms, method['basis']), size.vcpu)
    if method['optimiseBasis']:
        step = (1 + CONSTANTS['g']) * single_point_seconds(basis_functions(atoms, method['optimiseBasis']), size.vcpu)
        scf += optimisation_steps(len(atoms)) * step
    if job['molecule']['multiplicity'] > 1:
        scf *= OPEN_SHELL_FACTOR
    n_property = basis_functions(atoms, method['basis'])
    files = CONSTANTS['f2'] * (n_property / 1000) ** 2
    return {'scfSeconds': scf, 'filesSeconds': files}


def predict_seconds(job: dict, size: Size) -> float:
    parts = predict_parts(job, size)
    return parts['scfSeconds'] + parts['filesSeconds']


def decide(job: dict, local: bool = False) -> dict:
    """Pick the smallest worker with enough memory and enough time (Ruling T11-a).

    A worker must clear two independent bars: memory ≥ HEADROOM × predicted,
    and predicted time × TIME_HEADROOM ≤ the recipe's ceiling. The second bar
    exists because a bigger worker is also a faster one (more vCPUs speed up
    the SCF part, Ruling D14's file-writing term aside), so a job too slow
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
        raise JobRefused('too-long', f'predicted {best_seconds / 3600:.1f} h on {best.name} (the fastest size with '
                                     f'enough memory), {TIME_HEADROOM:g}× margin included: longer than this phase '
                                     f'allows for {job["recipe"]} ({ceiling / 3600:g} h)')
    timeout = int(min(max(math.ceil(TIMEOUT_FACTOR * seconds), MIN_TIMEOUT_SECONDS), ceiling))
    if local:
        capacity, attempts = 'local', 1
    elif SPOT_AVAILABLE and seconds <= SPOT_LIMIT_SECONDS:
        capacity, attempts = 'spot', SPOT_ATTEMPTS
    else:
        capacity, attempts = 'on-demand', 1
    # estimateFor (M1): size, time and timeout are Fargate figures even for a
    # local run, which this Mac runs single-threaded and with no time limit;
    # the field lets 6B-2 label them "Fargate estimate" rather than a promise.
    return {'version': SIZING_VERSION, 'estimateFor': 'fargate', 'size': size.name, 'vcpu': size.vcpu,
            'memoryGB': size.memory_gb, 'capacity': capacity, 'attempts': attempts, 'basisFunctions': n,
            'predictedSeconds': round(seconds, 1), 'predictedMemoryGB': round(memory, 2),
            'timeoutSeconds': timeout,
            'reservationMicros': attempts * cost_micros(capacity, size.vcpu, size.memory_gb, timeout),
            'predictedCostMicros': cost_micros(capacity, size.vcpu, size.memory_gb, seconds)}
