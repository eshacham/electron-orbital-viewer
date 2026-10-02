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

/**
 * One parameter set of the VWN5 form G(x; A, x0, b, c) below. The
 * restricted functional uses the paramagnetic set alone; the spin-polarised
 * one (spinCorrelation, Phase 3) adds VWN's (Vosko, Wilk and Nusair 1980,
 * fit 5) ferromagnetic set and spin stiffness alpha_c, the same form with
 * their own constants.
 */
export interface VwnParameters { A: number; x0: number; b: number; c: number }
export const PARAMAGNETIC: VwnParameters = { A, x0: X0, b: B, c: C };
export const FERROMAGNETIC: VwnParameters = { A: 0.01554535, x0: -0.325, b: 7.06042, c: 18.0578 };
export const SPIN_STIFFNESS: VwnParameters = { A: -1 / (6 * Math.PI * Math.PI), x0: -0.0047584, b: 1.13107, c: 13.0045 };

/** G(x; A, x0, b, c), x = sqrt(rs), factored throughout by the quadratic X(x) = x^2 + b*x + c. */
export function vwnG(x: number, p: VwnParameters): number {
    const X = x * x + p.b * x + p.c;
    const X0Value = p.x0 * p.x0 + p.b * p.x0 + p.c;
    const Q = Math.sqrt(4 * p.c - p.b * p.b);
    const atanTerm = Math.atan(Q / (2 * x + p.b));
    return p.A * (
        Math.log((x * x) / X)
        + ((2 * p.b) / Q) * atanTerm
        - ((p.b * p.x0) / X0Value) * (
            Math.log(((x - p.x0) * (x - p.x0)) / X)
            + ((2 * (p.b + 2 * p.x0)) / Q) * atanTerm
        )
    );
}

/**
 * dG/dx, using the simplified form from vwn5-verified.md: the naive
 * derivative's 4b/((2x+b)^2+Q^2) term collapses via the identity
 * (2x+b)^2+Q^2 = 4*X(x), verified exactly there.
 */
function vwnGDerivative(x: number, p: VwnParameters): number {
    const X = x * x + p.b * x + p.c;
    const X0Value = p.x0 * p.x0 + p.b * p.x0 + p.c;
    return p.A * (
        2 / x - (2 * x + p.b) / X - p.b / X
        - ((p.b * p.x0) / X0Value) * (2 / (x - p.x0) - (2 * x + p.b) / X - (p.b + 2 * p.x0) / X)
    );
}

/**
 * eps_c(x), x = sqrt(rs). Verified against a table of seven (rs, eps_c)
 * values and, at rs=1 and rs=2, against published Ceperley-Alder values.
 */
export function vwnEpsilonC(x: number): number {
    return vwnG(x, PARAMAGNETIC);
}

/** d(eps_c)/dx. */
export function vwnEpsilonCDerivative(x: number): number {
    return vwnGDerivative(x, PARAMAGNETIC);
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
 *
 * The same failure mode also shows up one step earlier than exact zero:
 * xFromDensity's 3/(4*pi*rho) is a mathematically enormous but finite number
 * for rho anywhere in the denormalised range (rho below about 1e-308), and
 * that quotient itself overflows to Infinity before cbrt/sqrt ever run,
 * producing the same non-finite x with rho still nominally positive.
 * Discovered running the SCF loop (Task 6) on the heaviest elements: their
 * grids reach far enough into the classically forbidden tail that a
 * subshell's density genuinely underflows into that range at some grid
 * points, well before it reaches exact 0. Checking x itself, rather than
 * only rho's sign, catches both cases with one guard.
 */
export function correlationEnergyDensity(rho: number): number {
    if (!(rho > 0)) return 0;
    const x = xFromDensity(rho);
    if (!Number.isFinite(x)) return 0;
    return vwnEpsilonC(x);
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
    if (!Number.isFinite(x)) return 0;
    return vwnEpsilonC(x) - (x / 6) * vwnEpsilonCDerivative(x);
}

/** E_c = integral( D(r) * eps_c(rho(r)) dr ), the same bookkeeping as E_x. */
export function correlationEnergy(grid: RadialGrid, D: Float64Array, density: Float64Array): number {
    const integrand = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) integrand[j] = D[j] * correlationEnergyDensity(density[j]);
    return integrateOnGrid(grid, integrand);
}

/**
 * VWN5 with spin polarisation, for the ΔSCF energies only (Phase 3).
 * Restricted LDA misses the exchange-correlation energy of unpaired spins,
 * which differs between an atom and its ion (O has two, O+ three) and put
 * oxygen's ΔSCF ionisation energy 22 % high. Pictures keep the restricted,
 * NIST-validated functional above.
 *
 * eps_P is vwnEpsilonC itself (the same G and parameter set), so at
 * zeta = 0 this reproduces the restricted functional bit for bit. The
 * ferromagnetic and stiffness sets are verified end to end by the LSD total
 * energies matching NIST SRD 141's LSD column (Task 5).
 */
/** f(zeta) = [(1+zeta)^(4/3) + (1-zeta)^(4/3) - 2] / (2^(4/3) - 2), 0 unpolarised, 1 fully polarised. */
const F_DENOMINATOR = Math.pow(2, 4 / 3) - 2;
const F_SECOND_DERIVATIVE_AT_0 = 8 / (9 * F_DENOMINATOR);
const spinF = (z: number) => (Math.pow(1 + z, 4 / 3) + Math.pow(1 - z, 4 / 3) - 2) / F_DENOMINATOR;
const spinFDerivative = (z: number) => (4 / 3) * (Math.cbrt(1 + z) - Math.cbrt(1 - z)) / F_DENOMINATOR;

/** Correlation energy per electron (Ha) and the potential each spin channel feels. */
export interface SpinCorrelation { epsilon: number; vUp: number; vDown: number }

/**
 * eps_c(rs, zeta) = eps_P + alpha_c f/f''(0) (1 - zeta^4) + (eps_F - eps_P) f zeta^4,
 * with V_s = eps_c - (x/6) d(eps_c)/dx + (s - zeta) d(eps_c)/d(zeta), s = +1 up, -1 down:
 * the x/6 is correlationPotential's chain rule, and the zeta term is how
 * moving density from one spin to the other shifts zeta at fixed total
 * density. Zero and underflowing density short-circuit to zero for the same
 * reason as correlationEnergyDensity.
 */
export function spinCorrelation(rhoUp: number, rhoDown: number): SpinCorrelation {
    const up = Math.max(rhoUp, 0);
    const down = Math.max(rhoDown, 0);
    const rho = up + down;
    if (!(rho > 0)) return { epsilon: 0, vUp: 0, vDown: 0 };
    const x = xFromDensity(rho);
    if (!Number.isFinite(x)) return { epsilon: 0, vUp: 0, vDown: 0 };
    const zeta = Math.max(-1, Math.min(1, (up - down) / rho));

    const eP = vwnG(x, PARAMAGNETIC), dP = vwnGDerivative(x, PARAMAGNETIC);
    const eF = vwnG(x, FERROMAGNETIC), dF = vwnGDerivative(x, FERROMAGNETIC);
    const a = vwnG(x, SPIN_STIFFNESS), dA = vwnGDerivative(x, SPIN_STIFFNESS);
    const f = spinF(zeta), fPrime = spinFDerivative(zeta);
    const z3 = zeta * zeta * zeta, z4 = z3 * zeta;

    const epsilon = eP + a * (f / F_SECOND_DERIVATIVE_AT_0) * (1 - z4) + (eF - eP) * f * z4;
    const dEpsDx = dP + dA * (f / F_SECOND_DERIVATIVE_AT_0) * (1 - z4) + (dF - dP) * f * z4;
    const dEpsDz = (a / F_SECOND_DERIVATIVE_AT_0) * (fPrime * (1 - z4) - 4 * z3 * f) + (eF - eP) * (fPrime * z4 + 4 * z3 * f);
    const common = epsilon - (x / 6) * dEpsDx;
    return { epsilon, vUp: common + (1 - zeta) * dEpsDz, vDown: common - (1 + zeta) * dEpsDz };
}
