import type { AnalyticFieldSource, FieldRenderRequest, GridFieldSource } from '../field_source';
import type { GridMeshRequest } from './grid_mesh_request';
import { ESP_SURFACE_DENSITY } from './esp_color';
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
 * Basic Orbitals source. A clear plan draws no surface at all.
 */
export type MoleculeRenderPlan =
    | { kind: 'grid'; fraction: number | 'espSurface'; colourByEsp: boolean; label: string }
    | { kind: 'mo'; request: FieldRenderRequest; label: string }
    /** Structure only (`show=none`, ruling P8): no surface -- the mesh is cleared and nothing is computed. */
    | { kind: 'clear' };

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
    if (surface.kind === 'none') return { kind: 'clear' };
    if (surface.kind === 'mo') {
        const orbital = meta.orbitals.find(o => o.index === surface.index);
        const name = orbital?.label ?? `orbital ${surface.index}`;
        const label = `Computing ${name}…`;
        return {
            kind: 'mo', label,
            request: {
                // The member is named for what it is, as Bonds names its
                // orbitals (bonds_request.ts), never the busy text: an
                // exported solid or a colour key must not read "Computing…".
                sources: [moleculeOrbitalSource(meta, surface.index)], colors: ['#ffffff'], memberLabels: [name],
                resolution: MOLECULE_MO_RESOLUTION, enclosedFraction, label,
                ...(basis ? { bases: [basis] } : {}),
            },
        };
    }
    if (surface.kind === 'esp') return { kind: 'grid', fraction: 'espSurface', colourByEsp: true, label: `Mapping the potential on ${meta.name}…` };
    return { kind: 'grid', fraction: enclosedFraction, colourByEsp: false, label: `Loading ${meta.name}…` };
}

/**
 * The grid worker's request for a grid plan: the density at its enclosed fraction, or the ESP surface exactly at
 * ρ = ESP_SURFACE_DENSITY (ruling D4). One builder for the main view (useMoleculeView) and the strip's density
 * and ESP tiles (Task 15), so a tile is meshed exactly as the view it opens.
 */
export function moleculeGridRequest(
    plan: Extract<MoleculeRenderPlan, { kind: 'grid' }>, source: GridFieldSource, requestId: number,
): GridMeshRequest {
    return plan.fraction === 'espSurface'
        ? { type: 'calculate', source, isoValue: ESP_SURFACE_DENSITY, requestId }
        : { type: 'calculate', source, enclosedFraction: plan.fraction, requestId };
}
