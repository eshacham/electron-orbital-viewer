import type { MeshData } from '../types/orbital';
import type { GridMeshRequest, MeshWorkerResponse } from './grid_mesh_request';

/**
 * One request, one reply, then the worker is done. The grid is copied, not
 * transferred: the cache keeps the main thread's copy for the next surface.
 */
export function runMeshWorker(worker: Worker, request: GridMeshRequest): Promise<MeshData> {
    return new Promise((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
            if (event.data.requestId !== request.requestId) return;
            worker.terminate();
            if (event.data.type === 'success') resolve(event.data.meshData);
            else reject(new Error(event.data.message));
        };
        worker.onerror = (event: ErrorEvent) => {
            worker.terminate();
            reject(new Error(event.message || 'The meshing worker failed'));
        };
        worker.postMessage(request);
    });
}
