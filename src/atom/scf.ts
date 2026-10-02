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
import { AtomSpecies, neutralGround, speciesConfiguration, speciesKey } from './species';
import {
    MAX_ITERATIONS,
    CONVERGENCE_TOLERANCE,
    INITIAL_BETA,
    nextBeta,
    linearMix,
    ANION_BINDING_THRESHOLD,
    UnboundAnionError,
    assertStatesBound,
    highestPrincipalQuantumNumber,
    totalElectronsOf,
    bareCoulombPotential,
    screenedStartingPotential,
    buildD,
    maxWeightedDelta,
} from './scf_shared';

export interface AtomSolution {
    Z: number;
    /** Z minus the electron count: 0 for a neutral atom, +1 for Na+, -1 for Br-. */
    charge: number;
    /** The occupancies actually solved, sorted by (n, l) -- an ion's or an excited atom's own. */
    configuration: SubshellOccupancy[];
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

/**
 * Options for one SCF solve. An object rather than more positional
 * parameters so later physics layers on without another signature change:
 * Phase 4 adds `relativity` and `startingPotential` here.
 */
export interface ScfOptions {
    /** Defaults to the neutral ground state, configurationFor(Z). */
    configuration?: SubshellOccupancy[];
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
    // Its own subshell, not 1s: an excited hydrogen (1s -> 2p) is reachable now.
    const subshell = configuration.find(s => s.electrons > 0)!;
    const potential = bareCoulombPotential(grid, Z);
    const state = solveRadialState(grid, subshell.n, subshell.l, potential);
    const states = [{ ...state, electrons: subshell.electrons }];
    const D = buildD(grid, states);
    const density = densityFromD(grid, D);

    return {
        Z,
        charge: Z - 1,
        configuration,
        grid,
        states,
        D,
        density,
        potential,
        // Exact: E = -Z^2 / (2 n^2) for any l.
        totalEnergy: -(Z * Z) / (2 * subshell.n * subshell.n),
        iterations: 1,
        converged: true,
    };
}

// Ruling R28, generalised from Z to species: a species' LDA solution is a
// pure function of its key (same configuration, same gridForAtom sizing,
// same SCF loop every time), so this cache can never go stale -- there is
// no invalidation to get wrong. Without it, the drill-down UI would re-run
// the solve on every level change; at ~8.6s for uranium, drilling atom ->
// shell -> orbital -> back would cost four solves (~34s) for what is
// conceptually one. Module-level rather than per-caller because solving is
// meant to be cheap to call repeatedly from anywhere (the worker, tests, the
// store) once warmed. A neutral ground state's key is String(Z) and
// solveAtom goes through here, so solveAtom(Z) keeps returning one memoised
// object exactly as before.
const solveSpeciesCache = new Map<string, AtomSolution>();

/**
 * Solves every occupied subshell of a species -- an element, a charge and
 * at most one promoted electron -- self-consistently, once per species.
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
export function solveSpecies(species: AtomSpecies): AtomSolution {
    const key = speciesKey(species);
    const cached = solveSpeciesCache.get(key);
    if (cached) return cached;

    const configuration = speciesConfiguration(species);
    const highestN = highestPrincipalQuantumNumber(configuration);
    const grid = gridForAtom(species.Z, highestN);
    const solution = solveAtomOnGrid(species.Z, grid, { configuration });
    solveSpeciesCache.set(key, solution);
    return solution;
}

/** Neutral ground state of Z (unchanged behaviour; see solveSpecies). */
export function solveAtom(Z: number): AtomSolution {
    return solveSpecies(neutralGround(Z));
}

/**
 * The solve itself, on a caller-supplied grid rather than one sized by
 * gridForAtom, for `options.configuration` (the neutral ground state when
 * omitted).
 *
 * Not for production use directly — solveSpecies's own grid choice is what
 * ruling R22 requires, and every real caller should go through it (or
 * solveAtom). This is exported so the grid-convergence acceptance test
 * (ruling R15) can solve the same atom a second time on an
 * independently-sized grid and compare, which is the only way to measure
 * whether gridForAtom's point count is actually fine enough rather than
 * merely assumed to be.
 *
 * Throws UnboundAnionError when an anion's electron has no bound state
 * (spec §3.5): the verdict is reported, never drawn around.
 */
export function solveAtomOnGrid(Z: number, grid: RadialGrid, options: ScfOptions = {}): AtomSolution {
    const configuration = (options.configuration ?? configurationFor(Z)).filter(s => s.electrons > 0);
    const electrons = totalElectronsOf(configuration);
    if (electrons === 0) throw new Error(`Z=${Z} with no electrons has nothing to solve.`);
    if (electrons === 1) return solveOneElectronAtom(Z, grid, configuration);

    // Only an anion can lose its outermost bound state (see UnboundAnionError);
    // neutral atoms and cations run exactly the loop they always have.
    const isAnion = electrons > Z;

    // Screened, not bare Coulomb (see screenedStartingPotential's doc
    // comment in scf_shared.ts for the full reasoning): starting from a
    // guess that is already closer to self-consistent gives the loop less
    // charge-sloshing room, which matters most for exactly the near-degenerate transition-
    // metal/lanthanide/actinide configurations the adaptive beta below also
    // exists for.
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
        // Before the solve, not after: solveRadialState searches only E < 0
        // and would hand back a state for an (n, l) the potential no longer
        // binds -- the nonsense (H- at -379 Ha) this guard exists to stop.
        if (isAnion) assertStatesBound(grid, configuration, potential);
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

        beta = nextBeta(delta, previousDelta, beta);
        previousDelta = delta;
        potential = linearMix(potential, newPotential, beta);
    }
    // The for loop leaves its counter one past the cap when it runs out.
    if (!converged) iterations = MAX_ITERATIONS;

    // A converged anion can still hold its outermost electron by less than
    // the grid can represent (see ANION_BINDING_THRESHOLD); that is the same
    // verdict as unbound.
    if (isAnion && converged) {
        const highest = states.reduce((top, s) => (s.energy > top.energy ? s : top), states[0]);
        if (highest.energy >= -ANION_BINDING_THRESHOLD) throw new UnboundAnionError(highest.n, highest.l);
    }

    const density = densityFromD(grid, D);
    const totalEnergy = totalEnergyOf(grid, states, D, density);

    return { Z, charge: Z - electrons, configuration, grid, states, D, density, potential, totalEnergy, iterations, converged };
}
