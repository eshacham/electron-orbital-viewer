import { radialWaveFunction } from './quantum_functions';

/**
 * The radial distribution function, P(r) = r^2 * R_nl(r)^2.
 *
 * This is where the shell structure of an orbital actually lives: P(r) dr is the
 * probability of finding the electron between r and r + dr in any direction, so
 * its peaks are the shells and its zeros are the radial nodes. It integrates to
 * 1 over all r, which also makes it the natural way to size the sampling box
 * without reference to any iso level.
 */

export interface RadialPoint {
    r: number;
    /** r^2 * R(r)^2, in units where the integral over all r is 1. */
    probability: number;
}

/** Samples P(r) over [0, rMax] for plotting. */
export function radialProfile(
    n: number,
    l: number,
    Z: number,
    rMax: number,
    samples: number = 240
): RadialPoint[] {
    const points: RadialPoint[] = [];
    for (let i = 0; i <= samples; i++) {
        const r = (rMax * i) / samples;
        const radial = radialWaveFunction(n, l, r, Z);
        points.push({ r, probability: r * r * radial * radial });
    }
    return points;
}

/**
 * The radius enclosing a given fraction of the electron, integrating P(r)
 * outward from the nucleus.
 *
 * Used to size the sampling box. Because P(r) is independent of direction, this
 * bounds the orbital in every direction at once, and needs no iso level — which
 * is what lets the iso level be derived from the samples rather than the other
 * way round.
 */
export function radiusContaining(n: number, l: number, Z: number, fraction: number): number {
    // Orbitals scale as n^2 / Z; go well past that and integrate inward-out.
    const scale = (n * n) / Z;
    const limit = 60 * scale + 20;
    const step = scale / 400;

    let total = 0;
    const strip: number[] = [];
    for (let r = 0; r <= limit; r += step) {
        const radial = radialWaveFunction(n, l, r, Z);
        const p = r * r * radial * radial * step;
        strip.push(p);
        total += p;
    }
    if (!(total > 0)) return limit;

    const target = fraction * total;
    let running = 0;
    for (let i = 0; i < strip.length; i++) {
        running += strip[i];
        if (running >= target) return i * step;
    }
    return limit;
}

/**
 * The density contour that encloses a given fraction of the electron.
 *
 * "Iso level 7e-7" says nothing about how much of the electron you are looking
 * at, and the same number means different things for different orbitals. This
 * inverts it: given the sampled field, find the density threshold whose region
 * holds the requested share of the total.
 *
 * Sorting two million samples would cost more than the render itself, so this
 * bins them by log density and walks down from the densest bin. The bins are
 * fine enough that the threshold is well inside the accuracy of the grid it came
 * from.
 *
 * The fraction is of the density present in the sampled box, not of an infinite
 * integral; the box is sized to hold essentially all of it. Cell volume does not
 * appear because the grid is uniform, so it cancels out of the ratio.
 */
export function isoLevelForEnclosedFraction(
    psiSamples: Float32Array,
    fraction: number
): number {
    let peak = 0;
    let total = 0;
    for (let i = 0; i < psiSamples.length; i++) {
        const density = psiSamples[i] * psiSamples[i];
        total += density;
        if (density > peak) peak = density;
    }
    if (!(peak > 0) || !(total > 0)) return 0;

    // Twelve decades below the peak covers everything that contributes.
    const BINS = 4096;
    const DECADES = 12;
    const logPeak = Math.log10(peak);
    const bins = new Float64Array(BINS);

    for (let i = 0; i < psiSamples.length; i++) {
        const density = psiSamples[i] * psiSamples[i];
        if (density <= 0) continue;
        const depth = (logPeak - Math.log10(density)) / DECADES;   // 0 at the peak
        if (depth >= 1) continue;   // fainter than the range covers; never enclosed first
        bins[Math.min(BINS - 1, Math.floor(depth * BINS))] += density;
    }

    const target = fraction * total;
    let running = 0;
    for (let bin = 0; bin < BINS; bin++) {
        running += bins[bin];
        if (running >= target) {
            // Lower edge of this bin: everything denser than it is included.
            const depth = (bin + 1) / BINS;
            return Math.pow(10, logPeak - depth * DECADES);
        }
    }

    // The requested fraction needs more than the box holds; take the faintest bin.
    return Math.pow(10, logPeak - DECADES);
}
