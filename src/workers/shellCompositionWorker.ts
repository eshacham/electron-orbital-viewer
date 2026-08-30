import { OrbitalParams } from '@/types/orbital';
import { generateOrbitalMesh } from '../orbital_mesh';

/**
 * The geometry half of a composite orbital's mesh -- positions and cells
 * only. Unlike a level-3 orbital (orbitalWorker.ts), the composite view has
 * no per-orbital cut face and does not colour by ψ's sign (it colours by
 * subshell instead, see shell_composition_view.ts), so it needs neither
 * `densityMap` nor `psiSigns`: dropping them here is what a level-3 mesh
 * would send across the worker boundary too, if it did not need them.
 */
export interface LobeMeshData {
    positions: number[][];
    cells: number[][];
}

/**
 * Computes every orbital lobe of one shell in a single worker call, rather
 * than one worker per orbital: a d shell needs 9 of these and an f shell 16,
 * and batching means the main thread pays one postMessage round trip for
 * the whole shell instead of up to sixteen. All of it still runs off the
 * main thread -- see the task report for measured per-shell timings.
 */
interface WorkerMessageData {
    type: 'calculate';
    orbitals: OrbitalParams[];
    requestId: number;
}

interface WorkerSuccessResponse {
    type: 'success';
    meshes: LobeMeshData[];
    requestId: number;
}

interface WorkerErrorResponse {
    type: 'error';
    message: string;
    requestId: number;
}

// The DOM lib types the global `self` as a Window, whose postMessage takes a
// target origin rather than a transfer list. Pulling in the WebWorker lib
// instead would collide with DOM, so describe just the surface used here.
interface WorkerScope {
    onmessage: ((event: MessageEvent<WorkerMessageData>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
}
const worker = self as unknown as WorkerScope;

worker.onmessage = (e: MessageEvent<WorkerMessageData>) => {
    if (e.data.type !== 'calculate') return;

    const { orbitals, requestId } = e.data;

    try {
        const meshes: LobeMeshData[] = orbitals.map(params => {
            const mesh = generateOrbitalMesh(params);
            return { positions: mesh.positions, cells: mesh.cells };
        });

        const response: WorkerSuccessResponse = { type: 'success', meshes, requestId };
        worker.postMessage(response);
    } catch (error) {
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };
        worker.postMessage(response);
    }
};
