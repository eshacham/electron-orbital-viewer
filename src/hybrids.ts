import { AnalyticFieldSource, CombinationRecipe } from './field_source';
import { sampleFieldSource } from './orbital_mesh';
import { positiveLobeCentroid, angleBetweenDegrees } from './field_integrals';
import { ORBITAL_RESOLUTION, combinationSamplingRadius, n2Recipe } from './orbital_presets';

/**
 * sp, sp² and sp³ hybrids of hydrogen's n = 2 shell:
 *
 *   hᵢ = −(1/√(k+1)) ψ₂ₛ + √(k/(k+1)) (dᵢ · p),   k = 1, 2, 3
 *
 * ⟨hᵢ|hⱼ⟩ = 1/(k+1) + (k/(k+1)) dᵢ·dⱼ, and dᵢ·dⱼ = −1, −½, −⅓ makes that
 * zero off the diagonal. The 2s enters with a minus sign: hydrogen's R₂₀ is
 * positive only inside its node at 2 a₀, and 95 % of the 2s density lies
 * beyond it, where it is negative. With +ψ₂ₛ each hybrid's large lobe would
 * point opposite its own label.
 */

export type HybridKind = 'sp' | 'sp2' | 'sp3';

export const HYBRID_NAMES: Record<HybridKind, string> = { sp: 'sp', sp2: 'sp²', sp3: 'sp³' };

const THIRD = 1 / Math.sqrt(3);

/** Unit lobe directions. sp along z, sp² in the xy plane (p_z is left for π), sp³ tetrahedral. */
export const HYBRID_DIRECTIONS: Record<HybridKind, Array<[number, number, number]>> = {
    sp: [[0, 0, 1], [0, 0, -1]],
    sp2: [[1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0], [-0.5, -Math.sqrt(3) / 2, 0]],
    sp3: [[THIRD, THIRD, THIRD], [THIRD, -THIRD, -THIRD], [-THIRD, THIRD, -THIRD], [-THIRD, -THIRD, THIRD]],
};

export function hybridCount(kind: HybridKind): number {
    return HYBRID_DIRECTIONS[kind].length;
}

/** In makeWaveFunctionEvaluator's real harmonics mₗ = +1 is p_x, −1 is p_y, 0 is p_z. */
export function hybridRecipe(kind: HybridKind, index: number): CombinationRecipe {
    const directions = HYBRID_DIRECTIONS[kind];
    if (!Number.isInteger(index) || index < 0 || index >= directions.length) {
        throw new Error(`${HYBRID_NAMES[kind]} has ${directions.length} hybrids; there is no hybrid ${index + 1}`);
    }
    const k = directions.length - 1;
    const s = 1 / Math.sqrt(k + 1);
    const p = Math.sqrt(k / (k + 1));
    const [dx, dy, dz] = directions[index];
    const terms = [
        { coefficient: -s, orbital: n2Recipe(0, 0) },
        { coefficient: p * dx, orbital: n2Recipe(1, 1) },
        { coefficient: p * dy, orbital: n2Recipe(1, -1) },
        { coefficient: p * dz, orbital: n2Recipe(1, 0) },
    ].filter(term => term.coefficient !== 0);
    return { type: 'combination', terms };
}

export function hybridSource(kind: HybridKind, index: number): AnalyticFieldSource {
    return { kind: 'analytic', id: `hybrid:${kind}:${index}`, recipe: hybridRecipe(kind, index), rMax: combinationSamplingRadius(2) };
}

/** Direction of a hybrid's positive (large) lobe, measured on the render grid. */
export function hybridLobeAxis(kind: HybridKind, index: number, resolution: number = ORBITAL_RESOLUTION): [number, number, number] {
    return positiveLobeCentroid(sampleFieldSource(hybridSource(kind, index), resolution));
}

export function hybridLobeAngleDegrees(kind: HybridKind, i: number, j: number, resolution: number = ORBITAL_RESOLUTION): number {
    return angleBetweenDegrees(hybridLobeAxis(kind, i, resolution), hybridLobeAxis(kind, j, resolution));
}
