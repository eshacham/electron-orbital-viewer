/** How the isosurface is drawn. Purely a view setting: changing it never re-runs the calculation. */
export type RenderMode = 'solid' | 'wireframe';

/** Axis a cut-away plane is perpendicular to, or 'none' for no cut. */
export type ClipAxis = 'none' | 'x' | 'y' | 'z';

/** Everything about how the surface looks. None of it affects the calculation. */
export interface SurfaceStyle {
    mode: RenderMode;
    /** 0 (invisible) to 1 (opaque). Below 1 the shells show through each other. */
    opacity: number;
    clipAxis: ClipAxis;
    /**
     * Where the cut plane sits along its axis, as a fraction of rMax. +1 keeps
     * the whole orbital, 0 cuts it in half, -1 removes it entirely.
     */
    clipPosition: number;
}

export const defaultSurfaceStyle: SurfaceStyle = {
    mode: 'solid',
    opacity: 1,
    clipAxis: 'none',
    clipPosition: 0
};

export interface OrbitalParams {
    n: number;
    l: number;
    ml: number;
    Z: number;
    resolution: number;
    rMax: number;
    /**
     * Which contour to draw, as the share of the electron it encloses.
     *
     * A raw density threshold says nothing about how much of the electron you
     * are looking at, and the same number means different things for different
     * orbitals. The density is derived from this per orbital instead.
     */
    enclosedFraction: number;
    /**
     * Present when the radial factor comes from a converged SCF solution
     * rather than the analytic hydrogen-like form.
     *
     * A closure cannot cross a worker boundary, so a solved subshell's R(r)
     * is handed over as this sampled log-grid array plus its grid parameters
     * instead; the receiving side (generateOrbitalMesh) rebuilds the
     * interpolating closure itself. Presence of this field, rather than a
     * separate flag, is what decides "numerical" vs "analytic" (ruling R4):
     * a flag could disagree with the data it describes, and it could not
     * carry what a worker needs regardless.
     */
    radialSamples?: { R: Float64Array; rMin: number; dx: number; size: number };
}

export type OrbitalDataPoint = {
    waveFunctionValue: number; // Raw wavefunction value (ψ)
    probabilityDensity: number; // Squared magnitude of the wavefunction (|ψ|^2)
};
/**
 * The sampled wave function, encoded for the GPU.
 *
 * One byte per grid point holding both the phase and the density: 0.5 is the
 * iso level, values above it are positive psi and below it negative, and the
 * distance from 0.5 is the density on a log scale between the iso level and the
 * orbital's peak. That is everything the cut-away face needs to shade itself,
 * in a form a plain 8-bit 3D texture can carry.
 *
 * Samples run z-fastest: index = (x * side + y) * side + z.
 */
export interface DensityMap {
    data: Uint8Array;
    /** Points per axis — one more than the cell resolution. */
    side: number;
    /** Half-width of the sampled box, in Bohr radii. */
    rMax: number;
}

// Add MeshData interface since it's used but not defined
export interface MeshData {
    positions: number[][];
    cells: number[][];
    psiSigns: number[]; // Include ψ signs in the mesh data
    densityMap: DensityMap;
    /** The density contour actually used, derived from `enclosedFraction`. */
    isoLevel: number;
}
