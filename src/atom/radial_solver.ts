/**
 * The radial eigenvalue solver: one bound state (n, l) of one potential.
 *
 * Everything downstream — the self-consistent field loop, shell profiles, the
 * 3D render — is built on this returning the right energy and the right shape.
 * Its oracle is exact: for V = -Z/r the answer is the analytic hydrogen-like
 * solution already in quantum_functions.ts, so this is validated against that
 * rather than against itself.
 */
import { RadialGrid, integrateOnGrid } from './radial_grid';
import { numerovForward, numerovBackward, countNodes } from './numerov';
import {
    RESCALE_THRESHOLD, RESCALE_FACTOR, DECAY_GROWTH_FACTOR, findEigenvalue, assertGridHoldsState,
} from './eigenvalue_search';

export interface RadialState {
    n: number;
    l: number;
    /** Eigenvalue in Hartree (rest mass excluded for relativistic states). Negative for a bound state. */
    energy: number;
    /**
     * u(r) = r*R(r), normalised so that the integral of u^2 dr is 1. For a
     * relativistic state this is the large component G, and it is G^2 + Q^2
     * -- not u^2 alone -- that integrates to 1 and that the density is built
     * from.
     */
    u: Float64Array;
    /** R(r) = u(r)/r, the radial wave function itself (the one the level-3 renderer draws). */
    R: Float64Array;
    /** Small component F = r*f, present only for relativistic states. */
    Q?: Float64Array;
    /** Total angular momentum j = l ± 1/2, present only for Dirac (spin-orbit) states. */
    j?: number;
    /** Dirac quantum number, present only for Dirac states: -(l+1) for j = l + 1/2, l for j = l - 1/2. */
    kappa?: number;
}

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

/** Phase A's node count at one trial energy. */
function nodesAt(grid: RadialGrid, l: number, potential: Float64Array, energy: number): number {
    const g = buildG(grid, l, potential, energy);
    return countNodesForBracketing(grid, g, l, matchIndex(g));
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
    const eHigh = -1e-12;

    // Phase B's mismatch is the logarithmic derivative at the match point;
    // the search itself (both phases) is shared with the relativistic solver.
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
    const { energy } = findEigenvalue({
        targetNodes, eLow, eHigh,
        nodesAt: trial => nodesAt(grid, l, potential, trial),
        mismatchAt: mismatch,
    });

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

    assertGridHoldsState(grid, uSquared, n, l);

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

/**
 * Whether `potential` holds a bound (n, l) state below `below` Hartree --
 * the oscillation theorem again: the outward regular solution at that
 * energy has exactly as many nodes as there are eigenvalues beneath it, so
 * more than n - l - 1 nodes means the (n, l) state lies below. Used by the
 * SCF's anion guard, where the extra electron's state can leave the bound
 * spectrum mid-iteration and solveRadialState (which only searches E < 0)
 * would otherwise return a nonsense state rather than fail.
 */
export function hasBoundState(
    grid: RadialGrid, n: number, l: number, potential: Float64Array, below: number = -1e-4
): boolean {
    return nodesAt(grid, l, potential, below) > n - l - 1;
}
