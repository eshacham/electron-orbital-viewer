/**
 * The radial grid every atomic calculation runs on.
 *
 * Logarithmic, because an atom spans two and a half orders of magnitude in
 * radius: uranium's 1s peaks inside 0.02 a0 while its valence shell reaches
 * past 40. A uniform grid fine enough for the former would need millions of
 * points to reach the latter, and almost all of them would be wasted in the
 * empty outer region.
 *
 * Points are r_j = rMin * e^(j*dx), so t = ln r is uniformly spaced. Every
 * integral below is therefore a uniform-spacing quadrature in t, with the
 * Jacobian dr = r dt folded into the integrand.
 */
export interface RadialGrid {
    readonly r: Float64Array;
    /** Uniform spacing in t = ln r. */
    readonly dx: number;
    readonly size: number;
    readonly rMin: number;
    readonly rMax: number;
}

export function makeRadialGrid(rMin: number, rMax: number, size: number): RadialGrid {
    if (!(rMin > 0) || !(rMax > rMin)) throw new Error('Radial grid needs 0 < rMin < rMax.');
    if (!Number.isInteger(size) || size < 3) throw new Error('Radial grid needs at least 3 points.');
    if (size % 2 === 0) {
        throw new Error('Radial grid needs an odd number of points, so Simpson\'s rule spans an even number of intervals.');
    }

    const dx = Math.log(rMax / rMin) / (size - 1);
    const r = new Float64Array(size);
    for (let j = 0; j < size; j++) r[j] = rMin * Math.exp(j * dx);
    return { r, dx, size, rMin, rMax };
}

/**
 * rMax needed to hold a bound state of a given highest principal quantum
 * number, indexed by n - 1.
 *
 * These are the hydrogenic 99.99%-enclosed radius (Z_eff = 1, worst l for
 * that n) computed offline, times a 1.25 safety factor. Z_eff = 1 is the
 * right basis even for a heavy atom: a valence electron in a neutral atom of
 * charge Z sees the nuclear charge almost entirely screened by the inner
 * shells, so its effective charge is close to 1 regardless of Z. This is a
 * measured table, not a formula invented at the keyboard — an earlier
 * from-Z-alone formula silently truncated diffuse states (hydrogen 6s and 7s
 * were wrong by 20% and 41% before this was measured).
 *
 * n:            1     2     3     4     5     6     7
 * r99.99 (a0): 7.0  18.9  35.5  56.6  82.2 112.1 146.4
 * with margin:  9    24    44    71   103   140   183
 */
const RMAX_FOR_HIGHEST_N: readonly number[] = [9, 24, 44, 71, 103, 140, 183];

/**
 * The highest principal quantum number occupied by a neutral atom of charge
 * Z, by period (period boundaries: 1-2, 3-10, 11-18, 19-36, 37-54, 55-86,
 * 87-118).
 */
function highestOccupiedN(Z: number): number {
    if (Z <= 2) return 1;
    if (Z <= 10) return 2;
    if (Z <= 18) return 3;
    if (Z <= 36) return 4;
    if (Z <= 54) return 5;
    if (Z <= 86) return 6;
    return 7;
}

/**
 * A grid sized for a neutral atom of charge Z, or explicitly for whichever
 * highest principal quantum number the caller intends to solve.
 *
 * The inner cutoff scales as 1/Z because that is how the innermost shell
 * scales. The outer edge is sized from highestN (see RMAX_FOR_HIGHEST_N)
 * rather than from Z alone: a caller solving an excited or Rydberg state well
 * above an atom's own ground-state occupation — hydrogen's n=6, say — needs a
 * grid sized for that n, not for hydrogen's single occupied shell. An odd
 * point count keeps Simpson's rule exact over the whole range.
 */
export function gridForAtom(Z: number, highestN: number = highestOccupiedN(Z)): RadialGrid {
    if (!Number.isInteger(highestN) || highestN < 1 || highestN > RMAX_FOR_HIGHEST_N.length) {
        throw new Error(`gridForAtom needs a highest n between 1 and ${RMAX_FOR_HIGHEST_N.length}.`);
    }
    const rMin = 1e-6 / Z;
    const rMax = RMAX_FOR_HIGHEST_N[highestN - 1];
    return makeRadialGrid(rMin, rMax, 2001);
}

/** Simpson's rule in t, with the dr = r dt Jacobian folded in. */
export function integrateOnGrid(grid: RadialGrid, fOfR: Float64Array): number {
    const { r, dx, size } = grid;
    let sum = fOfR[0] * r[0] + fOfR[size - 1] * r[size - 1];
    for (let j = 1; j < size - 1; j++) {
        sum += (j % 2 === 1 ? 4 : 2) * fOfR[j] * r[j];
    }
    return (sum * dx) / 3;
}

/**
 * The running integral from the origin out to each grid point.
 *
 * Trapezoid rather than Simpson: this feeds the Hartree potential, which needs
 * a value at every point rather than at every second one.
 */
export function cumulativeIntegral(grid: RadialGrid, fOfR: Float64Array): Float64Array {
    const { r, dx, size } = grid;
    const out = new Float64Array(size);
    for (let j = 1; j < size; j++) {
        out[j] = out[j - 1] + 0.5 * dx * (fOfR[j] * r[j] + fOfR[j - 1] * r[j - 1]);
    }
    return out;
}

/** Linear interpolation in t = ln r, clamped to the grid's range. */
export function interpolateOnGrid(grid: RadialGrid, values: Float64Array, r: number): number {
    const { rMin, dx, size } = grid;
    if (!(r > rMin)) return values[0];
    const position = Math.log(r / rMin) / dx;
    if (position >= size - 1) return values[size - 1];
    const j = Math.floor(position);
    const t = position - j;
    return values[j] * (1 - t) + values[j + 1] * t;
}
