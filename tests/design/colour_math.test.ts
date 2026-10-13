import { deltaE2000, deltaE76, hexToLab, srgbToLinear } from '../../src/design/colour_math';

describe('colour maths', () => {
    // Sharma, Wu & Dalal (2005), test pairs 1, 2 and 7.
    it.each([
        [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
        [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
        [[50, 0, 0], [50, -1, 2], 2.3669],
    ] as const)('ΔE2000 of %j and %j is %f', (a, b, expected) => {
        expect(deltaE2000([...a], [...b])).toBeCloseTo(expected, 4);
    });

    it('puts white at L* 100 and keeps sRGB pure red linear', () => {
        expect(hexToLab('#FFFFFF')[0]).toBeCloseTo(100, 3);
        expect(srgbToLinear(255)).toBe(1);
        expect(srgbToLinear(0)).toBe(0);
        expect(deltaE76(hexToLab('#000000'), hexToLab('#000000'))).toBe(0);
    });
});
