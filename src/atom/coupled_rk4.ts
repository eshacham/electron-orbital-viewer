/**
 * Classical fourth-order Runge–Kutta for a 2x2 linear first-order system on a
 * uniformly spaced variable -- here t = ln r, the spacing of the radial grid.
 *
 * This is the relativistic counterpart of numerov.ts: pure numerics, no
 * physics, no grid knowledge. The relativistic radial equations are a
 * coupled pair for the large and small components (G, F) with no
 * Numerov-compatible second-order form (see relativistic_solver.ts), so they
 * are integrated as the pair. The system's coefficients depend on the
 * potential, which lives only on grid points; RK4's half-step needs it in
 * between, supplied by `midpointValues` at the same fourth order.
 */

/** Fills out = [a, b, c, d] for d/dt (G, F) = [[a, b], [c, d]] (G, F) at radius r where the potential is v. */
export type CoefficientFn = (r: number, v: number, out: Float64Array) => void;

// Scratch for the coefficients: rk4Step runs ~10^8 times over a heavy-atom
// SCF, so allocating per call would dominate its cost.
const k = new Float64Array(4);

export function rk4Step(
    fill: CoefficientFn, h: number,
    r0: number, v0: number, rMid: number, vMid: number, r1: number, v1: number,
    G: number, F: number, out: Float64Array,
): void {
    fill(r0, v0, k);
    const g1 = k[0] * G + k[1] * F;
    const f1 = k[2] * G + k[3] * F;

    fill(rMid, vMid, k);
    const Ga = G + 0.5 * h * g1;
    const Fa = F + 0.5 * h * f1;
    const g2 = k[0] * Ga + k[1] * Fa;
    const f2 = k[2] * Ga + k[3] * Fa;
    const Gb = G + 0.5 * h * g2;
    const Fb = F + 0.5 * h * f2;
    const g3 = k[0] * Gb + k[1] * Fb;
    const f3 = k[2] * Gb + k[3] * Fb;

    fill(r1, v1, k);
    const Gc = G + h * g3;
    const Fc = F + h * f3;
    const g4 = k[0] * Gc + k[1] * Fc;
    const f4 = k[2] * Gc + k[3] * Fc;

    out[0] = G + (h * (g1 + 2 * g2 + 2 * g3 + g4)) / 6;
    out[1] = F + (h * (f1 + 2 * f2 + 2 * f3 + f4)) / 6;
}

/**
 * values at the half-way points j + 1/2, j = 0..size-2, by 4-point Lagrange
 * interpolation in the (uniform) index -- exact for cubics, so the same
 * order as RK4 itself. The first and last intervals have only one
 * neighbour on the outside and use the 3-point (quadratic) form instead.
 */
export function midpointValues(values: Float64Array): Float64Array {
    const size = values.length;
    if (size < 3) throw new Error('midpointValues needs at least 3 points.');
    const mid = new Float64Array(size - 1);
    mid[0] = (3 * values[0] + 6 * values[1] - values[2]) / 8;
    for (let j = 1; j < size - 2; j++) {
        mid[j] = (-values[j - 1] + 9 * values[j] + 9 * values[j + 1] - values[j + 2]) / 16;
    }
    mid[size - 2] = (-values[size - 3] + 6 * values[size - 2] + 3 * values[size - 1]) / 8;
    return mid;
}
