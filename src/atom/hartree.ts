/**
 * The Hartree potential and Dirac/Slater exchange, the two electron-electron
 * pieces of the mean-field potential the SCF loop (Task 6) assembles.
 *
 * Kept as free-standing functions rather than folded into one
 * "build the potential" call, deliberately (ruling R20): a planned
 * scalar-relativistic v2 needs to reuse exactly this Hartree and exchange
 * machinery unchanged, composing it with a different kinetic/exchange
 * treatment rather than a different Hartree potential. Correlation lives in
 * its own module (correlation.ts) for the same reason, one level further:
 * it is also physically independent of these two.
 */
import { RadialGrid, integrateOnGrid, cumulativeIntegral } from './radial_grid';

/**
 * V_H(r) by Gauss's law in spherical symmetry: the charge enclosed within r
 * acts like a point charge at the origin, and the charge outside r contributes
 * the potential of a shell, which is uniform inside its own radius.
 *
 * ∫₀^r D dr' is exactly what cumulativeIntegral computes. The outward-from-r
 * term, ∫_r^∞ (D/r') dr', is obtained as (grand total) − (running integral of
 * D/r up to r) rather than integrated afresh from each point outward, which
 * would be O(size^2); the subtraction is O(size) and exact for the same
 * quadrature rule.
 */
export function hartreePotential(grid: RadialGrid, D: Float64Array): Float64Array {
    const { r, size } = grid;
    const enclosed = cumulativeIntegral(grid, D);

    const DOverR = new Float64Array(size);
    for (let j = 0; j < size; j++) DOverR[j] = D[j] / r[j];
    const runningDOverR = cumulativeIntegral(grid, DOverR);
    const totalDOverR = runningDOverR[size - 1];

    const v = new Float64Array(size);
    for (let j = 0; j < size; j++) {
        v[j] = enclosed[j] / r[j] + (totalDOverR - runningDOverR[j]);
    }
    return v;
}

/**
 * ρ(r) = D(r) / (4πr²), guarded at the innermost point where D/r² would
 * otherwise divide a tiny numerator by an even tinier denominator: D itself
 * vanishes as r² near the origin (D = 4πr²ρ, and ρ(0) is finite), so the
 * ratio is well-behaved in the continuum limit, but on the grid r[0] is not
 * exactly zero and rounding in D near there can make the ratio noisy. Falling
 * back to the next point's density is a closer approximation to ρ(0) than
 * trusting that noise.
 */
export function densityFromD(grid: RadialGrid, D: Float64Array): Float64Array {
    const { r, size } = grid;
    const density = new Float64Array(size);
    for (let j = 1; j < size; j++) {
        density[j] = Math.max(D[j] / (4 * Math.PI * r[j] * r[j]), 0);
    }
    density[0] = size > 1 ? density[1] : 0;
    return density;
}

const EXCHANGE_COEFFICIENT = Math.pow(3 / Math.PI, 1 / 3);

/** Dirac/Slater local-density exchange potential, V_x(r) = -(3ρ/π)^(1/3). */
export function exchangePotential(density: Float64Array): Float64Array {
    const v = new Float64Array(density.length);
    for (let j = 0; j < density.length; j++) {
        const rho = Math.max(density[j], 0);
        v[j] = -EXCHANGE_COEFFICIENT * Math.cbrt(rho);
    }
    return v;
}

/** Exchange energy per electron, ε_x(ρ) = -(3/4)(3/π)^(1/3) ρ^(1/3). */
function exchangeEnergyDensity(density: Float64Array): Float64Array {
    const eps = new Float64Array(density.length);
    for (let j = 0; j < density.length; j++) {
        const rho = Math.max(density[j], 0);
        eps[j] = -0.75 * EXCHANGE_COEFFICIENT * Math.cbrt(rho);
    }
    return eps;
}

/** E_x = ∫ D(r) ε_x(ρ(r)) dr. */
export function exchangeEnergy(grid: RadialGrid, D: Float64Array, density: Float64Array): number {
    const eps = exchangeEnergyDensity(density);
    const integrand = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) integrand[j] = D[j] * eps[j];
    return integrateOnGrid(grid, integrand);
}

/** E_H = ½ ∫ D(r) V_H(r) dr. */
export function hartreeEnergy(grid: RadialGrid, D: Float64Array, vHartree: Float64Array): number {
    const integrand = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) integrand[j] = D[j] * vHartree[j];
    return 0.5 * integrateOnGrid(grid, integrand);
}
