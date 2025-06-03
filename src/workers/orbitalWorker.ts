import { OrbitalParams } from '@/types/orbital';
import { getOrbitalPotentialFunction } from '../quantum_functions';
import { marchingCubes, MarchingCubesMeshData } from 'marching-cubes-fast';

// Worker message types
interface WorkerMessageData {
    type: 'calculate';
    params: OrbitalParams;
}

interface WorkerSuccessResponse {
    type: 'success';
    meshData: {
        positions: number[][];
        cells: number[][];
    };
}

interface WorkerErrorResponse {
    type: 'error';
    error: string;
}


self.onmessage = (e: MessageEvent<WorkerMessageData>) => {
    if (e.data.type === 'calculate') {
        try {
            console.log('Worker: Starting calculation', e.data.params);
            const { n, l, ml, Z, resolution, rMax, isoLevel } = e.data.params;

            // Validate parameters
            if (resolution <= 0 || rMax <= 0 || isoLevel <= 0) {
                throw new Error('Invalid parameters: resolution, rMax, and isoLevel must be positive');
            }

            const orbitalPotentialFunction = getOrbitalPotentialFunction(n, l, ml, Z, isoLevel);

            console.log('Worker: Running marching cubes algorithm');
            const meshData: MarchingCubesMeshData | null = marchingCubes(
                resolution,
                (x, y, z) => orbitalPotentialFunction(x, y, z).probabilityDensity, // Extract probabilityDensity
                [[-rMax, -rMax, -rMax], [rMax, rMax, rMax]]
            );

            if (!meshData) {
                throw new Error('Failed to generate mesh data');
            }

            if (!meshData.positions.length || !meshData.cells.length) {
                throw new Error('Generated mesh has no vertices or faces');
            }

            console.log('Worker: Calculation complete', {
                vertexCount: meshData.positions.length,
                triangleCount: meshData.cells.length
            });

            const response: WorkerSuccessResponse = {
                type: 'success',
                meshData: {
                    positions: meshData.positions,
                    cells: meshData.cells
                }
            };

            self.postMessage(response);
        } catch (error) {
            console.error('Worker: Error during calculation:', error);
            const response: WorkerErrorResponse = {
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
            self.postMessage(response);
        }
    }
};