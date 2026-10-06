import pytest

from jobs.calibrate import fit
from jobs.sizing import speedup


def test_fit_recovers_known_constants():
    m0, m2, t0, t3, f2 = 0.4, 3.0, 5.0, 1800.0, 2500.0
    samples = [{'basisFunctions': n, 'threads': 8, 'peakMemoryGB': m0 + m2 * (n / 1000) ** 2,
                'scfSeconds': (t0 + t3 * (n / 1000) ** 3.5) / speedup(8),
                'filesSeconds': f2 * (n / 1000) ** 2} for n in (58, 276, 614)]
    got = fit(samples, t0=t0)
    assert got['m0'] == pytest.approx(m0, rel=1e-6) and got['m2'] == pytest.approx(m2, rel=1e-6)
    assert got['t3'] == pytest.approx(t3, rel=1e-6)
    assert got['f2'] == pytest.approx(f2, rel=1e-6)
