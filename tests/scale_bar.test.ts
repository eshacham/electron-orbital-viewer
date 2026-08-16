import {
    worldUnitsPerPixel,
    niceLength,
    computeScaleBar,
    formatScaleLabel,
} from '../src/scale_bar';

describe('worldUnitsPerPixel', () => {
    it('scales with how far the camera has pulled back', () => {
        const near = worldUnitsPerPixel(100, 75, 900);
        const far = worldUnitsPerPixel(200, 75, 900);
        expect(far).toBeCloseTo(near * 2);
    });

    it('matches the visible height a perspective camera covers', () => {
        // A 90 degree field of view sees exactly 2 * distance across its height.
        const perPixel = worldUnitsPerPixel(50, 90, 100);
        expect(perPixel).toBeCloseTo((2 * 50) / 100);
    });

    it('is zero for a viewport with no height', () => {
        expect(worldUnitsPerPixel(100, 75, 0)).toBe(0);
    });
});

describe('niceLength', () => {
    it.each([
        [37, 20],
        [9, 5],
        [4.9, 2],
        [1.5, 1],
        [230, 200],
        [0.42, 0.2],
    ])('rounds %p down to %p', (limit, expected) => {
        expect(niceLength(limit)).toBeCloseTo(expected);
    });

    it('only ever returns 1, 2 or 5 times a power of ten', () => {
        for (let limit = 0.05; limit < 5000; limit *= 1.07) {
            const length = niceLength(limit);
            const mantissa = length / Math.pow(10, Math.floor(Math.log10(length)));
            expect([1, 2, 5]).toContain(Math.round(mantissa));
            expect(length).toBeLessThanOrEqual(limit);
        }
    });

    it('rejects nonsense input', () => {
        expect(niceLength(0)).toBe(0);
        expect(niceLength(-5)).toBe(0);
        expect(niceLength(Infinity)).toBe(0);
    });
});

describe('computeScaleBar', () => {
    it('fits inside the space allowed', () => {
        for (const worldPerPixel of [0.001, 0.05, 0.4, 2, 17]) {
            const bar = computeScaleBar(worldPerPixel, 200)!;
            expect(bar.pixels).toBeLessThanOrEqual(200);
            // ...and is still long enough to read against.
            expect(bar.pixels).toBeGreaterThan(200 / 5);
        }
    });

    it('reports a longer distance as the camera pulls back', () => {
        const closeUp = computeScaleBar(0.05, 200)!;
        const wide = computeScaleBar(0.5, 200)!;
        expect(wide.lengthBohr).toBeGreaterThan(closeUp.lengthBohr);
    });

    it('is consistent: the bar is its length divided by the scale', () => {
        const bar = computeScaleBar(0.25, 180)!;
        expect(bar.pixels).toBeCloseTo(bar.lengthBohr / 0.25);
    });

    it('gives nothing when there is no scale to report', () => {
        expect(computeScaleBar(0, 200)).toBeNull();
        expect(computeScaleBar(1, 0)).toBeNull();
        expect(computeScaleBar(Infinity, 200)).toBeNull();
    });
});

describe('formatScaleLabel', () => {
    it.each([
        [20, '20 a₀'],
        [1, '1 a₀'],
        [0.5, '0.5 a₀'],
        [0.02, '0.02 a₀'],
    ])('renders %p as %p', (length, expected) => {
        expect(formatScaleLabel(length)).toBe(expected);
    });
});
