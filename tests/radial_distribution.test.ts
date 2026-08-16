import {
    radialProfile,
    radiusContaining,
    isoLevelForEnclosedFraction,
} from '../src/radial_distribution';
import { makeWaveFunctionEvaluator, radialWaveFunction } from '../src/quantum_functions';

describe('radialProfile', () => {
    it('starts at zero, since the r² factor kills the nucleus', () => {
        expect(radialProfile(1, 0, 1, 10)[0].probability).toBe(0);
    });

    // P(r) for 1s peaks at exactly one Bohr radius: the textbook result.
    it('peaks at 1 a₀ for hydrogen 1s', () => {
        const profile = radialProfile(1, 0, 1, 6, 600);
        const peak = profile.reduce((best, p) => (p.probability > best.probability ? p : best));
        expect(peak.r).toBeCloseTo(1, 1);
    });

    it('peaks at 1/Z a₀ for a hydrogen-like ion', () => {
        const profile = radialProfile(1, 0, 6, 3, 600);
        const peak = profile.reduce((best, p) => (p.probability > best.probability ? p : best));
        expect(peak.r).toBeCloseTo(1 / 6, 1);
    });

    // n - l peaks: the shells. This is the feature the plot exists to show, and
    // counting maxima is robust in a way that hunting for exact zeros is not —
    // a node is a single point that a finite sampling almost never lands on.
    it.each([
        [1, 0, 1], [2, 0, 2], [3, 0, 3], [2, 1, 1], [3, 1, 2], [3, 2, 1], [4, 1, 3], [4, 3, 1],
    ])('shows n-l shells for n=%i l=%i', (n, l, expectedPeaks) => {
        const profile = radialProfile(n, l, 1, radiusContaining(n, l, 1, 0.9999), 4000);
        let peaks = 0;
        for (let i = 1; i < profile.length - 1; i++) {
            if (profile[i].probability > profile[i - 1].probability
                && profile[i].probability > profile[i + 1].probability) peaks++;
        }
        expect(peaks).toBe(expectedPeaks);
    });

    // The nodes themselves are where the radial function changes sign.
    it.each([
        [1, 0, 0], [2, 0, 1], [3, 0, 2], [2, 1, 0], [3, 1, 1], [4, 1, 2], [4, 3, 0],
    ])('has n-l-1 radial nodes for n=%i l=%i', (n, l, expectedNodes) => {
        const limit = radiusContaining(n, l, 1, 0.9999);
        let changes = 0;
        let previous = Math.sign(radialWaveFunction(n, l, limit / 8000, 1));
        for (let i = 2; i <= 8000; i++) {
            const sign = Math.sign(radialWaveFunction(n, l, (limit * i) / 8000, 1));
            if (sign !== 0 && sign !== previous) { changes++; previous = sign; }
        }
        expect(changes).toBe(expectedNodes);
    });
});

describe('radiusContaining', () => {
    it('grows with the fraction requested', () => {
        const half = radiusContaining(3, 1, 1, 0.5);
        const most = radiusContaining(3, 1, 1, 0.99);
        expect(most).toBeGreaterThan(half);
    });

    it('shrinks as 1/Z', () => {
        const hydrogen = radiusContaining(3, 2, 1, 0.99);
        const carbon = radiusContaining(3, 2, 6, 0.99);
        expect(carbon).toBeLessThan(hydrogen);
        expect(carbon * 6).toBeCloseTo(hydrogen, 0);
    });

    it('grows roughly as n² for a given l', () => {
        const small = radiusContaining(2, 1, 1, 0.99);
        const large = radiusContaining(6, 1, 1, 0.99);
        expect(large / small).toBeGreaterThan(5);
    });

    // 90% of hydrogen 1s is inside about 2.7 a₀.
    it('matches the known 1s figure', () => {
        expect(radiusContaining(1, 0, 1, 0.9)).toBeCloseTo(2.66, 0);
    });
});

describe('isoLevelForEnclosedFraction', () => {
    /** Samples psi on a grid, the way the mesher does. */
    const sampleGrid = (n: number, l: number, ml: number, rMax: number, res: number) => {
        const psi = makeWaveFunctionEvaluator(n, l, ml, 1);
        const side = res + 1;
        const step = (2 * rMax) / res;
        const out = new Float32Array(side * side * side);
        let i = 0;
        for (let a = 0; a < side; a++)
            for (let b = 0; b < side; b++)
                for (let c = 0; c < side; c++)
                    out[i++] = psi(-rMax + a * step, -rMax + b * step, -rMax + c * step);
        return out;
    };

    /** What fraction of the sampled density sits at or above a threshold. */
    const enclosedAt = (samples: Float32Array, iso: number) => {
        let inside = 0, total = 0;
        for (let i = 0; i < samples.length; i++) {
            const d = samples[i] * samples[i];
            total += d;
            if (d >= iso) inside += d;
        }
        return inside / total;
    };

    it.each([0.5, 0.75, 0.9, 0.95, 0.99])('returns the contour enclosing %p of the electron', fraction => {
        const samples = sampleGrid(3, 2, 0, radiusContaining(3, 2, 1, 0.9999), 48);
        const iso = isoLevelForEnclosedFraction(samples, fraction);

        expect(iso).toBeGreaterThan(0);
        expect(enclosedAt(samples, iso)).toBeCloseTo(fraction, 2);
    });

    it('asks for a lower contour when more of the electron is wanted', () => {
        const samples = sampleGrid(2, 1, 0, radiusContaining(2, 1, 1, 0.9999), 48);
        const tight = isoLevelForEnclosedFraction(samples, 0.5);
        const loose = isoLevelForEnclosedFraction(samples, 0.95);
        expect(loose).toBeLessThan(tight);
    });

    it('works across orbitals whose densities differ by orders of magnitude', () => {
        for (const [n, l, ml] of [[1, 0, 0], [4, 3, 0], [9, 8, 8]] as number[][]) {
            const samples = sampleGrid(n, l, ml, radiusContaining(n, l, 1, 0.9999), 40);
            const iso = isoLevelForEnclosedFraction(samples, 0.9);
            expect(enclosedAt(samples, iso)).toBeCloseTo(0.9, 2);
        }
    });

    it('gives nothing for an empty field', () => {
        expect(isoLevelForEnclosedFraction(new Float32Array(64), 0.9)).toBe(0);
    });
});
