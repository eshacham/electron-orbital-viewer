"""Fits the sizing rule's constants from finished jobs (spec §7.2).

Least squares, closed form: memory is linear in (N/1000)², and SCF time ×
speedup(threads) − t0 is proportional to (N/1000)^3.5. Only the SCF stages
count toward t3; optimisation steps calibrate g. The file-writing stage is a
separate cost (Ruling D14), fitted through the origin against (N/1000)².
6B-1's local fit (`fit`) leaves it undivided: this Mac's PySCF has no OpenMP.
On Fargate it is threaded, and the AWS fit (`fit_aws`, sizing versions 2
to 5) divides it by a speedup law of its own, measured by the speedup probe.

    python -m jobs.calibrate ../tools/molecules/out/jobs/<key> …   (from tools/)
    python -m jobs.calibrate --aws [--probe probe.log] [--optimise-probe steps.log] <job dir> …
                                                         (Phase 6B-3: sizing v2 to v5)

Version 4 adds t3Step, the t3 an optimisation step is priced by when its
ERIs fit in core (sizing.step_in_core), from the optimise-steps probe
(probe.py --optimise-steps) and the jobs' own steps: the slowest of them.
Version 5 adds stepScale, the step count's (fit_step_scale), reads each
step's SCF cycles where the worker recorded them, leaves an optimisation's
in-core def2-SVP ERIs out of its working set, and lets only the slowest
file write at each N into f2.
"""
import json
import math
import sys
from pathlib import Path

from jobs import sizing
from jobs.basis_counts import basis_functions
from jobs.batch_runner import pyscf_max_memory_mb

TOO_FEW = 'need at least 2 AWS samples to fit'
# PySCF's own max_memory when PYSCF_MAX_MEMORY is unset, as in the speedup
# probe (its job definition sets none; only BatchRunner's submissions do).
PYSCF_DEFAULT_MAX_MEMORY_MB = 4000
# g's guard (Task 14): a missing or negative fit keeps this. t3Step is fitted
# through the g sizing will multiply by, so it needs the guard's answer too.
G_FALLBACK = 1.5


def _3sf(value):
    return float(f'{value:.3g}')


def _need_two(samples, distinct=False):
    if len(samples) < 2:
        raise ValueError(f'{TOO_FEW} (got {len(samples)})')
    if distinct and len({s['basisFunctions'] for s in samples}) < 2:
        raise ValueError(f'{TOO_FEW} at 2 distinct basis-function counts: one N cannot separate a fixed '
                         f'cost from a slope')


def _line(xs, ys):
    """Least squares with an intercept: (intercept, slope)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - slope * mx, slope


def _through_origin(xs, ys):
    return sum(x * y for x, y in zip(xs, ys)) / sum(x * x for x in xs)


def _speedup(threads, law):
    exponent, saturation = law
    return min(threads, saturation) ** exponent


def fit_memory(samples, key='peakMemoryGB'):
    _need_two(samples, distinct=True)
    m0, m2 = _line([(s['basisFunctions'] / 1000) ** 2 for s in samples], [s[key] for s in samples])
    return {'m0': m0, 'm2': m2}


def fit(samples, t0=None):
    """6B-1's local fit, from this Mac's single-threaded runs (sizing version 1)."""
    _need_two(samples, distinct=True)
    t0 = sizing.CONSTANTS['t0'] if t0 is None else t0
    us = [(s['basisFunctions'] / 1000) ** 3.5 for s in samples]
    vs = [s['scfSeconds'] * sizing.speedup(s['threads']) - t0 for s in samples]
    # f2: through the origin, nothing divided out -- this Mac's grid writing
    # is not threaded (Ruling D14).
    f2 = _through_origin([(s['basisFunctions'] / 1000) ** 2 for s in samples], [s['filesSeconds'] for s in samples])
    return {**fit_memory(samples), 't3': _through_origin(us, vs), 'f2': f2}


def samples_from(job_dirs):
    out = []
    for d in map(Path, job_dirs):
        timings = json.loads((d / 'timings.json').read_text())
        job = json.loads((d / 'job.json').read_text())['job']
        stages = timings['stages']
        out.append({'basisFunctions': basis_functions(job['molecule']['atoms'], job['method']['basis']),
                    'scfSeconds': sum(s['seconds'] for s in stages if s['name'].startswith('SCF')),
                    'filesSeconds': sum(s['seconds'] for s in stages if s['name'] == 'writing files'),
                    'threads': timings['threads'], 'peakMemoryGB': timings['peakMemoryGB']})
    return out


# -- Phase 6B-3: the AWS fit (sizing versions 2 to 5) ---------------------------
#
# The probe contract (Ruling D15). Task 12's speedup probe runs once, in one
# 32 vCPU Fargate task, and prints ONE line of JSON to stdout (CloudWatch);
# save that line (log lines around it are fine) to a file and pass it as
# `--probe FILE`. The shape:
#
#   {"probe": "speedup", "molecule": "benzene", "basis": "def2-TZVPD", "vcpu": 32,
#    "n":            [2, 4, 8, 16, 32],
#    "scfSeconds":   [s2, s4, s8, s16, s32],
#    "filesSeconds": [f2, f4, f8, f16, f32]}
#
#   n             the thread counts, each set with pyscf.lib.num_threads(n)
#                 before that run; at least two distinct values, each ≥ 1.
#   scfSeconds    wall seconds of benzene's B3LYP/def2-TZVPD SCF (kernel only,
#                 no molecule build) at n threads; same length as n, each > 0.
#   filesSeconds  wall seconds of the Phase 6 file write for that converged
#                 SCF (write_molecule_files, the worker's 'writing files'
#                 stage) at n threads; same length as n, each > 0.
#
# n, scfSeconds and filesSeconds give the two speedup laws. When the line
# also carries basisFunctions (and peakMemoryGB), as Task 12's probe does,
# its runs join the t3, f2 and memory fits as well. Each run should start
# cold (a fresh mf object), so that no run inherits another's converged
# density and looks faster than it is.


def incore_eri_gb(n, memory_gb=None, max_memory_mb=None):
    """GB (GiB, like peakMemoryGB) of two-electron integrals PySCF keeps in
    memory for N basis functions, or 0 if it would run direct instead.

    PySCF stores the 8-fold symmetric ERIs whenever N⁴/1e6 MB fits under
    0.95 × max_memory (scf.hf._is_mem_enough), and BatchRunner sets
    max_memory to 0.8 × the container. So on S benzene's 5.4 GB of ERIs sit
    in its peak, a size-dependent bonus PySCF takes only when it fits, not a
    need: a molecule whose ERIs do not fit runs direct in a fraction of that.
    (Ignoring PySCF's current-memory term errs towards counting ERIs in.)"""
    max_memory_mb = pyscf_max_memory_mb(memory_gb) if max_memory_mb is None else max_memory_mb
    if n ** 4 / 1e6 >= 0.95 * max_memory_mb:
        return 0.0
    pairs = n * (n + 1) // 2
    return pairs * (pairs + 1) // 2 * 8 / 1024 ** 3


def working_set_gb(peak, n, memory_gb, svp_n=None):
    """What a job needed, not what PySCF took because it fitted: its peak
    less the ERIs PySCF held in core. For an optimisation (svp_n, sizing
    version 5) that is the larger of its final SCF's and its def2-SVP
    steps': caffeine optimise on L kept the steps' 3.4 GiB in core (its
    log shows ~4.1 GB in use at each step's gradient) and ran its
    def2-TZVPD SCF direct, so its 5.67 GB peak is the steps' ERIs plus a
    2.2 GB working set."""
    eri = max(incore_eri_gb(n, memory_gb), incore_eri_gb(svp_n, memory_gb) if svp_n else 0.0)
    return peak - eri if peak > eri else peak


def _trajectory_frames(text):
    """How many frames an xyz trajectory holds (worker._xyz's format)."""
    lines, frames, i = text.strip().splitlines(), 0, 0
    while i < len(lines):
        try:
            count = int(lines[i])
        except ValueError:
            break
        frames, i = frames + 1, i + count + 2
    return frames


def _optimisation_steps(stages):
    """(each step's seconds, each step's SCF cycles or None, the step count)
    from one attempt's stages.

    Since sizing version 5 the worker times stage 'optimisation step k' from
    the start of step k to its end and puts that step's SCF cycles on it;
    the one stage after the last step (geomeTRIC's wrap-up) has none, so
    the steps are exactly the stages with cycles. Before, stage k ran from
    the end of step k to the end of step k + 1: step 1 fell in no stage and
    the last stage was the wrap-up, so the count is the number of stages
    and every stage but the last is one step's seconds."""
    steps = [s for s in stages if s['name'].startswith('optimisation step')]
    counted = [s for s in steps if 'cycles' in s]
    if counted:
        return [s['seconds'] for s in counted], [s['cycles'] for s in counted], len(counted)
    return [s['seconds'] for s in steps[:-1]], None, len(steps)


def _earlier_attempts_steps(folder, attempt):
    """Steps a reclaimed earlier attempt ran, from its trajectory as the sink
    keeps it (attempts/<n>/trajectory.xyz), where the folder has it: a
    resumed attempt's timings count only its own. A resumed attempt's first
    step re-evaluates the frame it started from, so the sum counts every
    step paid for, one more than an uninterrupted run would need."""
    total = 0
    for previous in range(1, attempt):
        path = folder / 'attempts' / str(previous) / 'trajectory.xyz'
        if path.exists():
            total += _trajectory_frames(path.read_text())
    return total


def _median(values):
    values = sorted(values)
    n = len(values)
    return None if n == 0 else (values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2)


def aws_samples(job_dirs):
    """One sample per finished AWS job folder (job.json + timings.json), with
    what fit_aws and compare need. Local timings (backend 'local') are
    skipped: a Mac's threads are not a Fargate vCPU."""
    out = []
    for d in map(Path, job_dirs):
        timings = json.loads((d / 'timings.json').read_text())
        if timings.get('backend') != 'aws':
            print(f'skipping {d.name}: backend {timings.get("backend")}', file=sys.stderr)
            continue
        record = json.loads((d / 'job.json').read_text())
        job = record['job']
        stages = timings['stages']
        steps, step_cycles, step_count = _optimisation_steps(stages)
        n = basis_functions(job['molecule']['atoms'], job['method']['basis'])
        svp = basis_functions(job['molecule']['atoms'], job['method']['optimiseBasis']) \
            if job['method']['optimiseBasis'] else None
        memory_gb = next(s.memory_gb for s in sizing.SIZES if s.name == timings['size'])
        peak = timings['peakMemoryGB']
        eri = incore_eri_gb(n, memory_gb)
        optimised = job['recipe'] == 'optimise'
        out.append({'key': record['key'], 'recipe': job['recipe'], 'atoms': len(job['molecule']['atoms']),
                    'basisFunctions': n, 'svpBasisFunctions': svp,
                    'stepSeconds': _median(steps) if steps else None,
                    # v5: every step this job paid for, earlier attempts' too, and each step's SCF cycles
                    # (None before the worker recorded them).
                    'optimisationSteps': step_count + _earlier_attempts_steps(d, timings.get('attempt', 1))
                    if optimised else None,
                    'stepCycles': step_cycles,
                    'scfSeconds': sum(s['seconds'] for s in stages if s['name'].startswith('SCF')),
                    # v4 prep (Task 6): the SCF stage that converged carries its own cycle count from
                    # worker.py, when it was run recently enough to record one. None for an older
                    # timings.json (no 'cycles' key on any stage) -- not read by this version's fit.
                    'scfCycles': next((s['cycles'] for s in reversed(stages)
                                       if s['name'].startswith('SCF') and 'cycles' in s), None),
                    # D4: the files term (Ruling D14) is refitted too, from the same stage 6B-1's fit reads.
                    'filesSeconds': sum(s['seconds'] for s in stages if s['name'] == 'writing files'),
                    'threads': timings['vcpu'], 'peakMemoryGB': peak,
                    # What the job needs, not what PySCF took because it fitted (see incore_eri_gb).
                    'workingSetGB': working_set_gb(peak, n, memory_gb, svp),
                    # The ERIs did not fit, so PySCF rebuilt them every cycle: the regime every
                    # molecule past N of about 280 on S-L runs in (fit_aws's t3).
                    'direct': eri == 0,
                    'wallSeconds': timings['wallSeconds'], 'predictedSeconds': record['sizing']['predictedSeconds'],
                    'predictedMemoryGB': record['sizing']['predictedMemoryGB'], 'size': timings['size'],
                    'capacity': timings['capacity']})
    return out


def _deployed_laws():
    c = sizing.CONSTANTS
    return (c['scfExponent'], c['scfSaturation']), (c['filesExponent'], c['filesSaturation'])


def fit_time(samples, law=None):
    """t0 and t3 together (least squares with an intercept). The law must be
    the one sizing will divide by, or t0 and t3 absorb the difference and are
    right only at the vCPU counts they were fitted on."""
    law = _deployed_laws()[0] if law is None else law
    _need_two(samples, distinct=True)
    t0, t3 = _line([(s['basisFunctions'] / 1000) ** 3.5 for s in samples],
                   [s['scfSeconds'] * _speedup(s['threads'], law) for s in samples])
    return {'t0': t0, 't3': t3}


def fit_g(samples, t0, t3, law=None):
    """g: one optimisation step = (1 + g) × the def2-SVP single point."""
    law = _deployed_laws()[0] if law is None else law
    ratios = [s['stepSeconds'] / ((t0 + t3 * (s['svpBasisFunctions'] / 1000) ** 3.5) / _speedup(s['threads'], law)) - 1
              for s in samples if s.get('stepSeconds')]
    return sum(ratios) / len(ratios) if ratios else None


def fit_f2(samples, law=None):
    """f2 through the origin against (N/1000)², as 6B-1's fit does, after
    multiplying each sample's seconds back up by the files speedup, so f2
    is a one-vCPU figure like t3. law (0, 1) is the undivided form.

    Since sizing version 5, where several runs share an N only the slowest
    (one-vCPU) of them stands for it (Ruling T14-speedup, extended): a
    faster run at an N already measured would otherwise pull f2 down for
    every size. Caffeine's file write ran 4.4x faster on L (16 vCPU) than
    on M (4 vCPU), where the probe's law promises 2.4x; with both in the
    least squares f2 would fall from 5 360 to 4 260 and under-predict the
    run on M by a fifth."""
    law = _deployed_laws()[1] if law is None else law
    _need_two(samples)
    slowest = {}
    for s in samples:
        n = s['basisFunctions']
        slowest[n] = max(slowest.get(n, 0.0), s['filesSeconds'] * _speedup(s['threads'], law))
    return _through_origin([(n / 1000) ** 2 for n in slowest], list(slowest.values()))


def fit_step_scale(samples):
    """stepScale (sizing version 5): optimisation_steps(atoms) is
    ceil(stepScale x (10 + 2 x atoms)), capped at MAX_STEPS. It is
    TIME_HEADROOM x the largest measured / (10 + 2 x atoms) over the
    optimisations, so no sample is under-predicted and the worst of them
    is predicted at TIME_HEADROOM x its count: a molecule needing up to
    TIME_HEADROOM x that worst rate still has no more steps than predicted.
    Returns (stepScale or None, notes)."""
    counted = [(s['optimisationSteps'], s['atoms'], s['key'][:12]) for s in samples if s.get('optimisationSteps')]
    if not counted:
        return None, []
    steps, atoms, key = max(counted, key=lambda c: c[0] / sizing.step_form(c[1]))
    scale = sizing.TIME_HEADROOM * steps / sizing.step_form(atoms)
    return scale, [f'stepScale: the largest measured / (10 + 2 x atoms) is {steps} of {sizing.step_form(atoms)} '
                   f'({key}); x TIME_HEADROOM {sizing.TIME_HEADROOM:g} = {scale:.4g}']


def _probe_series(points, name):
    if not isinstance(points, dict) or any(k not in points for k in ('n', 'scfSeconds', 'filesSeconds')):
        raise ValueError('probe: needs n, scfSeconds and filesSeconds')
    ns, ys = points['n'], points[name]
    if len(ns) != len(ys) or len(ns) != len(points['filesSeconds']) or len(set(ns)) < 2:
        raise ValueError('probe: n, scfSeconds and filesSeconds must be equal lists with two or more distinct n')
    if any(not (c >= 1) for c in ns) or any(not (math.isfinite(y) and y > 0) for y in ys):
        raise ValueError(f'probe: every n must be ≥ 1 and every {name} a positive number')
    return [math.log(c) for c in ns], [math.log(y) for y in ys]


def fit_speedup(points):
    """The exponent p of a plain power law, speedup(c) = c^p, from the
    probe's SCF series: seconds(c) = A / c^p is a straight line in log-log,
    so p is minus its least-squares slope. Kept for the record: Task 12's
    probe showed the SCF levelling off, which fit_law describes and v2 uses."""
    xs, ys = _probe_series(points, 'scfSeconds')
    return -_line(xs, ys)[1]


def fit_law(points, name):
    """speedup(c) = min(c, C)^a for one probe series (Ruling T14-speedup):
    a power law that stops gaining at C threads.

    Task 12's benzene SCF ran 3.5× faster from 4 to 16 threads and no faster
    at 32; one power law fits that badly (0.596, residuals up to 30 %).
    C is tried at each measured n that leaves two distinct min(n, C); a is
    the least-squares slope in log-log against log min(n, C). The smallest
    residual wins; on a tie the smaller C, which promises the bigger worker
    less. `relative` is predicted / measured − 1 at each n."""
    xs, ys = _probe_series(points, name)
    ns = points['n']
    best = None
    for c in sorted(set(ns)):
        clipped = [math.log(min(n, c)) for n in ns]
        if len(set(clipped)) < 2:
            continue
        intercept, slope = _line(clipped, ys)
        fitted = [intercept + slope * x for x in clipped]
        residual = sum((f - y) ** 2 for f, y in zip(fitted, ys))
        if best is None or residual < best['residual'] - 1e-12:
            best = {'exponent': -slope, 'saturation': c, 'residual': residual,
                    'relative': [math.exp(f - y) - 1 for f, y in zip(fitted, ys)]}
    return best


def fit_files(points, scf_law=None):
    """Does the file write divide by a speedup or not, and by which?

    The form is chosen as Task 9 chose it: two one-parameter models of the
    files series in log space (so the slowest run does not outweigh the
    rest), 'undivided', seconds = F, against 'divided by the SCF's law'. A
    tie keeps 'undivided', which never promises a big worker more speed than
    was measured. If divided, the files series then gets its own law
    (fit_law), since the write need not level off where the SCF does: Task
    12's kept improving to 32 threads after the SCF had stopped."""
    law = scf_law
    if law is None:
        scf = fit_law(points, 'scfSeconds')
        law = (scf['exponent'], scf['saturation'])
    xs, ys = _probe_series(points, 'filesSeconds')

    def residual(values):
        mean = sum(values) / len(values)
        return sum((v - mean) ** 2 for v in values)

    undivided = residual(ys)
    divided = residual([y + law[0] * math.log(min(c, law[1])) for c, y in zip(points['n'], ys)])
    out = {'form': 'divided' if divided < undivided else 'undivided',
           'residualDivided': divided, 'residualUndivided': undivided}
    if out['form'] == 'undivided':
        return {**out, 'exponent': 0.0, 'saturation': 1}
    own = fit_law(points, 'filesSeconds')
    return {**out, 'exponent': own['exponent'], 'saturation': own['saturation'], 'residual': own['residual'],
            'relative': own['relative']}


def read_probe(path):
    """The probe's JSON line from a saved log: the last line that parses as
    a JSON object with an 'n' key."""
    for line in reversed(Path(path).read_text().splitlines()):
        line = line.strip()
        if line.startswith('{'):
            try:
                found = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(found, dict) and 'n' in found:
                return found
    raise ValueError(f'{path}: no probe JSON line (an object with "n", "scfSeconds" and "filesSeconds")')


def read_optimise_probe(path):
    """The optimise-steps probe's JSON line (probe.measure_optimise) from a
    saved log: the last line that parses as an object with probe
    'optimise-steps'. geomeTRIC's own lines around it are fine."""
    for line in reversed(Path(path).read_text().splitlines()):
        line = line.strip()
        if line.startswith('{'):
            try:
                found = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(found, dict) and found.get('probe') == 'optimise-steps' and found.get('steps'):
                return found
    raise ValueError(f'{path}: no optimise-steps probe line (an object with "probe": "optimise-steps" and "steps")')


def fit_step_t3(samples, optimise_probe, t0, g, law):
    """t3Step (sizing version 4): one step = (1 + g)(t0 + t3Step (N/1000)^3.5)
    / speedup(c) when its ERIs fit in core. Each measured step offers
    (seconds x speedup(c) / (1 + g) - t0) / (N/1000)^3.5 and the slowest is
    kept (Ruling T14-speedup): the probe's every step (its first, cold from
    the minao guess, is the slowest) and each job's median step. t0, g and
    the law must be what sizing will hold (3 significant figures, g guarded),
    or the step is not reproduced. Returns (t3Step or None, notes)."""
    def per_step(seconds, n, threads):
        return (seconds * _speedup(threads, law) / (1 + g) - t0) / (n / 1000) ** 3.5

    jobs = [per_step(s['stepSeconds'], s['svpBasisFunctions'], s['threads']) for s in samples
            if s.get('stepSeconds') and s.get('svpBasisFunctions')]
    probe = [] if optimise_probe is None else [
        per_step(step['seconds'], optimise_probe['basisFunctions'], optimise_probe['vcpu'])
        for step in optimise_probe['steps']]
    notes = []
    if probe:
        notes.append(f't3Step: the optimise probe\'s slowest step gives {max(probe):.4g} (N '
                     f'{optimise_probe["basisFunctions"]}, {optimise_probe["vcpu"]} vCPU)'
                     + (f', the jobs\' steps at most {max(jobs):.4g}' if jobs else '') + '; kept the slower')
    elif jobs:
        notes.append(f't3Step: no optimise probe; the jobs\' steps give {max(jobs):.4g} (the slowest)')
    candidates = jobs + probe
    return (max(candidates) if candidates else None), notes


def _probe_samples(points):
    """The probe's runs as samples, when its line says which N it ran."""
    n = points.get('basisFunctions')
    if not n:
        return []
    peaks = points.get('peakMemoryGB') or [None] * len(points['n'])
    out = []
    for c, scf, files, peak in zip(points['n'], points['scfSeconds'], points['filesSeconds'], peaks):
        sample = {'basisFunctions': n, 'threads': c, 'scfSeconds': scf, 'filesSeconds': files}
        if peak is not None:
            eri = incore_eri_gb(n, max_memory_mb=PYSCF_DEFAULT_MAX_MEMORY_MB)
            sample['workingSetGB'] = peak - eri if peak > eri else peak
        out.append(sample)
    return out


def fit_aws(samples, probe=None, optimise_probe=None):
    """Sizing's constants (version 2, refitted for 3) from AWS samples, as
    fitted (unguarded), plus how they were got. `guarded` turns this into CONSTANTS.

    Without probe data the deployed speedup laws are kept, and the notes say
    so. With it (Ruling T14-speedup):
    - both laws come from the probe (fit_law, fit_files);
    - its runs join the f2 fit and, as direct-SCF working sets, the memory fit;
    - t3 is the largest of the in-core runs', the probe's and the direct
      jobs': the ladder's SCFs held their ERIs in core (S fits them up to
      N ≈ 280), which no larger molecule on S–L can, and the probe and any
      job flagged `direct` ran direct, the regime that caffeine and beyond
      run in. The slower prediction is the safe one: an under-prediction
      spends a timed-out attempt; an over-prediction only reserves a little
      more. Both the direct jobs' and the probe's own t3 are each the max of
      their per-point (seconds × speedup − t0) / (N/1000)^3.5, not a mean or
      a weighted least squares through the origin: a weighted average lets a
      fast large sample outvote a slow one (its (N/1000)^3.5 weight is
      larger), quietly lowering t3 below what "keep the slowest" (Ruling
      T14-speedup) means to guarantee. A future refit with more direct jobs
      or a noisier probe must keep following the max, even where today's one
      direct job and near-flat probe values make max and mean coincide.
    - t0 (and the in-core t3) come from the in-core samples alone, when
      they span two N (version 3): one line through both regimes bends t0
      negative, since a direct SCF is slower per (N/1000)^3.5 at any N.
    """
    notes, extra, summary = [], [], None
    if probe is None:
        scf_law, files_law = _deployed_laws()
        source = 'deployed'
        notes.append(f'no speedup probe: kept the deployed laws, SCF min(c, {scf_law[1]:g})^{scf_law[0]:g} and '
                     f'files min(c, {files_law[1]:g})^{files_law[0]:g}')
    else:
        scf = fit_law(probe, 'scfSeconds')
        scf_law = (scf['exponent'], scf['saturation'])
        files = fit_files(probe, scf_law)
        files_law = (files['exponent'], files['saturation'])
        source = 'probe'
        summary = {'scf': scf, 'files': files, 'powerLawExponent': fit_speedup(probe)}
        notes.append(f'speedup probe: SCF min(c, {scf_law[1]:g})^{scf_law[0]:.4f}, files term {files["form"]}'
                     + (f' by min(c, {files_law[1]:g})^{files_law[0]:.4f}' if files['form'] == 'divided' else '')
                     + f' (one power law would be {summary["powerLawExponent"]:.4f})')
        extra = _probe_samples(probe)
        if not extra:
            notes.append('probe line has no basisFunctions: its runs inform the laws only')
    memory = fit_memory(samples + [s for s in extra if 'workingSetGB' in s], key='workingSetGB')
    incore = [s for s in samples if not s.get('direct')]
    if len({s['basisFunctions'] for s in incore}) >= 2:
        time_ = fit_time(incore, scf_law)
    else:
        time_ = fit_time(samples, scf_law)
        if len(incore) < len(samples):
            notes.append('t0: fewer than 2 in-core N, so in-core and direct runs share one line')
    t0, t3 = time_['t0'], time_['t3']
    direct = [s for s in samples if s.get('direct')]
    if direct and len(incore) < len(samples) and len({s['basisFunctions'] for s in incore}) >= 2:
        # The max of each direct job's own t3, not a weighted least squares
        # through the origin: that average lets a fast large sample outvote
        # a slow one (its (N/1000)^3.5 weight is the larger), against "keep
        # the slowest" (Ruling T14-speedup, extended).
        per_job = [(s['scfSeconds'] * _speedup(s['threads'], scf_law) - t0) / (s['basisFunctions'] / 1000) ** 3.5
                  for s in direct]
        jobs_t3 = max(per_job)
        if jobs_t3 > t3:
            notes.append(f't3: the direct jobs ({len(direct)}) give {jobs_t3:.4g} (the slowest of them), '
                         f'the in-core runs {t3:.4g}; kept the direct jobs\', the slower')
            t3 = jobs_t3
    if extra:
        # The max of the probe's own per-point t3, for the same reason.
        probe_t3 = max((s['scfSeconds'] * _speedup(s['threads'], scf_law) - t0) / (s['basisFunctions'] / 1000) ** 3.5
                       for s in extra)
        if probe_t3 > t3:
            notes.append(f't3: the probe\'s direct SCF gives {probe_t3:.4g}, more than {t3:.4g} (the in-core '
                         f'runs\' or the direct jobs\'); kept the probe\'s, the slower')
            t3 = probe_t3
        else:
            notes.append(f't3: the probe\'s direct SCF gives {probe_t3:.4g}, less than {t3:.4g}; kept the slower')
    g = fit_g(samples, t0, t3, scf_law)
    # t3Step through the values sizing will hold: 3 s.f., and g and t0 as guarded() will leave them.
    step_g = G_FALLBACK if g is None or g < 0 else _3sf(g)
    step_t0 = 1.0 if t0 < 1.0 else _3sf(t0)
    t3_step, step_notes = fit_step_t3(samples, optimise_probe, step_t0, step_g, (_3sf(scf_law[0]), scf_law[1]))
    notes += step_notes
    step_scale, scale_notes = fit_step_scale(samples)
    notes += scale_notes
    out = {**memory, 't0': t0, 't3': t3, 't3Step': t3_step, 'g': g, 'f2': fit_f2(samples + extra, files_law),
           'stepScale': step_scale,
           'scfExponent': scf_law[0], 'scfSaturation': scf_law[1],
           'filesExponent': files_law[0], 'filesSaturation': files_law[1], 'speedupSource': source, 'notes': notes}
    if summary is not None:
        out['probe'] = summary
    return out


def guarded(fitted):
    """CONSTANTS from fit_aws's output: Task 14's guards, then 3 significant
    figures, every value a float. Returns (constants, the guards used)."""
    deployed, guards = sizing.CONSTANTS, []
    c = {k: fitted[k] for k in ('m0', 'm2', 't0', 't3', 't3Step', 'g', 'f2', 'stepScale', 'scfExponent',
                                'scfSaturation', 'filesExponent', 'filesSaturation')}
    rules = (('m0', lambda v: v < 0.2, lambda v: 0.2, 'below 0.2: set to 0.2'),
             ('m2', lambda v: v <= 0, lambda v: deployed['m2'], 'not positive: kept the deployed value'),
             ('t0', lambda v: v < 1.0, lambda v: 1.0, 'below 1.0: set to 1.0'),
             ('t3', lambda v: v <= 0, lambda v: deployed['t3'], 'not positive: kept the deployed value'),
             ('t3Step', lambda v: v is None or v <= 0, lambda v: deployed['t3Step'],
              'missing or not positive: kept the deployed value'),
             ('g', lambda v: v is None or v < 0, lambda v: G_FALLBACK, f'missing or negative: kept {G_FALLBACK:g}'),
             ('f2', lambda v: v <= 0, lambda v: deployed['f2'], 'not positive: kept the deployed value (D5)'),
             ('stepScale', lambda v: v is None or v <= 0, lambda v: deployed['stepScale'],
              'missing or not positive: kept the deployed value'))
    for name, bad, fix, why in rules:
        if bad(c[name]):
            fitted_text = 'none' if c[name] is None else f'{c[name]:.4g}'
            c[name] = fix(c[name])
            guards.append(f'{name}: fitted {fitted_text}, {why} ({c[name]:g})')
    return {k: _3sf(v) for k, v in c.items()}, guards


def compare(samples):
    """Predicted against actual, one row per job, for the commit message and HANDOFF."""
    return [{'key': s['key'][:12], 'recipe': s['recipe'], 'N': s['basisFunctions'], 'size': s['size'],
             'predictedSeconds': s['predictedSeconds'], 'wallSeconds': s['wallSeconds'],
             'predictedMemoryGB': s['predictedMemoryGB'], 'peakMemoryGB': s['peakMemoryGB']} for s in samples]


if __name__ == '__main__':
    if sys.argv[1:2] == ['--aws']:
        args, probe, optimise_probe = sys.argv[2:], None, None
        while args[:1] in (['--probe'], ['--optimise-probe']):
            if args[0] == '--probe':
                probe = read_probe(args[1])
            else:
                optimise_probe = read_optimise_probe(args[1])
            args = args[2:]
        samples = aws_samples(args)
        fitted = fit_aws(samples, probe, optimise_probe)
        constants, guards = guarded(fitted)
        print(json.dumps({'compare': compare(samples), 'fit': fitted, 'constants': constants, 'guards': guards},
                         indent=1))
    else:
        samples = samples_from(sys.argv[1:])
        print(json.dumps({'samples': samples, 'fit': fit(samples)}, indent=1))
