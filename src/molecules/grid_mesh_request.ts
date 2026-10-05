import type { GridFieldSource } from '../field_source';
import { generateFieldMesh, generateGridIsoValueMesh } from '../orbital_mesh';
import type { MeshData } from '../types/orbital';

/**
 * Ruling D4: a grid is meshed one of two ways. `enclosedFraction` is the
 * density view (spec §4.1 binds now that the grid is voxel-averaged).
 * `isoValue` meshes EXACTLY at that level via `generateGridIsoValueMesh` --
 * the ESP surface, always ρ = 0.001 e/a₀³ (the plan's `enclosedFraction`
 * field is dropped in favour of this pair; see Task 9's ESP_SURFACE_DENSITY).
 * Exactly one must be given.
 */
export interface GridMeshRequest {
    type: 'calculate';
    source: GridFieldSource;
    enclosedFraction?: number;
    isoValue?: number;
    requestId: number;
}
export type MeshWorkerResponse =
    | { type: 'success'; meshData: MeshData; requestId: number }
    | { type: 'error'; message: string; requestId: number };

/**
 * Ruling D25 (C13): a density grid should never carry a value further below
 * zero than numerical noise explains. `gridAsSampledField` (orbital_mesh.ts)
 * clamps a negative sample to 0 silently, which would hide a genuine bug
 * (spec §3.5 "failures are shown, not hidden"), so this is checked up front
 * and refused explicitly instead.
 */
function negativeDensityProblem(source: GridFieldSource): string | null {
    if (source.quantity !== 'density') return null;
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0; i < source.values.length; i++) {
        const v = source.values[i];
        if (v > max) max = v;
        if (v < min) min = v;
    }
    const floor = -1e-6 * max;
    if (min < floor) {
        return `density grid ${source.id} holds negative values down to ${min.toExponential(3)} (noise floor ${floor.toExponential(3)})`;
    }
    return null;
}

/** The worker's whole job, kept pure so it is testable without a Worker. A grid is meshed at its own resolution (Phase 1's rule). */
export function handleGridMeshRequest(request: GridMeshRequest): MeshWorkerResponse {
    try {
        if ((request.enclosedFraction === undefined) === (request.isoValue === undefined)) {
            throw new Error(
                `Grid mesh request for ${request.source.id} must give exactly one of enclosedFraction or isoValue`
            );
        }
        const problem = negativeDensityProblem(request.source);
        if (problem) throw new Error(problem);

        const meshData = request.isoValue !== undefined
            ? generateGridIsoValueMesh(request.source, request.isoValue)
            : generateFieldMesh(request.source, request.source.shape[0] - 1, request.enclosedFraction as number);
        return { type: 'success', meshData, requestId: request.requestId };
    } catch (error) {
        return { type: 'error', message: error instanceof Error ? error.message : 'Could not mesh this grid', requestId: request.requestId };
    }
}
