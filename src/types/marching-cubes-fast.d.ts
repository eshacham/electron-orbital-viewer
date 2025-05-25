declare module 'marching-cubes-fast' {
  export interface MarchingCubesMeshData {
    positions: [number, number, number][]; // Array of [x,y,z] vertices
    cells: [number, number, number][];     // Array of [i,j,k] triangle indices
    // Add other properties if the library returns them
  }

  // Assuming the library exports a function named 'marchingCubes'
  // If it's a default export with a method, the declaration would be different.
  export function marchingCubes(
    resolution: number,
    potentialFunction: (x: number, y: number, z: number) => number,
    worldBounds: [[number, number, number], [number, number, number]]
  ): MarchingCubesMeshData | null;
}