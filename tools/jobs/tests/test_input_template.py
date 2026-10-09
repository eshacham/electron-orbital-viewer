import os
import runpy
import subprocess
import sys

import numpy as np
import pytest

from jobs.canonical import canonical_job
from jobs.input_template import render_input

H2 = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.74]]
SMALL = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': None}
LADDER = {'xc': 'B3LYP', 'basis': '6-31g', 'optimiseBasis': None}   # D5: STO-3G never reaches the second-order rung


def test_rendered_script_is_self_describing():
    text = render_input(canonical_job('single', H2, 0, 1), 'k' * 64)
    assert "BASIS = 'def2-TZVPD'" in text and 'OPTIMISE_BASIS = None' in text
    assert f"XC = {canonical_job('single', H2, 0, 1)['method']['xc']!r}" in text
    assert 'FREQUENCY_CHECK = False' in text
    assert "('H', (0.0, 0.0, 0.74))" in text and 'kkkk' in text
    compile(text, 'input.py', 'exec')


def test_recipe_b_checks_its_structure_only_from_compute_version_2():
    job = canonical_job('optimise', H2, 0, 1)
    assert 'FREQUENCY_CHECK = True' in render_input({**job, 'computeVersion': 2}, 'k' * 64)
    assert 'FREQUENCY_CHECK = False' in render_input({**job, 'computeVersion': 1}, 'k' * 64)


def test_the_script_says_how_to_rerun_it_on_linux_and_on_an_apple_silicon_mac():
    # Preflight D17: pyscf-dispersion has no build that runs on Apple silicon; there input.py's D3 comes from
    # tools/molecules/dispersion.py's stand-in, which must be importable.
    text = render_input(canonical_job('single', H2, 0, 1), 'k' * 64)
    assert 'pyscf-dispersion' in text and 'PYTHONPATH=<repository>/tools/molecules python input.py' in text


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


def test_a_resumed_optimisation_says_where_it_started():
    """M4: input.py is what ran, so a resumed attempt must not read as if it
    started from the submitted geometry."""
    job = canonical_job('optimise', H2, 0, 1)
    fresh = render_input(job, 'k' * 64)
    assert 'Resumed' not in fresh
    resumed = render_input(job, 'k' * 64, start=[('H', (0.0, 0.0, 0.0)), ('H', (0.0, 0.0, 0.77))], resumed_from=1)
    assert "# Resumed from attempt 1's last trajectory frame" in resumed
    assert "('H', (0.0, 0.0, 0.77))" in resumed
    compile(resumed, 'input.py', 'exec')


OPT = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}
H2O2 = [[8, 0.0, 0.0, 0.0], [8, 1.45, 0.0, 0.0], [1, -0.32, 0.92, 0.0], [1, 1.77, -0.92, 0.0]]   # trans, C2h


def _namespace(tmp_path, monkeypatch, job):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(job, 'k' * 64))
    return runpy.run_path('input.py', run_name='jobs_input')


def test_the_optimisation_builds_its_molecule_without_symmetry(tmp_path, monkeypatch):
    # Phase 6D spec §8: PySCF's geomeTRIC engine holds every geometry to the starting point group.
    # (Compute version 1 here: no frequency check follows, so the build stops at the optimisation.)
    ns = _namespace(tmp_path, monkeypatch, {**canonical_job('optimise', H2, 0, 1, method=OPT), 'computeVersion': 1})
    import pyscf.geomopt.geometric_solver as gs
    seen = []

    def record(mf, **kwargs):
        seen.append(mf.mol.symmetry)
        return True, mf.mol
    monkeypatch.setattr(gs, 'kernel', record)
    mol, mf, info = ns['build']()
    assert seen == [False] and mol.symmetry and {k: info[k] for k in ('steps', 'converged')} == {'steps': 0, 'converged': True}
    assert info['finalGeometry'] == {'symmetrised': True, 'groupOrder': None, 'maxDisplacementAngstrom': 0.0,
                                     'pointGroup': 'Dooh'}


def dihedral(p0, p1, p2, p3):
    b0, b1, b2 = p0 - p1, p2 - p1, p3 - p2
    b1 = b1 / np.linalg.norm(b1)
    v, w = b0 - (b0 @ b1) * b1, b2 - (b2 @ b1) * b1
    return abs(np.degrees(np.arctan2(np.cross(b1, v) @ w, v @ w)))


def test_a_dihedral_constraint_moves_in_the_geometry_molecule(tmp_path, monkeypatch):
    # Spec §12's regression (scans research §4.2, pitfall 1): with symmetry on, trans-H2O2 driven to a
    # 120° H-O-O-H dihedral "converged" at 180°. The geometry molecule must let it move.
    ns = _namespace(tmp_path, monkeypatch, canonical_job('optimise', H2O2, 0, 1, method=OPT))
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel
    (tmp_path / 'constraints.txt').write_text('$set\ndihedral 3 1 2 4 120.0\n')
    atoms = [(s, xyz) for s, xyz in ns['ATOMS']]
    mol = ns['molecule'](atoms, 'sto-3g', symmetry=False)
    converged, final = geometric_kernel(ns['geometry_dft'](mol), constraints='constraints.txt', maxsteps=50)
    c = final.atom_coords(unit='Angstrom')
    assert converged and dihedral(c[2], c[0], c[1], c[3]) == pytest.approx(120.0, abs=0.5)


def test_b3lyp_d3bj_adds_its_dispersion_energy(tmp_path, monkeypatch):
    ns = _namespace(tmp_path, monkeypatch, canonical_job('single', H2O2, 0, 1,
                                                           method={'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': None}))
    mol, mf, _ = ns['build']()
    assert mf.converged and -0.01 < mf.scf_summary['dispersion'] < 0


def test_an_open_shell_runs_its_geometry_work_uks_only_when_it_will_be_checked(tmp_path, monkeypatch):
    oh = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.98]]
    job = canonical_job('optimise', oh, 0, 2, method=OPT)
    ns = _namespace(tmp_path, monkeypatch, {**job, 'computeVersion': 2})
    mol = ns['molecule']([('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.0, 0.98))], 'sto-3g', symmetry=False)
    assert type(ns['geometry_dft'](mol)).__name__.endswith('UKS')
    assert type(ns['make_dft'](mol)).__name__.endswith('ROKS')
    ns = _namespace(tmp_path, monkeypatch, {**job, 'computeVersion': 1})
    assert type(ns['geometry_dft'](mol)).__name__.endswith('ROKS')


def test_a_refused_step_ends_the_optimisation_with_its_last_geometry(tmp_path, monkeypatch):
    # Spec §9: the budget is asked after every step; a no keeps that step's geometry, marked not converged.
    ns = _namespace(tmp_path, monkeypatch, canonical_job('optimise', [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.9]], 0, 1, method=OPT))
    asked, steps = [], []
    mol, mf, info = ns['build'](on_step=lambda n, e, a: steps.append(a),
                                may_start=lambda stage: asked.append(stage) or False)
    assert asked == ['step'] and len(steps) == 1
    assert info['steps'] == 1 and info['converged'] is False and info['stoppedBy'] == 'time-limit'
    assert info['maxGradient'] > 1e-3
    assert mf.converged and abs(mol.atom_coord(1)[2] - mol.atom_coord(0)[2]) * 0.529177 == pytest.approx(
        abs(steps[0][1][1][2] - steps[0][0][1][2]), abs=1e-6)


def test_the_budget_is_never_asked_at_the_step_that_converges(tmp_path, monkeypatch):
    # Preflight D12: geomeTRIC tests convergence only after its callback returns. A budget asked at the
    # converged step could refuse it, and a converged geometry would be reported "stopped by its time limit,
    # not converged". So the step whose geometry, gradient and energy change meet geomeTRIC's own criteria
    # asks nothing: no further step follows it.
    stretched = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.9]]
    ns = _namespace(tmp_path, monkeypatch, {**canonical_job('optimise', stretched, 0, 1, method=OPT), 'computeVersion': 1})
    asked = []
    _, _, info = ns['build'](may_start=lambda stage: asked.append(stage) or True)
    assert info['converged'] and info['steps'] >= 2 and asked == ['step'] * (info['steps'] - 1)
    # The same run under a budget that would refuse anything past the last unconverged step: it converges.
    n, asked = info['steps'] - 1, []
    _, _, again = ns['build'](may_start=lambda stage: asked.append(stage) or len(asked) <= n)
    assert again == info and len(asked) == n


# Task 6 review, folded into Task 7: the final SCF's symmetry, an exact time check, the best frame.
TWISTED_ETHYLENE = [[6, 0, 0, 0], [6, 1.34, 0, 0], [1, -0.55, 0.93, 0.2], [1, -0.55, -0.93, -0.2],
                    [1, 1.89, 0.5, 0.8], [1, 1.89, -0.5, -0.8]]
D3_SMALL = {'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}


def test_a_geometry_symmetric_to_within_the_optimisers_noise_is_symmetrised_for_the_final_scf(tmp_path, monkeypatch):
    # The optimisation ends within ~2e-5 Å of D2h; PySCF then finds D2h but cannot build its symmetry-adapted
    # basis at that geometry (IndexError in symm_adapted_basis), and a paid job failed after its optimisation.
    ns = _namespace(tmp_path, monkeypatch, {**canonical_job('optimise', TWISTED_ETHYLENE, 0, 1, method=D3_SMALL),
                                            'computeVersion': 1})
    mol, mf, info = ns['build']()
    assert mf.converged and mol.symmetry and mol.topgroup == 'D2h'
    record = info['finalGeometry']
    assert record['symmetrised'] and record['pointGroup'] == 'D2h' and record['groupOrder'] == 8
    assert 0 < record['maxDisplacementAngstrom'] < 1e-3


def _noisy(atoms, scale, seed=7):
    rng = np.random.default_rng(seed)
    return [(s, tuple(float(c) for c in np.asarray(xyz) + scale * rng.standard_normal(3))) for s, xyz in atoms]


def test_symmetrising_finds_the_full_group_and_moves_nothing_further_than_the_noise(tmp_path, monkeypatch):
    ns = _namespace(tmp_path, monkeypatch, canonical_job('single', H2, 0, 1, method=SMALL))
    from pyscf import gto
    a = 0.629
    methane = [('C', (0.0, 0.0, 0.0)), ('H', (a, a, a)), ('H', (-a, -a, a)), ('H', (-a, a, -a)), ('H', (a, -a, -a))]
    noisy = _noisy(methane, 3e-5)
    assert gto.M(atom=noisy, symmetry=True, verbose=0).topgroup != 'Td'          # noise above PySCF's tolerance
    placed, order, moved = ns['symmetrised'](noisy)
    assert order == 24 and moved < 2e-4
    assert gto.M(atom=placed, symmetry=True, verbose=0).topgroup == 'Td'
    # A real asymmetry, ten times the tolerance, is kept: water with O-H bonds 0.96 and 0.97 Å stays Cs.
    water = [('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.757, 0.587)), ('H', (0.0, -0.765, 0.593))]
    placed, order, moved = ns['symmetrised'](water)
    assert order == 2 and moved < 1e-12
    # A linear molecule: laid exactly on its line and, here, exactly centrosymmetric.
    placed, order, moved = ns['symmetrised'](_noisy([('O', (0.0, 0.0, -1.16)), ('C', (0.0, 0.0, 0.0)), ('O', (0.0, 0.0, 1.16))], 2e-5))
    assert gto.M(atom=placed, symmetry=True, verbose=0).topgroup == 'Dooh' and moved < 1e-4


def test_a_final_scf_whose_symmetry_cannot_be_built_runs_without_it_and_says_so(tmp_path, monkeypatch):
    ns = _namespace(tmp_path, monkeypatch, canonical_job('single', H2, 0, 1, method=SMALL))
    live = ns['build'].__globals__
    real = live['molecule']

    def broken(atoms, basis, symmetry=True):
        if symmetry:
            raise IndexError('index 2 is out of bounds for axis 0 with size 2')
        return real(atoms, basis, symmetry=False)
    live['molecule'] = broken
    mol, mf, info = ns['build']()
    assert mf.converged and not mol.symmetry
    assert info['finalGeometry']['symmetry'] == 'off'
    assert info['finalGeometry']['note'] == (
        'PySCF could not build symmetry-adapted orbitals at this geometry (IndexError: index 2 is out of bounds '
        'for axis 0 with size 2), so the final SCF ran without point-group symmetry; its orbitals are labelled '
        "from the geometry's own point group by character projection, where the labeller supports that group "
        "(meta.json's symmetry says how)")


def test_a_stopped_optimisation_keeps_its_lowest_energy_frame(tmp_path, monkeypatch):
    # geomeTRIC can take a step that raises the energy (and then reject it); a stop just after one must not
    # hand on that worse geometry.
    ns = _namespace(tmp_path, monkeypatch, {**canonical_job('optimise', H2, 0, 1, method=OPT), 'computeVersion': 1})
    import pyscf.geomopt.geometric_solver as gs
    frames = [[('H', (0.0, 0.0, 0.0)), ('H', (0.0, 0.0, z))] for z in (0.80, 0.74, 0.70)]
    energies, gradients = (-1.10, -1.20, -1.15), (0.03, 0.001, 0.02)

    def fake(scanner, maxsteps, callback, **kwargs):
        for frame, energy, gmax in zip(frames + frames[:1], energies + (0.0,), gradients + (0.0,)):
            mol = ns['molecule'](frame, 'sto-3g', symmetry=False)
            scanner(mol)                                   # the budget refuses the fourth
            callback({'mol': mol, 'energy': energy, 'gradients': np.array([[0, 0, gmax], [0, 0, -gmax]]),
                      'g_scanner': scanner})
        return True, mol
    monkeypatch.setattr(gs, 'kernel', fake)
    asked = []
    _, _, info = ns['build'](may_start=lambda stage: asked.append(stage) or len(asked) < 3)
    assert asked == ['step'] * 3 and info['steps'] == 3 and info['stoppedBy'] == 'time-limit'
    assert info['maxGradient'] == pytest.approx(0.001) and info['stoppedAt'] == 2


OH = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.97]]


def test_a_final_scf_that_does_not_converge_with_symmetry_is_retried_once_without(tmp_path, monkeypatch):
    # Ruling OH-retry: OH (2Π) does not converge in ROKS with symmetry on at def2-TZVPD -- nor at 6-31G, which
    # shows it in a quarter of the time -- on any rung (DIIS, level shift, second order), and converges at
    # once without it. A paid job must not fail on that: the final SCF is retried once with symmetry off, and
    # the record says so.
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', OH, 0, 2, method=LADDER), 'k' * 64))
    stages = []
    mol, mf, info = runpy.run_path('input.py', run_name='jobs_input')['build'](
        on_stage=lambda s, e=None, c=None: stages.append(s))
    assert mf.converged and not mol.symmetry and type(mf).__name__.endswith('ROKS')
    assert 'SCF (second-order)' in stages and stages[-1].startswith('SCF without symmetry (')
    assert info['finalScf']['symmetry'] == 'off' and info['finalScf']['retried'] is True
    assert info['finalScf']['summary'].startswith('the final SCF did not converge with point-group symmetry')


def test_a_final_scf_that_converges_neither_way_fails_saying_both(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', H2, 0, 1, method=LADDER), 'k' * 64))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    ns['converge'].__globals__['MAX_CYCLES'] = (1, 1, 1)
    with pytest.raises(ns['SCFNotConverged']) as e:
        ns['build']()
    assert str(e.value) == ('SCF did not converge with point-group symmetry or without it (DIIS, level shift '
                            '0.3 Ha, second-order)')

