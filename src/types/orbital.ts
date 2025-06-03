export interface OrbitalParams {
    n: number;
    l: number;
    ml: number;
    Z: number;
    resolution: number;
    rMax: number;
    isoLevel: number;
}

export type OrbitalDataPoint = {
    waveFunctionValue: number; // Raw wavefunction value (ψ)
    probabilityDensity: number; // Squared magnitude of the wavefunction (|ψ|^2)
};
// Add MeshData interface since it's used but not defined
export interface MeshData {
    positions: number[][];
    cells: number[][];
    psiSigns: number[]; // Include ψ signs in the mesh data
}
