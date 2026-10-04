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
import { RadialState, solveRadialState, hasBoundState } from './radial_solver';
import { solveScalarRelativisticState, solveDiracState, hasBoundRelativisticState } from './relativistic_solver';
import { StateNotFoundError } from './eigenvalue_search';
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
import { AtomSpecies, isNeutralGround, neutralGround, speciesConfiguration, speciesKey } from './species';
import {
    MAX_ITERATIONS,
    CONVERGENCE_TOLERANCE,
    INITIAL_BETA,
    nextBeta,
    linearMix,
    ANION_BINDING_THRESHOLD,
    UnboundAnionError,
    UnboundElectronError,
    solveOccupiedLevel,
    assertStatesBound,
    assertOutermostBound,
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
     * only E < 0 -- handed back a state anyway (the H- failure UnboundAnionError
     * exists for; since ruling T7-b it refuses instead). C 2s -> 3d,
     * Na 3s -> 3d and He 1s -> 2p did the same.
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

/** Whether `potential` binds this orbital by ANION_BINDING_THRESHOLD or more, asked of its own radial equation. */
function orbitalIsBound(grid: RadialGrid, Z: number, spec: OrbitalSpec, potential: Float64Array, relativity: RelativityMode): boolean {
    if (relativity === 'off') return hasBoundState(grid, spec.n, spec.l, potential, -ANION_BINDING_THRESHOLD);
    const kappa = relativity === 'spinOrbit' ? spec.kappa ?? -(spec.l + 1) : undefined;
    return hasBoundRelativisticState(grid, spec.n, spec.l, potential, Z, kappa, -ANION_BINDING_THRESHOLD);
}

/**
 * Every occupied orbital in one potential. A solve that finds no state is
 * read through solveOccupiedLevel (ruling T7-b): a level the potential does
 * not bind is the unbound verdict -- the anion's (UnboundAnionError), or for
 * a neutral atom or cation UnboundElectronError -- naming the j-level when
 * the Dirac equation is the one that failed; a level it does bind is a
 * solver failure and keeps the solver's own message.
 *
 * An anion in a relativistic mode is the one exception: the
 * non-relativistic pre-check (ruling C12) can pass while the relativistic
 * equation, which binds d and f slightly less, finds no bound state at
 * all, and for an anion the solver's "found no state" there
 * (StateNotFoundError) is reported as the unbound verdict without asking
 * the node count. Any other solver failure keeps its own message.
 */
function solveOrbitals(
    grid: RadialGrid, Z: number, specs: OrbitalSpec[], potential: Float64Array, relativity: RelativityMode, isAnion: boolean,
): Array<RadialState & { electrons: number }> {
    return specs.map(spec => {
        const j = spec.kappa === undefined ? undefined : jForKappa(spec.kappa);
        const unbound = () => (isAnion ? new UnboundAnionError(spec.n, spec.l, j) : new UnboundElectronError(spec.n, spec.l, j));
        const solve = () => ({ ...solveOrbital(grid, Z, spec, potential, relativity), electrons: spec.electrons });
        if (isAnion && relativity !== 'off') {
            // Only the solver's "found no state" is the verdict (final
            // review M7); anything else it throws is a failure of its own.
            try {
                return solve();
            } catch (error) {
                if (error instanceof StateNotFoundError) throw unbound();
                throw error;
            }
        }
        return solveOccupiedLevel(solve, () => orbitalIsBound(grid, Z, spec, potential, relativity), unbound);
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
    const states = solveOrbitals(grid, Z, orbitalSpecsFor(configuration, relativity), potential, relativity, false);
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
//
// Bounded (final review recommendation): ions, excitations and three modes
// widen the key space to thousands of species, each holding a grid's worth
// of orbitals (a heavy atom's is several hundred kilobytes), so everything
// but a neutral ground state without relativity is kept least recently
// used first, at most SOLVE_CACHE_LIMIT of them -- a session revisits a
// handful of species, and the worker asks for the same few (picture,
// comparison, reference ring) together. The neutral ground states are kept
// for good, as before Phase 3: at most 118, and solveAtom(Z)'s one-object
// identity is what callers (and tests) rely on.
const SOLVE_CACHE_LIMIT = 48;
let solveCacheLimit = SOLVE_CACHE_LIMIT;
const neutralGroundCache = new Map<string, AtomSolution>();
const solveSpeciesCache = new Map<string, AtomSolution>();

function cachedSolution(key: string): AtomSolution | undefined {
    const pinned = neutralGroundCache.get(key);
    if (pinned) return pinned;
    const hit = solveSpeciesCache.get(key);
    if (hit) {
        // Map iterates in insertion order, so re-inserting on a hit makes
        // that order double as recency (profile_cache.ts does the same).
        solveSpeciesCache.delete(key);
        solveSpeciesCache.set(key, hit);
    }
    return hit;
}

function rememberSolution(key: string, species: AtomSpecies, relativity: RelativityMode, solution: AtomSolution): void {
    if (relativity === 'off' && isNeutralGround(species)) {
        neutralGroundCache.set(key, solution);
        return;
    }
    solveSpeciesCache.set(key, solution);
    while (solveSpeciesCache.size > solveCacheLimit) {
        const oldest = solveSpeciesCache.keys().next().value;
        if (oldest === undefined) break;
        solveSpeciesCache.delete(oldest);
    }
}

/** Test-only: a smaller bound, so eviction can be exercised on a few cheap species. Returns the restore. */
export function setSolveCacheLimitForTests(limit: number): () => void {
    solveCacheLimit = limit;
    return () => { solveCacheLimit = SOLVE_CACHE_LIMIT; };
}

// A non-relativistic solve's failure, by species key: the verdict (Pr-Eu
// 6s -> 4f's unbound 4f, an unbound anion) is as pure a function of the
// species as an answer is. A relativistic request asks for the
// non-relativistic solve twice -- the warm-start probe below and the
// worker's comparison baseline -- and again on every repeat, so without
// this a species whose non-relativistic solve fails pays for that failing
// SCF over and over. Off only: that is the solve asked for repeatedly.
const failedNonRelativisticSolves = new Map<string, unknown>();

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
 * excited species' own Coulomb tail. Where that solve did not converge
 * (K 4s -> 4d) or found a level unbound (Pr-Eu 6s -> 4f), there is no answer
 * to start next to, and the relativistic loop starts from the screened guess
 * as the non-relativistic one did. An unbound anion's verdict propagates
 * from the non-relativistic solve unchanged.
 *
 * And where the warm start fails, the screened one gets its turn (ruling
 * T7-a). The heavy sweep found 16 species whose warm-started solve throws
 * in its first iterations while a cold one converges: the relativistic
 * equation, asked in the non-relativistic potential, finds a barely bound
 * f level pushed out of the bound spectrum (Tm and Yb with spin-orbit,
 * their own 4f⁷⁄₂; Pr, Nd, Ho, Er, Tm, Yb 6s -> 5d, the 4f; Pa, U, Np, Bk,
 * Cf, Es, Fm, Md 7s -> 5f, the 5f, which ends bound by 2-42 mHa). So a
 * warm-started solve that throws or does not converge is discarded and the
 * species solved again from the screened guess, whose outcome -- answer or
 * verdict -- is the one reported. The warm start is kept wherever it works:
 * it is where the iterations are saved.
 */
export function solveSpecies(species: AtomSpecies, relativity: RelativityMode = 'off'): AtomSolution {
    const key = relativity === 'off' ? speciesKey(species) : `${speciesKey(species)}@${relativity}`;
    const cached = cachedSolution(key);
    if (cached) return cached;
    if (failedNonRelativisticSolves.has(key)) throw failedNonRelativisticSolves.get(key);

    const configuration = speciesConfiguration(species);
    const highestN = highestPrincipalQuantumNumber(configuration);
    const grid = gridForAtom(species.Z, highestN);
    let solution: AtomSolution | null = null;
    if (relativity !== 'off') {
        const startingPotential = convergedNonRelativisticPotential(species);
        if (startingPotential) {
            try {
                const warm = solveAtomOnGrid(species.Z, grid, { configuration, relativity, startingPotential });
                if (warm.converged) solution = warm;
            } catch {
                // Retried from the screened start below, which reports its own verdict.
            }
        }
    }
    if (!solution) {
        try {
            solution = solveAtomOnGrid(species.Z, grid, { configuration, relativity });
        } catch (error) {
            if (relativity === 'off') failedNonRelativisticSolves.set(key, error);
            throw error;
        }
    }
    rememberSolution(key, species, relativity, solution);
    return solution;
}

/**
 * The relativistic solve's warm start: the same species' converged
 * non-relativistic potential, or null when there is none to start next to
 * (that solve did not converge, or found a level unbound). An anion's
 * unbound verdict is final in every mode, so it propagates.
 */
function convergedNonRelativisticPotential(species: AtomSpecies): Float64Array | null {
    try {
        const nonRelativistic = solveSpecies(species, 'off');
        return nonRelativistic.converged ? nonRelativistic.potential : null;
    } catch (error) {
        if (error instanceof UnboundAnionError) throw error;
        return null;
    }
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
        // and used to hand back a state for an (n, l) the potential no longer
        // binds -- the nonsense (H- at -379 Ha) this guard was written to
        // stop. It now refuses a state with no root (ruling T7-b), but this
        // check is still the one that draws the line at 10⁻⁴ Ha, which a
        // barely bound state the solver can find would pass.
        // In a relativistic mode this asks the non-relativistic question of
        // the same potential (ruling C12), an approximation: relativity
        // binds s and p½ slightly more and d and f slightly less, so a
        // marginal anion's verdict could in principle differ. Two later
        // checks close the gap from the relativistic side: a relativistic
        // solve that finds no bound state reports the anion unbound
        // (solveOrbitals), and the final check below is on
        // the relativistic eigenvalues themselves.
        if (isAnion) assertStatesBound(grid, configuration, potential);
        states = solveOrbitals(grid, Z, specs, potential, relativity, isAnion);
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
    if (isAnion && converged) assertOutermostBound(states);

    const density = densityFromD(grid, D);
    const totalEnergy = totalEnergyOf(grid, states, D, density, relativisticExchange);

    return { Z, charge: Z - electrons, configuration, grid, states, D, density, potential, totalEnergy, iterations, converged, relativity };
}
