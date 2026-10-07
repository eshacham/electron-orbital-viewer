"""The speedup probe (Ruling D15): how a job's two costs scale with threads.

Every AWS job the calibration ladder can afford sizes to S (2 vCPU), so the
ladder alone cannot say how the SCF speeds up with more vCPU, nor whether
the Phase 6 file write speeds up at all. This runs benzene's B3LYP/def2-TZVPD
SCF and the file write once per thread count, in one big Fargate task, and
prints ONE line of JSON in the shape calibrate.py's probe contract defines
(n, scfSeconds, filesSeconds, plus keys kept for the record). calibrate's
fit_speedup and fit_files read it; nothing here touches AWS.

    python -m jobs.worker probe [--budget-seconds 1080]          (the image's entry point)
    python -m jobs.probe --molecule h2o --basis def2-SVP --threads 2,1 --grid-points 32   (a quick local check)
    python -m jobs.worker probe --molecule caffeine --basis def2-SVP --optimise-steps 3 \
        --atoms-json '[[1,-2.9346,2.1021,-0.8849], ...]'   (Phase 6B-3 follow-up: times a few optimisation
        steps directly, bypassing decide() and the jobs table, for a recipe decide() refuses too-long --
        caffeine is not in the library (only ever resolved through PubChem), hence --atoms-json; see
        measure_optimise and HANDOFF's "Caffeine optimise is now refused")

Each thread count runs in a fresh child process with OMP_NUM_THREADS and
OPENBLAS_NUM_THREADS set to n, as BatchRunner sets OMP_NUM_THREADS to the
task's vCPU. Calling pyscf.lib.num_threads(n) alone would leave numpy's BLAS
pool at the machine's full width, so the low-n runs would borrow threads a
small worker does not have and the measured speedup would come out too
flat. A fresh process also means a fresh mf object: no run inherits another's
converged density.

The thread counts run largest first, and --budget-seconds stops before a run
that would not fit. The runs get slower as n falls, so if the task's timeout
is near, the run lost is the slowest one, and the line is still printed with
what was measured.
"""
import argparse
import json
import os
import resource
import subprocess
import sys
import tempfile
import time
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
_MOLECULES = str(TOOLS / 'molecules')
if _MOLECULES not in sys.path:
    sys.path.append(_MOLECULES)

THREADS = (32, 16, 8, 4, 2)
# A run at n/2 threads takes at most twice the run at n (speedup is never
# better than linear). Pessimistic by design: stopping early loses one point;
# overrunning the timeout loses the whole line.
NEXT_RUN_FACTOR = 2.0


def _peak_memory_gb():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(rss / 1024 ** 3 if sys.platform == 'darwin' else rss / 1024 ** 2, 3)   # bytes on macOS, KiB on Linux


def _vcpu():
    try:
        return len(os.sched_getaffinity(0))
    except AttributeError:                          # macOS has no sched_getaffinity
        return os.cpu_count()


def measure(molecule, basis, n, grid_points):
    """One run at n threads, in this process: the SCF's kernel, timed alone
    (no molecule build), then the worker's 'writing files' stage for it."""
    from pyscf import gto, lib
    from build_library import write_molecule_files
    from library import by_id
    from optimise import geometry_for, make_dft

    lib.num_threads(n)
    entry = by_id(molecule)
    atoms, _ = geometry_for(entry)
    # The worker's settings (input_template.make_dft is optimise.make_dft's
    # twin): grids level 4, conv_tol 1e-10, plain DIIS, which converges
    # benzene first time.
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=entry.spin, symmetry=True, verbose=0)
    mf = make_dft(mol)
    began = time.monotonic()
    mf.kernel()
    scf = time.monotonic() - began
    if not mf.converged:
        raise RuntimeError(f'{molecule}: SCF did not converge at {n} threads')
    mf.verbose = 0
    fields = {'id': f'probe-{molecule}', 'name': entry.name, 'formula': entry.formula,
              'geometrySource': 'speedup probe', 'references': [], 'multiplicity': entry.spin + 1,
              'method': f'B3LYP/{basis}'}
    with tempfile.TemporaryDirectory(prefix='probe-') as out:
        began = time.monotonic()
        meta = write_molecule_files(out, mol, mf, fields, grid_points, commit='probe')
        files = time.monotonic() - began
    return {'n': n, 'threadsSeen': lib.num_threads(), 'scfSeconds': round(scf, 3), 'filesSeconds': round(files, 3),
            'energyHartree': float(mf.e_tot), 'scfCycles': int(getattr(mf, 'cycles', -1)),
            'basisFunctions': int(mol.nao), 'gridShape': meta['grid']['shape'], 'peakMemoryGB': _peak_memory_gb()}


def measure_optimise(atoms, basis, steps, spin=0, label=None):
    """A few optimisation steps (SCF + gradient), timed directly (Phase 6B-3
    follow-up, Task 7): the measurement route for a recipe decide() refuses
    too-long for, since that refusal means no job record and no Batch
    submission ever exists to time. `atoms` is an explicit [[Z,x,y,z],...]
    list, not a library id: caffeine (and any owner molecule) is never in
    tools/molecules' library, only ever resolved through PubChem, which this
    probe does not call (Ruling D15, extended -- see main's --atoms-json).
    geomeTRIC's own maxsteps stops the optimisation after `steps` real
    (SCF + gradient) evaluations, raising NotConvergedError on the next one,
    which `kernel` already catches; the geometry answer is thrown away; only
    each step's wall time and the SCF's cycle count (the gradient scanner's
    `.base`, the mf object that step's SCF converged, the same `.cycles`
    probe's own measure() and input_template's SCFNotConverged check read)
    matter."""
    from pyscf import gto
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel
    from optimise import make_dft

    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=spin, symmetry=True, verbose=0)
    began, out = [time.monotonic()], []

    def callback(envs):
        now = time.monotonic()
        base = getattr(envs['g_scanner'], 'base', None)
        out.append({'seconds': round(now - began[0], 3), 'cycles': int(getattr(base, 'cycles', -1))})
        began[0] = now

    geometric_kernel(make_dft(mol), maxsteps=steps, callback=callback)
    return {'probe': 'optimise-steps', 'molecule': label, 'basis': basis, 'vcpu': _vcpu(),
            'basisFunctions': int(mol.nao), 'steps': out}


def run_child(n, molecule, basis, grid_points):
    """measure() in a fresh Python, its thread pools fixed at n from the start."""
    env = dict(os.environ, OMP_NUM_THREADS=str(n), OPENBLAS_NUM_THREADS=str(n), MKL_NUM_THREADS=str(n),
               PYTHONPATH=os.pathsep.join(filter(None, (str(TOOLS), _MOLECULES, os.environ.get('PYTHONPATH')))))
    done = subprocess.run([sys.executable, '-m', 'jobs.probe', '--child', str(n), '--molecule', molecule,
                           '--basis', basis, '--grid-points', ','.join(map(str, grid_points))],
                          env=env, stdout=subprocess.PIPE, text=True, check=False)
    lines = [line for line in done.stdout.splitlines() if line.startswith('{')]
    if done.returncode != 0 or not lines:
        raise RuntimeError(f'the {n}-thread run exited {done.returncode}')
    return json.loads(lines[-1])


def probe(threads=THREADS, molecule='benzene', basis='def2-TZVPD', grid_points=None, budget_seconds=None,
          runner=run_child, clock=time.monotonic, emit=print):
    """Runs each thread count (largest first), emitting one progress line per
    run (keyed 'probeRun', not 'n', so calibrate.read_probe skips them) and
    then the contract line. Returns the contract line's dict."""
    from build_library import GRID_POINTS_TRIES
    grid_points = tuple(grid_points or GRID_POINTS_TRIES)
    began, runs, skipped, error, last = clock(), [], [], None, None
    for n in sorted(set(threads), reverse=True):
        elapsed = clock() - began
        if budget_seconds is not None and last is not None and elapsed + NEXT_RUN_FACTOR * last > budget_seconds:
            skipped.append(n)
            continue
        start = clock()
        try:
            run = runner(n, molecule, basis, grid_points)
        except Exception as e:
            error = f'{type(e).__name__}: {e}'
            break
        last = clock() - start
        run['wallSeconds'] = round(last, 3)
        runs.append(run)
        emit(json.dumps({'probeRun': n, **{k: v for k, v in run.items() if k != 'n'}}), flush=True)
    line = {'probe': 'speedup', 'molecule': molecule, 'basis': basis, 'vcpu': _vcpu(),
            'n': [r['n'] for r in runs], 'scfSeconds': [r['scfSeconds'] for r in runs],
            'filesSeconds': [r['filesSeconds'] for r in runs],
            'threadsSeen': [r['threadsSeen'] for r in runs],
            'energyHartree': [r['energyHartree'] for r in runs],
            'peakMemoryGB': [r['peakMemoryGB'] for r in runs],
            'basisFunctions': runs[0]['basisFunctions'] if runs else None,
            'gridShape': runs[0]['gridShape'] if runs else None,
            'skipped': skipped, 'error': error, 'totalSeconds': round(clock() - began, 3)}
    emit(json.dumps(line), flush=True)
    return line


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m jobs.worker probe')
    parser.add_argument('--molecule', default='benzene', help='a molecule library id')
    parser.add_argument('--basis', default='def2-TZVPD')
    parser.add_argument('--threads', default=','.join(map(str, THREADS)), help='comma-separated, e.g. 32,16,8,4,2')
    parser.add_argument('--grid-points', default=None, help="comma-separated; default the worker's 96,88,80")
    parser.add_argument('--budget-seconds', type=float, default=None,
                        help='skip a run that would end past this many seconds (keep it under the task timeout)')
    parser.add_argument('--child', type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument('--optimise-steps', type=int, default=None,
                        help='time this many optimisation steps (SCF + gradient) instead of the thread sweep '
                             '-- the route past a recipe decide() refuses too-long (Phase 6B-3 follow-up)')
    parser.add_argument('--atoms-json', default=None,
                        help='[[Z,x,y,z],...] in Angstrom, for --optimise-steps on a molecule outside the '
                             'library (e.g. caffeine, which the app only ever resolves through PubChem)')
    parser.add_argument('--spin', type=int, default=0, help='2S (multiplicity - 1), for --atoms-json')
    args = parser.parse_args(argv)
    grid = tuple(int(v) for v in args.grid_points.split(',')) if args.grid_points else None
    if args.optimise_steps is not None:
        if args.atoms_json:
            atoms, spin = json.loads(args.atoms_json), args.spin
        else:
            from library import by_id
            from optimise import geometry_for
            entry = by_id(args.molecule)
            atoms, spin = geometry_for(entry)[0], entry.spin
        line = measure_optimise(atoms, args.basis, args.optimise_steps, spin=spin, label=args.molecule)
        print(json.dumps(line), flush=True)
        return 0
    if args.child is not None:
        from build_library import GRID_POINTS_TRIES
        print(json.dumps(measure(args.molecule, args.basis, args.child, grid or GRID_POINTS_TRIES)), flush=True)
        return 0
    line = probe(tuple(int(v) for v in args.threads.split(',')), args.molecule, args.basis, grid, args.budget_seconds)
    # Two points are the least fit_speedup takes; fewer is a failed probe.
    return 0 if len(set(line['n'])) >= 2 and line['error'] is None else 1


if __name__ == '__main__':
    sys.exit(main())
