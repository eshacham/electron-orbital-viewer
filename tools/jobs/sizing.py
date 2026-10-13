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
optimise-steps probe, and otherwise by the direct t3, as before; version 5
scales the step count by stepScale, fitted from the AWS optimisations'
measured step counts (the owner's caffeine optimise ran 11 of 58). Every
job records the version and the prediction so the fit can be checked.
Version 6 (Phase 6D) prices recipe B's frequency check -- an analytic
Hessian, h x one optimisation step x atoms -- and labelling the orbitals
(Ruling D7), and hands the worker the figures its time budget reads
(budget_parts).
"""
import math
from dataclasses import dataclass

from jobs.basis_counts import basis_functions
from jobs.batch_runner import pyscf_max_memory_mb
from jobs.canonical import electron_count
from jobs.errors import JobRefused
from jobs.input_template import predicted_frequencies_bytes
from jobs.prices import cost_micros


@dataclass(frozen=True)
class Size:
    name: str
    vcpu: int
    memory_gb: int


SIZES = (Size('S', 2, 8), Size('M', 4, 16), Size('L', 16, 64), Size('XL', 32, 244))
SIZING_VERSION = 6
# Version 6, 2026-10-09 (Phase 6D spec §10, Ruling D7): version 5's constants and forms, plus two terms.
# - h, the frequency check's price. Recipe B (compute version 2 on) checks its optimised structure with an
#   analytic Hessian at def2-SVP: frequency_seconds = h x step_seconds(N_SVP) x atoms, x OPEN_SHELL_FACTOR for an
#   open shell. Before it was measured h was 1.5: PySCF 2.8's RKS Hessian cost 0.84 (ethanol) to 1.06 (water)
#   SCF+gradient steps per atom on this Mac (def2-SVP, one thread, 2026-10-08) -- the textbook cost of an analytic
#   Hessian, 3N CPHF perturbations, about a gradient's work per atom -- with room for poorer threading.
#   Measured 2026-10-09 by the owner-approved Hessian probe (Batch job 3a9f334b-495a-4e8e-9af2-fc3969d7278b, L
#   on demand, 16 vCPU / 64 GB, PYSCF_MAX_MEMORY 52 428 as BatchRunner sets it, job definition rev 12, image
#   ef20a86beec20439; tests/fixtures/aws/hessian-probe.json), each Hessian over sizing's own price for one
#   def2-SVP step on L, per atom: water (N 24) step 0.386 s, Hessian 0.678 s, h 0.204; ethanol (N 72) step
#   3.67 s, Hessian 24.6 s, h 1.52; caffeine (N 246) step 38.7 s, Hessian 881 s, h 0.695.
#   Ruling h=1.00: h is fitted only from molecules of at least 200 def2-SVP basis functions
#   (calibrate.HESSIAN_MIN_BASIS_FUNCTIONS), the slowest kept, and floored at 1.00 until a second such molecule
#   is measured: h = 1.00, with `--hessian-probe` added to version 5's command. Below N 200 the step's price on
#   L is mostly t0, so water's and ethanol's ratios measure the step law's miss at small N on 16 vCPU (ethanol's
#   step ran 3.67 s against 1.80 s priced: 16 threads gained 1.7x over this Mac's one), not the Hessian, and
#   such molecules run on S. 1.00 covers caffeine's 0.695 with about 44 % to spare (1267 s against 881 s).
#   The D3 terms are not priced (spec §10: negligible).
# - labelling the orbitals (labelling_seconds; LABEL_* below), which runs after the time budget's last decision
#   and is in no measured file write (every AWS sample predates it). It moves single points too, by 1-5 %.
# Caffeine optimise moves from 2205 s (L, Spot) under version 5 to 3496.6 s (check 1267.4 s): under the 3600 s
# Spot limit, so L Spot, three attempts (with the provisional h 1.5 it was 4130 s, on demand). Caffeine single
# moves from 1043.5 s to 1067.5 s on L (labelling 24.0 s), water single 15.5 -> 16.3 s.
#
# Version 5, fitted 2026-10-08 (Phase 6B-3 follow-up) with the same command as version 4 (below), from 6 AWS
# jobs: version 4's five plus the owner's caffeine optimise (09ae0fa051c6..., L on-demand, 16 vCPU / 64 GB,
# sized by v4: DONE in 1022 s of 4103 predicted; 11 steps of 58; final SCF 441 s, files 192 s, peak 5.67 GB).
# - stepScale (new, 0.375): optimisation_steps = ceil(stepScale x (10 + 2 x atoms)), at most MAX_STEPS.
#   Measured / (10 + 2 x atoms): water 3 of 16, ethanol 7 of 28 (5 in its reclaimed attempt 1, from that
#   attempt's trajectory, and 2 in attempt 2), caffeine 11 of 58. stepScale = TIME_HEADROOM x the largest
#   (ethanol's 0.25), so every sample is predicted at 1.5x its count or more (water 6, ethanol 11,
#   caffeine 22), and a molecule stepping up to 1.5x worse than ethanol still has no more steps than predicted.
# - t3Step stays 31 000 (the probe's cold direct step, 52.85 s on L). Caffeine's slowest timed step was 39.1 s
#   (11 SCF cycles); its first, cold one (14 cycles) fell in no stage before version 5's worker, and the log's
#   cycles (14, 11, 10, ... 6) against the timed steps (~1.8 s a cycle plus ~19 s) put it near 45 s: in core,
#   faster than the probe. The jobs' median steps offer 20 040; the slower is kept.
# - t3 stays 42 000. The final def2-TZVPD SCF ran DIRECT on L (its ERIs need 614^4/1e6 = 142 GB against
#   0.95 x 52 428 MB; peak 5.7 GB), 441 s against 689 s predicted: t3 26 900 at 16 vCPU against caffeine on
#   M's 41 950 at 4. M -> L gained 5.2x where min(c, 16)^0.867 promises 3.3x; the slower is kept.
#   Single points stay priced direct everywhere (no in-core t3 for a def2-TZVPD SCF): the only in-core
#   ones measured are the ladder's (N <= 276, on S), and 9 050 would put water single and ethanol's final
#   SCF under their measured times. No recipe A decision moves but by f2's +0.9 %.
# - f2 5 360 -> 5 410: only the slowest one-vCPU file write at each N joins the least squares now. Caffeine's
#   ran 4.4x faster on L than on M (the law promises 2.4x) and would pull f2 to 4 260, under the M run by 21 %;
#   N 58 (two runs) and N 276 (the ladder's benzene and the probe's four) move it the other way.
# - m0, m2 0.477, 3.98 -> 0.459, 4.35: caffeine optimise's working set is its peak less the steps' in-core
#   def2-SVP ERIs (3.4 GiB; the log shows ~4.1 GB in use at each gradient): 2.23 GB at N 614.
# - g still fits negative (-0.12) and keeps 1.5.
# Residuals (predicted / measured - 1, on the size each ran on; wall): caffeine optimise +116 % (v4 +302 %),
# its steps +35 to +42 %; water optimise +143 % (v4 +435 %); ethanol optimise -1.6 % against its 270 s floor
# (which counts the reclaimed attempt; v4 +67 %); water single +3.0 %, benzene single +99 %, caffeine single on
# M +0.2 %; the optimise probe's steps -0.1 to +25 %; working sets -9 % (ethanol's) to +50 % (water's).
# Every AWS job, step and probe step is inside TIME_HEADROOM x its v5 prediction, HEADROOM x the v5 memory
# covers every working set, and no single point's size, capacity, attempts, prediction, timeout or reservation
# is below version 4's (tests/test_sizing.py, which also checks calibrate reproduces these constants).
#
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
#   direct step (the probe), 1.35x below the direct price, and that ~1.35x (42 000 / 31 000) is the worst
#   case while t3Step stays a direct-step figure. It becomes ~4.6x (42 000 / 9 050) only if t3Step is
#   refitted from a true in-core probe (PYSCF_MAX_MEMORY set) near 9 000; then this margin is what
#   protects the timeout.
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
CONSTANTS = {'m0': 0.459, 'm2': 4.35, 't0': 4.84, 't3': 42000.0, 't3Step': 31000.0, 'g': 1.5, 'f2': 5410.0,
             'stepScale': 0.375, 'h': 1.0, 'scfExponent': 0.867, 'scfSaturation': 16.0, 'filesExponent': 0.631,
             'filesSaturation': 32.0}
HEADROOM = 2.0
TIME_HEADROOM = 1.5
TIMEOUT_FACTOR = 3.0
MIN_TIMEOUT_SECONDS = 600
# Phase 6C quotes (owner decision 2026-10-08): the recipe's time no longer refuses a job; the price the owner
# approves caps it. TARGET_SECONDS (what CEILING_SECONDS was: single 1 h, optimise 2 h) now only chooses the
# size: the smallest whose margined prediction fits the target. SANITY_CEILING_SECONDS refuses the absurd: a
# prediction longer than 48 h even on the fastest size with enough memory.
TARGET_SECONDS = {'single': 3600, 'optimise': 7200}
SANITY_CEILING_SECONDS = 48 * 3600
# Fix round 1 (review minor 2): the ceiling is applied to the size that would run (which _choose may take up
# to TIME_HEADROOM slower than the fastest), and the time limit it implies is bounded absolutely: at most 6 days
# of Fargate wall time for any job. A shorter bound (the review's example, 72 h) would refuse every prediction
# over 24 h, half the owner's 48 h example: an owner decision, not made here.
MAX_TIMEOUT_SECONDS = 3 * SANITY_CEILING_SECONDS
# Spot is offered only for a run predicted at this or less (an availability rule for the Spot option since
# Phase 6C, no longer a refusal): a reclaim late in a long run would waste most of it, and every attempt bills.
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


# geomeTRIC's step limit in input.py (input_template.MAX_STEPS): no job runs more steps than this.
MAX_STEPS = 100


def step_form(atom_count: int) -> int:
    """Versions 1-4's step count, 10 + 2 x atoms, which version 5 scales by stepScale."""
    return 10 + 2 * atom_count


def optimisation_steps(atom_count: int) -> int:
    """The steps an optimisation is priced for (version 5): stepScale x
    (10 + 2 x atoms), rounded up, at most MAX_STEPS. stepScale is fitted
    (calibrate.fit_step_scale) so every AWS optimisation's measured count
    is at most 1 / TIME_HEADROOM of its prediction."""
    return min(math.ceil(round(CONSTANTS['stepScale'] * step_form(atom_count), 6)), MAX_STEPS)


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


def runs_frequency_check(job: dict) -> bool:
    """Recipe B checks its structure from compute version 2 (input_template.render_input's rule); a single
    point, and a compute-version-1 job (an owner's retry of one), do not."""
    return bool(job['method']['optimiseBasis']) and job.get('computeVersion', 1) >= 2


def frequency_seconds(job: dict, size: Size) -> float:
    """Recipe B's frequency check (version 6, Phase 6D spec §10): the analytic Hessian at the optimisation
    basis, h x one step there x atoms, an open shell scaled as its SCF is. Zero for a single point, and for a
    compute-version-1 job (an owner's retry of one), which runs no check."""
    if not runs_frequency_check(job):
        return 0.0
    atoms = job['molecule']['atoms']
    seconds = CONSTANTS['h'] * step_seconds(basis_functions(atoms, job['method']['optimiseBasis']), size) * len(atoms)
    return seconds * (OPEN_SHELL_FACTOR if job['molecule']['multiplicity'] > 1 else 1)


# Ruling D7 (version 6): labelling the orbitals. point_group.orbital_characters (Task 3) evaluates the AOs on
# the SCF's whole DFT grid once unrotated and once per class operation, for every kept orbital at once, then
# multiplies them into the orbitals; orbitals.orbital_table does that once for the table and, when it constructs
# an LVMO, once more for its irrep (irrep_of). So the cost is evaluations x grid points x N x (a + b x orbitals).
# - LABEL_EVALUATIONS: sizing runs where PySCF does not (the API Lambda) and cannot find the point group, so
#   every job is priced for the largest projection: D6h's 12 classes plus the unrotated grid, twice. A C1, D2h
#   or linear molecule (PySCF's own labels, no projection) pays for labels it gets free: 1-5 % of its price.
# - LABEL_SECONDS (a) and LABEL_SECONDS_PER_ORBITAL (b), per grid point x basis function x evaluation on one
#   Fargate vCPU: this Mac's slowest measured run (ammonia C3v, 0.1 s: 5.65e-9 per point-AO evaluation; benzene
#   D6h 3.98e-9, SF6 Oh 3.8e-9, methane Td 5.5e-9), and a caffeine-sized molecule (N 614, 553 968 points, two
#   operations) with 1 to 250 random orbitals, 3.85e-9 + 1.43e-11 per orbital; each x MAC_TO_FARGATE.
#   Before Task 3 the projection re-ran per degenerate set (benzene 47.7-52 s, the preflight's figure); it no
#   longer scales with the sets, only, through b, with the orbitals kept, of which the sets are a partition.
# - MAC_TO_FARGATE: the file write, the same kind of grid work, fitted 2 480 on this Mac (version 1) and 5 410
#   per Fargate vCPU (version 5): 2.18, rounded up. Nothing has timed labelling on Fargate yet.
# - It threads as the file write does (eval_gto through PySCF's OpenMP, the products through BLAS), so it is
#   divided by files_speedup, the slower of the two laws, and, like the files, not by spin.
# Benzene (D6h) is priced at 26.5 s on one vCPU against 3.3 s measured on this Mac (~7.3 s on Fargate), caffeine
# at 134 s (23 s on L); a coronene-sized D6h job (C24H12, N ~1000) at ~5 min, not the preflight's 30.
LABEL_EVALUATIONS = 2 * (12 + 1)
MAC_TO_FARGATE = 2.2
LABEL_SECONDS = 1.25e-8
LABEL_SECONDS_PER_ORBITAL = 3.2e-11
# PySCF's level-4 grid (input.py and the library), per atom: a lone atom's count, which Becke partitioning only
# prunes in a molecule -- at most 15 712 for H and He and 30 768 for anything else to Kr (PySCF 2.8).
LIGHT_ATOM_GRID_POINTS = 16_000
ATOM_GRID_POINTS = 31_000


def grid_points(atoms) -> int:
    """An upper estimate of the SCF's DFT grid (version 6): within 7 % above PySCF's own for water, benzene
    and caffeine."""
    return sum(LIGHT_ATOM_GRID_POINTS if int(a[0]) <= 2 else ATOM_GRID_POINTS for a in atoms)


def labelling_seconds(job: dict, size: Size) -> float:
    """Labelling the orbitals (version 6, Ruling D7) at the property basis on `size`: every orbital basis.json
    keeps (as predicted_basis_json_bytes counts them), projected for the largest group the labeller supports."""
    mol = job['molecule']
    n = basis_functions(mol['atoms'], job['method']['basis'])
    orbitals = math.ceil(electron_count(mol['atoms'], mol['charge']) / 2) + VIRTUAL_ROWS
    rate = LABEL_SECONDS + LABEL_SECONDS_PER_ORBITAL * orbitals
    return LABEL_EVALUATIONS * grid_points(mol['atoms']) * n * rate / files_speedup(size.vcpu)


def predict_parts(job: dict, size: Size) -> dict:
    """The SCF estimate and the file-writing estimate, kept apart (Ruling D14).

    `scfSeconds` is the brief's original model: the final single point at
    the property basis, plus (for `optimise`) the optimisation steps at the
    optimisation basis (step_seconds: priced by regime since version 4), all
    sped up by vCPU count and then scaled by the open-shell factor. `filesSeconds` is the grid the worker writes out at
    the property basis (def2-TZVPD), divided by its own files_speedup and
    not scaled by the open-shell factor, because writing files is
    indifferent to spin. `frequencySeconds` (version 6) is the frequency
    check, its own term; `labellingSeconds` (version 6, Ruling D7) labelling
    the orbitals, grid work like the files.
    """
    atoms, method = job['molecule']['atoms'], job['method']
    scf = single_point_seconds(basis_functions(atoms, method['basis']), size.vcpu)
    if method['optimiseBasis']:
        scf += optimisation_steps(len(atoms)) * step_seconds(basis_functions(atoms, method['optimiseBasis']), size)
    if job['molecule']['multiplicity'] > 1:
        scf *= OPEN_SHELL_FACTOR
    n_property = basis_functions(atoms, method['basis'])
    files = CONSTANTS['f2'] * (n_property / 1000) ** 2 / files_speedup(size.vcpu)
    return {'scfSeconds': scf, 'filesSeconds': files, 'frequencySeconds': frequency_seconds(job, size),
            'labellingSeconds': labelling_seconds(job, size)}


def predict_seconds(job: dict, size: Size) -> float:
    parts = predict_parts(job, size)
    return parts['scfSeconds'] + parts['filesSeconds'] + parts['frequencySeconds'] + parts['labellingSeconds']


def budget_parts(job: dict, size: Size) -> dict:
    """What the worker's time budget reads (version 6, Phase 6D spec §9), on `size`: one optimisation step,
    the frequency check, the final SCF, labelling the orbitals and the file write, each as predict_parts prices
    it."""
    atoms, method = job['molecule']['atoms'], job['method']
    shell = OPEN_SHELL_FACTOR if job['molecule']['multiplicity'] > 1 else 1
    step = step_seconds(basis_functions(atoms, method['optimiseBasis']), size) * shell if method['optimiseBasis'] else 0.0
    parts = predict_parts(job, size)
    return {'stepSeconds': round(step, 1), 'frequencySeconds': round(parts['frequencySeconds'], 1),
            'finalScfSeconds': round(single_point_seconds(basis_functions(atoms, method['basis']), size.vcpu) * shell, 1),
            'labellingSeconds': round(parts['labellingSeconds'], 1), 'filesSeconds': round(parts['filesSeconds'], 1)}


# Fix round 1 (C1): a job whose result files cannot fit the app's file limit is refused before it runs.
# build_library.write_molecule_files raises BudgetExceeded when meta.json, basis.json, density.bin.gz and
# esp.bin.gz pass BUDGET_BYTES at its last grid try (80^3), after the whole SCF has been paid for.
# - basis.json holds one row of N coefficients for every occupied orbital and orbital_table's 5 virtuals
#   (plus any virtual degenerate with the fifth: 10 covers icosahedral 5-fold degeneracy), and since Phase 6D
#   the constructed LVMO rows orbital_table may append, a whole degenerate set of them (VALENCE_VIRTUAL_ROWS,
#   silane's t2; preflight D15).
#   Each coefficient takes ~23 bytes as JSON (caffeine: 796 428 B for 56 rows x 614); COEFF_BYTES 24.
#   Water, ethanol, benzene and caffeine's written basis.json are 74-90 % of this prediction.
# - frequencies.json (version 6, preflight D10): recipe B's frequency check writes it before the grids, inside
#   the same budget (worker.run_job), so a check job's prediction counts input_template's upper estimate of it.
# - GRID_FILES_BYTES: density, ESP and meta at 80^3. The six DONE jobs wrote 0.91-1.42 MB of them at 96^3;
#   at 80^3 (0.58x the points) the largest is ~0.82 MB, rounded up.
# Before Phase 6C the 1 h single-point ceiling refused everything above about N 800, so nothing reached the
# limit; with the ceiling gone, C28-C36-sized molecules (N 1000-1350) were quotable, approvable under the
# cap, and certain to fail after 1.5-3.3 h.
OUTPUT_BUDGET_BYTES = 3_000_000          # build_library.BUDGET_BYTES (pinned by tests/test_sizing.py)
VALENCE_VIRTUAL_ROWS = 3
VIRTUAL_ROWS = 10 + VALENCE_VIRTUAL_ROWS
COEFF_BYTES = 24
GRID_FILES_BYTES = 900_000
# Preflight D13: this said larger molecules "arrive with Phase 6D's smaller-basis option"; the roadmap moved that
# option to a later phase (6B-4), so the message promises no date.
OUTPUT_REFUSAL = ("this molecule's result files would exceed the app's file limit (about {mb:.1f} MB predicted "
                  "against {limit:.0f} MB), so it would run and then fail; larger molecules need a smaller basis, "
                  'which a later phase is to offer')


def predicted_basis_json_bytes(n: int, electrons: int) -> int:
    return COEFF_BYTES * (math.ceil(electrons / 2) + VIRTUAL_ROWS) * n


def frequencies_bytes(job: dict) -> int:
    """frequencies.json's predicted size for a job that runs the frequency check (version 6); 0 otherwise."""
    return predicted_frequencies_bytes(len(job['molecule']['atoms'])) if runs_frequency_check(job) else 0


def predicted_output_bytes(job: dict) -> int:
    """The budgeted result files at the last grid try: basis.json plus the grids and meta, and a check job's
    frequencies.json."""
    mol = job['molecule']
    n = basis_functions(mol['atoms'], job['method']['basis'])
    return (predicted_basis_json_bytes(n, electron_count(mol['atoms'], mol['charge'])) + GRID_FILES_BYTES
            + frequencies_bytes(job))


def _choose(job: dict, memory_fitting: list) -> tuple[Size, float]:
    """The size a job runs on (Ruling T11-a, Phase 6C): the smallest whose
    margined prediction fits the recipe's target -- predicted seconds are
    non-increasing in vCPU count, so that is the cheapest that finishes in
    good time. A job no size can finish within its target (a recipe ceiling
    refused these until Phase 6C) runs on the cheapest size (by Fargate's
    on-demand price for its predicted time) among those within TIME_HEADROOM
    of the fastest: the SCF's speedup levels off at scfSaturation vCPUs, so
    XL is barely faster than L and costs about 2.5x as much an hour, while a
    much smaller size would run for many times longer."""
    target = TARGET_SECONDS[job['recipe']]
    times = [(s, predict_seconds(job, s)) for s in memory_fitting]
    for size, seconds in times:
        if seconds * TIME_HEADROOM <= target:
            return size, seconds
    fastest = min(seconds for _, seconds in times)
    eligible = [(s, seconds) for s, seconds in times if seconds <= TIME_HEADROOM * fastest]
    return min(eligible, key=lambda pair: (cost_micros('on-demand', pair[0].vcpu, pair[0].memory_gb, pair[1]),
                                           pair[1]))


def spot_unavailable(seconds: float) -> str | None:
    """Why the Spot option is not offered for a run predicted at `seconds`, or None if it is."""
    if not SPOT_AVAILABLE:
        return 'Fargate Spot is switched off for this app (sizing.SPOT_AVAILABLE).'
    if seconds > SPOT_LIMIT_SECONDS:
        return (f'Spot is offered only for runs predicted at {SPOT_LIMIT_SECONDS // 60} min or less; this one is '
                f'predicted at {_hours(seconds)}, and an interruption late in a long run would waste most of it.')
    return None


def _hours(seconds: float) -> str:
    # Task 4 minor: minutes below 2 h, so a run just past the 60 min Spot limit reads "62 min", not "1.0 h".
    return f'{seconds / 60:.0f} min' if seconds < 7200 else f'{seconds / 3600:.1f} h'


def decide(job: dict, local: bool = False, capacity: str | None = None) -> dict:
    """Pick the worker and price it (Ruling T11-a; Phase 6C quotes).

    A worker must have memory >= HEADROOM x predicted (none: refused
    too-large); a job predicted at over SANITY_CEILING_SECONDS even on the
    fastest such size is refused too-long. The size is _choose's. The
    timeout is TIMEOUT_FACTOR x the prediction (at least
    MIN_TIMEOUT_SECONDS), never clamped since Phase 6C: the owner's approved
    price, computed from it, is what caps the job.

    `capacity` names the option being priced: 'spot' (SPOT_ATTEMPTS
    attempts, refused if spot_unavailable) or 'on-demand' (one). None takes
    the default, Spot when it is offered. A local run is 'local', one
    attempt, whatever is asked.
    """
    n = basis_functions(job['molecule']['atoms'], job['method']['basis'])
    memory = predicted_memory_gb(n)
    memory_fitting = [s for s in SIZES if s.memory_gb >= HEADROOM * memory]
    if not memory_fitting:
        raise JobRefused('too-large', f'predicted {memory:.0f} GB of memory (N = {n}): beyond the largest Fargate '
                                      f'worker ({SIZES[-1].memory_gb} GB with {HEADROOM:g}× headroom)')
    output = predicted_output_bytes(job)
    if output > OUTPUT_BUDGET_BYTES:
        raise JobRefused('output-too-large', OUTPUT_REFUSAL.format(mb=output / 1e6, limit=OUTPUT_BUDGET_BYTES / 1e6))
    size, seconds = _choose(job, memory_fitting)
    timeout = int(max(math.ceil(TIMEOUT_FACTOR * seconds), MIN_TIMEOUT_SECONDS))
    if seconds > SANITY_CEILING_SECONDS or timeout > MAX_TIMEOUT_SECONDS:
        raise JobRefused('too-long', f'predicted {seconds / 3600:.1f} h on {size.name} (the size it would run on): '
                                     f'longer than the {SANITY_CEILING_SECONDS // 3600} h this app accepts for one '
                                     f'job')
    if local:
        capacity, attempts = 'local', 1
    else:
        if capacity is None:
            capacity = 'spot' if spot_unavailable(seconds) is None else 'on-demand'
        if capacity == 'spot':
            reason = spot_unavailable(seconds)
            if reason:
                raise JobRefused('option-unavailable', reason, 409)
            attempts = SPOT_ATTEMPTS
        elif capacity == 'on-demand':
            attempts = 1
        else:
            raise JobRefused('invalid-request', f'no such option: {capacity}', 400)
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
            'predictedCostMicros': cost_micros(capacity, size.vcpu, size.memory_gb, seconds),
            'parts': budget_parts(job, size)}
