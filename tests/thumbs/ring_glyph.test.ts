import { drawRingGlyph } from '../../src/thumbs/ring_glyph';

describe('ring glyphs (ruling R5)', () => {
    it('draws one translucent ring per radius step, coloured by layer, brighter where D(r) is larger', () => {
        const calls: Array<{ radius: number; colour: string; alpha: number }> = [];
        const ctx = {
            strokeStyle: '' as string, globalAlpha: 1, lineWidth: 1,
            clearRect: jest.fn(), beginPath: jest.fn(), stroke: jest.fn(),
            arc(_x: number, _y: number, radius: number) { calls.push({ radius, colour: ctx.strokeStyle, alpha: ctx.globalAlpha }); },
        };
        const rGrid = [0, 1, 2, 3, 4];
        drawRingGlyph(ctx, 40, [{ curve: [0, 1, 4, 1, 0], colour: '#4da3ff' }], rGrid, 4);
        expect(ctx.clearRect).toHaveBeenCalled();
        const brightest = calls.reduce((a, b) => (b.alpha > a.alpha ? b : a));
        expect(brightest.colour).toBe('#4da3ff');
        expect(brightest.radius).toBeGreaterThan(5);
        expect(brightest.radius).toBeLessThan(15);
    });

    it('draws nothing for an empty curve, without throwing', () => {
        const ctx = { strokeStyle: '', globalAlpha: 1, lineWidth: 1, clearRect: jest.fn(), beginPath: jest.fn(), stroke: jest.fn(), arc: jest.fn() };
        expect(() => drawRingGlyph(ctx, 40, [{ curve: [0, 0, 0], colour: '#fff' }], [0, 1, 2], 2)).not.toThrow();
        expect(ctx.stroke).not.toHaveBeenCalled();
    });
});
