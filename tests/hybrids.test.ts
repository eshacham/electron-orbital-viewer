import {
    HYBRID_DIRECTIONS, HybridKind, hybridCount, hybridRecipe, hybridSource, hybridLobeAngleDegrees,
} from '../src/hybrids';
import { sampleFieldSource, SampledField } from '../src/orbital_mesh';
import { overlapIntegral, positiveLobeCentroid, positiveShare, angleBetweenDegrees } from '../src/field_integrals';
import { ORBITAL_RESOLUTION, computeSamplingRadius, combinationSamplingRadius } from '../src/orbital_presets';
import { VALIDATION } from '../src/validation/references';

const KINDS: HybridKind[] = ['sp', 'sp2', 'sp3'];
const EXPECTED_ANGLE: Record<HybridKind, number> = { sp: 180, sp2: 120, sp3: (Math.acos(-1 / 3) * 180) / Math.PI };

// Sampled once on the app's own render grid (129³ over ±21 a0): "orthonormal
// on the sampling grid" is a statement about exactly these samples.
const sampled: Partial<Record<HybridKind, SampledField[]>> = {};
beforeAll(() => {
    for (const kind of KINDS) {
        sampled[kind] = Array.from({ length: hybridCount(kind) }, (_, i) => sampleFieldSource(hybridSource(kind, i), ORBITAL_RESOLUTION));
    }
}, 60_000);

describe('hybrid recipes', () => {
    it('sizes the box to hold every orbital of the shell', () => {
        expect(combinationSamplingRadius(2)).toBe(Math.max(computeSamplingRadius(2, 0, 1), computeSamplingRadius(2, 1, 1)));
        expect(combinationSamplingRadius(1)).toBe(computeSamplingRadius(1, 0, 1));
    });

    it('builds sp³ h1 as (-2s + 2px + 2py + 2pz) / 2', () => {
        const terms = hybridRecipe('sp3', 0).terms.map(t => [t.orbital.l, t.orbital.ml, t.coefficient]);
        expect(terms).toEqual([[0, 0, -0.5], [1, 1, expect.closeTo(0.5, 12)], [1, -1, expect.closeTo(0.5, 12)], [1, 0, expect.closeTo(0.5, 12)]]);
    });

    it.each(KINDS)('gives every %s hybrid unit weight', kind => {
        for (let i = 0; i < hybridCount(kind); i++) {
            const weight = hybridRecipe(kind, i).terms.reduce((sum, t) => sum + t.coefficient ** 2, 0);
            expect(weight).toBeCloseTo(1, 12);
        }
    });

    it('names each hybrid stably', () => {
        expect(hybridSource('sp3', 2)).toMatchObject({ kind: 'analytic', id: 'hybrid:sp3:2', rMax: combinationSamplingRadius(2) });
    });
});

describe('hybrids on the sampling grid', () => {
    it.each(KINDS)('%s hybrids are orthonormal to 1e-3', kind => {
        const fields = sampled[kind]!;
        for (let i = 0; i < fields.length; i++) {
            for (let j = 0; j < fields.length; j++) {
                expect(Math.abs(overlapIntegral(fields[i], fields[j]) - (i === j ? 1 : 0))).toBeLessThan(1e-3);
            }
        }
    });

    it.each(KINDS)('every pair of %s lobes meets at the textbook angle, within 0.5°', kind => {
        const axes = sampled[kind]!.map(positiveLobeCentroid);
        for (let i = 0; i < axes.length; i++) {
            for (let j = i + 1; j < axes.length; j++) {
                expect(Math.abs(angleBetweenDegrees(axes[i], axes[j]) - EXPECTED_ANGLE[kind])).toBeLessThan(0.5);
            }
        }
    });

    it.each(KINDS)('each %s lobe points along its stated direction', kind => {
        sampled[kind]!.forEach((field, i) => {
            expect(angleBetweenDegrees(positiveLobeCentroid(field), HYBRID_DIRECTIONS[kind][i])).toBeLessThan(0.5);
        });
    });

    // Why the 2s enters with a minus sign: this is the lobe that carries the density.
    it.each(KINDS)('the positive %s lobe holds most of the electron', kind => {
        for (const field of sampled[kind]!) expect(positiveShare(field)).toBeGreaterThan(0.8);
    });
});

describe('validation row', () => {
    it('records the sp³ angle from the same computation the tests assert', () => {
        const row = VALIDATION.find(r => r.phase === 1 && r.quantity === 'inter-lobe angle');
        expect(row).toBeDefined();
        expect(row!.app).toBe(hybridLobeAngleDegrees('sp3', 0, 1));
        expect(row!.reference).toBeCloseTo(109.4712, 4);
    });
});
