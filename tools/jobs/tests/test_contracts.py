"""Every Phase 6 name this plan builds on. A failure means Phase 6 shipped a
different name: fix the uses in this plan's later tasks, never Phase 6."""
import importlib


def test_phase_6_builder_names():
    build_library = importlib.import_module('build_library')
    for name in ('build_molecule', 'run_dft', 'BudgetExceeded', 'GRID_POINTS_TRIES', 'BUDGET_BYTES'):
        assert hasattr(build_library, name), name
    assert hasattr(importlib.import_module('optimise'), 'make_dft')
    assert hasattr(importlib.import_module('generate'), 'basis_json')


def test_geometric_and_rfc8785_are_installed():
    importlib.import_module('geometric')
    importlib.import_module('rfc8785')


def test_jobs_package_imports():
    assert importlib.import_module('jobs').__doc__
