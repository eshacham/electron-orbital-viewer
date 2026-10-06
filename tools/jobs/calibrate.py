"""Fits the sizing rule's constants from finished jobs (spec §7.2).

Least squares, closed form: memory is linear in (N/1000)², and SCF time ×
speedup(threads) − t0 is proportional to (N/1000)^3.5. Only the SCF stages
count toward t3; optimisation steps calibrate g, which needs AWS runs
(Phase 6B-3). The file-writing stage is a separate, single-threaded cost
(Ruling D14): f2 is fitted through the origin against (N/1000)², with no
speedup divided out, from the 'writing files' stage alone.

    python -m jobs.calibrate ../tools/molecules/out/jobs/<key> …   (from tools/)
    python -m jobs.calibrate --aws [--probe probe.log] <job dir> …  (Phase 6B-3: sizing v2)
"""
import json
import math
import sys
from pathlib import Path

from jobs.basis_counts import basis_functions
from jobs.sizing import CONSTANTS, speedup


def fit(samples, t0=None):
    t0 = CONSTANTS['t0'] if t0 is None else t0
    xs = [(s['basisFunctions'] / 1000) ** 2 for s in samples]
    ys = [s['peakMemoryGB'] for s in samples]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    m2 = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    m0 = my - m2 * mx
    us = [(s['basisFunctions'] / 1000) ** 3.5 for s in samples]
    vs = [s['scfSeconds'] * speedup(s['threads']) - t0 for s in samples]
    t3 = sum(u * v for u, v in zip(us, vs)) / sum(u * u for u in us)
    # f2: least squares through the origin (no intercept, no speedup divided
    # out — the grid-writing code is not threaded, Ruling D14).
    ws = [s['filesSeconds'] for s in samples]
    f2 = sum(x * w for x, w in zip(xs, ws)) / sum(x * x for x in xs)
    return {'m0': m0, 'm2': m2, 't3': t3, 'f2': f2}


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


# -- Phase 6B-3: the AWS fit (sizing version 2) --------------------------------
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
# Only n, scfSeconds and filesSeconds are read; the other keys are for the
# record. Each run should start cold (a fresh mf object), so that no run
# inherits another's converged density and looks faster than it is.

# v1's exponent, read off sizing.speedup rather than copied, so the two
# cannot drift apart: speedup(c) = c^p, so p = log2(speedup(2)).
V1_SPEEDUP_EXPONENT = round(math.log(speedup(2), 2), 12)


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
        steps = [s['seconds'] for s in stages if s['name'].startswith('optimisation step')]
        out.append({'key': record['key'], 'recipe': job['recipe'], 'atoms': len(job['molecule']['atoms']),
                    'basisFunctions': basis_functions(job['molecule']['atoms'], job['method']['basis']),
                    'svpBasisFunctions': basis_functions(job['molecule']['atoms'], job['method']['optimiseBasis'])
                    if job['method']['optimiseBasis'] else None,
                    # The last step's stage runs on into the final SCF's setup, so it is left out.
                    'stepSeconds': _median(steps[:-1]) if len(steps) >= 2 else None,
                    'scfSeconds': sum(s['seconds'] for s in stages if s['name'].startswith('SCF')),
                    # D4: the files term (Ruling D14) is refitted too, from the same stage 6B-1's fit reads.
                    'filesSeconds': sum(s['seconds'] for s in stages if s['name'] == 'writing files'),
                    'threads': timings['vcpu'], 'peakMemoryGB': timings['peakMemoryGB'],
                    'wallSeconds': timings['wallSeconds'], 'predictedSeconds': record['sizing']['predictedSeconds'],
                    'predictedMemoryGB': record['sizing']['predictedMemoryGB'], 'size': timings['size'],
                    'capacity': timings['capacity']})
    return out


def fit_time(samples, exponent=V1_SPEEDUP_EXPONENT):
    """t0 and t3 together (least squares with an intercept): AWS runs on
    1–16 vCPUs give the fixed cost a lever the three Mac runs did not. The
    exponent must be the one sizing will divide by, or t0 and t3 absorb the
    difference and are right only at the vCPU counts they were fitted on."""
    xs = [(s['basisFunctions'] / 1000) ** 3.5 for s in samples]
    ys = [s['scfSeconds'] * s['threads'] ** exponent for s in samples]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    t3 = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return {'t0': my - t3 * mx, 't3': t3}


def fit_g(samples, t0, t3, exponent=V1_SPEEDUP_EXPONENT):
    """g: one optimisation step = (1 + g) × the def2-SVP single point."""
    ratios = [s['stepSeconds'] / ((t0 + t3 * (s['svpBasisFunctions'] / 1000) ** 3.5) / s['threads'] ** exponent) - 1
              for s in samples if s.get('stepSeconds')]
    return sum(ratios) / len(ratios) if ratios else None


def fit_f2(samples, divided=False, exponent=V1_SPEEDUP_EXPONENT):
    """f2 through the origin against (N/1000)², as 6B-1's fit does; if the
    probe says the file write is threaded, its seconds are first multiplied
    back up by the speedup, so f2 stays a one-vCPU figure like t3."""
    xs = [(s['basisFunctions'] / 1000) ** 2 for s in samples]
    ws = [s['filesSeconds'] * (s['threads'] ** exponent if divided else 1) for s in samples]
    return sum(x * w for x, w in zip(xs, ws)) / sum(x * x for x in xs)


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
    """The exponent p in speedup(c) = c^p, from the probe's SCF series (see
    the contract above): seconds(c) = A / c^p is a straight line in log-log,
    so p is minus its least-squares slope. One molecule at one N on one
    machine: the exponent is the thing measured, not t3."""
    xs, ys = _probe_series(points, 'scfSeconds')
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return -slope


def fit_files(points, exponent=None):
    """Does the file write divide by speedup or not? Two one-parameter models
    of the probe's files series, compared in log space (so the 2-thread run,
    the longest, does not outweigh the rest): 'undivided', seconds = F, and
    'divided', seconds = F / c^p with the SCF's p (the one sizing would
    divide by). The smaller residual wins; a tie keeps 'undivided', v1's form,
    which never promises a big worker more speed than it measured."""
    p = fit_speedup(points) if exponent is None else exponent
    xs, ys = _probe_series(points, 'filesSeconds')

    def residual(values):
        mean = sum(values) / len(values)
        return sum((v - mean) ** 2 for v in values)

    undivided = residual(ys)
    divided = residual([y + p * x for x, y in zip(xs, ys)])
    return {'form': 'divided' if divided < undivided else 'undivided', 'exponent': p,
            'residualDivided': divided, 'residualUndivided': undivided}


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


def fit_aws(samples, probe=None):
    """Sizing version 2's constants from AWS samples, plus how they were got.

    Without probe data the exponent stays v1's and the files term undivided,
    and the notes say so. A missing g (no optimise runs) or a non-positive f2
    falls back to v1's value with a note, so the output always holds every
    constant sizing.predict_parts and decide read (D5). Other non-positive
    constants are noted but left as fitted: whether to clamp is Task 14's call.
    """
    notes = []
    if probe is None:
        exponent, form, source, files = V1_SPEEDUP_EXPONENT, 'undivided', 'v1', None
        notes.append(f'no speedup probe: kept v1\'s exponent {exponent:g} and the undivided files term')
    else:
        exponent = fit_speedup(probe)
        files = fit_files(probe, exponent)
        form, source = files['form'], 'probe'
        notes.append(f'speedup probe: exponent {exponent:.4f}, files term {form} (log residuals: divided '
                     f'{files["residualDivided"]:.3g}, undivided {files["residualUndivided"]:.3g})')
    memory = fit(samples)
    time_ = fit_time(samples, exponent)
    g = fit_g(samples, time_['t0'], time_['t3'], exponent)
    if g is None or g <= -1:
        notes.append(f'g: {"no optimisation steps to fit" if g is None else f"fitted {g:.4g}, impossible"}; '
                     f'kept v1\'s {CONSTANTS["g"]}')
        g = CONSTANTS['g']
    f2 = fit_f2(samples, form == 'divided', exponent)
    if not f2 > 0:
        notes.append(f'f2: fitted {f2:.4g}, not positive; kept v1\'s {CONSTANTS["f2"]}')
        f2 = CONSTANTS['f2']
    out = {'m0': memory['m0'], 'm2': memory['m2'], **time_, 'g': g, 'f2': f2}
    notes += [f'{k}: fitted {v:.4g}, not positive' for k, v in out.items() if k in ('m0', 'm2', 't0', 't3') and v <= 0]
    out.update({'speedupExponent': exponent, 'filesForm': form, 'speedupSource': source, 'notes': notes})
    if files is not None:
        out['probe'] = files
    return out


def compare(samples):
    """Predicted against actual, one row per job, for the commit message and HANDOFF."""
    return [{'key': s['key'][:12], 'recipe': s['recipe'], 'N': s['basisFunctions'], 'size': s['size'],
             'predictedSeconds': s['predictedSeconds'], 'wallSeconds': s['wallSeconds'],
             'predictedMemoryGB': s['predictedMemoryGB'], 'peakMemoryGB': s['peakMemoryGB']} for s in samples]


if __name__ == '__main__':
    if sys.argv[1:2] == ['--aws']:
        args, probe = sys.argv[2:], None
        if args[:1] == ['--probe']:
            probe, args = read_probe(args[1]), args[2:]
        samples = aws_samples(args)
        print(json.dumps({'compare': compare(samples), 'fit': fit_aws(samples, probe)}, indent=1))
    else:
        samples = samples_from(sys.argv[1:])
        print(json.dumps({'samples': samples, 'fit': fit(samples)}, indent=1))
