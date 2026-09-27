import { radialCurvesToCsv } from '../../src/export/csv';

describe('radialCurvesToCsv', () => {
    it('writes comments, a header naming each curve, and one row per radius', () => {
        const csv = radialCurvesToCsv([
            { label: '2s', points: [{ r: 0.5, value: 0.25 }, { r: 1, value: 0.125 }] },
            { label: 'n=2, valence', points: [{ r: 0.5, value: 1e-9 }, { r: 1, value: 3 }] },
        ], ['Neon', 'method: x']);
        expect(csv.split('\n')).toEqual(['# Neon', '# method: x', 'r_bohr,2s,"n=2, valence"', '0.5,0.25,1e-9', '1,0.125,3', '']);
    });

    it('refuses curves sampled at different radii, and no curves at all', () => {
        expect(() => radialCurvesToCsv([
            { label: 'a', points: [{ r: 1, value: 0 }] }, { label: 'b', points: [{ r: 2, value: 0 }] },
        ], [])).toThrow(/same radii/);
        expect(() => radialCurvesToCsv([], [])).toThrow(/No curves/);
    });
});
