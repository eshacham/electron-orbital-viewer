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

    // Fix round 1, M1: a hole in the data must fail the whole export, not
    // write a blank cell -- "failures are shown, not hidden".
    it('refuses a non-finite value, naming the curve and the radius', () => {
        expect(() => radialCurvesToCsv([
            { label: '2p_z', points: [{ r: 0.5, value: 0.25 }, { r: 1, value: NaN }] },
        ], [])).toThrow(/"2p_z".*r = 1/);
        expect(() => radialCurvesToCsv([
            { label: '2p_z', points: [{ r: 0.5, value: Infinity }] },
        ], [])).toThrow(/"2p_z".*r = 0.5/);
    });

    // Fix round 1, M2: a lone \r (not part of a \n pair) must be quoted too,
    // and a quote character in a label must be doubled per RFC 4180.
    it('quotes a label containing a quote character or a bare \\r', () => {
        const csv = radialCurvesToCsv([
            { label: '2p "z"', points: [{ r: 1, value: 0 }] },
            { label: 'a\rb', points: [{ r: 1, value: 0 }] },
        ], []);
        expect(csv.split('\n')[0]).toBe('r_bohr,"2p ""z""","a\rb"');
    });
});
