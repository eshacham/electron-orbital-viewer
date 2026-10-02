/**
 * The spin-polarised (LSD) central-field SCF, used only for ΔSCF total
 * energies (delta_scf.ts). Same grid, same radial solver, same adaptive
 * mixing as scf.ts; two potentials instead of one, because a spin-up
 * electron's exchange hole is made of spin-up electrons only.
 *
 * Energies and nothing else: no profile, no picture. Every drawn density
 * stays on the restricted path validated against NIST's LDA column, and
 * AtomSolution keeps its one-state-per-subshell contract. Restricted LDA is
 * the wrong tool for an energy *difference* between an atom and its ion,
 * because the two have different numbers of unpaired electrons and the
 * exchange energy those carry is exactly what a restricted calculation
 * averages away (O's ΔSCF ionisation energy comes out 22 % high).
 */
import { RadialGrid, gridForAtom, integrateOnGrid } from './radial_grid';
import { RadialState, solveRadialState } from './radial_solver';
import { SubshellOccupancy } from './configurations';
import { hartreePotential, hartreeEnergy, densityFromD, spinExchangePotential, spinExchangeEnergyDensity } from './hartree';
import { spinCorrelation } from './correlation';
import {
    ANION_BINDING_THRESHOLD, UnboundAnionError, assertStatesBound, buildD, highestPrincipalQuantumNumber, maxWeightedDelta,
    screenedStartingPotential, totalElectronsOf, CONVERGENCE_TOLERANCE, INITIAL_BETA, MAX_ITERATIONS, MIN_BETA,
} from './scf_shared';

export interface SpinOccupancy { n: number; l: number; up: number; down: number }

export interface PolarisedSolution {
    Z: number;
    charge: number;
    /**
     * Total energy (Ha). Only an energy when `converged` is true: an
     * unconverged loop's total is whatever the last iterate happened to
     * give, so callers must refuse it (delta_scf.ts throws) rather than
     * show it.
     */
    totalEnergy: number;
    converged: boolean;
    iterations: number;
    /** The least-bound occupied eigenvalue of either spin; null with no electrons. */
    highestEigenvalue: number | null;
}

/**
 * Hund's rule, spherically averaged: fill one spin before the other, so an
 * open subshell carries the most unpaired electrons it can -- the
 * occupation NIST SRD 141's LSD column uses. Up is the majority spin.
 */
export function spinOccupations(configuration: SubshellOccupancy[]): SpinOccupancy[] {
    return configuration.filter(s => s.electrons > 0).map(({ n, l, electrons }) => {
        const up = Math.min(electrons, 2 * l + 1);
        return { n, l, up, down: electrons - up };
    });
}

type Channel = Array<RadialState & { electrons: number }>;

/**
 * Both spin channels' mean-field potentials from their radial
 * distributions, with the pieces the total-energy bookkeeping needs. The
 * nucleus and the Hartree term see the total density; exchange and
 * correlation see each spin's own.
 */
function polarisedPotentials(grid: RadialGrid, Z: number, DUp: Float64Array, DDown: Float64Array) {
    const D = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) D[j] = DUp[j] + DDown[j];
    const nUp = densityFromD(grid, DUp);
    const nDown = densityFromD(grid, DDown);
    const vHartree = hartreePotential(grid, D);
    const vxUp = spinExchangePotential(nUp);
    const vxDown = spinExchangePotential(nDown);
    const up = new Float64Array(grid.size);
    const down = new Float64Array(grid.size);
    const vcUp = new Float64Array(grid.size);
    const vcDown = new Float64Array(grid.size);
    const epsC = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const c = spinCorrelation(nUp[j], nDown[j]);
        vcUp[j] = c.vUp; vcDown[j] = c.vDown; epsC[j] = c.epsilon;
        const common = -Z / grid.r[j] + vHartree[j];
        up[j] = common + vxUp[j] + c.vUp;
        down[j] = common + vxDown[j] + c.vDown;
    }
    return { up, down, D, nUp, nDown, vHartree, vxUp, vxDown, vcUp, vcDown, epsC };
}

/**
 * The solve on a caller-supplied grid (solvePolarised sizes one with
 * gridForAtom). Converges by scf.ts's measure -- the larger of the two
 * channels' max|delta-V * r| -- and damps by its schedule, one beta shared
 * by both channels so neither runs ahead of the density it is built from.
 *
 * Returns converged: false rather than throwing when MAX_ITERATIONS runs
 * out, as solveAtomOnGrid does; see PolarisedSolution.totalEnergy. Throws
 * UnboundAnionError when an anion's electron has no bound state in its
 * channel, exactly as the restricted solver does.
 */
export function solvePolarisedOnGrid(Z: number, grid: RadialGrid, configuration: SubshellOccupancy[]): PolarisedSolution {
    const occupied = configuration.filter(s => s.electrons > 0);
    const electrons = totalElectronsOf(occupied);
    const charge = Z - electrons;
    if (electrons === 0) return { Z, charge, totalEnergy: 0, converged: true, iterations: 0, highestEigenvalue: null };
    if (electrons === 1) {
        // The one-electron bypass (HANDOFF): exact for any (n, l), no self-interaction.
        const energy = -(Z * Z) / (2 * occupied[0].n * occupied[0].n);
        return { Z, charge, totalEnergy: energy, converged: true, iterations: 1, highestEigenvalue: energy };
    }
    const isAnion = charge < 0;
    const channels = spinOccupations(occupied);
    const upSpecs = channels.filter(c => c.up > 0);
    const downSpecs = channels.filter(c => c.down > 0);

    // One starting guess for both spins: the polarisation builds up from
    // the occupations within the first iteration, so nothing is gained by
    // guessing it.
    let vUp = screenedStartingPotential(grid, Z);
    let vDown = vUp.slice();
    let beta = INITIAL_BETA;
    let previousDelta = Infinity;
    let upStates: Channel = [];
    let downStates: Channel = [];
    let converged = false;
    let iterations = 0;

    for (iterations = 1; iterations <= MAX_ITERATIONS; iterations++) {
        // Before the solve, for the same reason as scf.ts: solveRadialState
        // would hand back a state for an (n, l) the potential no longer binds.
        if (isAnion) { assertStatesBound(grid, upSpecs, vUp); assertStatesBound(grid, downSpecs, vDown); }
        upStates = upSpecs.map(c => ({ ...solveRadialState(grid, c.n, c.l, vUp), electrons: c.up }));
        downStates = downSpecs.map(c => ({ ...solveRadialState(grid, c.n, c.l, vDown), electrons: c.down }));
        const next = polarisedPotentials(grid, Z, buildD(grid, upStates), buildD(grid, downStates));
        const delta = Math.max(maxWeightedDelta(grid, vUp, next.up), maxWeightedDelta(grid, vDown, next.down));
        if (delta < CONVERGENCE_TOLERANCE) { converged = true; vUp = next.up; vDown = next.down; break; }
        if (delta > previousDelta) beta = Math.max(beta * 0.5, MIN_BETA);
        previousDelta = delta;
        const mixedUp = new Float64Array(grid.size);
        const mixedDown = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) {
            mixedUp[j] = (1 - beta) * vUp[j] + beta * next.up[j];
            mixedDown[j] = (1 - beta) * vDown[j] + beta * next.down[j];
        }
        vUp = mixedUp;
        vDown = mixedDown;
    }

    const all = [...upStates, ...downStates];
    const highest = all.reduce((top, s) => (s.energy > top.energy ? s : top), all[0]);
    // Bound, but by less than the grid can represent: the same verdict (see ANION_BINDING_THRESHOLD).
    if (isAnion && converged && highest.energy >= -ANION_BINDING_THRESHOLD) throw new UnboundAnionError(highest.n, highest.l);

    // E = sum(occ eps) - E_H - integral(sum_s D_s V_xc,s) + E_x + E_c: scf.ts's
    // bookkeeping (ruling R8) per spin. Exchange is a sum over the two
    // channels; correlation is one functional of both, so it weights the
    // total D.
    const DUp = buildD(grid, upStates);
    const DDown = buildD(grid, downStates);
    const f = polarisedPotentials(grid, Z, DUp, DDown);
    const epsXUp = spinExchangeEnergyDensity(f.nUp);
    const epsXDown = spinExchangeEnergyDensity(f.nDown);
    const doubleCounted = new Float64Array(grid.size);
    const exchangeCorrelation = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        doubleCounted[j] = DUp[j] * (f.vxUp[j] + f.vcUp[j]) + DDown[j] * (f.vxDown[j] + f.vcDown[j]);
        exchangeCorrelation[j] = DUp[j] * epsXUp[j] + DDown[j] * epsXDown[j] + f.D[j] * f.epsC[j];
    }
    const sumEigenvalues = all.reduce((sum, s) => sum + s.electrons * s.energy, 0);
    const totalEnergy = sumEigenvalues - hartreeEnergy(grid, f.D, f.vHartree)
        - integrateOnGrid(grid, doubleCounted) + integrateOnGrid(grid, exchangeCorrelation);

    return { Z, charge, totalEnergy, converged, iterations, highestEigenvalue: highest.energy };
}

/** solvePolarisedOnGrid on the grid gridForAtom (ruling R22) sizes for this configuration. */
export function solvePolarised(Z: number, configuration: SubshellOccupancy[]): PolarisedSolution {
    const occupied = configuration.filter(s => s.electrons > 0);
    return solvePolarisedOnGrid(Z, gridForAtom(Z, highestPrincipalQuantumNumber(occupied)), occupied);
}
