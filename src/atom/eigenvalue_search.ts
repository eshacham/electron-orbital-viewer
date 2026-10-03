/**
 * The eigenvalue search both radial solvers share: bracket by node count
 * (Phase A), refine by bisection on the mismatch where an outward and an
 * inward solution meet (Phase B), and the containment guard every converged
 * state has to pass.
 *
 * Extracted from radial_solver.ts unchanged when the relativistic solver
 * (relativistic_solver.ts) arrived, so that the two cannot drift apart: the
 * search knows nothing about which equation is being solved, only two
 * functions of the trial energy -- how many nodes the regular solution has,
 * and how badly the outward and inward solutions disagree at the match point.
 * Every choice below was paid for in the Schrödinger solver first; the
 * comments that explain them moved here with the code.
 */
import { RadialGrid, cumulativeIntegral } from './radial_grid';

const MAX_BISECTIONS = 200;
const ENERGY_TOLERANCE = 1e-13;

// Outward integration can run into the classically forbidden region at low
// trial energies and blow up before the match point would have stopped it; a
// plain magnitude threshold with a periodic rescale keeps it finite without
// perturbing the node count or the match, since both are invariant under a
// uniform positive rescale of the whole array computed so far.
export const RESCALE_THRESHOLD = 1e100;
export const RESCALE_FACTOR = 1e-100;

// How far past the classical turning point Phase A's node count needs to look
// before it can trust what it has seen (see radial_solver's
// countNodesForBracketing).
export const DECAY_GROWTH_FACTOR = 1e6;

export interface EigenvalueSearch {
    /** n - l - 1: the node count that identifies the state being sought. */
    targetNodes: number;
    /** Phase A's starting bracket: an energy certainly below the state, and one just below zero. */
    eLow: number;
    eHigh: number;
    /** Nodes of the outward regular solution at a trial energy (the oscillation theorem's count). */
    nodesAt: (energy: number) => number;
    /** Mismatch at the match point between outward and inward solutions; changes sign at an eigenvalue. */
    mismatchAt: (energy: number) => number;
}

export interface EigenvalueResult {
    energy: number;
    /**
     * Whether Phase B found a sign change of the mismatch and bisected on it.
     * When it did not, `energy` is only the middle of the widest bracket it
     * tried -- about -150 Hartree after its 60 doublings, whatever the state
     * -- not an eigenvalue of anything: measured for hydrogen 5g on a 10 a0
     * grid, which has no room for it, the Schrödinger solver returns -156.25.
     * radial_solver predates this flag and keeps its behaviour unchanged;
     * the relativistic solver refuses such a result.
     */
    bracketed: boolean;
}

export function findEigenvalue(search: EigenvalueSearch): EigenvalueResult {
    const { targetNodes, nodesAt, mismatchAt } = search;
    let eLow = search.eLow;
    let eHigh = search.eHigh;

    // Phase A: bracket the eigenvalue by node count (see radial_solver's
    // countNodesForBracketing for why this cannot stop at the turning point).
    //
    // This stops at a loose relative width rather than driving all the way to
    // ENERGY_TOLERANCE, deliberately. countNodesForBracketing's decay-growth
    // cutoff is itself an approximation, and how close its node-count
    // transition sits to the true eigenvalue varies from state to state — for
    // hydrogen n=4, l=0 it is off by about 1e-5 relative. Phase B, bisecting
    // on the physically exact mismatch, corrects that bias, but only if it is
    // left a bracket that actually contains the true root. A fixed width is
    // not reliable enough for that on its own — how far Phase A's converged
    // interval sits from the true root turned out, when measured, to depend
    // on incidental details like the search's starting point, not just on its
    // width — so Phase B widens outward below until it finds a genuine sign
    // change rather than trusting Phase A's width as-is.
    for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
        const energy = 0.5 * (eLow + eHigh);
        if (nodesAt(energy) > targetNodes) eHigh = energy;
        else eLow = energy;
        if (eHigh - eLow < Math.abs(eHigh) * 1e-3) break;
    }

    // Phase B: refine on the mismatch at the match point.
    let low = eLow;
    let high = eHigh;
    let fLow = mismatchAt(low);
    let fHigh = mismatchAt(high);
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
        fLow = mismatchAt(low);
        fHigh = mismatchAt(high);
    }

    let energy = 0.5 * (low + high);
    const bracketed = Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0;
    if (bracketed) {
        for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
            const middle = 0.5 * (low + high);
            const value = mismatchAt(middle);
            if (!Number.isFinite(value)) break;
            if (value * fLow > 0) low = middle;
            else high = middle;
            energy = 0.5 * (low + high);
            if (high - low < Math.abs(high) * 1e-14 + ENERGY_TOLERANCE) break;
        }
    }
    return { energy, bracketed };
}

/**
 * Containment guard (ruling R21): throws if the state packs more than 1% of
 * its probability into the outermost 1% of the grid. `density` is the
 * unnormalised radial probability -- u^2 for a Schrödinger state, G^2 + F^2
 * for a relativistic one.
 *
 * A grid too small for the requested state does not fail loudly on its own —
 * the hard-wall-like inward seed just forces the solution toward zero at
 * whatever edge it is given, so a single point check at rMax (e.g. u(rMax)^2
 * against the peak) is not a reliable signal: measured directly for hydrogen
 * 7s truncated at rMax=40, that ratio comes out *smaller* than for a
 * correctly sized grid, because the boundary condition manufactures a small
 * value there regardless of whether the true state has actually decayed by
 * then. What does not lie is the norm itself: a state that does not fit is
 * forced to pack an outsized share of its probability into the last sliver
 * of the grid simply to be normalisable at all. Measured across
 * gridForAtom(1, n) for n=1..7 and n=26,l=1/Z=26 etc., a correctly sized grid
 * keeps under 5e-5 of the norm in the outermost 1% of grid points; truncating
 * hydrogen 7s to rMax=40 (a third of the ~150 a0 it needs) pushes that figure
 * to 0.15 — a three-thousand-fold jump, so 1e-2 leaves a wide, safe margin on
 * both sides.
 */
export function assertGridHoldsState(grid: RadialGrid, density: Float64Array, n: number, l: number): void {
    const cumulative = cumulativeIntegral(grid, density);
    const total = cumulative[grid.size - 1];
    const tailStart = Math.floor(grid.size * 0.99);
    const tailFraction = total > 0
        ? (total - cumulative[tailStart]) / total
        : 1;
    if (tailFraction > 1e-2) {
        throw new Error(
            `Radial grid (rMax=${grid.rMax}) is too small to hold n=${n}, l=${l}: ` +
            `${(tailFraction * 100).toFixed(1)}% of the electron's probability lies ` +
            `in the outermost 1% of the grid. Use a grid sized for this n.`
        );
    }
}
