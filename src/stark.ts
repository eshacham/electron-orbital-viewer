import { AnalyticFieldSource, CombinationRecipe, fieldProblem } from './field_source';
import { sampleFieldSource } from './orbital_mesh';
import { overlapIntegral, zMatrixElement } from './field_integrals';
import { ORBITAL_RESOLUTION, combinationSamplingRadius, n2Recipe } from './orbital_presets';

/**
 * Hydrogen in a uniform field F along +z, H′ = +F z (atomic units): the field
 * pulls the electron towards −z.
 *
 * n = 1: ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ (Dalgarno–Lewis, exact to first order),
 * ⟨z⟩ = −2F⟨z²(1 + r/2)⟩₁ₛ = −9F/2, so μ = αF with α = 9/2 a₀³.
 * n = 2: the degenerate level splits to first order into (2s ± 2p_z)/√2 with
 * shifts ±3F, since ⟨2s|z|2p_z⟩ = −3 a₀ in this code's sign convention.
 */

export const HYDROGEN_POLARIZABILITY = 4.5;
/** γ for hydrogen, exact: 10665/8 a.u. μ = αF + γF³/6. */
export const HYDROGEN_HYPERPOLARIZABILITY = 10665 / 8;
export const STARK_N2_COEFFICIENT = 3;
export const VOLTS_PER_METRE_PER_AU = 5.14220675e11;
export const EV_PER_HARTREE = 27.211386;
export const DEBYE_PER_EA0 = 2.541746;
/** Where α is measured: small enough that normalising the first-order ψ costs 0.05 %. */
export const VALIDATION_FIELD_AU = 0.01;

export type StarkState = 'lower' | 'upper';

/**
 * Classically, V = −1/r + Fz peaks at −2√F on the −z side, so a state bound
 * by E escapes over the barrier once F > E²/4.
 */
export function overTheBarrierField(bindingEnergy: number): number {
    return (bindingEnergy * bindingEnergy) / 4;
}

/** n = 2's limit, E = −1/8 Ha: 1/256 ≈ 0.0039 a.u., rounded down. */
export const N2_MAX_FIELD_AU = Math.floor(overTheBarrierField(1 / 8) * 1e4) / 1e4;

export function starkFieldProblem(field: number): string | null {
    if (Number.isFinite(field) && field >= 0 && field <= N2_MAX_FIELD_AU) return null;
    return `A field of ${field} a.u. is refused at n = 2: an n = 2 electron is not bound above about ${N2_MAX_FIELD_AU} a.u. (the field lowers the barrier below its energy, F = E²/4 with E = −1/8 Ha).`;
}

export function polarized1sSource(field: number): AnalyticFieldSource {
    const problem = fieldProblem(field);
    if (problem) throw new Error(problem);
    return { kind: 'analytic', id: `polarized1s:F${field}`, recipe: { type: 'polarized1s', field }, rMax: combinationSamplingRadius(1) };
}

/** lower = (2s + 2p_z)/√2, shifted by −3F; upper = (2s − 2p_z)/√2, by +3F. */
export function starkStateRecipe(state: StarkState): CombinationRecipe {
    const pSign = state === 'lower' ? 1 : -1;
    return { type: 'combination', terms: [
        { coefficient: Math.SQRT1_2, orbital: n2Recipe(0, 0) },
        { coefficient: pSign * Math.SQRT1_2, orbital: n2Recipe(1, 0) },
    ] };
}

export function starkStateSource(state: StarkState): AnalyticFieldSource {
    return { kind: 'analytic', id: `stark:n2:${state}`, recipe: starkStateRecipe(state), rMax: combinationSamplingRadius(2) };
}

export function starkShiftHartree(state: StarkState, field: number): number {
    return (state === 'lower' ? -1 : 1) * STARK_N2_COEFFICIENT * field;
}

/** μ = αF, e·a₀. */
export function inducedDipole(field: number): number {
    return HYDROGEN_POLARIZABILITY * field;
}

/** (γF³/6) / (αF): how much the next order would change μ. */
export function nextOrderDipoleShare(field: number): number {
    return (HYDROGEN_HYPERPOLARIZABILITY * field * field) / (6 * HYDROGEN_POLARIZABILITY);
}

/** α = −⟨ψ|z|ψ⟩ / (F ⟨ψ|ψ⟩) from the ψ actually drawn, on the render grid. */
export function polarizabilityFromDrawnPsi(field: number = VALIDATION_FIELD_AU, resolution: number = ORBITAL_RESOLUTION): number {
    if (!(field > 0)) throw new Error('α needs a non-zero field to measure a response');
    const psi = sampleFieldSource(polarized1sSource(field), resolution);
    return -zMatrixElement(psi, psi) / (field * overlapIntegral(psi, psi));
}

/** ⟨2s|z|2p_z⟩ on the render grid; −3 a₀ exactly. */
export function transitionDipole2s2pz(resolution: number = ORBITAL_RESOLUTION): number {
    const rMax = combinationSamplingRadius(2);
    const s = sampleFieldSource({ kind: 'analytic', id: 'hydrogenic:2,0,0,Z1', recipe: n2Recipe(0, 0), rMax }, resolution);
    const pz = sampleFieldSource({ kind: 'analytic', id: 'hydrogenic:2,1,0,Z1', recipe: n2Recipe(1, 0), rMax }, resolution);
    return zMatrixElement(s, pz);
}

const SUPERSCRIPT: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** "1.54 × 10¹⁰ V/m". */
export function formatVoltsPerMetre(field: number): string {
    const voltsPerMetre = field * VOLTS_PER_METRE_PER_AU;
    if (!(voltsPerMetre > 0)) return '0 V/m';
    let exponent = Math.floor(Math.log10(voltsPerMetre));
    let mantissa = (voltsPerMetre / 10 ** exponent).toFixed(2);
    if (mantissa === '10.00') {
        exponent += 1;
        mantissa = '1.00';
    }
    const power = String(exponent).split('').map(c => SUPERSCRIPT[c]).join('');
    return `${mantissa} × 10${power} V/m`;
}
