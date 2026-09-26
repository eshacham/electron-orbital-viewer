import { makeFieldEvaluator, hydrogenicSource, fieldProblem, MAX_FIELD_AU, HydrogenicRecipe } from '../src/field_source';
import { makeWaveFunctionEvaluator, radialWaveFunction } from '../src/quantum_functions';

const POINTS: Array<[number, number, number]> = [[0.3, -0.4, 1.2], [2, 1, -1.5], [-3, 0.5, 0.2], [0, 0, 4]];
const hydrogenic = (n: number, l: number, ml: number): HydrogenicRecipe => ({ type: 'hydrogenic', n, l, ml, Z: 1 });

describe('makeFieldEvaluator', () => {
    it('evaluates a hydrogenic recipe exactly as makeWaveFunctionEvaluator does', () => {
        const field = makeFieldEvaluator(hydrogenic(3, 2, -1));
        const reference = makeWaveFunctionEvaluator(3, 2, -1, 1);
        for (const [x, y, z] of POINTS) expect(field(x, y, z)).toBe(reference(x, y, z));
    });

    it('uses a numerical R(r) when the recipe carries one', () => {
        const rMin = 1e-4, dx = 0.01, size = 1501;
        const R = Float64Array.from({ length: size }, (_, j) => radialWaveFunction(2, 0, rMin * Math.exp(j * dx), 1));
        const field = makeFieldEvaluator({ ...hydrogenic(2, 0, 0), radialSamples: { R, rMin, dx, size } });
        const reference = makeWaveFunctionEvaluator(2, 0, 0, 1);
        for (const [x, y, z] of POINTS) {
            expect(Math.abs(field(x, y, z) - reference(x, y, z))).toBeLessThan(1e-4 * Math.abs(reference(x, y, z)) + 1e-12);
        }
    });

    it('sums a combination term by term', () => {
        const field = makeFieldEvaluator({ type: 'combination', terms: [
            { coefficient: 0.6, orbital: hydrogenic(2, 0, 0) },
            { coefficient: -0.8, orbital: hydrogenic(2, 1, 0) },
        ] });
        const s = makeWaveFunctionEvaluator(2, 0, 0, 1);
        const pz = makeWaveFunctionEvaluator(2, 1, 0, 1);
        for (const [x, y, z] of POINTS) expect(field(x, y, z)).toBeCloseTo(0.6 * s(x, y, z) - 0.8 * pz(x, y, z), 14);
    });

    it('refuses an empty combination', () => {
        expect(() => makeFieldEvaluator({ type: 'combination', terms: [] })).toThrow(/at least one term/);
    });

    it('draws the first-order polarised 1s, psi = psi1s (1 - F z (1 + r/2))', () => {
        const unperturbed = makeFieldEvaluator({ type: 'polarized1s', field: 0 });
        const oneS = makeWaveFunctionEvaluator(1, 0, 0, 1);
        for (const [x, y, z] of POINTS) expect(unperturbed(x, y, z)).toBeCloseTo(oneS(x, y, z), 14);

        const polarised = makeFieldEvaluator({ type: 'polarized1s', field: 0.05 });
        // (0, 0, 1): r = 1, so the factor is 1 - 0.05 * 1 * 1.5.
        expect(polarised(0, 0, 1)).toBeCloseTo((Math.exp(-1) / Math.sqrt(Math.PI)) * 0.925, 14);
        // The electron is pulled towards -z: more density below than above.
        expect(Math.abs(polarised(0, 0, -2))).toBeGreaterThan(Math.abs(polarised(0, 0, 2)));
    });

    it.each([0.0501, 0.2, -0.001, Number.NaN])('refuses a field of %p a.u.', field => {
        expect(fieldProblem(field)).toMatch(/refused/);
        expect(() => makeFieldEvaluator({ type: 'polarized1s', field })).toThrow(/refused/);
    });

    // Final review: a negative or non-finite field (reachable once Phase 2
    // decodes URLs) is not "too strong"; saying it ionises the atom is wrong.
    it.each([-0.001, Number.NaN, Number.POSITIVE_INFINITY])('says a field of %p a.u. is out of range, not that it ionises', field => {
        expect(fieldProblem(field)).toMatch(/must be between 0 and 0\.05 a\.u\./);
        expect(fieldProblem(field)).not.toMatch(/ionise/);
    });

    it('keeps the ionisation reason for a field that is too strong', () => {
        expect(fieldProblem(0.2)).toMatch(/stronger fields ionise the atom/);
    });

    it('accepts the whole slider range', () => {
        expect(fieldProblem(0)).toBeNull();
        expect(fieldProblem(MAX_FIELD_AU)).toBeNull();
    });
});

describe('hydrogenicSource', () => {
    it('wraps OrbitalParams with a stable id and the same box', () => {
        const source = hydrogenicSource({ n: 2, l: 1, ml: 0, Z: 1, resolution: 64, rMax: 20, enclosedFraction: 0.9 });
        expect(source).toEqual({
            kind: 'analytic', id: 'hydrogenic:2,1,0,Z1', rMax: 20,
            recipe: { type: 'hydrogenic', n: 2, l: 1, ml: 0, Z: 1 },
        });
    });

    it('marks an SCF radial function in the id, so a cache cannot confuse it with the analytic one', () => {
        const radialSamples = { R: new Float64Array(3), rMin: 1e-3, dx: 0.1, size: 3 };
        const source = hydrogenicSource({ n: 2, l: 1, ml: 0, Z: 18, resolution: 64, rMax: 2, enclosedFraction: 0.9, radialSamples });
        expect(source.id).toBe('hydrogenic:2,1,0,Z18:scf');
        expect(source.recipe).toEqual({ type: 'hydrogenic', n: 2, l: 1, ml: 0, Z: 18, radialSamples });
    });
});
