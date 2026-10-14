import { drawRingGlyph, ringAlpha } from '../../src/thumbs/ring_glyph';
import { THUMB_FILL } from '../../src/thumbs/thumb_key';

/** A 2D context that records the glyph's gradients and fills (jsdom has no canvas). */
function recordingContext() {
    const gradients: Array<{ circles: number[]; stops: Array<{ at: number; colour: string }> }> = [];
    const fills: Array<{ x: number; y: number; radius: number; gradient: unknown }> = [];
    let lastArc = { x: 0, y: 0, radius: 0 };
    const ctx = {
        fillStyle: '' as unknown as string | CanvasGradient | CanvasPattern,
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        arc(x: number, y: number, radius: number) { lastArc = { x, y, radius }; },
        fill: jest.fn(() => { fills.push({ ...lastArc, gradient: ctx.fillStyle }); }),
        createRadialGradient(...circles: number[]) {
            const gradient = { circles, stops: [] as Array<{ at: number; colour: string }>, addColorStop(at: number, colour: string) { gradient.stops.push({ at, colour }); } };
            gradients.push(gradient);
            return gradient;
        },
    };
    return { ctx, gradients, fills };
}

const alphaOf = (colour: string) => Number(/,([\d.]+)\)$/.exec(colour)![1]);

// Ruling R20d: one radial gradient per layer (was a stroked ring per pixel, whose overlaps drew spokes).
describe('ring glyphs (ruling R5)', () => {
    it('draws each layer as rings of its own colour, brighter where D(r) is larger', () => {
        const { ctx, gradients, fills } = recordingContext();
        drawRingGlyph(ctx, 40, [{ curve: [0, 1, 4, 1, 0], colour: '#4da3ff' }], [0, 1, 2, 3, 4], 4);
        expect(ctx.clearRect).toHaveBeenCalled();
        expect(fills).toHaveLength(1);
        const { stops } = gradients[0];
        expect(stops.every(stop => stop.colour.startsWith('rgba(77,163,255,'))).toBe(true);
        const brightest = stops.reduce((a, b) => (alphaOf(b.colour) > alphaOf(a.colour) ? b : a));
        // D(r) peaks at r = 2 of rMax 4: half-way out.
        expect(brightest.at).toBeCloseTo(0.5, 1);
        expect(alphaOf(brightest.colour)).toBe(1);
        expect(alphaOf(stops[0].colour)).toBe(0);
    });

    it('draws nothing for an empty curve, without throwing', () => {
        const { ctx, fills } = recordingContext();
        expect(() => drawRingGlyph(ctx, 40, [{ curve: [0, 0, 0], colour: '#ffffff' }], [0, 1, 2], 2)).not.toThrow();
        expect(fills).toHaveLength(0);
    });

    it('leaves out what is under 3 % of the peak, and is opaque at the peak', () => {
        expect([ringAlpha(0.02), ringAlpha(0.5), ringAlpha(1)]).toEqual([0, 0.5, 1]);
    });

    // Ruling R20d: a glyph tile fills its tile as an orbital tile does -- rMax at THUMB_FILL of the half-side.
    it('maps rMax to THUMB_FILL of the tile, centred, like the orbital tiles', () => {
        const { ctx, gradients, fills } = recordingContext();
        drawRingGlyph(ctx, 144, [{ curve: [1, 1, 1, 1, 1], colour: '#4da3ff' }, { curve: [1, 0, 0, 0, 0], colour: '#ff6b6b' }], [0, 1, 2, 3, 4], 4);
        expect(fills).toHaveLength(2);
        for (const fill of fills) expect(fill).toMatchObject({ x: 72, y: 72, radius: 72 * THUMB_FILL });
        for (const { circles, stops } of gradients) {
            expect(circles).toEqual([72, 72, 0, 72, 72, 72 * THUMB_FILL]);
            expect(stops[stops.length - 1].at).toBe(1);
        }
    });
});
