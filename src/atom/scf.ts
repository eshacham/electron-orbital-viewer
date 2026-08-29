/**
 * The self-consistent field loop: the module that turns the radial solver,
 * the electron configuration table and the Hartree/exchange/correlation
 * pieces into an actual ground-state atom.
 *
 * The physics: each occupied subshell sees a mean-field potential built from
 * every electron's charge (including its own — that self-interaction error is
 * why the one-electron bypass below exists), and that potential in turn
 * depends on the subshells' own wave functions. There is no closed form, so
 * the loop iterates: solve every subshell in the current potential, rebuild
 * the potential from the resulting density, mix the two, and repeat until the
 * potential stops moving.
 */
import { RadialGrid, gridForAtom, integrateOnGrid } from './radial_grid';
import { RadialState, solveRadialState } from './radial_solver';
import { configurationFor, SubshellOccupancy } from './configurations';
import {
    hartreePotential,
    densityFromD,
    exchangePotential,
    exchangeEnergy,
    hartreeEnergy,
} from './hartree';
import { correlationPotential, correlationEnergy } from './correlation';

export interface AtomSolution {
    Z: number;
    grid: RadialGrid;
    /** One entry per occupied subshell, ordered by (n, l). */
    states: Array<RadialState & { electrons: number }>;
    /** Converged total radial distribution, D(r) = sum over occupied of occ*u^2. */
    D: Float64Array;
    density: Float64Array;
    potential: Float64Array;
    totalEnergy: number;
    iterations: number;
    converged: boolean;
}

const MAX_ITERATIONS = 200;
// Ruling: "max|delta-V * r| < 1e-6" — measured in r*V (a Hartree-like unit
// that stays finite as r -> infinity) rather than in V itself, since V ~ 1/r
// far out would make a fixed absolute tolerance on V either impossibly tight
// near the origin or meaningless at large r.
const CONVERGENCE_TOLERANCE = 1e-6;
const INITIAL_BETA = 0.3;
// Floor for the adaptive mixing in solveAtomOnGrid below: small enough that
// even the most charge-sloshing-prone configurations (near-degenerate 4s/3d,
// 4f/5d) settle, without ever fully stalling the loop.
const MIN_BETA = 0.02;

/** The largest principal quantum number occupied by this configuration — what gridForAtom (ruling R22) needs to size the grid correctly. */
function highestPrincipalQuantumNumber(configuration: SubshellOccupancy[]): number {
    return configuration.reduce((max, subshell) => Math.max(max, subshell.n), 1);
}

function totalElectronsOf(configuration: SubshellOccupancy[]): number {
    return configuration.reduce((sum, subshell) => sum + subshell.electrons, 0);
}

/** V = -Z/r, the bare nuclear attraction and the loop's starting guess. */
function bareCoulombPotential(grid: RadialGrid, Z: number): Float64Array {
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
function screenedStartingPotential(grid: RadialGrid, Z: number): Float64Array {
    const screeningLength = 0.8853 * Math.pow(Z, -1 / 3);
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const r = grid.r[j];
        const zEff = 1 + (Z - 1) * Math.exp(-r / screeningLength);
        v[j] = -zEff / r;
    }
    return v;
}

/**
 * Composes the mean-field potential from its independent physical pieces
 * (ruling R20): the bare nucleus, the classical electron-electron repulsion,
 * and the LDA exchange-correlation hole. Kept as one small function, rather
 * than scattered through the loop body, so a planned scalar-relativistic v2
 * can swap in a different kinetic treatment while reusing this composition
 * unchanged.
 */
function meanFieldPotential(grid: RadialGrid, Z: number, D: Float64Array): Float64Array {
    const density = densityFromD(grid, D);
    const vHartree = hartreePotential(grid, D);
    const vExchange = exchangePotential(density);
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        v[j] = -Z / grid.r[j] + vHartree[j] + vExchange[j] + correlationPotential(density[j]);
    }
    return v;
}

function buildD(grid: RadialGrid, states: Array<RadialState & { electrons: number }>): Float64Array {
    const D = new Float64Array(grid.size);
    for (const state of states) {
        for (let j = 0; j < grid.size; j++) D[j] += state.electrons * state.u[j] * state.u[j];
    }
    return D;
}

/** max|delta-V * r|, the convergence measure the brief specifies. */
function maxWeightedDelta(grid: RadialGrid, previous: Float64Array, next: Float64Array): number {
    let maxDelta = 0;
    for (let j = 0; j < grid.size; j++) {
        const delta = Math.abs((next[j] - previous[j]) * grid.r[j]);
        if (delta > maxDelta) maxDelta = delta;
    }
    return maxDelta;
}

/**
 * E = sum(occ*eps_i) - E_H - integral(D*(V_x+V_c) dr) + E_x + E_c (ruling R8).
 *
 * The orbital eigenvalues sum double-counts the electron-electron
 * interaction (each electron's eps_i already includes the mean field of
 * every other electron, so summing over all of them counts every pair
 * twice), which is why the Hartree and exchange-correlation potential
 * contributions are subtracted back out and replaced by the once-counted
 * Hartree and exchange-correlation *energies*.
 */
function totalEnergyOf(
    grid: RadialGrid,
    states: Array<RadialState & { electrons: number }>,
    D: Float64Array,
    density: Float64Array
): number {
    const vHartree = hartreePotential(grid, D);
    const vExchange = exchangePotential(density);

    const eHartree = hartreeEnergy(grid, D, vHartree);
    const eExchange = exchangeEnergy(grid, D, density);
    const eCorrelation = correlationEnergy(grid, D, density);

    const doubleCountedXC = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        doubleCountedXC[j] = D[j] * (vExchange[j] + correlationPotential(density[j]));
    }

    const sumEigenvalues = states.reduce((sum, state) => sum + state.electrons * state.energy, 0);

    return sumEigenvalues - eHartree - integrateOnGrid(grid, doubleCountedXC) + eExchange + eCorrelation;
}

/**
 * The pure-Coulomb, exact one-electron solution (the brief's bypass).
 *
 * LDA's exchange-correlation terms model the interaction of each electron
 * with the *mean field of every other electron, including itself* — a
 * self-interaction error that is invisible when there are enough electrons
 * to average over, but glaring for a single electron, where it is pure
 * error: an isolated electron does not repel itself. Since the app already
 * has the exact hydrogenic solution for this case, the SCF machinery is
 * bypassed entirely rather than asked to approximate an answer already known
 * exactly.
 */
function solveOneElectronAtom(Z: number, grid: RadialGrid, configuration: SubshellOccupancy[]): AtomSolution {
    const subshell = configuration[0];
    const potential = bareCoulombPotential(grid, Z);
    const state = solveRadialState(grid, subshell.n, subshell.l, potential);
    const states = [{ ...state, electrons: subshell.electrons }];
    const D = buildD(grid, states);
    const density = densityFromD(grid, D);

    return {
        Z,
        grid,
        states,
        D,
        density,
        potential,
        totalEnergy: -(Z * Z) / 2,
        iterations: 1,
        converged: true,
    };
}

/**
 * Solves every occupied subshell of neutral atom Z self-consistently.
 *
 * Mixing is linear (V <- (1-beta)*V_old + beta*V_new) but beta is adaptive,
 * not fixed at the brief's 0.3 (ruling R17): plain fixed-beta linear mixing
 * charge-sloshes indefinitely for several transition-metal and lanthanide/
 * actinide configurations, where two subshells (4s/3d, or 4f/5d) sit close
 * enough in energy that the loop can flip which one is more occupied from
 * iteration to iteration instead of settling. Halving beta whenever the
 * weighted potential change grows instead of shrinking damps that
 * oscillation directly, and is a strictly local, self-correcting response —
 * it never needs to guess in advance which elements will need it.
 */
export function solveAtom(Z: number): AtomSolution {
    const configuration = configurationFor(Z);
    const highestN = highestPrincipalQuantumNumber(configuration);
    const grid = gridForAtom(Z, highestN);
    return solveAtomOnGrid(Z, grid);
}

/**
 * The same solve, but on a caller-supplied grid rather than one sized by
 * gridForAtom.
 *
 * Not for production use — solveAtom's own grid choice is what ruling R22
 * requires, and every real caller should go through it. This exists so the
 * grid-convergence acceptance test (ruling R15) can solve the same atom a
 * second time on an independently-sized grid and compare, which is the only
 * way to measure whether gridForAtom's point count is actually fine enough
 * rather than merely assumed to be.
 */
export function solveAtomOnGrid(Z: number, grid: RadialGrid): AtomSolution {
    const configuration = configurationFor(Z);

    if (totalElectronsOf(configuration) === 1) {
        return solveOneElectronAtom(Z, grid, configuration);
    }

    let potential = screenedStartingPotential(grid, Z);
    let beta = INITIAL_BETA;
    let previousDelta = Infinity;

    let states: Array<RadialState & { electrons: number }> = [];
    // Typed explicitly (rather than inferred from the initialiser) so this
    // matches buildD's Float64Array<ArrayBufferLike> return type below —
    // otherwise TS narrows the initial `new Float64Array(...)` to the more
    // specific Float64Array<ArrayBuffer> and rejects the reassignment.
    let D: Float64Array = new Float64Array(grid.size);
    let converged = false;
    let iterations = 0;

    for (iterations = 1; iterations <= MAX_ITERATIONS; iterations++) {
        states = configuration.map(subshell => ({
            ...solveRadialState(grid, subshell.n, subshell.l, potential),
            electrons: subshell.electrons,
        }));
        D = buildD(grid, states);

        const newPotential = meanFieldPotential(grid, Z, D);
        const delta = maxWeightedDelta(grid, potential, newPotential);

        if (delta < CONVERGENCE_TOLERANCE) {
            converged = true;
            potential = newPotential;
            break;
        }

        // Adaptive damping: growth in the residual signals oscillation
        // (charge sloshing between near-degenerate subshells), and halving
        // beta is the standard, self-correcting response to it. Convergence
        // that is merely slowing down, not growing, is left alone — halving
        // beta on every step would make the well-behaved majority of
        // elements needlessly slower.
        if (delta > previousDelta) beta = Math.max(beta * 0.5, MIN_BETA);
        previousDelta = delta;

        const mixed = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) {
            mixed[j] = (1 - beta) * potential[j] + beta * newPotential[j];
        }
        potential = mixed;
    }

    const density = densityFromD(grid, D);
    const totalEnergy = totalEnergyOf(grid, states, D, density);

    return { Z, grid, states, D, density, potential, totalEnergy, iterations, converged };
}
