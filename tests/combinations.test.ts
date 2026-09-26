import {
    NO_COMBINATION, OVERLAY_COLORS, fieldRequestFor, combinationTitle, combinationCurves, overlayLegend,
    selectionProblem, samePicture, CombinationSelection,
} from '../src/combinations';
import { ORBITAL_RESOLUTION, OVERLAY_RESOLUTION, combinationSamplingRadius, basicOrbitalParams, computeSamplingRadius } from '../src/orbital_presets';
import { CURVE_COLORS } from '../src/curve_colors';

const sp3All: CombinationSelection = { kind: 'hybrid', hybrid: 'sp3', member: 'all' };
const field = (level: 1 | 2, F: number, stark: 'lower' | 'upper' | 'both' = 'lower'): CombinationSelection =>
    ({ kind: 'field', level, field: F, stark });

describe('fieldRequestFor', () => {
    it('asks for nothing when no combination is chosen', () => {
        expect(fieldRequestFor(NO_COMBINATION, 0.9)).toBeNull();
    });

    it('overlays every sp³ hybrid in its own colour, at the overlay resolution', () => {
        const request = fieldRequestFor(sp3All, 0.75)!;
        expect(request.sources.map(s => s.id)).toEqual(['hybrid:sp3:0', 'hybrid:sp3:1', 'hybrid:sp3:2', 'hybrid:sp3:3']);
        expect(request.colors).toEqual(OVERLAY_COLORS.slice(0, 4));
        expect(request.resolution).toBe(OVERLAY_RESOLUTION);
        expect(request.enclosedFraction).toBe(0.75);
        expect(request.label).toBe('sp³ hybrids — all 4');
    });

    it('draws one hybrid alone at full resolution', () => {
        const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp2', member: 1 }, 0.9)!;
        expect(request.sources.map(s => s.id)).toEqual(['hybrid:sp2:1']);
        expect(request.resolution).toBe(ORBITAL_RESOLUTION);
    });

    it('draws the polarised 1s at the chosen field', () => {
        const request = fieldRequestFor(field(1, 0.03), 0.9)!;
        expect(request.sources[0]).toMatchObject({ recipe: { type: 'polarized1s', field: 0.03 }, rMax: combinationSamplingRadius(1) });
    });

    it('draws both n = 2 Stark states together', () => {
        expect(fieldRequestFor(field(2, 0.002, 'both'), 0.9)!.sources.map(s => s.id)).toEqual(['stark:n2:lower', 'stark:n2:upper']);
    });

    // Review Focus 3: values that did not come from the UI's own controls.
    it.each<[string, CombinationSelection]>([
        ['a field above 0.05 a.u.', field(1, 0.08)],
        ['an n = 2 field that frees the electron', field(2, 0.01)],
        ['a hybrid that does not exist', { kind: 'hybrid', hybrid: 'sp', member: 2 }],
    ])('refuses %s, with a reason', (_name, selection) => {
        expect(fieldRequestFor(selection, 0.9)).toBeNull();
        expect(selectionProblem(selection)).toMatch(/refused|no hybrid/);
    });
});

// Final review: at n = 2 the Stark shapes do not depend on F, so a new F on
// the slider is the same picture and must not be recomputed.
describe('samePicture', () => {
    const request = (selection: CombinationSelection, fraction = 0.9) => fieldRequestFor(selection, fraction)!;

    it('treats a new n = 2 field as the same picture', () => {
        expect(samePicture(request(field(2, 0.001)), request(field(2, 0.003)))).toBe(true);
    });

    it.each([
        ['another Stark choice', field(2, 0.001, 'both'), 0.9],
        ['another enclosed fraction', field(2, 0.001), 0.75],
        ['another level', field(1, 0.001), 0.9],
    ] as const)('tells %s apart', (_name, other, fraction) => {
        expect(samePicture(request(field(2, 0.001)), request(other, fraction))).toBe(false);
    });

    it('tells a new n = 1 field apart: that shape does depend on F', () => {
        expect(samePicture(request(field(1, 0.01)), request(field(1, 0.02)))).toBe(false);
    });
});

describe('titles and legends', () => {
    it.each<[CombinationSelection, string]>([
        [sp3All, 'sp³ hybrids — all 4'],
        [{ kind: 'hybrid', hybrid: 'sp', member: 1 }, 'sp hybrid h₂'],
        [field(1, 0.03), 'H 1s in a field, F = 0.030 a.u.'],
        [field(2, 0.002, 'lower'), 'n = 2 Stark state (2s + 2p_z)/√2'],
        [field(2, 0.002, 'both'), 'n = 2 Stark states'],
    ])('names %j "%s"', (selection, title) => {
        expect(combinationTitle(selection)).toBe(title);
    });

    it('keys an overlay by member, and has no key for a single source', () => {
        expect(overlayLegend(sp3All)).toEqual(OVERLAY_COLORS.slice(0, 4).map((color, i) => ({ label: `h${'₁₂₃₄'[i]}`, color })));
        expect(overlayLegend(field(2, 0.002, 'both'))!.map(item => item.label)).toEqual(['(2s + 2p_z)/√2, −3F', '(2s − 2p_z)/√2, +3F']);
        expect(overlayLegend({ kind: 'hybrid', hybrid: 'sp3', member: 0 })).toBeNull();
        expect(overlayLegend(field(1, 0.03))).toBeNull();
    });

    it('keeps overlay colours clear of the red and blue that mean the sign of ψ', () => {
        expect(OVERLAY_COLORS).toEqual([CURVE_COLORS[2], CURVE_COLORS[3], CURVE_COLORS[4], CURVE_COLORS[5]]);
    });
});

describe('combinationCurves', () => {
    it('plots 2s, 2p and each sp³ hybrid as exactly ¼·2s + ¾·2p', () => {
        const { curves, rMax } = combinationCurves(sp3All)!;
        expect(rMax).toBe(combinationSamplingRadius(2));
        expect(curves.map(c => c.label)).toEqual(['2s', '2p', 'each hybrid: ¼·2s + ¾·2p']);
        const [s, p, sum] = curves;
        sum.points.forEach((point, i) => expect(point.value).toBeCloseTo(0.25 * s.points[i].value + 0.75 * p.points[i].value, 14));
        let integral = 0;
        for (let i = 1; i < sum.points.length; i++) {
            integral += 0.5 * (sum.points[i].value + sum.points[i - 1].value) * (sum.points[i].r - sum.points[i - 1].r);
        }
        expect(integral).toBeCloseTo(1, 3);
    });

    it('says the 1s radial distribution does not change to first order', () => {
        expect(combinationCurves(field(1, 0.03))!.curves.map(c => c.label)).toEqual(['1s — unchanged to first order in F']);
    });

    it('has nothing to plot for no combination', () => {
        expect(combinationCurves(NO_COMBINATION)).toBeNull();
    });
});

describe('basicOrbitalParams', () => {
    it('is the Basic Orbitals render of one orbital', () => {
        expect(basicOrbitalParams(3, 2, 0, 0.9)).toEqual({
            n: 3, l: 2, ml: 0, Z: 1, resolution: ORBITAL_RESOLUTION, rMax: computeSamplingRadius(3, 2, 1), enclosedFraction: 0.9,
        });
    });
});
