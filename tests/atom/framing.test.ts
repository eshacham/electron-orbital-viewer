import { framingRadiusFor, outermostFeatureRadius, wholeAtomFramingRadius } from '../../src/atom/framing';

describe('whole-atom framing', () => {
    it('frames on 2.5x the outermost feature, never past the drawn sphere', () => {
        expect(framingRadiusFor(1.764, 0.5716)).toBeCloseTo(1.429, 12);
        expect(framingRadiusFor(1.944, 3)).toBe(1.944);
        expect(framingRadiusFor(2, undefined)).toBe(2);
        expect(framingRadiusFor(2, 0)).toBe(2);
    });

    it('takes the further of the last resolved peak and the valence peak', () => {
        expect(outermostFeatureRadius([0.1, 0.6], 3.1)).toBe(3.1);
        expect(outermostFeatureRadius(new Float64Array([0.1, 1.2]), 0.9)).toBe(1.2);
        expect(outermostFeatureRadius([], 0.5)).toBe(0.5);
    });

    // He: its own view is framed inside its drawn sphere (1.429 < 1.764), so
    // a floor at the drawn radius would pull He⁺'s camera out by ~23 %.
    it('is the radius a neutral atom\'s own view is framed on', () => {
        const he = { displayRadius: 1.764, shellPeaks: [0.5716], valencePeakRadius: 0.5716 };
        expect(wholeAtomFramingRadius(he)).toBeCloseTo(1.429, 12);
    });
});
