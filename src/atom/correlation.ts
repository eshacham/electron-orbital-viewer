/**
 * VWN5 local-density correlation (ruling R8, not in the original brief).
 *
 * Added alongside Hartree and Dirac/Slater exchange because the only precise
 * external benchmark for this engine — NIST atomic reference data, Z<=92, to
 * 1 microHartree — uses exchange plus VWN correlation; without it there is
 * nothing authoritative to validate the whole engine against. Kept in its
 * own module and tested against a table of independently verified (rs,
 * eps_c, V_c) values (.superpowers/sdd/2026-08-29-multi-electron-atoms/
 * vwn5-verified.md) so that a bug here surfaces as a pure-function test
 * failure rather than a mysterious few-percent error inside an atomic total
 * energy. Constants, formula and derivative below are transcribed verbatim
 * from that file — do not substitute a remembered VWN parametrisation.
 */
import { RadialGrid, integrateOnGrid } from './radial_grid';

const A = 0.0310907;
const X0 = -0.10498;
const B = 3.72744;
const C = 12.9352;
const Q = Math.sqrt(4 * C - B * B);

/** X(x) = x^2 + b*x + c, the quadratic VWN5 factors throughout. */
function bigX(x: number): number {
    return x * x + B * x + C;
}

/**
 * eps_c(x), x = sqrt(rs). Verified against a table of seven (rs, eps_c)
 * values and, at rs=1 and rs=2, against published Ceperley-Alder values.
 */
export function vwnEpsilonC(x: number): number {
    const X = bigX(x);
    const X0Value = bigX(X0);
    const atanTerm = Math.atan(Q / (2 * x + B));
    return A * (
        Math.log((x * x) / X)
        + ((2 * B) / Q) * atanTerm
        - ((B * X0) / X0Value) * (
            Math.log(((x - X0) * (x - X0)) / X)
            + ((2 * (B + 2 * X0)) / Q) * atanTerm
        )
    );
}

/**
 * d(eps_c)/dx, using the simplified form from vwn5-verified.md: the naive
 * derivative's 4b/((2x+b)^2+Q^2) term collapses via the identity
 * (2x+b)^2+Q^2 = 4*X(x), verified exactly there.
 */
export function vwnEpsilonCDerivative(x: number): number {
    const X = bigX(x);
    const X0Value = bigX(X0);
    return A * (
        2 / x - (2 * x + B) / X - B / X
        - ((B * X0) / X0Value) * (2 / (x - X0) - (2 * x + B) / X - (B + 2 * X0) / X)
    );
}

/** rs = (3/(4*pi*rho))^(1/3), the Wigner-Seitz radius for a given density. */
function xFromDensity(rho: number): number {
    const rs = Math.cbrt(3 / (4 * Math.PI * Math.max(rho, 0)));
    return Math.sqrt(rs);
}

/**
 * eps_c(rho): correlation energy per electron of a uniform gas at density
 * rho. Zero density is short-circuited rather than fed through xFromDensity:
 * rs -> infinity there, so x is literally Infinity, and Infinity/Infinity
 * inside vwnEpsilonC evaluates to NaN even though the analytic limit is 0 (as
 * confirmed by the rs -> infinity test below). A grid point at the tail of a
 * wide atomic grid can underflow to exactly rho = 0 in double precision, and
 * a single NaN there would poison every Simpson's-rule sum this feeds.
 */
export function correlationEnergyDensity(rho: number): number {
    if (!(rho > 0)) return 0;
    return vwnEpsilonC(xFromDensity(rho));
}

/**
 * V_c = eps_c - (x/6) d(eps_c)/dx.
 *
 * The x/6 (not rs/3) comes from the chain rule through rs = x^2: the usual
 * V_c = eps_c - (rs/3) d(eps_c)/drs identity, rewritten in terms of x, picks
 * up a factor of 1/(2x) from d(eps_c)/drs = d(eps_c)/dx * dx/drs, and
 * rs/3 * 1/(2x) = x/6.
 */
export function correlationPotential(rho: number): number {
    if (!(rho > 0)) return 0;
    const x = xFromDensity(rho);
    return vwnEpsilonC(x) - (x / 6) * vwnEpsilonCDerivative(x);
}

/** E_c = integral( D(r) * eps_c(rho(r)) dr ), the same bookkeeping as E_x. */
export function correlationEnergy(grid: RadialGrid, D: Float64Array, density: Float64Array): number {
    const integrand = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) integrand[j] = D[j] * correlationEnergyDensity(density[j]);
    return integrateOnGrid(grid, integrand);
}
