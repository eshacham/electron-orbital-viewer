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
SIZING_VERSION = 0
# f2 seed: water 11.6 s @ N 58, benzene 204 s @ N 276 (single-threaded Mac measurement).
CONSTANTS = {'m0': 0.5, 'm2': 2.0, 't0': 5.0, 't3': 2400.0, 'g': 1.5, 'f2': 3000.0}
HEADROOM = 2.0
TIMEOUT_FACTOR = 3.0
MIN_TIMEOUT_SECONDS = 600
CEILING_SECONDS = {'single': 3600, 'optimise': 7200}
SPOT_LIMIT_SECONDS = 3600
SPOT_ATTEMPTS = 3
OPEN_SHELL_FACTOR = 1.5


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
    n = basis_functions(job['molecule']['atoms'], job['method']['basis'])
    memory = predicted_memory_gb(n)
    fitting = [s for s in SIZES if s.memory_gb >= HEADROOM * memory]
    if not fitting:
        raise JobRefused('too-large', f'predicted {memory:.0f} GB of memory (N = {n}): beyond the largest Fargate '
                                      f'worker ({SIZES[-1].memory_gb} GB with {HEADROOM:g}× headroom)')
    size = fitting[0]
    seconds = predict_seconds(job, size)
    ceiling = CEILING_SECONDS[job['recipe']]
    if seconds > ceiling:
        raise JobRefused('too-long', f'predicted {seconds / 3600:.1f} h on {size.name}: longer than this phase allows '
                                     f'for {job["recipe"]} ({ceiling / 3600:g} h)')
    timeout = int(min(max(math.ceil(TIMEOUT_FACTOR * seconds), MIN_TIMEOUT_SECONDS), ceiling))
    if local:
        capacity, attempts = 'local', 1
    elif seconds <= SPOT_LIMIT_SECONDS:
        capacity, attempts = 'spot', SPOT_ATTEMPTS
    else:
        capacity, attempts = 'on-demand', 1
    return {'version': SIZING_VERSION, 'size': size.name, 'vcpu': size.vcpu, 'memoryGB': size.memory_gb,
            'capacity': capacity, 'attempts': attempts, 'basisFunctions': n,
            'predictedSeconds': round(seconds, 1), 'predictedMemoryGB': round(memory, 2),
            'timeoutSeconds': timeout,
            'reservationMicros': attempts * cost_micros(capacity, size.vcpu, size.memory_gb, timeout),
            'predictedCostMicros': cost_micros(capacity, size.vcpu, size.memory_gb, seconds)}
