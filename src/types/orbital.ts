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