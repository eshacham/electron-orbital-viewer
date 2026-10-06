import type { AnalyticFieldSource, FieldRenderRequest } from '../field_source';
import type { LibraryMoleculeMeta } from './library_types';
import type { MoleculeBasis } from './types';
import type { MoleculeSurface } from '../store/moleculeSlice';

/** Spec §4.2's budget case: one MO on a 96³ grid. */
export const MOLECULE_MO_RESOLUTION = 95;

/**
 * What one surface request does. A grid plan meshes the shipped density:
 * at the enclosed fraction (the Density view), or -- 'espSurface' -- exactly
 * at ρ = 0.001 e/a₀³ (ESP_SURFACE_DENSITY, ruling D4), coloured by the ESP.
 * An MO plan is evaluated from the basis in the orbital worker, like any
 * Basic Orbitals source.
 */
export type MoleculeRenderPlan =
    | { kind: 'grid'; fraction: number | 'espSurface'; colourByEsp: boolean; label: string }
    | { kind: 'mo'; request: FieldRenderRequest; label: string };

/** The density grid is a centred cube (Phase 1's grid convention), so its half-width is one origin coordinate. */
export const gridHalfWidth = (meta: LibraryMoleculeMeta) => Math.abs(meta.grid.origin[0]);

/** An MO is drawn in the density's own box, so switching between them keeps the camera. */
export function moleculeOrbitalSource(meta: LibraryMoleculeMeta, index: number): AnalyticFieldSource {
    return { kind: 'analytic', id: `gaussianMO:${meta.id}:${index}`, recipe: { type: 'gaussianMO', moleculeId: meta.id, index }, rMax: gridHalfWidth(meta) };
}

/**
 * `basis` is what the orbital worker registers before evaluating the
 * gaussianMO recipe (D3) -- without it the worker has nothing to evaluate.
 * Omitted only to read an MO plan's label before the basis has loaded.
 */
export function planMoleculeRender(
    meta: LibraryMoleculeMeta, surface: MoleculeSurface, enclosedFraction: number, basis?: MoleculeBasis,
): MoleculeRenderPlan {
    if (surface.kind === 'mo') {
        const orbital = meta.orbitals.find(o => o.index === surface.index);
        const label = `Computing ${orbital?.label ?? `orbital ${surface.index}`}…`;
        return {
            kind: 'mo', label,
            request: {
                sources: [moleculeOrbitalSource(meta, surface.index)], colors: ['#ffffff'], memberLabels: [label],
                resolution: MOLECULE_MO_RESOLUTION, enclosedFraction, label,
                ...(basis ? { bases: [basis] } : {}),
            },
        };
    }
    if (surface.kind === 'esp') return { kind: 'grid', fraction: 'espSurface', colourByEsp: true, label: `Mapping the potential on ${meta.name}…` };
    return { kind: 'grid', fraction: enclosedFraction, colourByEsp: false, label: `Loading ${meta.name}…` };
}
