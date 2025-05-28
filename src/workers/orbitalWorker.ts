import { getOrbitalPotentialFunction } from '../quantum_functions';
import { marchingCubes, MarchingCubesMeshData } from 'marching-cubes-fast';

interface OrbitalParameters {
  n: number;
  l: number;
  ml: number;
  Z: number;
  resolution: number;
  rMax: number;
  isoLevel: number;
}

self.onmessage = (e: MessageEvent<{ type: 'calculate', params: OrbitalParameters }>) => {
  if (e.data.type === 'calculate') {
    try {
      const { n, l, ml, Z, resolution, rMax, isoLevel } = e.data.params;
      const orbitalPotentialFunction = getOrbitalPotentialFunction(n, l, ml, Z, isoLevel);
      
      const meshData: MarchingCubesMeshData | null = marchingCubes(
        resolution,
        orbitalPotentialFunction,
        [[-rMax, -rMax, -rMax], [rMax, rMax, rMax]]
      );

      if (!meshData) {
        throw new Error('Failed to generate mesh data');
      }

      self.postMessage({ 
        type: 'success', 
        meshData: {
          positions: meshData.positions,
          cells: meshData.cells
        }
      });
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
};