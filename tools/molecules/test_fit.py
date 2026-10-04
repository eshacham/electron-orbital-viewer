import numpy as np
import pytest

from fit import MIN_VALID_POINTS, fit_minimum, valid_range
from molecules import HARTREE_TO_EV, SCAN_FACTORS


def morse(r, de=0.17, a=1.0, re=1.4):
    return de * (1 - np.exp(-a * (r - re))) ** 2 - de


def test_fits_the_minimum_of_a_morse_curve():
    r = 1.4 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, morse(r), 0.0)
    assert abs(fit['ReBohr'] - 1.4) < 1e-4 * 1.4
    assert abs(fit['EminHartree'] + 0.17) < 1e-5
    assert fit['bound'] is True
    # D_e from the separated atoms, not from the last scan point (still 9 mHa below them at 2.4 R_e).
    assert abs(fit['DeHartree'] - 0.17) < 1e-5 and abs(fit['DeEv'] - 0.17 * HARTREE_TO_EV) < 1e-3
    assert 0 <= fit['ReUncertaintyBohr'] < 1e-3


def test_a_repulsive_curve_is_not_bound():
    r = 3.0 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, np.exp(-r), 0.0)
    assert fit['ReBohr'] is None and fit['DeHartree'] is None and fit['bound'] is False


def test_a_van_der_waals_dimple_is_not_a_bond():
    r = 3.0 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, 0.5 * np.exp(-2 * r) - 3e-5 * np.exp(-((r - 5.6) ** 2)), 0.0)
    assert fit['bound'] is False and 0 < fit['DeHartree'] < 1e-4


def points(energies, t1=0.01, converged=None):
    converged = converged or [True] * len(energies)
    return [{'RBohr': 2.0 * f, 'energyHartree': e if ok else None, 'converged': ok,
             't1Diagnostic': t1 if ok else None, 'failure': None if ok else 'CCSD did not converge'}
            for f, e, ok in zip(SCAN_FACTORS, energies, converged)]


def test_a_curve_that_turns_over_is_cut_where_it_starts_to_fall():
    """F₂'s failure, in miniature: the curve rises from its minimum, peaks,
    then falls -- single-reference CCSD(T) breaking down, not physics."""
    r = 2.68 * np.array(SCAN_FACTORS)
    energies = list(morse(r, re=2.68))
    hump = 16
    energies[hump + 1:] = [energies[hump] - 0.005 * (k + 1) for k in range(len(r) - hump - 1)]
    validity = valid_range(points(energies), t1_limit=0.02)
    assert validity['count'] == hump + 1
    assert validity['validUpToRBohr'] == pytest.approx(2.0 * SCAN_FACTORS[hump])
    assert validity['stopReason'].startswith('energy turns over (5.00 mHa below the point before) at R = ')


def test_the_monotonicity_guard_ignores_the_compressed_side_and_flat_is_a_turnover():
    energies = [1.0 - 0.1 * k for k in range(8)] + [0.31 + 0.01 * k for k in range(12)]
    assert valid_range(points(energies), t1_limit=0.02)['stopReason'] is None   # falling down to R_e is fine
    energies[12] = energies[11]
    assert valid_range(points(energies), t1_limit=0.02)['count'] == 12


def test_t1_and_convergence_stop_the_curve_but_not_for_an_exact_method():
    energies = [1.0 - 0.1 * k for k in range(8)] + [0.31 + 0.01 * k for k in range(12)]
    high = points(energies)
    for p in high[10:]:
        p['t1Diagnostic'] = 0.025
    assert valid_range(high, t1_limit=0.02)['count'] == 10
    assert 'T1 diagnostic 0.0250 exceeds 0.02' in valid_range(high, t1_limit=0.02)['stopReason']
    assert valid_range(high, t1_limit=0.03)['count'] == 20
    assert valid_range(high, t1_limit=None)['count'] == 20
    diverged = points(energies, converged=[True] * 18 + [False] * 2)
    assert valid_range(diverged, t1_limit=None)['stopReason'].startswith('CCSD did not converge at R = ')
    assert valid_range(diverged, t1_limit=None)['count'] == 18


def test_a_turnover_before_a_t1_failure_wins():
    energies = [1.0 - 0.1 * k for k in range(8)] + [0.31 + 0.01 * k for k in range(12)]
    energies[11] = energies[10] - 1e-4
    late = points(energies)
    for p in late[15:]:
        p['t1Diagnostic'] = 0.5
    assert valid_range(late, t1_limit=0.02)['count'] == 11
    assert MIN_VALID_POINTS == 8
