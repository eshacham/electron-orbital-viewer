import type { RadialCurve } from './components/RadialPlot';
import { AnalyticFieldSource, FieldRenderRequest, fieldProblem } from './field_source';
import { HybridKind, HYBRID_NAMES, hybridCount, hybridSource } from './hybrids';
import { StarkState, polarized1sSource, starkFieldProblem, starkStateSource } from './stark';
import { ORBITAL_RESOLUTION, OVERLAY_RESOLUTION, BASIC_ORBITALS_Z, combinationSamplingRadius } from './orbital_presets';
import { radialProfile } from './radial_distribution';
import { CURVE_COLORS } from './curve_colors';

/** What Basic Orbitals' Combination picker has chosen. */
export type StarkChoice = StarkState | 'both';

export type CombinationSelection =
    | { kind: 'none' }
    | { kind: 'hybrid'; hybrid: HybridKind; member: number | 'all' }
    | { kind: 'field'; level: 1 | 2; field: number; stark: StarkChoice };

export const NO_COMBINATION: CombinationSelection = { kind: 'none' };

/** Where the field slider starts: visibly polarised, and first-order theory still within 5 % in μ. */
export const DEFAULT_FIELD_AU = 0.03;

/**
 * One colour per overlaid member. Red and blue are skipped: everywhere else in
 * the app they mean ψ > 0 and ψ < 0, and each member keeps that distinction as
 * a darker shade of its own colour.
 */
export const OVERLAY_COLORS: string[] = [CURVE_COLORS[2], CURVE_COLORS[3], CURVE_COLORS[4], CURVE_COLORS[5]];

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** "h₁" for member 0. */
export function hybridMemberLabel(index: number): string {
    return `h${String(index + 1).split('').map(d => SUBSCRIPTS[Number(d)]).join('')}`;
}

const STARK_LABEL: Record<StarkState, string> = { lower: '(2s + 2p_z)/√2', upper: '(2s − 2p_z)/√2' };

/** Why a selection cannot be drawn, or null. A selection may come from elsewhere than the controls (Phase 2's URL state). */
export function selectionProblem(selection: CombinationSelection): string | null {
    if (selection.kind === 'field') {
        return selection.level === 1 ? fieldProblem(selection.field) : starkFieldProblem(selection.field);
    }
    if (selection.kind === 'hybrid' && selection.member !== 'all') {
        const count = hybridCount(selection.hybrid);
        const member = selection.member;
        if (!Number.isInteger(member) || member < 0 || member >= count) {
            return `${HYBRID_NAMES[selection.hybrid]} has ${count} hybrids; there is no hybrid ${member + 1}.`;
        }
    }
    return null;
}

export function fieldSourcesFor(selection: CombinationSelection): AnalyticFieldSource[] {
    if (selection.kind === 'none' || selectionProblem(selection)) return [];
    if (selection.kind === 'hybrid') {
        const members = selection.member === 'all'
            ? Array.from({ length: hybridCount(selection.hybrid) }, (_, i) => i)
            : [selection.member];
        return members.map(i => hybridSource(selection.hybrid, i));
    }
    if (selection.level === 1) return [polarized1sSource(selection.field)];
    return selection.stark === 'both'
        ? [starkStateSource('lower'), starkStateSource('upper')]
        : [starkStateSource(selection.stark)];
}

export function combinationTitle(selection: CombinationSelection): string {
    switch (selection.kind) {
        case 'none': return '';
        case 'hybrid':
            return selection.member === 'all'
                ? `${HYBRID_NAMES[selection.hybrid]} hybrids — all ${hybridCount(selection.hybrid)}`
                : `${HYBRID_NAMES[selection.hybrid]} hybrid ${hybridMemberLabel(selection.member)}`;
        case 'field':
            if (selection.level === 1) return `H 1s in a field, F = ${selection.field.toFixed(3)} a.u.`;
            return selection.stark === 'both' ? 'n = 2 Stark states' : `n = 2 Stark state ${STARK_LABEL[selection.stark]}`;
    }
}

export function fieldRequestFor(selection: CombinationSelection, enclosedFraction: number): FieldRenderRequest | null {
    const sources = fieldSourcesFor(selection);
    if (sources.length === 0) return null;
    return {
        sources,
        colors: sources.map((_, i) => OVERLAY_COLORS[i % OVERLAY_COLORS.length]),
        resolution: sources.length > 1 ? OVERLAY_RESOLUTION : ORBITAL_RESOLUTION,
        enclosedFraction,
        label: combinationTitle(selection),
    };
}

/** The colour key for an overlay; null when a single source is drawn in phase colours. */
export function overlayLegend(selection: CombinationSelection): Array<{ label: string; color: string }> | null {
    const sources = fieldSourcesFor(selection);
    if (sources.length < 2) return null;
    if (selection.kind === 'field') {
        return [
            { label: `${STARK_LABEL.lower}, −3F`, color: OVERLAY_COLORS[0] },
            { label: `${STARK_LABEL.upper}, +3F`, color: OVERLAY_COLORS[1] },
        ];
    }
    return sources.map((_, i) => ({ label: hybridMemberLabel(i), color: OVERLAY_COLORS[i] }));
}

const WEIGHT_LABEL: Record<number, string> = { 1: '½·2s + ½·2p', 2: '⅓·2s + ⅔·2p', 3: '¼·2s + ¾·2p' };

/**
 * The radial plot for a combination: its ingredients and the result. The
 * spherical average of |Σ cᵢ R Y|² is Σ cᵢ² R², because the cross terms
 * integrate to zero over angles, so the weighted sum is the combination's
 * exact radial distribution, not an illustration of it.
 */
export function combinationCurves(selection: CombinationSelection): { curves: RadialCurve[]; rMax: number } | null {
    if (selection.kind === 'none' || selectionProblem(selection)) return null;
    const curveOf = (n: number, l: number, rMax: number) =>
        radialProfile(n, l, BASIC_ORBITALS_Z, rMax, 240).map(point => ({ r: point.r, value: point.probability }));

    if (selection.kind === 'field' && selection.level === 1) {
        const rMax = combinationSamplingRadius(1);
        return { rMax, curves: [{ label: '1s — unchanged to first order in F', color: CURVE_COLORS[0], points: curveOf(1, 0, rMax) }] };
    }

    const k = selection.kind === 'hybrid' ? hybridCount(selection.hybrid) - 1 : 1;
    const rMax = combinationSamplingRadius(2);
    const s = curveOf(2, 0, rMax);
    const p = curveOf(2, 1, rMax);
    const sWeight = 1 / (k + 1);
    const sum = s.map((point, i) => ({ r: point.r, value: sWeight * point.value + (1 - sWeight) * p[i].value }));
    const noun = selection.kind === 'hybrid' ? 'each hybrid' : 'each Stark state';
    return {
        rMax,
        curves: [
            { label: '2s', color: CURVE_COLORS[0], points: s },
            { label: '2p', color: CURVE_COLORS[1], points: p },
            { label: `${noun}: ${WEIGHT_LABEL[k]}`, color: CURVE_COLORS[7], points: sum },
        ],
    };
}
