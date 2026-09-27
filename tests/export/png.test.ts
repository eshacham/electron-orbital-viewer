import { exportPixelRatio, freeAreaCrop, drawOverlays, captureViewPng, ExportCanvas, ExportPainter } from '../../src/export/png';

function recorder() {
    const calls: Array<[string, ...unknown[]]> = [];
    const painter: ExportPainter = {
        fillStyle: '', font: '', textBaseline: 'top',
        fillRect: (...args: number[]) => { calls.push(['fillRect', ...args]); },
        fillText: (text: string, x: number, y: number) => { calls.push(['fillText', text, x, y]); },
        measureText: (text: string) => ({ width: text.length * 7 }),
        // The image argument itself is not logged (an opaque HTMLCanvasElement, not a value worth asserting on).
        drawImage: (_image, sx, sy, sw, sh, dx, dy, dw, dh) => { calls.push(['drawImage', sx, sy, sw, sh, dx, dy, dw, dh]); },
    };
    const factory = (width: number, height: number): ExportCanvas => ({
        width, height, getContext: () => painter,
        toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })),
    });
    return { calls, painter, factory };
}

describe('PNG export', () => {
    it('doubles the drawing buffer, capped on the long side', () => {
        expect(exportPixelRatio(1, 1440, 900)).toBe(2);
        expect(exportPixelRatio(2, 1440, 900)).toBeCloseTo(4096 / 1440, 9);
        expect(exportPixelRatio(2, 390, 844)).toBe(4);
    });

    it('crops to what the panels leave free, where the view is centred', () => {
        expect(freeAreaCrop(1440, 900, { top: 0, right: 340, bottom: 0, left: 320 })).toEqual({ x: 320, y: 0, width: 780, height: 900 });
        expect(freeAreaCrop(400, 800)).toEqual({ x: 0, y: 0, width: 400, height: 800 });
        // Panels covering almost everything: the view was fitted to the whole canvas.
        expect(freeAreaCrop(400, 800, { top: 0, right: 200, bottom: 0, left: 150 })).toEqual({ x: 0, y: 0, width: 400, height: 800 });
    });

    it('draws the caption, a scale bar of the right length and the phase key', () => {
        const { calls, painter } = recorder();
        drawOverlays(painter, 800, 600, 2, { caption: ['Iron 3d_z²', 'method'], scaleBar: { lengthBohr: 2, pixels: 50 }, phaseLegend: true });
        const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
        expect(texts).toEqual(expect.arrayContaining(['Iron 3d_z²', 'method', '2 a₀', 'ψ > 0', 'ψ < 0']));
        expect(calls).toContainEqual(['fillRect', 28, expect.any(Number), 100, 6]);
    });

    // Ruling C5: when App is showing the combination colour key instead of
    // the plain ψ-sign key (more than one overlaid source), the PNG must
    // describe what it shows -- so it draws the same key, swatches and all,
    // plus the shared "darker: ψ < 0" note, and not the plain ψ key.
    it('draws the combination colour key instead of the phase key, when one is on screen (ruling C5)', () => {
        const { calls, painter } = recorder();
        drawOverlays(painter, 800, 600, 2, {
            caption: ['sp³ hybrids — all 4'],
            scaleBar: null,
            phaseLegend: true,
            combinationLegend: [{ label: 'h₁', color: '#20c020' }, { label: 'h₂', color: '#c02020' }],
        });
        const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
        expect(texts).toEqual(expect.arrayContaining(['h₁', 'h₂', 'darker: ψ < 0']));
        expect(texts).not.toContain('ψ > 0');
        expect(texts).not.toContain('ψ < 0');
        // Swatch rects are 11*scale square (22x22 at scale 2); the caption
        // band is the only other fillRect call, and is far wider than tall.
        const swatches = calls.filter(c => c[0] === 'fillRect' && c[3] === 22 && c[4] === 22);
        // One swatch per combination member; the "darker" note has none.
        expect(swatches).toHaveLength(2);
    });

    it('renders once at the export ratio, crops, and puts the ratio back', async () => {
        let ratio = 1;
        const log: string[] = [];
        const target = {
            renderer: {
                getPixelRatio: () => ratio,
                setPixelRatio: (r: number) => { ratio = r; log.push(`ratio ${r}`); },
                domElement: { clientWidth: 1000, clientHeight: 500 } as unknown as HTMLCanvasElement,
            },
            render: () => { log.push(`render ${ratio}`); },
        };
        const { calls, factory } = recorder();
        const blob = await captureViewPng(target, { x: 300, y: 0, width: 400, height: 500 }, null, factory);
        expect(blob.type).toBe('image/png');
        expect(log).toEqual(['ratio 2', 'render 2', 'ratio 1', 'render 1']);
        expect(calls[0]).toEqual(['drawImage', 600, 0, 800, 1000, 0, 0, 800, 1000]);
    });

    it('puts the pixel ratio back even when rendering fails', async () => {
        let ratio = 1;
        const target = {
            renderer: { getPixelRatio: () => ratio, setPixelRatio: (r: number) => { ratio = r; }, domElement: { clientWidth: 100, clientHeight: 100 } as unknown as HTMLCanvasElement },
            render: () => { if (ratio === 2) throw new Error('context lost'); },
        };
        await expect(captureViewPng(target, { x: 0, y: 0, width: 100, height: 100 }, null, recorder().factory)).rejects.toThrow('context lost');
        expect(ratio).toBe(1);
    });
});
