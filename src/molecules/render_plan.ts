import type { AnalyticFieldSource, FieldRenderRequest, GridFieldSource } from '../field_source';
import type { GridMeshRequest } from './grid_mesh_request';
import { ESP_SURFACE_DENSITY } from './esp_color';
import type { LibraryMoleculeMeta } from './library_types';
import type { MoleculeBasis } from './types';
import type { MoleculeSurface } from '../store/moleculeSlice';
import { orbitalViewBox, viewResolution } from './view_box';

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

/**
 * Task 16d: the molecule's own centre -- the middle of its atoms' extent -- which every Molecules view is framed and
 * turned about. A library molecule's atoms need not sit round the origin (glycine's N is at it, its far O 8.3 a₀
 * out); framing a sphere about the origin left such a molecule half the size its own extent allows.
 */
export function moleculeCentre(meta: Pick<LibraryMoleculeMeta, 'atoms'>): [number, number, number] {
    if (meta.atoms.length === 0) return [0, 0, 0];
    const axis = (k: number) => {
        const values = meta.atoms.map(atom => atom.position[k]);
        // + 0: a symmetric molecule's centre is 0, never -0.
        return (Math.min(...values) + Math.max(...values)) / 2 + 0;
    };
    return [axis(0), axis(1), axis(2)];
}

/**
 * An MO is sampled in the density's own box, grown where the molecule's orbitals reach past it (ruling
 * T10-mainbox, `rMax`), and framed for the density's box, so switching between them keeps the camera.
 */
function moleculeOrbitalSource(meta: LibraryMoleculeMeta, index: number, rMax: number): AnalyticFieldSource {
    return { kind: 'analytic', id: `gaussianMO:${meta.id}:${index}`, recipe: { type: 'gaussianMO', moleculeId: meta.id, index }, rMax };
}

/**
 * `basis` is what the orbital worker registers before evaluating the
 * gaussianMO recipe (D3) -- without it the worker has nothing to evaluate.
 * Omitted only to read an MO plan's label before the basis has loaded.
 */
export function planMoleculeRender(
    meta: LibraryMoleculeMeta, surface: MoleculeSurface, enclosedFraction: number, basis?: MoleculeBasis,
    /** `probe: false`: keep the density's box -- the strip's tiles fit their own (fitToOrbital) and never probe (ruling T16c-I1). */
    { probe = true }: { probe?: boolean } = {},
): MoleculeRenderPlan {
    if (surface.kind === 'none') return { kind: 'clear' };
    if (surface.kind === 'mo') {
        const orbital = meta.orbitals.find(o => o.index === surface.index);
        const name = orbital?.label ?? `orbital ${surface.index}`;
        const label = `Computing ${name}…`;
        // Rulings T10-mainbox / T16c-I1: the orbital's own box, grown past the density's where its surface reaches
        // further at this fraction (view_box.ts), at a resolution that keeps the density box's step within the
        // caps (T16c-cap), framed for the density's box. It needs the basis; a plan read only for its label
        // keeps the density's box.
        const densityBox = gridHalfWidth(meta);
        const box = basis && probe ? orbitalViewBox(basis, surface.index, enclosedFraction, densityBox) : densityBox;
        return {
            kind: 'mo', label,
            request: {
                // The member is named for what it is, as Bonds names its
                // orbitals (bonds_request.ts), never the busy text: an
                // exported solid or a colour key must not read "Computing…".
                sources: [moleculeOrbitalSource(meta, surface.index, box)], colors: ['#ffffff'], memberLabels: [name],
                resolution: basis ? viewResolution(MOLECULE_MO_RESOLUTION, densityBox, box, basis.nao) : MOLECULE_MO_RESOLUTION, enclosedFraction, label,
                frameBox: densityBox,
                // Task 16d: turned about the molecule's own centre, as its density is.
                frameCentre: moleculeCentre(meta),
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
