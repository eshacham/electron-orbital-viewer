import { makeWaveFunctionEvaluator } from './quantum_functions';
import { RadialGrid, interpolateOnGrid } from './atom/radial_grid';
import { OrbitalParams } from './types/orbital';
import { H2PlusState, h2plusEvaluator, solveH2Plus } from './bonds/h2plus';
import type { GridSpec, MoleculeBasis } from './molecules/types';
import { registeredBasis } from './molecules/basis_registry';
import { densityEvaluator, densityOnGrid, moEvaluator, moOnGrid } from './molecules/gaussian_basis';

/**
 * Everything the renderer draws is one of two sources (spec §4.1): an analytic
 * ψ rebuilt from a serialisable recipe on the far side of the worker boundary,
 * or a sampled grid. `FieldRecipe` grows by one variant per kind of physics;
 * adding one is a new interface here, a member of the union, and a case in
 * `makeFieldEvaluator` -- the `never` check there makes a missed case a
 * compile error rather than a blank screen.
 */

export type RadialSamples = NonNullable<OrbitalParams['radialSamples']>;

export interface HydrogenicRecipe {
    type: 'hydrogenic';
    n: number;
    l: number;
    ml: number;
    Z: number;
    /** An SCF solution's numerical R(r) in place of the analytic one (see OrbitalParams.radialSamples). */
    radialSamples?: RadialSamples;
}

/** A fixed linear combination of hydrogenic orbitals: hybrids, Stark states. */
export interface CombinationRecipe {
    type: 'combination';
    terms: Array<{ coefficient: number; orbital: HydrogenicRecipe }>;
}

/** Hydrogen's 1s to first order in a field F along +z (Dalgarno–Lewis). */
export interface Polarized1sRecipe {
    type: 'polarized1s';
    field: number;
}

/** H₂⁺ solved exactly at internuclear distance R, nuclei at z = ±R/2 (Phase 5). */
export interface H2PlusRecipe {
    type: 'h2plus';
    /** Internuclear distance, a0. */
    R: number;
    state: H2PlusState;
}

/** One molecular orbital from a shipped Gaussian basis (Phases 5–6). */
export interface GaussianMORecipe {
    type: 'gaussianMO';
    /** A registered basis's id, e.g. 'n2@07' (see FieldRenderRequest.bases). */
    moleculeId: string;
    /** Position in the basis's `orbitals`. */
    index: number;
}

/**
 * A molecule's total density, evaluated from its basis (Phase 5). Evaluates
 * √ρ, the convention generateFieldMesh already uses for density grids: the
 * contour search squares its samples, so it sees ρ itself, and every vertex
 * is "positive" -- a density has no phase.
 */
export interface GaussianDensityRecipe {
    type: 'gaussianDensity';
    moleculeId: string;
}

export type FieldRecipe =
    | HydrogenicRecipe | CombinationRecipe | Polarized1sRecipe | H2PlusRecipe
    | GaussianMORecipe | GaussianDensityRecipe;

/** An analytic field, evaluated on demand in a worker. */
export interface AnalyticFieldSource {
    kind: 'analytic';
    /** Stable id for caching, e.g. 'hydrogenic:2,1,0,Z1' or 'hybrid:sp3:0'. */
    id: string;
    /** Serialisable recipe; the worker rebuilds the evaluator from it. */
    recipe: FieldRecipe;
    /** Half-width of the sampling box, a0. */
    rMax: number;
}

/** A precomputed or client-computed grid. */
export interface GridFieldSource {
    kind: 'grid';
    id: string;
    /** Points per axis. */
    shape: [number, number, number];
    /** World position of grid point (0,0,0), a0. */
    origin: [number, number, number];
    /** Spacing, a0. */
    spacing: number;
    /** ψ (signed) or ρ (non-negative); tells the renderer whether to phase-colour. */
    quantity: 'psi' | 'density';
    /** z-fastest, like DensityMap: index = (i * shape[1] + j) * shape[2] + k. */
    values: Float32Array;
}

export type FieldSource = AnalyticFieldSource | GridFieldSource;

export type FieldEvaluator = (x: number, y: number, z: number) => number;

/**
 * One render: a single source is drawn like any orbital (phase colours, cut
 * face); several are overlaid, one colour each (`colors[i]` for `sources[i]`).
 * `label` names it in the busy indicator.
 */
export interface FieldRenderRequest {
    sources: AnalyticFieldSource[];
    colors: string[];
    /** What the colour key calls each source (`memberLabels[i]` for `sources[i]`); an exported overlay names its solids with them. */
    memberLabels: string[];
    resolution: number;
    enclosedFraction: number;
    label: string;
    /** Bases the worker registers before evaluating 'gaussianMO'/'gaussianDensity' recipes. */
    bases?: MoleculeBasis[];
    /**
     * Draw each source at this value of ρ (e/a₀³) instead of at an enclosed
     * fraction. 'gaussianDensity' sources only; see generateIsoValueMesh for why.
     */
    densityIsoValue?: number;
}

/**
 * The strongest field drawn (spec §5 Phase 1). Hydrogen's 1s goes over the
 * barrier at E²/4 = 0.0625 a.u., and first-order theory is already 12 % off in
 * μ at 0.05, so beyond this the picture would be a fiction.
 */
export const MAX_FIELD_AU = 0.05;

/** Why a field cannot be drawn, or null if it can. */
export function fieldProblem(field: number): string | null {
    if (Number.isFinite(field) && field >= 0 && field <= MAX_FIELD_AU) return null;
    // Only a real, positive field can be too strong; anything else is simply out of range.
    if (!(field > 0) || !Number.isFinite(field)) return `A field of ${field} a.u. is refused: the field must be between 0 and ${MAX_FIELD_AU} a.u.`;
    return `A field of ${field} a.u. is refused: first-order perturbation theory is drawn only from 0 to ${MAX_FIELD_AU} a.u., and stronger fields ionise the atom.`;
}

/**
 * Rebuilds the interpolating closure an SCF solution's R(r) was flattened
 * into to cross the worker boundary. `interpolateOnGrid` reads only `rMin`,
 * `dx` and `size`, so a RadialGrid-shaped object is enough.
 */
export function radialOverrideFromSamples(samples: RadialSamples): (r: number) => number {
    const { R, rMin, dx, size } = samples;
    const grid: RadialGrid = { r: new Float64Array(0), dx, size, rMin, rMax: rMin * Math.exp((size - 1) * dx) };
    return (r: number) => interpolateOnGrid(grid, R, r);
}

export function hydrogenicSource(params: OrbitalParams): AnalyticFieldSource {
    const { n, l, ml, Z, rMax, radialSamples } = params;
    const recipe: HydrogenicRecipe = radialSamples
        ? { type: 'hydrogenic', n, l, ml, Z, radialSamples }
        : { type: 'hydrogenic', n, l, ml, Z };
    return {
        kind: 'analytic',
        id: `hydrogenic:${n},${l},${ml},Z${Z}${radialSamples ? ':scf' : ''}`,
        recipe,
        rMax,
    };
}

function hydrogenicEvaluator(recipe: HydrogenicRecipe): FieldEvaluator {
    return makeWaveFunctionEvaluator(
        recipe.n, recipe.l, recipe.ml, recipe.Z,
        recipe.radialSamples ? radialOverrideFromSamples(recipe.radialSamples) : undefined
    );
}

function combinationEvaluator(recipe: CombinationRecipe): FieldEvaluator {
    if (recipe.terms.length === 0) throw new Error('A combination needs at least one term');
    const coefficients = recipe.terms.map(term => {
        if (!Number.isFinite(term.coefficient)) throw new Error('A combination coefficient must be a finite number');
        return term.coefficient;
    });
    const evaluators = recipe.terms.map(term => hydrogenicEvaluator(term.orbital));
    return (x, y, z) => {
        let sum = 0;
        for (let i = 0; i < evaluators.length; i++) sum += coefficients[i] * evaluators[i](x, y, z);
        return sum;
    };
}

function polarized1sEvaluator(field: number): FieldEvaluator {
    const problem = fieldProblem(field);
    if (problem) throw new Error(problem);
    const norm = 1 / Math.sqrt(Math.PI);
    return (x, y, z) => {
        const r = Math.sqrt(x * x + y * y + z * z);
        return norm * Math.exp(-r) * (1 - field * z * (1 + r / 2));
    };
}

export function makeFieldEvaluator(recipe: FieldRecipe): FieldEvaluator {
    switch (recipe.type) {
        case 'hydrogenic': return hydrogenicEvaluator(recipe);
        case 'combination': return combinationEvaluator(recipe);
        case 'polarized1s': return polarized1sEvaluator(recipe.field);
        case 'h2plus': return h2plusEvaluator(solveH2Plus(recipe.R, recipe.state));
        case 'gaussianMO': return moEvaluator(registeredBasis(recipe.moleculeId), recipe.index);
        case 'gaussianDensity': {
            const rho = densityEvaluator(registeredBasis(recipe.moleculeId));
            return (x, y, z) => Math.sqrt(rho(x, y, z));
        }
        default: {
            const unhandled: never = recipe;
            throw new Error(`Unknown field recipe: ${JSON.stringify(unhandled)}`);
        }
    }
}

/**
 * The recipe's values over a whole grid at once (z-fastest), where that is
 * much cheaper than point by point -- or null, and the caller samples
 * makeFieldEvaluator's closure. Only the Gaussian recipes have one: a
 * molecule at 96³ is 0.9 M points of up to 62 AOs each, and sampling it a
 * grid row at a time from per-axis tables (gaussian_basis.ts, sampleOnGrid)
 * takes O₂'s 97³ density from 1.45 s to 0.25 s (0.4–0.5 s meshed; Apple
 * M2 Pro, task-7 report), inside §3.7's 1.5 s on a 2020 laptop with room
 * for one that is twice as slow. The values are
 * makeFieldEvaluator's to float32 storage (tests/molecules/gaussian_basis.test.ts).
 */
export function fieldOnGrid(recipe: FieldRecipe): ((grid: GridSpec) => Float32Array) | null {
    switch (recipe.type) {
        case 'gaussianMO': {
            const basis = registeredBasis(recipe.moleculeId);
            return grid => moOnGrid(basis, recipe.index, grid);
        }
        case 'gaussianDensity': {
            const basis = registeredBasis(recipe.moleculeId);
            return grid => densityOnGrid(basis, grid, { root: true });
        }
        default: return null;
    }
}
