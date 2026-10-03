/**
 * The relativistic radial eigenvalue solver: one bound state of one
 * potential, for either the scalar-relativistic Koelling–Harmon equation
 * (channel { kind: 'scalar', l }) or the radial Dirac equation
 * (channel { kind: 'dirac', kappa }).
 *
 * The eigenvalue search is radial_solver.ts's own, shared through
 * eigenvalue_search.ts -- node-count bracketing (Phase A), then bisection on
 * the mismatch at the classical turning point (Phase B), the same overflow
 * rescaling and the same containment guard -- because every one of those
 * choices was paid for there. What differs is the equation: a coupled
 * first-order pair for the large and small components (G, F), integrated
 * with RK4 in t = ln r (coupled_rk4.ts) rather than a single second-order
 * equation by Numerov. The Dirac hydrogen spectrum (relativity.ts's
 * diracHydrogenicEnergy) is the exact oracle.
 *
 * In t = ln r, with M(r) = 1 + (E - V)/2c^2, both systems read
 * d/dt (G, F) = [[a, b], [c, d]] (G, F):
 *
 *   Dirac, κ:          a = -κ   b = 2cMr   c = r(V - E)/c                   d = κ
 *   Koelling–Harmon:   a = 1    b = 2cMr   c = l(l+1)/(2Mcr) + r(V - E)/c   d = -1
 *
 * Koelling–Harmon is the κ = -1 form with the centrifugal term moved into c,
 * which drops the spin–orbit coupling and keeps the mass-velocity and Darwin
 * terms. For l = 0 the two are the same arithmetic.
 */
import { RadialGrid, integrateOnGrid } from './radial_grid';
import { RadialState } from './radial_solver';
import { countNodes } from './numerov';
import { CoefficientFn, midpointValues, rk4Step } from './coupled_rk4';
import { SPEED_OF_LIGHT, diracHydrogenicEnergy, jForKappa, lForKappa } from './relativity';
import {
    RESCALE_THRESHOLD, RESCALE_FACTOR, DECAY_GROWTH_FACTOR, findEigenvalue, assertGridHoldsState,
} from './eigenvalue_search';

export type CoupledChannel = { kind: 'scalar'; l: number } | { kind: 'dirac'; kappa: number };

const C = SPEED_OF_LIGHT;
const C2 = C * C;

// Phase A's lower energy bound: below the bare-nucleus Dirac 1s, which no
// state of a screened atom can reach. radial_solver's bound (the minimum of
// V + centrifugal) is -Z/rMin ~ -1e6 Z^2 on this grid, where the relativistic
// mass M = 1 + (E - V)/2c^2 goes negative and the Koelling–Harmon
// coefficient l(l+1)/(2Mcr) blows up.
const LOWER_BOUND_MARGIN = 1.2;

function channelL(channel: CoupledChannel): number {
    return channel.kind === 'scalar' ? channel.l : lForKappa(channel.kappa);
}

/** d/dt (G, F) = [[a, b], [c, d]] (G, F), t = ln r. Every entry stays finite as r -> 0. */
function coefficientsFor(channel: CoupledChannel, energy: number): CoefficientFn {
    if (channel.kind === 'scalar') {
        const centrifugal = channel.l * (channel.l + 1);
        return (r, v, out) => {
            const M = 1 + (energy - v) / (2 * C2);
            out[0] = 1;
            out[1] = 2 * C * M * r;
            out[2] = centrifugal / (2 * M * C * r) + (r * (v - energy)) / C;
            out[3] = -1;
        };
    }
    const kappa = channel.kappa;
    return (r, v, out) => {
        const M = 1 + (energy - v) / (2 * C2);
        out[0] = -kappa;
        out[1] = 2 * C * M * r;
        out[2] = (r * (v - energy)) / C;
        out[3] = kappa;
    };
}

/**
 * Leading power r^gamma at a point nucleus, and F/G there. Both follow from
 * the leading 1/r terms alone (V ~ -Z/r, M ~ Z/(2c^2 r)), so they are exact
 * at the origin for any potential with a bare nucleus at its centre.
 */
function originBehaviour(channel: CoupledChannel, Z: number): { gamma: number; ratio: number } {
    const zc = Z / C;
    if (channel.kind === 'scalar') {
        const gamma = Math.sqrt(channel.l * (channel.l + 1) + 1 - zc * zc);
        return { gamma, ratio: (gamma - 1) / zc };
    }
    const gamma = Math.sqrt(channel.kappa * channel.kappa - zc * zc);
    return { gamma, ratio: (gamma + channel.kappa) / zc };
}

/**
 * Outermost classically allowed point, judged by the non-relativistic
 * effective potential. Any point inside the allowed region would do for
 * matching; this one is where the outward and inward integrations are both
 * stable, which is all the relativistic corrections to the turning point
 * could change.
 */
function matchIndex(grid: RadialGrid, potential: Float64Array, energy: number, l: number): number {
    const centrifugal = l * (l + 1);
    for (let j = grid.size - 2; j > 1; j--) {
        if (centrifugal / (2 * grid.r[j] * grid.r[j]) + potential[j] - energy < 0) return j;
    }
    return Math.floor(grid.size / 2);
}

interface Components { G: Float64Array; F: Float64Array }

function integrateOutward(
    grid: RadialGrid, fill: CoefficientFn, potential: Float64Array, mid: Float64Array,
    channel: CoupledChannel, Z: number, to: number,
): Components {
    const { r, dx, size } = grid;
    const G = new Float64Array(size);
    const F = new Float64Array(size);
    const { gamma, ratio } = originBehaviour(channel, Z);
    G[0] = Math.pow(r[0], gamma);
    F[0] = G[0] * ratio;
    const halfStep = Math.exp(0.5 * dx);
    const next = new Float64Array(2);
    for (let j = 0; j < to; j++) {
        rk4Step(fill, dx, r[j], potential[j], r[j] * halfStep, mid[j], r[j + 1], potential[j + 1], G[j], F[j], next);
        G[j + 1] = next[0];
        F[j + 1] = next[1];
        if (Math.abs(G[j + 1]) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) { G[k] *= RESCALE_FACTOR; F[k] *= RESCALE_FACTOR; }
        }
    }
    return { G, F };
}

/**
 * Inward from the grid's edge, seeded on the decaying solution with the
 * local WKB rate λ = sqrt(2M(V - E) + l(l+1)/r^2) at the edge, F chosen so
 * dG/dt = -λ r G holds there. Same reasoning as radial_solver's WKB seed: a
 * seed already close to the decaying solution needs few decay lengths to wash
 * out, where a hard wall biases states the grid only just holds. Local rather
 * than the asymptotic sqrt(-2E(1 + E/2c^2)), because the edge of a grid sized
 * by gridForAtom is not yet asymptotic: measured for hydrogen 1s on
 * gridForAtom(1, 1), the asymptotic rate leaves a grid-independent energy
 * error of 5.2e-7 relative, the local one 3.4e-8 (radial_solver: 3.1e-7).
 */
function integrateInward(
    grid: RadialGrid, fill: CoefficientFn, potential: Float64Array, mid: Float64Array,
    energy: number, l: number, to: number,
): Components {
    const { r, dx, size } = grid;
    const G = new Float64Array(size);
    const F = new Float64Array(size);
    const last = size - 1;
    const v = potential[last];
    const M = 1 + (energy - v) / (2 * C2);
    const lambda = Math.sqrt(Math.max(2 * M * (v - energy) + (l * (l + 1)) / (r[last] * r[last]), 1e-12));
    const edge = new Float64Array(4);
    fill(r[last], potential[last], edge);
    G[last] = 1e-10;
    F[last] = ((-lambda * r[last] - edge[0]) / edge[1]) * G[last];
    const halfStep = Math.exp(0.5 * dx);
    const next = new Float64Array(2);
    for (let j = last; j > to; j--) {
        rk4Step(fill, -dx, r[j], potential[j], r[j] / halfStep, mid[j - 1], r[j - 1], potential[j - 1], G[j], F[j], next);
        G[j - 1] = next[0];
        F[j - 1] = next[1];
        if (Math.abs(G[j - 1]) > RESCALE_THRESHOLD) {
            for (let k = j - 1; k <= last; k++) { G[k] *= RESCALE_FACTOR; F[k] *= RESCALE_FACTOR; }
        }
    }
    return { G, F };
}

/**
 * Node count of G for Phase A, integrated past the turning point until the
 * amplitude has grown DECAY_GROWTH_FACTOR beyond its classically allowed
 * peak, then stopped (radial_solver's countNodesForBracketing explains both
 * halves of that). Stepped one point at a time so the rescale can also
 * rescale `peak` -- without that, a deep state on a wide grid rescales its
 * own peak region to zero and the count degenerates (found in the prototype:
 * europium's 1s, 2s and 3s all converged onto one energy).
 */
function countNodesForBracketing(
    grid: RadialGrid, fill: CoefficientFn, potential: Float64Array, mid: Float64Array,
    channel: CoupledChannel, Z: number, match: number,
): number {
    const { r, dx, size } = grid;
    const G = new Float64Array(size);
    const { gamma, ratio } = originBehaviour(channel, Z);
    let g = Math.pow(r[0], gamma);
    let f = g * ratio;
    G[0] = g;
    let peak = Math.abs(g);
    let stop = size - 1;
    const halfStep = Math.exp(0.5 * dx);
    const next = new Float64Array(2);
    for (let j = 0; j < size - 1; j++) {
        rk4Step(fill, dx, r[j], potential[j], r[j] * halfStep, mid[j], r[j + 1], potential[j + 1], g, f, next);
        g = next[0];
        f = next[1];
        G[j + 1] = g;
        if (Math.abs(g) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) G[k] *= RESCALE_FACTOR;
            g *= RESCALE_FACTOR;
            f *= RESCALE_FACTOR;
            peak *= RESCALE_FACTOR;
        }
        if (j + 1 <= match) {
            if (Math.abs(g) > peak) peak = Math.abs(g);
        } else if (Math.abs(g) > DECAY_GROWTH_FACTOR * peak) {
            stop = j + 1;
            break;
        }
    }
    return countNodes(G, 0, stop);
}

/**
 * A grid with no room for the state looks, from inside the search, exactly
 * like a potential that does not bind it, so the message names both.
 */
function notHeld(grid: RadialGrid, n: number, l: number, evidence: string): Error {
    return new Error(
        `Radial grid (rMax=${grid.rMax}) is too small to hold n=${n}, l=${l}, or the potential does not bind it: ${evidence}.`
    );
}

function solveCoupledState(grid: RadialGrid, n: number, channel: CoupledChannel, potential: Float64Array, Z: number): RadialState {
    if (channel.kind === 'dirac' && (!Number.isInteger(channel.kappa) || channel.kappa === 0)) {
        throw new Error('κ must be a non-zero integer.');
    }
    const l = channelL(channel);
    if (!Number.isInteger(n) || n < 1) throw new Error('Principal quantum number (n) must be a positive integer.');
    if (!Number.isInteger(l) || l < 0 || l > n - 1) throw new Error('Azimuthal quantum number (l) must be an integer between 0 and n-1.');
    if (!(Z > 0)) throw new Error('The relativistic solver needs a nuclear charge Z > 0 for its origin boundary condition.');

    const targetNodes = n - l - 1;
    const mid = midpointValues(potential);

    // Phase B's mismatch: equal G and equal F at one point is equal G and
    // equal dG/dt (dG/dt is linear in G and F with the same coefficients on
    // both sides), i.e. the coupled-pair analogue of matching log-derivatives.
    const mismatch = (energy: number): number => {
        const fill = coefficientsFor(channel, energy);
        const match = matchIndex(grid, potential, energy, l);
        const outward = integrateOutward(grid, fill, potential, mid, channel, Z, match);
        const inward = integrateInward(grid, fill, potential, mid, energy, l, match);
        if (outward.G[match] === 0 || inward.G[match] === 0) return 0;
        const scale = outward.G[match] / inward.G[match];
        return (outward.F[match] - scale * inward.F[match]) / outward.G[match];
    };
    const { energy, bracketed } = findEigenvalue({
        targetNodes,
        eLow: LOWER_BOUND_MARGIN * diracHydrogenicEnergy(1, -1, Z),
        eHigh: -1e-12,
        nodesAt: trial => countNodesForBracketing(
            grid, coefficientsFor(channel, trial), potential, mid, channel, Z, matchIndex(grid, potential, trial, l),
        ),
        mismatchAt: mismatch,
    });
    if (!bracketed) throw notHeld(grid, n, l, 'the outward and inward solutions match at no energy below zero');

    // Final components: outward up to the match point, inward beyond it,
    // scaled to agree where they meet.
    const fill = coefficientsFor(channel, energy);
    const match = matchIndex(grid, potential, energy, l);
    const outward = integrateOutward(grid, fill, potential, mid, channel, Z, match);
    const inward = integrateInward(grid, fill, potential, mid, energy, l, match);
    const scale = inward.G[match] !== 0 ? outward.G[match] / inward.G[match] : 1;

    const G = new Float64Array(grid.size);
    const F = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        if (j <= match) { G[j] = outward.G[j]; F[j] = outward.F[j]; }
        else { G[j] = scale * inward.G[j]; F[j] = scale * inward.F[j]; }
    }

    const density = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) density[j] = G[j] * G[j] + F[j] * F[j];
    const norm = Math.sqrt(integrateOnGrid(grid, density));
    if (!(norm > 0) || !Number.isFinite(norm)) {
        throw new Error(`Relativistic radial solver did not converge for n=${n}, l=${l}.`);
    }

    assertGridHoldsState(grid, density, n, l);

    // The search can also bracket a root that is not this state -- measured
    // for hydrogen 2s on a 10 a0 grid, a state with two nodes -- so the node
    // count, which is what names the state, is checked last.
    const nodes = countNodes(G, 0, grid.size - 1);
    if (nodes !== targetNodes) {
        throw notHeld(grid, n, l, `the solver converged on a state with ${nodes} nodes, not ${targetNodes}`);
    }

    // Sign convention: G > 0 as r -> 0, as radial_solver.
    const firstSignificant = G.findIndex(value => Math.abs(value) > 1e-12 * norm);
    const sign = firstSignificant >= 0 && G[firstSignificant] < 0 ? -1 : 1;
    const R = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        G[j] = (sign * G[j]) / norm;
        F[j] = (sign * F[j]) / norm;
        R[j] = G[j] / grid.r[j];
    }

    const state: RadialState = { n, l, energy, u: G, R, Q: F };
    if (channel.kind === 'dirac') {
        state.kappa = channel.kappa;
        state.j = jForKappa(channel.kappa);
    }
    return state;
}

/** One Koelling–Harmon (scalar-relativistic) state: mass-velocity and Darwin, no spin–orbit. */
export function solveScalarRelativisticState(
    grid: RadialGrid, n: number, l: number, potential: Float64Array, Z: number,
): RadialState {
    return solveCoupledState(grid, n, { kind: 'scalar', l }, potential, Z);
}

/** One radial Dirac state, j = |κ| - 1/2: κ = -(l+1) for j = l + 1/2, κ = l for j = l - 1/2. */
export function solveDiracState(
    grid: RadialGrid, n: number, kappa: number, potential: Float64Array, Z: number,
): RadialState {
    return solveCoupledState(grid, n, { kind: 'dirac', kappa }, potential, Z);
}
