/**
 * Pieces of the SCF loop that more than one solver needs: moved out of
 * scf.ts unchanged, so the restricted loop and the spin-polarised energy
 * loop that layers on it converge by the same measure, mix by the same
 * schedule and start from the same guess -- with the anion guard, which
 * both need, beside them.
 */
import { RadialGrid } from './radial_grid';
import { RadialState, hasBoundState } from './radial_solver';
import { SubshellOccupancy, subshellLabel } from './configurations';
import { jLabel } from './relativity';

export const MAX_ITERATIONS = 200;
// Ruling: "max|delta-V * r| < 1e-6" — measured in r*V (a Hartree-like unit
// that stays finite as r -> infinity) rather than in V itself, since V ~ 1/r
// far out would make a fixed absolute tolerance on V either impossibly tight
// near the origin or meaningless at large r.
export const CONVERGENCE_TOLERANCE = 1e-6;
export const INITIAL_BETA = 0.3;
// Floor for nextBeta's adaptive mixing: small enough that
// even the most charge-sloshing-prone configurations (near-degenerate 4s/3d,
// 4f/5d) settle, without ever fully stalling the loop.
export const MIN_BETA = 0.02;

/** The largest principal quantum number occupied by this configuration — what gridForAtom (ruling R22) needs to size the grid correctly. */
export function highestPrincipalQuantumNumber(configuration: SubshellOccupancy[]): number {
    return configuration.reduce((max, subshell) => Math.max(max, subshell.n), 1);
}

export function totalElectronsOf(configuration: SubshellOccupancy[]): number {
    return configuration.reduce((sum, subshell) => sum + subshell.electrons, 0);
}

/** V = -Z/r, the bare nuclear attraction and the loop's starting guess. */
export function bareCoulombPotential(grid: RadialGrid, Z: number): Float64Array {
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) v[j] = -Z / grid.r[j];
    return v;
}

/**
 * A screened starting potential, used in place of the bare Coulomb guess for
 * the SCF loop (not for the one-electron bypass, which has no loop to seed).
 *
 * The bare potential's first iteration puts the full, unscreened nuclear
 * charge in front of every electron at once, which is furthest from
 * self-consistency for exactly the atoms most prone to charge sloshing
 * between near-degenerate subshells (the 3d/4s and 4f/5d transition rows).
 * This is not a Thomas-Fermi solve — it is a cheap, qualitatively-right
 * stand-in: the effective charge decays from Z at the nucleus towards 1 at
 * large r (an outer electron sees the other Z-1 electrons screening the
 * nucleus down to a net charge of 1), with a length scale of order an atomic
 * radius (~Z^(-1/3), the same scaling Thomas-Fermi theory gives) so the
 * transition happens roughly where the outermost, screening electrons
 * actually sit. It only has to be closer to self-consistent than the bare
 * nucleus, which any monotonic screening curve of the right scale achieves;
 * the loop's own iteration determines the converged potential regardless of
 * where it started, provided it converges.
 */
export function screenedStartingPotential(grid: RadialGrid, Z: number): Float64Array {
    const screeningLength = 0.8853 * Math.pow(Z, -1 / 3);
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const r = grid.r[j];
        const zEff = 1 + (Z - 1) * Math.exp(-r / screeningLength);
        v[j] = -zEff / r;
    }
    return v;
}

/** The loop's first potential: a caller's (checked against the grid) or the screened guess. */
export function startingPotentialFor(grid: RadialGrid, Z: number, supplied: Float64Array | undefined): Float64Array {
    if (!supplied) return screenedStartingPotential(grid, Z);
    if (supplied.length !== grid.size) {
        throw new Error(`startingPotential has ${supplied.length} points; the grid has ${grid.size}.`);
    }
    return Float64Array.from(supplied);
}

/**
 * D(r) = sum over occupied of occ*(u^2 + Q^2). A relativistic state's
 * normalisation is shared between its large and small components, so its
 * small component Q must count here or the density would hold fewer than
 * its electrons. Non-relativistic states have no Q and add exactly what
 * they always have, bit for bit.
 */
export function buildD(grid: RadialGrid, states: Array<RadialState & { electrons: number }>): Float64Array {
    const D = new Float64Array(grid.size);
    for (const state of states) {
        const { u, Q } = state;
        if (Q) {
            for (let j = 0; j < grid.size; j++) D[j] += state.electrons * (u[j] * u[j] + Q[j] * Q[j]);
        } else {
            for (let j = 0; j < grid.size; j++) D[j] += state.electrons * u[j] * u[j];
        }
    }
    return D;
}

/** max|delta-V * r|, the convergence measure the brief specifies. */
export function maxWeightedDelta(grid: RadialGrid, previous: Float64Array, next: Float64Array): number {
    let maxDelta = 0;
    for (let j = 0; j < grid.size; j++) {
        const delta = Math.abs((next[j] - previous[j]) * grid.r[j]);
        if (delta > maxDelta) maxDelta = delta;
    }
    return maxDelta;
}

/**
 * Adaptive damping (ruling R17): growth in the residual signals oscillation
 * (charge sloshing between near-degenerate subshells), and halving beta is
 * the standard, self-correcting response to it. Convergence that is merely
 * slowing down, not growing, is left alone -- halving beta on every step
 * would make the well-behaved majority of elements needlessly slower.
 */
export function nextBeta(delta: number, previousDelta: number, beta: number): number {
    return delta > previousDelta ? Math.max(beta * 0.5, MIN_BETA) : beta;
}

/** V <- (1 - beta) V_old + beta V_new, the loop's linear mixing. */
export function linearMix(previous: Float64Array, next: Float64Array, beta: number): Float64Array {
    const mixed = new Float64Array(previous.length);
    for (let j = 0; j < previous.length; j++) mixed[j] = (1 - beta) * previous[j] + beta * next[j];
    return mixed;
}

/** An anion's electron bound by less than this (Ha) counts as unbound: its ~70 a0 decay length does not fit the grid. */
export const ANION_BINDING_THRESHOLD = 1e-4;

/**
 * LDA's self-interaction leaves an anion's outermost electron facing a
 * +1/r tail (the Hartree term counts all N = Z + 1 electrons, itself
 * included), and for most anions no bound state survives it. Spec §3.5:
 * that verdict is shown, never drawn around.
 */
export class UnboundAnionError extends Error {
    readonly n: number;
    readonly l: number;
    /** The j-level, when a spin-orbit (Dirac) solve is the one that found it unbound. */
    readonly j?: number;
    constructor(n: number, l: number, j?: number) {
        const label = subshellLabel(n, l) + (j === undefined ? '' : jLabel(j));
        super(`LDA does not bind this anion: its ${label} electron is not bound by 10⁻⁴ Ha or more.`);
        this.name = 'UnboundAnionError';
        this.n = n;
        this.l = l;
        if (j !== undefined) this.j = j;
        Object.setPrototypeOf(this, UnboundAnionError.prototype);
    }
}

/**
 * Throws UnboundAnionError for the first subshell `potential` cannot bind
 * by at least ANION_BINDING_THRESHOLD -- checked before each iteration's
 * solve, since solveRadialState would otherwise return a state for it anyway.
 */
export function assertStatesBound(grid: RadialGrid, subshells: Array<{ n: number; l: number }>, potential: Float64Array): void {
    for (const { n, l } of subshells) {
        if (!hasBoundState(grid, n, l, potential, -ANION_BINDING_THRESHOLD)) throw new UnboundAnionError(n, l);
    }
}
