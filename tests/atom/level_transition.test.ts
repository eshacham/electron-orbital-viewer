import { lerp, clamp01, easeInOutCubic, interpolateCurves } from '../../src/atom/level_transition';

describe('lerp', () => {
    it('is a plain linear interpolation', () => {
        expect(lerp(0, 10, 0)).toBe(0);
        expect(lerp(0, 10, 1)).toBe(10);
        expect(lerp(0, 10, 0.5)).toBe(5);
        expect(lerp(4, 2, 0.25)).toBeCloseTo(3.5);
    });
});

describe('clamp01', () => {
    it('clamps to [0, 1]', () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(0)).toBe(0);
        expect(clamp01(0.5)).toBe(0.5);
        expect(clamp01(1)).toBe(1);
        expect(clamp01(2)).toBe(1);
    });
});

describe('easeInOutCubic', () => {
    it('starts at 0, ends at 1, and passes through the midpoint', () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    });

    it('decelerates into its endpoints rather than moving at a constant rate (spec: no jump-cut feel)', () => {
        // The first tenth of the curve covers less ground than the middle
        // tenth -- the whole point of easing in/out instead of a straight
        // ramp.
        const earlyStep = easeInOutCubic(0.1) - easeInOutCubic(0);
        const midStep = easeInOutCubic(0.55) - easeInOutCubic(0.45);
        expect(earlyStep).toBeLessThan(midStep);
    });

    it('clamps its own input, so a progress fraction outside [0, 1] never overshoots', () => {
        expect(easeInOutCubic(-0.5)).toBe(0);
        expect(easeInOutCubic(1.5)).toBe(1);
    });
});

describe('interpolateCurves', () => {
    const from = new Float32Array([0, 1, 2, 3]);
    const to = new Float32Array([4, 4, 4, 4]);

    it('is exactly the "from" curve at t=0', () => {
        expect(Array.from(interpolateCurves(from, to, 0))).toEqual(Array.from(from));
    });

    it('is exactly the "to" curve at t=1', () => {
        expect(Array.from(interpolateCurves(from, to, 1))).toEqual(Array.from(to));
    });

    it('blends per sample at an intermediate t', () => {
        const result = interpolateCurves(from, to, 0.5);
        expect(Array.from(result)).toEqual([2, 2.5, 3, 3.5]);
    });

    // This is exactly the atom<->shell fade (level-transition spec addendum):
    // interpolating between the whole atom's D(r) and one shell's own D_n(r)
    // is what makes the other shells visually disappear from the cut face.
    it('fades between the whole atom\'s curve and one shell\'s own curve', () => {
        const totalD = new Float32Array([0.1, 0.9, 0.2, 0.1]);
        const shellD = new Float32Array([0.0, 0.05, 1.0, 0.02]);

        const midway = interpolateCurves(totalD, shellD, 0.5);
        for (let i = 0; i < totalD.length; i++) {
            expect(midway[i]).toBeCloseTo((totalD[i] + shellD[i]) / 2);
        }
    });

    it('never reads or writes past the shorter of two differently-sized curves', () => {
        const longer = new Float32Array([1, 2, 3, 4, 5]);
        const shorter = new Float32Array([10, 20]);

        const result = interpolateCurves(longer, shorter, 0.5);
        expect(result.length).toBe(2);
        expect(Array.from(result)).toEqual([5.5, 11]);
    });

    it('returns a fresh array rather than mutating either input', () => {
        const before = Array.from(from);
        interpolateCurves(from, to, 0.5);
        expect(Array.from(from)).toEqual(before);
    });
});
