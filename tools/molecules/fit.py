"""The equilibrium bond length and dissociation energy from a scan, and the
range of the scan over which single-reference CCSD(T) can be trusted.

R_e is the minimum of a cubic spline through the reference energies,
searched between the two scan points either side of the lowest one (spacing
there is 2 % of R, see SCAN_FACTORS); its uncertainty is how far a quartic
fitted to the central points puts it instead."""
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.optimize import minimize_scalar

from molecules import HARTREE_TO_EV

# A chemical bond is at least tens of meV deep; below 1 mHa (27 meV) it is a
# van der Waals dimple at most, and the app says "no chemical bond".
BOUND_THRESHOLD_HARTREE = 1e-3
# Lee & Taylor's rule of thumb for when one determinant stops describing the
# wavefunction (ruling T4-a): 0.02 for closed shells, 0.03 for open shells.
T1_LIMIT_CLOSED = 0.02
T1_LIMIT_OPEN = 0.03
# Ruling T4-d: a curve may also run until T1 has grown by half over its value
# at R_e. That keeps CO (T1 0.018 at R_e, so 0.02 cut it 2 % out) from being
# judged by an absolute bar it nearly fails at equilibrium, and gives B₂ and
# C₂ (over the bar even at R_e) a curve at all, flagged multireference.
T1_GROWTH_ALLOWED = 1.5
# The fewest points a shipped CCSD(T) curve may have: R_e is scan point 07,
# so this is every compressed point plus R_e itself (ruling T4-a).
MIN_VALID_POINTS = 8
QUARTIC_POINTS = 7


def _bounded_minimum(f, lo, hi):
    best = minimize_scalar(f, bounds=(lo, hi), method='bounded', options={'xatol': 1e-8})
    return float(best.x), float(best.fun)


def fit_minimum(r, e, separated_atoms_hartree):
    """ReBohr is None when the lowest energy is at either end of the points
    given (no minimum inside them). D_e is measured from the separated atoms
    computed at the same method and basis, never from the last scan point:
    a curve cut short at its validity limit has not reached them."""
    r, e = np.asarray(r, float), np.asarray(e, float)
    i = int(np.argmin(e))
    if i in (0, len(r) - 1):
        return {'ReBohr': None, 'ReUncertaintyBohr': None, 'EminHartree': float(e[i]),
                'DeHartree': None, 'DeEv': None, 'bound': False}
    re, emin = _bounded_minimum(CubicSpline(r, e), r[i - 1], r[i + 1])
    lo, hi = max(0, i - QUARTIC_POINTS // 2), min(len(r), i + QUARTIC_POINTS // 2 + 1)
    uncertainty = None
    if hi - lo >= 5:
        quartic = np.polynomial.Polynomial.fit(r[lo:hi], e[lo:hi], 4)
        uncertainty = abs(re - _bounded_minimum(quartic, r[i - 1], r[i + 1])[0])
    de = float(separated_atoms_hartree - emin)
    return {'ReBohr': re, 'ReUncertaintyBohr': uncertainty, 'EminHartree': emin,
            'DeHartree': de, 'DeEv': de * HARTREE_TO_EV, 'bound': bool(de > BOUND_THRESHOLD_HARTREE)}


def t1_rule(points, base_limit, equilibrium_index):
    """The T1 limit a curve is held to (ruling T4-d): max(base_limit,
    T1_GROWTH_ALLOWED × T1 at R_e), and whether the molecule is strongly
    multireference (T1 at R_e already over base_limit), which the UI captions
    as "only qualitative here". T1 at R_e is None if that point failed, and
    the base limit then stands (the curve stops before R_e and is refused)."""
    at_re = points[equilibrium_index]['t1Diagnostic'] if points[equilibrium_index]['converged'] else None
    limit = base_limit if at_re is None else max(base_limit, T1_GROWTH_ALLOWED * at_re)
    return {'t1AtRe': at_re, 't1Limit': limit, 'multireference': bool(at_re is not None and at_re > base_limit)}


def valid_range(points, *, t1_limit):
    """How many scan points, from the most compressed outwards, a curve may
    ship. `points` carry RBohr, energyHartree, converged, t1Diagnostic and
    failure (quantum.solve's result). A point stops the curve if its
    calculation failed, or -- for an approximate method (t1_limit not None)
    -- if its T1 diagnostic exceeds t1_limit, or if, past the lowest point,
    its energy is not above the one before: a real curve rises monotonically
    to the separated atoms, so a fall is single-reference CCSD(T) breaking
    down as the bond goes open-shell (F₂'s spurious hump), not physics.

    Returns {'count', 'validUpToRBohr', 'stoppedAtRBohr', 'stopReason'};
    the last two are None when every point is valid."""
    def stop(k, reason):
        return {'count': k, 'validUpToRBohr': points[k - 1]['RBohr'] if k else None,
                'stoppedAtRBohr': points[k]['RBohr'], 'stopReason': f'{reason} at R = {points[k]["RBohr"]:.4f} a₀'}

    first_failure = None
    for k, p in enumerate(points):
        if not p['converged']:
            first_failure = (k, p['failure'])
        elif t1_limit is not None and p['t1Diagnostic'] > t1_limit:
            first_failure = (k, f'T1 diagnostic {p["t1Diagnostic"]:.4f} exceeds {t1_limit:.4f}')
        if first_failure:
            break
    computed = first_failure[0] if first_failure else len(points)
    if t1_limit is not None and computed:
        # The turnover is judged on the points that passed the checks above,
        # so it can stop the curve before them, never after.
        energies = [p['energyHartree'] for p in points[:computed]]
        for k in range(int(np.argmin(energies)) + 1, computed):
            if energies[k] <= energies[k - 1]:
                fall = (energies[k - 1] - energies[k]) * 1e3
                return stop(k, f'energy turns over ({fall:.2f} mHa below the point before)')
    if first_failure:
        return stop(*first_failure)
    return {'count': len(points), 'validUpToRBohr': points[-1]['RBohr'], 'stoppedAtRBohr': None, 'stopReason': None}
