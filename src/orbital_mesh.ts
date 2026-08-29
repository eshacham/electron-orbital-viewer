import { DensityMap, MeshData, OrbitalParams } from './types/orbital';
import { makeWaveFunctionEvaluator } from './quantum_functions';
import { marchingCubes } from './marching_cubes';
import { isoLevelForEnclosedFraction } from './radial_distribution';
import { RadialGrid, interpolateOnGrid } from './atom/radial_grid';

/**
 * Rebuilds the interpolating closure a converged SCF solution's R(r) was
 * flattened into to cross the worker boundary (see `OrbitalParams.radialSamples`).
 *
 * `interpolateOnGrid` only reads `rMin`, `dx` and `size` off its grid
 * argument, so a `RadialGrid`-shaped object is reconstructed here rather than
 * duplicating its interpolation logic (`r` and `rMax` are unused and filled
 * in only to satisfy the type); this is the one place `radialSamples` needs
 * to be turned back into the `(r: number) => number` signature
 * `makeWaveFunctionEvaluator` expects.
 */
function radialOverrideFromSamples(
    samples: NonNullable<OrbitalParams['radialSamples']>
): (r: number) => number {
    const { R, rMin, dx, size } = samples;
    const grid: RadialGrid = { r: new Float64Array(0), dx, size, rMin, rMax: rMin * Math.exp((size - 1) * dx) };
    return (r: number) => interpolateOnGrid(grid, R, r);
}

/**
 * The density that anchors the top of the log-scale climb below (see
 * `encodeDensityMap`), robust to a single isolated grid point outweighing
 * every shell that is actually visible.
 *
 * An s orbital (l = 0) is nonzero at the nucleus, and for a high-n Rydberg
 * state that single point can be two-plus orders of magnitude denser than
 * any of the orbital's own shells -- a 7s samples 0.00093 at r = 0 against
 * 0.0000039 at its next-highest shell, a 240x gap. That one grid point
 * encloses essentially no volume, but taking the raw maximum as "the peak"
 * still hands it the top of the ramp, and the log scale in encodeDensityMap
 * only compresses the *span* of climb values -- it does nothing about where
 * that span's own ceiling sits. With the nucleus pinned to climb = 1, every
 * shell that actually has volume is squeezed into the bottom third of the
 * ramp: the cut face reads as flat colour rather than the concentric shells
 * described in the README's "tree rings" case (7s, cut away).
 *
 * The fix is to require the peak to be supported by more than a literal
 * handful of samples. `MIN_SUPPORT_FRACTION` of the grid is a small share --
 * for the default 65^3 grid that is already dozens of samples -- so an
 * isolated point of arbitrary density cannot set the ceiling on its own, but
 * a real shell (which spans a whole neighbourhood of grid points) still can.
 * Below that many samples (any small input, in particular every existing
 * test's tiny arrays) this returns the exact maximum, unchanged from before.
 *
 * Found via the log-density histogram already used by
 * `isoLevelForEnclosedFraction` (radial_distribution.ts) rather than a sort,
 * for the same reason that one avoids sorting millions of samples: one O(n)
 * pass to bin, one to walk down from the top bin until enough samples are
 * accounted for.
 */
const MIN_SUPPORT_FRACTION = 1e-4;

function robustPeakDensity(psi: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < psi.length; i++) {
        const density = psi[i] * psi[i];
        if (density > peak) peak = density;
    }
    if (!(peak > 0)) return peak;

    const support = Math.max(1, Math.round(psi.length * MIN_SUPPORT_FRACTION));
    if (support <= 1) return peak;

    const BINS = 4096;
    const DECADES = 12;
    const logPeak = Math.log10(peak);
    const counts = new Uint32Array(BINS);

    for (let i = 0; i < psi.length; i++) {
        const density = psi[i] * psi[i];
        if (density <= 0) continue;
        const depth = (logPeak - Math.log10(density)) / DECADES;   // 0 at the peak
        if (depth >= 1) continue;   // fainter than the range covers; never the peak's neighbourhood
        counts[Math.min(BINS - 1, Math.floor(depth * BINS))]++;
    }

    let seen = 0;
    for (let bin = 0; bin < BINS; bin++) {
        seen += counts[bin];
        if (seen >= support) {
            // Lower edge of this bin: everything denser than it is the peak's
            // supported neighbourhood.
            const depth = (bin + 1) / BINS;
            return peak * Math.pow(10, -depth * DECADES);
        }
    }
    return peak;
}

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
 * whole face flat except for a pinpoint at the nucleus. "The peak" itself comes
 * from `robustPeakDensity` above rather than a plain maximum, for the same
 * flat-face failure mode one order of compression further out.
 */
export function encodeDensityMap(psi: Float32Array, isoLevel: number): Uint8Array {
    const peak = robustPeakDensity(psi);

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
    const { n, l, ml, Z, resolution, rMax, enclosedFraction, radialSamples } = params;

    if (resolution <= 0 || rMax <= 0) {
        throw new Error('Invalid parameters: resolution and rMax must be positive');
    }
    if (!Number.isInteger(resolution)) {
        throw new Error('Invalid parameters: resolution must be a whole number');
    }
    if (!(enclosedFraction > 0) || enclosedFraction >= 1) {
        throw new Error('Invalid parameters: enclosedFraction must be between 0 and 1');
    }

    const evaluatePsi = makeWaveFunctionEvaluator(
        n, l, ml, Z,
        radialSamples ? radialOverrideFromSamples(radialSamples) : undefined
    );

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
