import type { MeshData } from '../types/orbital';
import type { GridMeshRequest, MeshWorkerResponse } from './grid_mesh_request';

/**
 * Why a mesh never arrived when nothing went wrong: a newer request took its
 * place. Callers drop it silently -- it is not a failure to show (ruling D38).
 */
export class MeshRequestSuperseded extends Error {
    constructor() {
        super('Superseded by a newer surface');
        this.name = 'MeshRequestSuperseded';
    }
}

export const isSuperseded = (error: unknown): boolean => error instanceof MeshRequestSuperseded;

export interface MeshJob {
    promise: Promise<MeshData>;
    /**
     * Stops the worker and settles `promise` with MeshRequestSuperseded. A
     * terminated worker fires neither onmessage nor onerror, so without this
     * the promise -- and any busy label waiting on it -- would hang for ever.
     */
    cancel: () => void;
}

/**
 * One request, one reply, then the worker is done. The grid is copied, not
 * transferred: the cache keeps the main thread's copy for the next surface.
 */
export function runMeshWorker(worker: Worker, request: GridMeshRequest): MeshJob {
    let settled = false;
    let cancel = () => {};
    const promise = new Promise<MeshData>((resolve, reject) => {
        const finish = (outcome: () => void) => {
            if (settled) return;
            settled = true;
            worker.terminate();
            outcome();
        };
        cancel = () => finish(() => reject(new MeshRequestSuperseded()));
        worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
            if (event.data.requestId !== request.requestId) return;
            const data = event.data;
            finish(() => (data.type === 'success' ? resolve(data.meshData) : reject(new Error(data.message))));
        };
        worker.onerror = (event: ErrorEvent) => {
            finish(() => reject(new Error(event.message || 'The meshing worker failed')));
        };
        worker.postMessage(request);
    });
    return { promise, cancel };
}
