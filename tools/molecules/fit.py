"""The equilibrium bond length from a scan: the minimum of a cubic spline
through the 20 reference energies, searched between the two scan points
either side of the lowest one (spacing there is 2 % of R, see SCAN_FACTORS)."""
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.optimize import minimize_scalar

# A chemical bond is at least tens of meV deep; below 1 mHa (27 meV) it is a
# van der Waals dimple at most, and the app says "no chemical bond".
BOUND_THRESHOLD_HARTREE = 1e-3


def fit_minimum(r, e):
    """ReBohr is None when the lowest energy is at either end of the scan (no
    minimum inside it). The well depth is measured against the scan's last
    (longest) point, not the separated atoms: it decides only "bond or not",
    and 2.4 R_e is far enough out for that."""
    r, e = np.asarray(r, float), np.asarray(e, float)
    i = int(np.argmin(e))
    if i in (0, len(r) - 1):
        return {'ReBohr': None, 'EminHartree': float(e[i]), 'wellDepthHartree': 0.0, 'bound': False}
    spline = CubicSpline(r, e)
    best = minimize_scalar(spline, bounds=(r[i - 1], r[i + 1]), method='bounded', options={'xatol': 1e-8})
    depth = float(e[-1] - best.fun)
    return {'ReBohr': float(best.x), 'EminHartree': float(best.fun), 'wellDepthHartree': depth,
            'bound': bool(depth > BOUND_THRESHOLD_HARTREE)}
