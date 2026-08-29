/**
 * The radial eigenvalue solver: one bound state (n, l) of one potential.
 *
 * Everything downstream — the self-consistent field loop, shell profiles, the
 * 3D render — is built on this returning the right energy and the right shape.
 * Its oracle is exact: for V = -Z/r the answer is the analytic hydrogen-like
 * solution already in quantum_functions.ts, so this is validated against that
 * rather than against itself.
 */
import { RadialGrid, integrateOnGrid, cumulativeIntegral } from './radial_grid';
import { numerovForward, numerovBackward, countNodes } from './numerov';

export interface RadialState {
    n: number;
    l: number;
    /** Eigenvalue in Hartree. Negative for a bound state. */
    energy: number;
    /** u(r) = r*R(r), normalised so that the integral of u^2 dr is 1. */
    u: Float64Array;
    /** R(r) = u(r)/r, the radial wave function itself. */
    R: Float64Array;
}

const MAX_BISECTIONS = 200;
const ENERGY_TOLERANCE = 1e-13;

// Outward integration can run into the classically forbidden region at low
// trial energies and blow up before matchIndex would have stopped it (see
// buildG/matchIndex below); a plain magnitude threshold with a periodic
// rescale keeps it finite without perturbing the node count or the
// logarithmic-derivative match, since both are invariant under a uniform
// positive rescale of the whole array computed so far.
const RESCALE_THRESHOLD = 1e100;
const RESCALE_FACTOR = 1e-100;

// How far past the classical turning point Phase A's node count needs to look
// before it can trust what it has seen (see countNodesForBracketing below).
const DECAY_GROWTH_FACTOR = 1e6;

/**
 * g(t) for y'' = g y, the log-grid form of the radial equation.
 *
 * Writing u = r R and then y = u / sqrt(r) with t = ln r removes the
 * first-derivative term that the change of variable would otherwise introduce,
 * leaving exactly the form Numerov integrates.
 */
function buildG(grid: RadialGrid, l: number, potential: Float64Array, energy: number): Float64Array {
    const centrifugal = (l + 0.5) * (l + 0.5);
    const g = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const r = grid.r[j];
        g[j] = centrifugal + 2 * r * r * (potential[j] - energy);
    }
    return g;
}

/** Outermost point where the motion is still classically allowed (g < 0). */
function matchIndex(g: Float64Array): number {
    for (let j = g.length - 2; j > 1; j--) {
        if (g[j] < 0) return j;
    }
    return Math.floor(g.length / 2);
}

function seedOutward(y: Float64Array, l: number, dx: number): void {
    y.fill(0);
    y[0] = 1;
    y[1] = Math.exp((l + 0.5) * dx);
}

/**
 * Numerov forward, one grid point at a time, with an overflow guard.
 *
 * numerovForward integrates the whole [from, to] span in one call, so a guard
 * has to live here rather than inside it: rescaling mid-recurrence needs
 * access to the two most recent points, which only this loop has.
 */
function integrateOutwardGuarded(g: Float64Array, dx: number, y: Float64Array, from: number, to: number): void {
    for (let j = from; j < to; j++) {
        numerovForward(g, dx, y, j, j + 1);
        if (Math.abs(y[j + 1]) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) y[k] *= RESCALE_FACTOR;
        }
    }
}

function integrateOutward(grid: RadialGrid, g: Float64Array, l: number, to: number): Float64Array {
    const y = new Float64Array(grid.size);
    seedOutward(y, l, grid.dx);
    integrateOutwardGuarded(g, grid.dx, y, 1, to);
    return y;
}

/**
 * Node count for Phase A's bracketing, integrated past the turning point
 * rather than stopping there.
 *
 * The oscillation theorem (the outward regular solution's node count is a
 * step function of trial energy that jumps by one exactly at each eigenvalue)
 * only holds when the solution is followed out to where its true behaviour —
 * decaying, for a trial energy between eigenvalues — has actually shown up.
 * That happens a short distance into the classically forbidden region, not at
 * the turning point itself: measured directly for hydrogen 1s, node count
 * frozen at the turning point flips from 0 to 1 around E = -0.36, nowhere
 * near either E1 = -0.5 or E2 = -0.125, because the extra oscillation the
 * next state will have hasn't appeared yet at that boundary.
 *
 * But it cannot be allowed to run away either: for a tightly bound state
 * (large Z, small n) the turning point sits deep inside a grid sized for the
 * atom's outermost shell, and the numerically dominant growing solution
 * swamps the true, decaying one in a bounded number of e-foldings, well
 * before the far edge of the grid — measured directly for Z=6 1s, continuing
 * all the way to the grid's edge gives node counts that bounce around
 * non-monotonically (21, 1, 1, 4 at E = -15, -10, -5, -1) instead of the
 * single, clean jump at E1 = -18 that a correct implementation must produce.
 *
 * The fix is to stop once the amplitude has grown by a fixed factor beyond
 * its peak in the classically allowed region: comfortably past where any node
 * belonging to the next state would already have appeared, and comfortably
 * short of where rounding noise takes over. This was verified numerically
 * against known hydrogen and Z=6/Z=26 eigenvalues across factors from 1e3 to
 * 1e20 with identical, correct results, so the exact choice is not sensitive.
 */
function countNodesForBracketing(grid: RadialGrid, g: Float64Array, l: number, match: number): number {
    const y = new Float64Array(grid.size);
    seedOutward(y, l, grid.dx);

    let peak = Math.max(Math.abs(y[0]), Math.abs(y[1]));
    for (let j = 1; j < match; j++) {
        numerovForward(g, grid.dx, y, j, j + 1);
        if (Math.abs(y[j + 1]) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) y[k] *= RESCALE_FACTOR;
            peak *= RESCALE_FACTOR;
        }
        if (Math.abs(y[j + 1]) > peak) peak = Math.abs(y[j + 1]);
    }

    let stopIndex = grid.size - 1;
    for (let j = match; j < grid.size - 1; j++) {
        numerovForward(g, grid.dx, y, j, j + 1);
        if (Math.abs(y[j + 1]) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) y[k] *= RESCALE_FACTOR;
            peak *= RESCALE_FACTOR;
        }
        if (peak > 0 && Math.abs(y[j + 1]) > DECAY_GROWTH_FACTOR * peak) {
            stopIndex = j + 1;
            break;
        }
    }
    return countNodes(y, 0, stopIndex);
}

/**
 * Seeds the inward integration with the WKB decay rate at the outer edge,
 * rather than a hard wall (y = 0 there).
 *
 * A hard wall is exact only in the limit that the grid edge is many decay
 * lengths past the state's own extent, which gridForAtom does not guarantee
 * for every (n, l) it might be asked for: it is sized for an atom's outermost
 * shell, not for whichever bound state happens to be requested. Measured
 * directly for hydrogen n=4, l=0 on gridForAtom(1) (whose classical turning
 * point near r=32 leaves only a handful of decay lengths before rMax=65), a
 * hard wall biases the energy by about 1e-5 relative — enough to fail R5's
 * 1e-4 tolerance on R_nl and the brief's 1e-6 energy check — and the bias
 * does not shrink as the grid is refined, confirming it is a domain-size
 * artefact rather than truncation error. Seeding with the local exponential
 * decay rate sqrt(g) instead makes the seed already close to the true
 * decaying solution, so it needs far fewer decay lengths to wash out
 * whatever error remains: the same case comes back accurate to 1e-9 once
 * this and the Phase A margin below are both in place.
 *
 * Stepped one grid point at a time with the same periodic rescale as
 * integrateOutwardGuarded above, for the same reason: the classically
 * forbidden region a deeply bound inner state must cross, integrating
 * backward from a grid's outer edge to its own much smaller turning point,
 * grows without bound in a grid sized for the atom's *outermost* shell
 * (ruling R22 of the SCF task) rather than for this particular state — the
 * whole point of solving every subshell on one shared grid. Discovered via
 * the SCF loop itself: solving iron's 1s (turning point r ~ 0.08) on the
 * grid its own 4s needs (rMax = 71) blew this integration to Infinity in a
 * single unguarded call, where the same state solved on a grid sized only
 * for n=1..3 (rMax <= 44) was fine — i.e. exactly the asymmetry this mirrors
 * against the forward direction's existing guard.
 */
function integrateInward(grid: RadialGrid, g: Float64Array, to: number): Float64Array {
    const y = new Float64Array(grid.size);
    const last = grid.size - 1;
    const kappa = Math.sqrt(Math.max(g[last], 0));
    y[last] = 1e-10;
    y[last - 1] = 1e-10 * Math.exp(kappa * grid.dx);
    for (let j = last - 1; j > to; j--) {
        numerovBackward(g, grid.dx, y, j, j - 1);
        if (Math.abs(y[j - 1]) > RESCALE_THRESHOLD) {
            for (let k = j - 1; k <= last; k++) y[k] *= RESCALE_FACTOR;
        }
    }
    return y;
}

export function solveRadialState(
    grid: RadialGrid, n: number, l: number, potential: Float64Array
): RadialState {
    if (!Number.isInteger(n) || n < 1) throw new Error('Principal quantum number (n) must be a positive integer.');
    if (!Number.isInteger(l) || l < 0 || l > n - 1) throw new Error('Azimuthal quantum number (l) must be an integer between 0 and n-1.');

    const targetNodes = n - l - 1;

    let eLow = -Infinity;
    for (let j = 0; j < grid.size; j++) {
        const value = potential[j] + ((l + 0.5) * (l + 0.5)) / (2 * grid.r[j] * grid.r[j]);
        if (Number.isFinite(value)) eLow = eLow === -Infinity ? value : Math.min(eLow, value);
    }
    if (!Number.isFinite(eLow) || eLow >= 0) eLow = -1e4;
    let eHigh = -1e-12;

    // Phase A: bracket the eigenvalue by node count (see
    // countNodesForBracketing for why this cannot stop at the turning point).
    //
    // This stops at a loose relative width rather than driving all the way to
    // ENERGY_TOLERANCE, deliberately. countNodesForBracketing's decay-growth
    // cutoff is itself an approximation, and how close its node-count
    // transition sits to the true eigenvalue varies from state to state — for
    // hydrogen n=4, l=0 it is off by about 1e-5 relative. Phase B, bisecting
    // on the physically exact log-derivative mismatch, corrects that bias,
    // but only if it is left a bracket that actually contains the true root.
    // A fixed width is not reliable enough for that on its own — how far
    // Phase A's converged interval sits from the true root turned out, when
    // measured, to depend on incidental details like the search's starting
    // point, not just on its width — so Phase B widens outward below until it
    // finds a genuine sign change rather than trusting Phase A's width as-is.
    for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
        const energy = 0.5 * (eLow + eHigh);
        const g = buildG(grid, l, potential, energy);
        const match = matchIndex(g);
        if (countNodesForBracketing(grid, g, l, match) > targetNodes) eHigh = energy;
        else eLow = energy;
        if (eHigh - eLow < Math.abs(eHigh) * 1e-3) break;
    }

    // Phase B: refine on the logarithmic-derivative mismatch at the match point.
    const mismatch = (energy: number): number => {
        const g = buildG(grid, l, potential, energy);
        const match = matchIndex(g);
        const outward = integrateOutward(grid, g, l, match + 1);
        const inward = integrateInward(grid, g, match - 1);
        if (outward[match] === 0 || inward[match] === 0) return 0;
        const scale = outward[match] / inward[match];
        const outwardSlope = (outward[match + 1] - outward[match - 1]) / (2 * grid.dx);
        const inwardSlope = (scale * (inward[match + 1] - inward[match - 1])) / (2 * grid.dx);
        return (outwardSlope - inwardSlope) / outward[match];
    };

    let low = eLow;
    let high = eHigh;
    let fLow = mismatch(low);
    let fHigh = mismatch(high);
    // Expand geometrically around Phase A's bracket until the mismatch
    // function actually changes sign across it, or until the expansion has
    // clearly gone further than any plausible eigenvalue gap. Halving this
    // width back down would only rediscover Phase A's own bias; growing it is
    // what gives Phase B room to find the true root instead.
    const centre = 0.5 * (low + high);
    let halfWidth = Math.max(0.5 * (high - low), Math.abs(centre) * 1e-6);
    for (let expansion = 0; expansion < 60; expansion++) {
        if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) break;
        halfWidth *= 2;
        low = Math.min(centre - halfWidth, eLow);
        high = Math.max(centre + halfWidth, eHigh);
        if (high >= 0) high = -Number.EPSILON;
        fLow = mismatch(low);
        fHigh = mismatch(high);
    }

    let energy = 0.5 * (low + high);
    if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) {
        for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
            const middle = 0.5 * (low + high);
            const value = mismatch(middle);
            if (!Number.isFinite(value)) break;
            if (value * fLow > 0) low = middle;
            else high = middle;
            energy = 0.5 * (low + high);
            if (high - low < Math.abs(high) * 1e-14 + ENERGY_TOLERANCE) break;
        }
    }

    // Final wave function: outward up to the match point, inward beyond it,
    // scaled to agree where they meet.
    const g = buildG(grid, l, potential, energy);
    const match = matchIndex(g);
    const outward = integrateOutward(grid, g, l, match + 1);
    const inward = integrateInward(grid, g, match - 1);
    const scale = inward[match] !== 0 ? outward[match] / inward[match] : 1;

    const y = new Float64Array(grid.size);
    for (let j = 0; j <= match; j++) y[j] = outward[j];
    for (let j = match + 1; j < grid.size; j++) y[j] = scale * inward[j];

    // u = y * sqrt(r), normalised so that the integral of u^2 dr is 1.
    const u = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) u[j] = y[j] * Math.sqrt(grid.r[j]);

    const uSquared = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) uSquared[j] = u[j] * u[j];
    const norm = Math.sqrt(integrateOnGrid(grid, uSquared));
    if (!(norm > 0)) throw new Error(`Radial solver did not converge for n=${n}, l=${l}.`);

    // Containment guard (ruling R21): a grid too small for the requested state
    // does not fail loudly on its own — the hard-wall-like inward seed just
    // forces the solution toward zero at whatever edge it is given, so a
    // single point check at rMax (e.g. u(rMax)^2 against the peak) is not a
    // reliable signal: measured directly for hydrogen 7s truncated at rMax=40,
    // that ratio comes out *smaller* than for a correctly sized grid, because
    // the boundary condition manufactures a small value there regardless of
    // whether the true state has actually decayed by then. What does not lie
    // is the norm itself: a state that does not fit is forced to pack an
    // outsized share of its probability into the last sliver of the grid
    // simply to be normalisable at all. Measured across gridForAtom(1, n) for
    // n=1..7 and n=26,l=1/Z=26 etc., a correctly sized grid keeps under
    // 5e-5 of the norm in the outermost 1% of grid points; truncating
    // hydrogen 7s to rMax=40 (a third of the ~150 a0 it needs) pushes that
    // figure to 0.15 — a three-thousand-fold jump, so 1e-2 leaves a wide,
    // safe margin on both sides.
    const cumulativeUSquared = cumulativeIntegral(grid, uSquared);
    const totalUSquared = cumulativeUSquared[grid.size - 1];
    const tailStart = Math.floor(grid.size * 0.99);
    const tailFraction = totalUSquared > 0
        ? (totalUSquared - cumulativeUSquared[tailStart]) / totalUSquared
        : 1;
    if (tailFraction > 1e-2) {
        throw new Error(
            `Radial grid (rMax=${grid.rMax}) is too small to hold n=${n}, l=${l}: ` +
            `${(tailFraction * 100).toFixed(1)}% of the electron's probability lies ` +
            `in the outermost 1% of the grid. Use a grid sized for this n.`
        );
    }

    // Sign convention: R > 0 as r -> 0, matching the analytic solution.
    const firstSignificant = u.findIndex(value => Math.abs(value) > 1e-12 * norm);
    const sign = firstSignificant >= 0 && u[firstSignificant] < 0 ? -1 : 1;

    const R = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        u[j] = (sign * u[j]) / norm;
        R[j] = u[j] / grid.r[j];
    }

    return { n, l, energy, u, R };
}
