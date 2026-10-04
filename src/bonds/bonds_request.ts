import { AnalyticFieldSource, FieldRenderRequest } from '../field_source';
import type { BondsState, BondsView } from '../store/bondsSlice';
import { BasisOrbital, MoleculeBasis, OrbitalSpin } from '../molecules/types';
import { H2PLUS_LABELS, H2PlusState, h2plusSource } from './h2plus';
import { BONDS_RESOLUTION, DENSITY_SURFACE_HEX, MOLECULE_PADDING, pointId, snapH2PlusR, systemFormula } from './systems';

export { DENSITY_SURFACE_HEX };

/** A single source is drawn in the ψ phase colours; this entry is only what the request's shape asks for. */
const SINGLE_SOURCE_COLOR = '#ffffff';
/** Exported for export/caption.ts, which names a drawn orbital's spin the same way. */
export const SPIN_SUFFIX: Record<OrbitalSpin, string> = { restricted: '', alpha: ' (α)', beta: ' (β)' };

/**
 * h2plusSource solves H₂⁺ again (about 1.2 ms on the main thread) only to
 * size the sampling box, and the request is rebuilt on every render that
 * reads it. R sits on the slider's 0.01 a₀ step, so the keys are few; the
 * cap only bounds a long session of sliding.
 */
const H2PLUS_SOURCE_CACHE_SIZE = 64;
const h2plusSources = new Map<string, AnalyticFieldSource>();

function cachedH2PlusSource(R: number, state: H2PlusState): AnalyticFieldSource {
    const key = `${R}:${state}`;
    let source = h2plusSources.get(key);
    if (!source) {
        source = h2plusSource(R, state);
        if (h2plusSources.size >= H2PLUS_SOURCE_CACHE_SIZE) h2plusSources.delete(h2plusSources.keys().next().value!);
        h2plusSources.set(key, source);
    }
    return source;
}

/** The orbital a view names in this basis: the `component`-th of those sharing its label and spin (a degenerate π pair has two). */
export function findOrbital(basis: MoleculeBasis, view: BondsView): BasisOrbital | null {
    if (view.kind !== 'mo') return null;
    const matches = basis.orbitals.filter(o => o.label === view.label && o.spin === view.spin);
    return matches[view.component] ?? null;
}

function singleSourceRequest(
    source: AnalyticFieldSource, color: string, label: string, enclosedFraction: number, extra: Partial<FieldRenderRequest> = {},
): FieldRenderRequest {
    return {
        sources: [source], colors: [color], memberLabels: [label],
        resolution: BONDS_RESOLUTION, enclosedFraction, label, ...extra,
    };
}

/**
 * The render the current selection asks for, or null while its data is still
 * loading. `note` says why the picture differs from the selection, when it does.
 */
export function bondsFieldRequest(
    state: BondsState, basis: MoleculeBasis | null, enclosedFraction: number,
): { request: FieldRenderRequest; note: string | null } | null {
    if (state.system === 'h2plus') {
        // The slice keeps R on the slider; this is the last guard before the
        // solver, which throws outside (0, 100] (Task 1's carry).
        const R = state.R === null ? null : snapH2PlusR(state.R);
        if (state.view.kind !== 'h2plus' || R === null) return null;
        const label = `H₂⁺ ${H2PLUS_LABELS[state.view.state]} at R = ${R.toFixed(2)} a₀`;
        return { note: null, request: singleSourceRequest(cachedH2PlusSource(R, state.view.state), SINGLE_SOURCE_COLOR, label, enclosedFraction) };
    }
    // A molecule is drawn only from the basis of the very scan point selected:
    // one still loading for another point (or molecule) would put the wrong
    // geometry under this R's label.
    if (state.scanIndex === null || state.R === null || !basis || basis.id !== pointId(state.system, state.scanIndex)) return null;
    const rMax = Math.max(...basis.atoms.map(position => Math.hypot(...position))) + MOLECULE_PADDING;
    const formula = systemFormula(state.system);
    const where = `at R = ${state.R.toFixed(2)} a₀`;
    const bases = [basis];
    const orbital = findOrbital(basis, state.view);
    if (orbital) {
        const source: AnalyticFieldSource = {
            kind: 'analytic', id: `gaussianMO:${basis.id}:${orbital.index}`, rMax,
            recipe: { type: 'gaussianMO', moleculeId: basis.id, index: orbital.index },
        };
        const label = `${formula} ${orbital.label}${SPIN_SUFFIX[orbital.spin]} ${where}`;
        return { note: null, request: singleSourceRequest(source, SINGLE_SOURCE_COLOR, label, enclosedFraction, { bases }) };
    }
    // Review Focus 2: an orbital this geometry does not keep (or a label from
    // another molecule) is never a blank or stale picture -- the density is
    // drawn, and the note says why.
    const source: AnalyticFieldSource = {
        kind: 'analytic', id: `gaussianDensity:${basis.id}`, rMax,
        recipe: { type: 'gaussianDensity', moleculeId: basis.id },
    };
    // Ruling T7-a: drawn exactly at this ρ, not at an enclosed fraction, and labelled so.
    const label = `${formula} total density ${where}, surface at ρ = ${state.densityIso} e/a₀³`;
    return {
        note: state.view.kind === 'mo'
            ? `${state.view.label} is not among the orbitals kept at this geometry; showing the total density.`
            : null,
        request: singleSourceRequest(source, DENSITY_SURFACE_HEX, label, enclosedFraction, { bases, densityIsoValue: state.densityIso }),
    };
}
