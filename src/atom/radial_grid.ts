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
 * A grid sized for a neutral atom of charge Z.
 *
 * The inner cutoff scales as 1/Z because that is how the innermost shell
 * scales; the outer edge grows slowly with Z because adding electrons fills
 * higher shells faster than the nucleus contracts them. An odd point count
 * keeps Simpson's rule exact over the whole range.
 */
export function gridForAtom(Z: number): RadialGrid {
    const rMin = 1e-6 / Z;
    const rMax = 50 + 1.5 * Math.cbrt(Z) * 10;
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
