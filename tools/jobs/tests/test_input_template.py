import os
import runpy
import subprocess
import sys

import pytest

from jobs.canonical import canonical_job
from jobs.input_template import render_input

H2 = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.74]]
SMALL = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': None}
LADDER = {'xc': 'B3LYP', 'basis': '6-31g', 'optimiseBasis': None}   # D5: STO-3G never reaches the second-order rung


def test_rendered_script_is_self_describing():
    text = render_input(canonical_job('single', H2, 0, 1), 'k' * 64)
    assert "BASIS = 'def2-TZVPD'" in text and "XC = 'B3LYP'" in text and 'OPTIMISE_BASIS = None' in text
    assert "('H', (0.0, 0.0, 0.74))" in text and 'kkkk' in text
    compile(text, 'input.py', 'exec')


def test_build_returns_a_converged_scf_and_logs(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', H2, 0, 1, method=SMALL), 'k' * 64))
    stages = []
    mol, mf, info = runpy.run_path('input.py', run_name='jobs_input')['build'](on_stage=lambda s, e=None: stages.append(s))
    assert mf.converged and info == {} and stages[0].startswith('SCF')
    assert (tmp_path / 'output.log').read_text().count('converged SCF energy') >= 1


def test_open_shell_uses_roks(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', [[1, 0, 0, 0]], 0, 2, method=SMALL), 'k' * 64))
    mol, mf, _ = runpy.run_path('input.py', run_name='jobs_input')['build']()
    # D4: with symmetry on, PySCF's open-shell DFT class is SymAdaptedROKS.
    assert type(mf).__name__.endswith('ROKS') and mol.spin == 1


def test_ladder_reaches_second_order_and_then_gives_up(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    # D5: STO-3G converges early and never reaches the second-order rung; use 6-31g instead.
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', H2, 0, 1, method=LADDER), 'k' * 64))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    stages = []
    ns['converge'].__globals__['MAX_CYCLES'] = (1, 1, 1)      # force every rung to stop early
    with pytest.raises(ns['SCFNotConverged']):
        ns['build'](on_stage=lambda s, e=None: stages.append(s))
    # PySCF's own kernel loop calls `callback` once per completed cycle, on top of this
    # template's pre-announcement, and the second-order (newton) solver calls it once more
    # after its macro loop; collapse consecutive repeats so the assertion checks the rungs
    # reached, not how many times each one happened to report in.
    seen = []
    for s in stages:
        if s.startswith('SCF (') and (not seen or seen[-1] != s):
            seen.append(s)
    assert seen == ['SCF (DIIS)', 'SCF (level shift 0.3 Ha)', 'SCF (second-order)']


def test_optimise_wraps_geometric_not_converged(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    method = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}
    (tmp_path / 'input.py').write_text(render_input(canonical_job('optimise', H2, 0, 1, method=method), 'k' * 64))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    import pyscf.geomopt.geometric_solver as gs

    def boom(*a, **k):
        raise gs.NotConvergedError('geometry optimization failed to converge')

    monkeypatch.setattr(gs, 'kernel', boom)
    with pytest.raises(ns['OptimisationNotConverged']):
        ns['build']()


def test_optimise_lets_other_errors_propagate(tmp_path, monkeypatch):
    # Important fix: only geomeTRIC's own NotConvergedError should be reported as
    # "did not converge". A MemoryError (or any other bug) must reach the worker
    # unchanged, so it is never misreported as a convergence failure.
    monkeypatch.chdir(tmp_path)
    method = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}
    (tmp_path / 'input.py').write_text(render_input(canonical_job('optimise', H2, 0, 1, method=method), 'k' * 64))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    import pyscf.geomopt.geometric_solver as gs

    def boom(*a, **k):
        raise MemoryError('out of memory')

    monkeypatch.setattr(gs, 'kernel', boom)
    with pytest.raises(MemoryError):
        ns['build']()


def test_close_log_closes_the_handle(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', H2, 0, 1, method=SMALL), 'k' * 64))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    ns['build']()
    # runpy.run_path returns a snapshot of the globals at exec time; the live module
    # dict (where `global _log` assignments actually land) is reachable through any
    # of its functions' __globals__ (same pattern the brief's own ladder test uses).
    glob = ns['molecule'].__globals__
    log = glob['_log']
    assert log is not None and not log.closed
    ns['close_log']()
    assert log.closed and glob['_log'] is None


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='a short geomeTRIC run')
def test_optimise_reports_steps_and_runs_standalone(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    stretched = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.9]]
    method = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}
    (tmp_path / 'input.py').write_text(render_input(canonical_job('optimise', stretched, 0, 1, method=method), 'k' * 64))
    steps = []
    mol, mf, info = runpy.run_path('input.py', run_name='jobs_input')['build'](on_step=lambda n, e, a: steps.append((n, e, a)))
    assert info['converged'] and info['steps'] == len(steps) >= 2
    assert abs(mol.atom_coord(1)[2] - mol.atom_coord(0)[2]) * 0.529177 < 0.85
    run = subprocess.run([sys.executable, 'input.py'], cwd=tmp_path, capture_output=True, text=True)
    assert run.returncode == 0 and 'E =' in run.stdout
