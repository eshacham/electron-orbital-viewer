import { DensityMap, MeshData, OrbitalParams } from './types/orbital';
import { marchingCubes } from './marching_cubes';
import { isoLevelForEnclosedFraction } from './radial_distribution';
import {
    AnalyticFieldSource, FieldEvaluator, FieldSource, GridFieldSource,
    hydrogenicSource, makeFieldEvaluator,
} from './field_source';

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

/** ψ sampled on a regular cube, z-fastest: index = (i * side + j) * side + k. */
export interface SampledField {
    samples: Float32Array;
    side: number;
    step: number;
    /** World coordinate of grid point 0 on every axis. */
    origin: number;
}

function checkBox(resolution: number, rMax: number): void {
    if (resolution <= 0 || rMax <= 0) {
        throw new Error('Invalid parameters: resolution and rMax must be positive');
    }
    if (!Number.isInteger(resolution)) {
        throw new Error('Invalid parameters: resolution must be a whole number');
    }
}

function checkFraction(enclosedFraction: number): void {
    if (!(enclosedFraction > 0) || enclosedFraction >= 1) {
        throw new Error('Invalid parameters: enclosedFraction must be between 0 and 1');
    }
}

export function sampleEvaluator(evaluate: FieldEvaluator, rMax: number, resolution: number): SampledField {
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
                samples[index++] = evaluate(x, y, origin + k * step);
            }
        }
    }
    return { samples, side, step, origin };
}

export function sampleFieldSource(source: AnalyticFieldSource, resolution: number): SampledField {
    checkBox(resolution, source.rMax);
    return sampleEvaluator(makeFieldEvaluator(source.recipe), source.rMax, resolution);
}

/**
 * The contour and its mesh, from samples already taken.
 *
 * The contour to draw is chosen from the samples: `enclosedFraction` says how
 * much of the electron the surface should hold, and the density threshold that
 * achieves it falls out of the sampled distribution. The samples are handed
 * back as a density map, so the cut-away face is shaded without evaluating
 * the field a second time. `signAt` colours each vertex by the sign of ψ at
 * the vertex itself: taken from the nearest sample instead, vertices across a
 * nodal surface from that sample would be miscoloured, exactly where the two
 * phases meet.
 */
export function meshFromSamples(field: SampledField, enclosedFraction: number, signAt: FieldEvaluator): MeshData {
    const { samples, side, step, origin } = field;
    const isoLevel = isoLevelForEnclosedFraction(samples, enclosedFraction);
    if (!(isoLevel > 0)) {
        throw new Error('No isosurface for this orbital');
    }

    // Meshing needs float64: near the surface |psi|^2 and isoLevel are within a
    // rounding error of each other, and their difference decides the sign.
    const values = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        values[i] = samples[i] * samples[i] - isoLevel;
    }

    const mesh = marchingCubes(side - 1, values, origin, step);
    if (!mesh.positions.length || !mesh.cells.length) {
        throw new Error('No isosurface for this orbital');
    }

    const psiSigns = mesh.positions.map(([x, y, z]) => (signAt(x, y, z) >= 0 ? 1 : -1));
    const densityMap: DensityMap = { data: encodeDensityMap(samples, isoLevel), side, rMax: -origin };
    return { positions: mesh.positions, cells: mesh.cells, psiSigns, densityMap, isoLevel };
}

const GRID_SHAPE_MESSAGE =
    'Grid field sources must be a centred cube: the same number of points on every axis, origin at minus half the width';

/**
 * A grid source as samples the mesher understands. A density grid is carried
 * as √ρ so the enclosed-fraction search, which squares its input, sees ρ
 * itself; its vertices are all "positive", there being no phase to show.
 */
function gridAsSampledField(source: GridFieldSource, resolution: number): SampledField {
    const [side, ny, nz] = source.shape;
    if (ny !== side || nz !== side || side < 2 || !(source.spacing > 0)) throw new Error(GRID_SHAPE_MESSAGE);
    const halfWidth = ((side - 1) * source.spacing) / 2;
    if (source.origin.some(o => Math.abs(o + halfWidth) > 1e-6 * halfWidth)) throw new Error(GRID_SHAPE_MESSAGE);
    if (source.values.length !== side ** 3) {
        throw new Error(`Grid field source ${source.id}: expected ${side ** 3} values, got ${source.values.length}`);
    }
    if (resolution !== side - 1) {
        throw new Error(`Invalid parameters: resolution must be ${side - 1} for grid ${source.id} (its own shape)`);
    }
    const samples = source.quantity === 'density'
        ? Float32Array.from(source.values, v => Math.sqrt(Math.max(0, v)))
        : source.values;
    return { samples, side, step: source.spacing, origin: -halfWidth };
}

/** Trilinear interpolation of a sampled field, clamped to the box. */
function interpolateSample(field: SampledField, x: number, y: number, z: number): number {
    const { samples, side, step, origin } = field;
    const cell = (c: number): [number, number] => {
        const t = (c - origin) / step;
        const i = Math.min(side - 2, Math.max(0, Math.floor(t)));
        return [i, Math.min(1, Math.max(0, t - i))];
    };
    const [i, fx] = cell(x);
    const [j, fy] = cell(y);
    const [k, fz] = cell(z);
    const at = (a: number, b: number, c: number) => samples[((i + a) * side + (j + b)) * side + (k + c)];
    const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
    return lerp(
        lerp(lerp(at(0, 0, 0), at(0, 0, 1), fz), lerp(at(0, 1, 0), at(0, 1, 1), fz), fy),
        lerp(lerp(at(1, 0, 0), at(1, 0, 1), fz), lerp(at(1, 1, 0), at(1, 1, 1), fz), fy),
        fx
    );
}

/**
 * The isosurface of any field source (spec §4.1). An analytic source is
 * sampled once per point of a (resolution + 1)³ grid over its box; a grid
 * source is meshed on its own grid.
 */
export function generateFieldMesh(source: FieldSource, resolution: number, enclosedFraction: number): MeshData {
    if (source.kind === 'grid') {
        const field = gridAsSampledField(source, resolution);
        checkFraction(enclosedFraction);
        const signAt: FieldEvaluator = source.quantity === 'density'
            ? () => 1
            : (x, y, z) => interpolateSample(field, x, y, z);
        return meshFromSamples(field, enclosedFraction, signAt);
    }
    checkBox(resolution, source.rMax);
    checkFraction(enclosedFraction);
    const evaluate = makeFieldEvaluator(source.recipe);
    return meshFromSamples(sampleEvaluator(evaluate, source.rMax, resolution), enclosedFraction, evaluate);
}

/** One orbital's isosurface; unchanged behaviour, now a field source like any other. */
export function generateOrbitalMesh(params: OrbitalParams): MeshData {
    return generateFieldMesh(hydrogenicSource(params), params.resolution, params.enclosedFraction);
}
