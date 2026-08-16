import { DensityMap, MeshData, OrbitalParams } from './types/orbital';
import { makeWaveFunctionEvaluator } from './quantum_functions';
import { marchingCubes } from './marching_cubes';
import { isoLevelForEnclosedFraction } from './radial_distribution';

/**
 * Packs the sampled wave function into one byte per grid point.
 *
 * The cut-away face shades itself from this, so it has to carry both the phase
 * and the density. 0.5 is the iso level; above it is positive psi, below it
 * negative, and the distance from 0.5 is how far the density has climbed from
 * the iso level towards the orbital's peak.
 *
 * That climb is measured on a log scale: between the iso level and the peak the
 * density spans several orders of magnitude, and a linear ramp would leave the
 * whole face flat except for a pinpoint at the nucleus.
 */
export function encodeDensityMap(psi: Float32Array, isoLevel: number): Uint8Array {
    let peak = 0;
    for (let i = 0; i < psi.length; i++) {
        const density = psi[i] * psi[i];
        if (density > peak) peak = density;
    }

    const encoded = new Uint8Array(psi.length);
    const range = Math.log(peak / isoLevel);
    // Everything is at or below the iso level: nothing is visible anyway.
    if (!(range > 0)) return encoded.fill(128);

    for (let i = 0; i < psi.length; i++) {
        const value = psi[i];
        const density = value * value;
        const climb = density <= isoLevel
            ? 0
            : Math.min(1, Math.log(density / isoLevel) / range);
        const signed = value >= 0 ? climb : -climb;
        // Centred on 128 rather than 127.5, so the two phases encode to exactly
        // mirrored distances from the midpoint.
        encoded[i] = 128 + Math.round(signed * 127);
    }
    return encoded;
}

/**
 * Builds the isosurface mesh for an orbital.
 *
 * psi is sampled once per point of a regular grid over [-rMax, rMax]^3. The
 * contour to draw is then chosen from those samples: `enclosedFraction` says how
 * much of the electron the surface should hold, and the density threshold that
 * achieves it falls out of the sampled distribution. The samples are kept and
 * handed back as a density map, so the cut-away face can be shaded without
 * evaluating the wave function a second time.
 */
export function generateOrbitalMesh(params: OrbitalParams): MeshData {
    const { n, l, ml, Z, resolution, rMax, enclosedFraction } = params;

    if (resolution <= 0 || rMax <= 0) {
        throw new Error('Invalid parameters: resolution and rMax must be positive');
    }
    if (!Number.isInteger(resolution)) {
        throw new Error('Invalid parameters: resolution must be a whole number');
    }
    if (!(enclosedFraction > 0) || enclosedFraction >= 1) {
        throw new Error('Invalid parameters: enclosedFraction must be between 0 and 1');
    }

    const evaluatePsi = makeWaveFunctionEvaluator(n, l, ml, Z);

    const side = resolution + 1;
    const step = (2 * rMax) / resolution;
    const origin = -rMax;

    const samples = new Float32Array(side * side * side);

    let index = 0;
    for (let i = 0; i < side; i++) {
        const x = origin + i * step;
        for (let j = 0; j < side; j++) {
            const y = origin + j * step;
            for (let k = 0; k < side; k++) {
                samples[index++] = evaluatePsi(x, y, origin + k * step);
            }
        }
    }

    const isoLevel = isoLevelForEnclosedFraction(samples, enclosedFraction);
    if (!(isoLevel > 0)) {
        throw new Error('No isosurface for this orbital');
    }

    // Meshing needs float64: near the surface |psi|^2 and isoLevel are within a
    // rounding error of each other, and their difference decides the sign.
    const field = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        field[i] = samples[i] * samples[i] - isoLevel;
    }

    const mesh = marchingCubes(resolution, field, origin, step);

    if (!mesh.positions.length || !mesh.cells.length) {
        throw new Error('No isosurface for this orbital');
    }

    // Sign of psi at the vertex itself. Taking it from the nearest grid sample
    // instead would miscolour vertices that sit across a nodal surface from
    // that sample, which is exactly where the two phases meet.
    const psiSigns = mesh.positions.map(([x, y, z]) => (evaluatePsi(x, y, z) >= 0 ? 1 : -1));

    const densityMap: DensityMap = {
        data: encodeDensityMap(samples, isoLevel),
        side,
        rMax,
    };

    return { positions: mesh.positions, cells: mesh.cells, psiSigns, densityMap, isoLevel };
}
