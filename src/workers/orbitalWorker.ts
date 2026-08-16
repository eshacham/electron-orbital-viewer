import { MeshData, OrbitalParams } from '@/types/orbital';
import { generateOrbitalMesh } from '../orbital_mesh';


// Worker message types
interface WorkerMessageData {
    type: 'calculate';
    params: OrbitalParams;
}

interface WorkerSuccessResponse {
    type: 'success';
    meshData: MeshData;
}

interface WorkerErrorResponse {
    type: 'error';
    message: string;
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

    try {
        console.log('Worker: Starting calculation', e.data.params);
        const meshData = generateOrbitalMesh(e.data.params);

        console.log('Worker: Calculation complete', {
            vertexCount: meshData.positions.length,
            triangleCount: meshData.cells.length
        });

        const response: WorkerSuccessResponse = { type: 'success', meshData };
        // The density map is the largest thing crossing the boundary; hand the
        // buffer over rather than copying it.
        worker.postMessage(response, [meshData.densityMap.data.buffer]);
    } catch (error) {
        console.error('Worker: Error during calculation:', error);
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
        worker.postMessage(response);
    }
};
