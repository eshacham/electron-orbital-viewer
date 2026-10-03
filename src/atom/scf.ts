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
import { solveScalarRelativisticState, solveDiracState } from './relativistic_solver';
import { RelativityMode, RELATIVISTIC_EXCHANGE_CORRECTION, splitByJ, jForKappa } from './relativity';
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
    startingPotentialFor,
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
    /**
     * One entry per occupied subshell, ordered by (n, l) -- with spin-orbit,
     * one per j-level instead, j - 1/2 before j + 1/2 (each carrying j and
     * kappa). Every relativistic state carries its small component Q.
     */
    states: Array<RadialState & { electrons: number }>;
    /** Converged total radial distribution, D(r) = sum over occupied of occ*(u^2 + Q^2). */
    D: Float64Array;
    density: Float64Array;
    potential: Float64Array;
    totalEnergy: number;
    iterations: number;
    converged: boolean;
    /** Which radial equation produced `states` ('off' = Schrödinger). */
    relativity: RelativityMode;
}

/**
 * Options for one SCF solve. An object rather than more positional
 * parameters so later physics layers on without another signature change.
 */
export interface ScfOptions {
    /** Defaults to the neutral ground state, configurationFor(Z). */
    configuration?: SubshellOccupancy[];
    /**
     * Which radial equation the orbitals obey; 'off' (the default) is the
     * Schrödinger equation the app has always solved. 'scalar' is
     * Koelling–Harmon, 'spinOrbit' the radial Dirac equation with each l > 0
     * subshell split into its j-levels. Both relativistic modes also apply
     * the MacDonald–Vosko correction to exchange (relativity.ts).
     */
    relativity?: RelativityMode;
    /**
     * Start the loop from this potential instead of the screened guess; it
     * must be on the solve's own grid. Omitted, the loop starts exactly as it
     * always has. For Phase 4, which starts a relativistic solve from the
     * same species' converged non-relativistic one.
     *
     * Not a cure for an excited state that will not converge (final review
     * I2, measured): started from its element's converged neutral potential,
     * K 4s -> 4d "converges" in 39 iterations to -904 Ha with a 4d eigenvalue
     * of -168 Ha. A neutral atom's LDA potential has no Coulomb tail, so it
     * binds no diffuse 4d at all, and the radial solver -- which searches
     * only E < 0 -- hands back a state anyway (the H- failure UnboundAnionError
     * exists for). C 2s -> 3d, Na 3s -> 3d and He 1s -> 2p do the same.
     */
    startingPotential?: Float64Array;
}

/** One orbital the loop solves: a subshell, or with spin-orbit one of its j-levels (kappa set). */
interface OrbitalSpec { n: number; l: number; electrons: number; kappa?: number }

/**
 * With spin-orbit, each l > 0 subshell becomes two j-levels sharing its
 * electrons by 2j+1 (relativity.ts's splitByJ), lower j first. The species
 * itself -- its configuration, its excitation -- stays in (n, l) (ruling
 * C13): Na 3s -> 3p puts a third of the promoted electron in 3p½ and two
 * thirds in 3p³⁄₂, the same spherical averaging as every open subshell.
 */
function orbitalSpecsFor(configuration: SubshellOccupancy[], relativity: RelativityMode): OrbitalSpec[] {
    if (relativity !== 'spinOrbit') return configuration.map(({ n, l, electrons }) => ({ n, l, electrons }));
    return configuration.flatMap(subshell =>
        splitByJ(subshell).map(({ n, l, kappa, electrons }) => ({ n, l, kappa, electrons })));
}

function solveOrbital(grid: RadialGrid, Z: number, spec: OrbitalSpec, potential: Float64Array, relativity: RelativityMode): RadialState {
    if (relativity === 'off') return solveRadialState(grid, spec.n, spec.l, potential);
    if (relativity === 'scalar') return solveScalarRelativisticState(grid, spec.n, spec.l, potential, Z);
    return solveDiracState(grid, spec.n, spec.kappa ?? -(spec.l + 1), potential, Z);
}

function solveOrbitals(
    grid: RadialGrid, Z: number, specs: OrbitalSpec[], potential: Float64Array, relativity: RelativityMode,
): Array<RadialState & { electrons: number }> {
    return specs.map(spec => ({ ...solveOrbital(grid, Z, spec, potential, relativity), electrons: spec.electrons }));
}

/**
 * solveOrbitals for an anion in a relativistic mode. The non-relativistic
 * pre-check (ruling C12) can pass while the relativistic equation, which
 * binds d and f slightly less, finds no bound state at all -- and its solver
 * then throws (no root, or a state the grid cannot hold) where the
 * Schrödinger solver would have handed back nonsense. For an anion that is
 * the unbound verdict, not a solve failure, so it is reported as one,
 * naming the j-level when the Dirac equation is the one that failed.
 */
function solveAnionOrbitalsRelativistic(
    grid: RadialGrid, Z: number, specs: OrbitalSpec[], potential: Float64Array, relativity: RelativityMode,
): Array<RadialState & { electrons: number }> {
    return specs.map(spec => {
        try {
            return { ...solveOrbital(grid, Z, spec, potential, relativity), electrons: spec.electrons };
        } catch {
            throw new UnboundAnionError(spec.n, spec.l, spec.kappa === undefined ? undefined : jForKappa(spec.kappa));
        }
    });
}

/** sum(occ*eps_i): every electron's eigenvalue, weighted by its (possibly fractional) occupancy. */
function sumOfEigenvalues(states: Array<RadialState & { electrons: number }>): number {
    return states.reduce((sum, state) => sum + state.electrons * state.energy, 0);
}

/**
 * Composes the mean-field potential from its independent physical pieces
 * (ruling R20): the bare nucleus, the classical electron-electron repulsion,
 * and the LDA exchange-correlation hole. Kept as one small function, rather
 * than scattered through the loop body, so the relativistic modes swap in a
 * different kinetic treatment (the radial equation, in solveOrbital) while
 * reusing this composition -- changed only by the MacDonald–Vosko flag on
 * exchange.
 */
function meanFieldPotential(grid: RadialGrid, Z: number, D: Float64Array, relativisticExchange: boolean): Float64Array {
    const density = densityFromD(grid, D);
    const vHartree = hartreePotential(grid, D);
    const vExchange = exchangePotential(density, relativisticExchange);
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
 *
 * Unchanged in form for the relativistic modes: their eigenvalues have the
 * rest mass removed, so sum(occ*eps_i) still counts the kinetic and nuclear
 * energy once and the interaction twice, exactly as above.
 */
function totalEnergyOf(
    grid: RadialGrid,
    states: Array<RadialState & { electrons: number }>,
    D: Float64Array,
    density: Float64Array,
    relativisticExchange: boolean
): number {
    const vHartree = hartreePotential(grid, D);
    const vExchange = exchangePotential(density, relativisticExchange);

    const eHartree = hartreeEnergy(grid, D, vHartree);
    const eExchange = exchangeEnergy(grid, D, density, relativisticExchange);
    const eCorrelation = correlationEnergy(grid, D, density);

    const doubleCountedXC = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        doubleCountedXC[j] = D[j] * (vExchange[j] + correlationPotential(density[j]));
    }

    const sumEigenvalues = sumOfEigenvalues(states);

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
 *
 * The relativistic modes bypass the loop for the same reason, but their
 * total is the solver's own eigenvalues, occupancy-weighted over the
 * j-levels (ruling C3): those are the Dirac (or Koelling–Harmon) energies of
 * the bare nucleus to 1e-6 (relativistic_solver.test.ts), with nothing to
 * double-count.
 */
function solveOneElectronAtom(
    Z: number, grid: RadialGrid, configuration: SubshellOccupancy[], relativity: RelativityMode,
): AtomSolution {
    if (relativity !== 'off') return solveOneElectronRelativistic(Z, grid, configuration, relativity);
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
        relativity: 'off',
    };
}

function solveOneElectronRelativistic(
    Z: number, grid: RadialGrid, configuration: SubshellOccupancy[], relativity: RelativityMode,
): AtomSolution {
    const potential = bareCoulombPotential(grid, Z);
    const states = solveOrbitals(grid, Z, orbitalSpecsFor(configuration, relativity), potential, relativity);
    const D = buildD(grid, states);
    const density = densityFromD(grid, D);
    const totalEnergy = sumOfEigenvalues(states);
    return { Z, charge: Z - 1, configuration, grid, states, D, density, potential, totalEnergy, iterations: 1, converged: true, relativity };
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
// object exactly as before. A relativistic solve is a pure function of its
// species and mode, keyed `${speciesKey}@${mode}` (ruling C2); 'off' keeps
// the bare species key, so nothing that existed before Phase 4 moves.
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
 *
 * A relativistic solve starts from the same species' converged
 * non-relativistic potential (ruling C2): the worker needs that solve anyway
 * for the comparison curve, it is on the same grid (gridForAtom depends only
 * on Z and the highest n), and starting next to the answer saves iterations
 * -- 47 -> 37 for gold, 103 -> 37 for Cs 6s -> 5d. Measured against a cold
 * (screened) start -- in scalar mode for Au, Au+, Pb2+ and the excitations
 * Cs 6s -> 5d, Cs 6s -> 6d, Au 6s -> 6p, Hg 6s -> 6p and U 7s -> 6d; with
 * spin-orbit for Au, Cs 6s -> 6p and Na 3s -> 3d -- both starts land on the
 * same solution: max r*|delta V| <= 3.3e-7, inside the loop's own 1e-6
 * tolerance, and total energies within 6.3e-8 relative (1.1e-8 for the
 * heavy samples). The same species' seed is not the neutral-atom seed
 * Phase 3 found converging to nonsense for excitations: it already has the
 * excited species' own Coulomb tail. Where that solve did
 * not converge (K 4s -> 4d), there is no answer to start next to, and the
 * relativistic loop starts from the screened guess as the non-relativistic
 * one did. An unbound anion's verdict propagates from the non-relativistic
 * solve unchanged.
 */
export function solveSpecies(species: AtomSpecies, relativity: RelativityMode = 'off'): AtomSolution {
    const key = relativity === 'off' ? speciesKey(species) : `${speciesKey(species)}@${relativity}`;
    const cached = solveSpeciesCache.get(key);
    if (cached) return cached;

    const configuration = speciesConfiguration(species);
    const highestN = highestPrincipalQuantumNumber(configuration);
    const grid = gridForAtom(species.Z, highestN);
    let startingPotential: Float64Array | undefined;
    if (relativity !== 'off') {
        const nonRelativistic = solveSpecies(species, 'off');
        if (nonRelativistic.converged) startingPotential = nonRelativistic.potential;
    }
    const solution = solveAtomOnGrid(species.Z, grid, { configuration, relativity, startingPotential });
    solveSpeciesCache.set(key, solution);
    return solution;
}

/** Neutral ground state of Z (unchanged behaviour for 'off'; see solveSpecies). */
export function solveAtom(Z: number, relativity: RelativityMode = 'off'): AtomSolution {
    return solveSpecies(neutralGround(Z), relativity);
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
    const relativity = options.relativity ?? 'off';
    const relativisticExchange = relativity !== 'off' && RELATIVISTIC_EXCHANGE_CORRECTION;
    const configuration = (options.configuration ?? configurationFor(Z)).filter(s => s.electrons > 0);
    const electrons = totalElectronsOf(configuration);
    if (electrons === 0) throw new Error(`Z=${Z} with no electrons has nothing to solve.`);
    if (electrons === 1) return solveOneElectronAtom(Z, grid, configuration, relativity);
    const specs = orbitalSpecsFor(configuration, relativity);

    // Only an anion can lose its outermost bound state (see UnboundAnionError);
    // neutral atoms and cations run exactly the loop they always have.
    const isAnion = electrons > Z;

    // Screened, not bare Coulomb, unless the caller supplies a potential to
    // start from (see screenedStartingPotential's doc comment in
    // scf_shared.ts for the full reasoning): starting from a
    // guess that is already closer to self-consistent gives the loop less
    // charge-sloshing room, which matters most for exactly the near-degenerate transition-
    // metal/lanthanide/actinide configurations the adaptive beta below also
    // exists for.
    let potential = startingPotentialFor(grid, Z, options.startingPotential);
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
        // In a relativistic mode this asks the non-relativistic question of
        // the same potential (ruling C12), an approximation: relativity
        // binds s and p½ slightly more and d and f slightly less, so a
        // marginal anion's verdict could in principle differ. Two later
        // checks close the gap from the relativistic side: a relativistic
        // solve that finds no bound state reports the anion unbound
        // (solveAnionOrbitalsRelativistic), and the final check below is on
        // the relativistic eigenvalues themselves.
        if (isAnion) assertStatesBound(grid, configuration, potential);
        states = isAnion && relativity !== 'off'
            ? solveAnionOrbitalsRelativistic(grid, Z, specs, potential, relativity)
            : solveOrbitals(grid, Z, specs, potential, relativity);
        D = buildD(grid, states);

        const newPotential = meanFieldPotential(grid, Z, D, relativisticExchange);
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
    const totalEnergy = totalEnergyOf(grid, states, D, density, relativisticExchange);

    return { Z, charge: Z - electrons, configuration, grid, states, D, density, potential, totalEnergy, iterations, converged, relativity };
}
