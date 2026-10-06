"""Fits the sizing rule's constants from finished jobs (spec §7.2).

Least squares, closed form: memory is linear in (N/1000)², and SCF time ×
speedup(threads) − t0 is proportional to (N/1000)^3.5. Only the SCF stages
count toward t3; optimisation steps calibrate g, which needs AWS runs
(Phase 6B-3). The file-writing stage is a separate, single-threaded cost
(Ruling D14): f2 is fitted through the origin against (N/1000)², with no
speedup divided out, from the 'writing files' stage alone.

    python -m jobs.calibrate ../tools/molecules/out/jobs/<key> …   (from tools/)
"""
import json
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


if __name__ == '__main__':
    samples = samples_from(sys.argv[1:])
    print(json.dumps({'samples': samples, 'fit': fit(samples)}, indent=1))
