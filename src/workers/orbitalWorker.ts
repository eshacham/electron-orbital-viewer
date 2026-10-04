import { MeshData, OrbitalParams } from '@/types/orbital';
import { FieldRenderRequest } from '../field_source';
import { generateOrbitalMesh, generateFieldMeshes, generateIsoValueMesh } from '../orbital_mesh';
import { registerMoleculeBasis } from '../molecules/basis_registry';

type WorkerMessageData =
    | { type: 'calculate'; params: OrbitalParams }
    | { type: 'calculateFields'; request: FieldRenderRequest };

interface WorkerSuccessResponse {
    type: 'success';
    meshData: MeshData;
}

interface WorkerFieldsSuccessResponse {
    type: 'fieldsSuccess';
    meshes: MeshData[];
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
    const message = e.data;
    try {
        if (message.type === 'calculate') {
            console.log('Worker: Starting calculation', message.params);
            const meshData = generateOrbitalMesh(message.params);
            console.log('Worker: Calculation complete', {
                vertexCount: meshData.positions.length,
                triangleCount: meshData.cells.length
            });
            const response: WorkerSuccessResponse = { type: 'success', meshData };
            // The density map is the largest thing crossing the boundary; hand the
            // buffer over rather than copying it.
            worker.postMessage(response, [meshData.densityMap.data.buffer]);
        } else if (message.type === 'calculateFields') {
            const { request } = message;
            // A molecule's recipe names its basis; the request carries the
            // basis itself, registered before any evaluator is rebuilt.
            for (const basis of request.bases ?? []) registerMoleculeBasis(basis);
            const isoValue = request.densityIsoValue;
            const meshes = isoValue !== undefined
                ? request.sources.map(source => generateIsoValueMesh(source, request.resolution, isoValue))
                : generateFieldMeshes(request);
            const response: WorkerFieldsSuccessResponse = { type: 'fieldsSuccess', meshes };
            worker.postMessage(response, meshes.map(mesh => mesh.densityMap.data.buffer));
        }
    } catch (error) {
        console.error('Worker: Error during calculation:', error);
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
        worker.postMessage(response);
    }
};
