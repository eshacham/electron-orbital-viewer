import numpy as np

from fit import fit_minimum
from molecules import SCAN_FACTORS


def morse(r, de=0.17, a=1.0, re=1.4):
    return de * (1 - np.exp(-a * (r - re))) ** 2 - de


def test_fits_the_minimum_of_a_morse_curve():
    r = 1.4 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, morse(r))
    assert abs(fit['ReBohr'] - 1.4) < 1e-4 * 1.4
    assert abs(fit['EminHartree'] + 0.17) < 1e-5
    assert fit['bound'] is True


def test_a_repulsive_curve_is_not_bound():
    r = 3.0 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, np.exp(-r))
    assert fit['ReBohr'] is None and fit['bound'] is False


def test_a_van_der_waals_dimple_is_not_a_bond():
    r = 3.0 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, 0.5 * np.exp(-2 * r) - 3e-5 * np.exp(-((r - 5.6) ** 2)))
    assert fit['bound'] is False and fit['wellDepthHartree'] < 1e-4
