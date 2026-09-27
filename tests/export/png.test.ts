import { exportPixelRatio, freeAreaCrop, drawOverlays, captureViewPng, ExportCanvas, ExportPainter } from '../../src/export/png';
import { ATOM_METHOD } from '../../src/export/caption';

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

/** A `CaptureRenderer` test double: a live (not lost) context unless told otherwise. */
function fakeRenderer(clientWidth: number, clientHeight: number, lost = false) {
    let ratio = 1;
    const log: string[] = [];
    const renderer = {
        getPixelRatio: () => ratio,
        setPixelRatio: (r: number) => { ratio = r; log.push(`ratio ${r}`); },
        getContext: () => ({ isContextLost: () => lost }),
        domElement: { clientWidth, clientHeight } as unknown as HTMLCanvasElement,
    };
    return { renderer, log, ratio: () => ratio };
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
    });

    // M4: below the quarter-canvas floor, the crop is *not* the whole
    // canvas (that would include the panels themselves) -- it is a
    // quarter-canvas window centred on the free area's own centre, exactly
    // mirroring fitFactorFor's floor and applyViewOffset's centring.
    it('mirrors fitFactorFor: a narrow free area gets a quarter-canvas window centred on it, not the whole canvas', () => {
        // free width = 50 (< 25% of 400 = 100) -> span 100, centred on the
        // free area's own centre (150 + 25 = 175), i.e. [125, 225].
        expect(freeAreaCrop(400, 800, { top: 0, right: 200, bottom: 0, left: 150 })).toEqual({ x: 125, y: 0, width: 100, height: 800 });
    });

    it('clamps the window to the canvas edge when the free area sits right against it', () => {
        // free width = 100 (< 25% of 1000 = 250) -> span 250, naively
        // centred at 50 (0 + 100/2), which would put the window's left
        // edge at -75 -- clamped to 0 instead.
        expect(freeAreaCrop(1000, 500, { top: 0, right: 900, bottom: 0, left: 0 })).toEqual({ x: 0, y: 0, width: 250, height: 500 });
    });

    it('draws the caption, a scale bar of the right length and the phase key', () => {
        const { calls, painter } = recorder();
        drawOverlays(painter, 800, 600, 2, { caption: ['Iron 3d_z²', 'method'], scaleBar: { lengthBohr: 2, pixels: 50 }, phaseLegend: true });
        const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
        expect(texts).toEqual(expect.arrayContaining(['Iron 3d_z²', 'method', '2 a₀', 'ψ > 0', 'ψ < 0']));
        expect(calls).toContainEqual(['fillRect', 28, expect.any(Number), 100, 6]);
    });

    // I1: a caption line is prose, not a short label -- ATOM_METHOD alone
    // runs past 1000 px at 13 CSS px, so drawing it as a single fillText
    // silently clipped everything past the image edge (worst on a phone,
    // where the default atom export lost "...non-relativistic, spherically
    // averaged" off the right of the frame).
    it('word-wraps a long caption line to fit the image, losing no word, growing the band to fit (I1)', () => {
        const { calls, painter } = recorder();
        const width = 390;
        drawOverlays(painter, width, 300, 2, { caption: [ATOM_METHOD], scaleBar: null, phaseLegend: false });
        const textCalls = calls.filter(c => c[0] === 'fillText');
        expect(textCalls.length).toBeGreaterThan(1); // it did wrap, not just overflow one line
        const drawnWords = textCalls.map(c => c[1] as string).join(' ').split(' ');
        for (const word of ATOM_METHOD.split(' ')) expect(drawnWords).toContain(word);
        for (const [, text, x] of textCalls) {
            const w = painter.measureText(text as string).width;
            expect((x as number) + w).toBeLessThanOrEqual(width);
        }
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
        const { renderer, log } = fakeRenderer(1000, 500);
        const target = { renderer, render: () => { log.push(`render ${renderer.getPixelRatio()}`); } };
        const { calls, factory } = recorder();
        const blob = await captureViewPng(target, { x: 300, y: 0, width: 400, height: 500 }, null, factory);
        expect(blob.type).toBe('image/png');
        expect(log).toEqual(['ratio 2', 'render 2', 'ratio 1', 'render 1']);
        expect(calls[0]).toEqual(['drawImage', 600, 0, 800, 1000, 0, 0, 800, 1000]);
    });

    // M6: the overlays are drawn onto the *output* canvas (crop × ratio),
    // at the export scale (= ratio), not at scale 1 -- otherwise the
    // caption/scale-bar/key would be a fraction of the size everything
    // else in the image is drawn at.
    it('draws overlays at the export scale, onto an output sized crop × ratio (M6)', async () => {
        const { renderer } = fakeRenderer(200, 100);
        const target = { renderer, render: () => {} };
        const seen: Array<{ width: number; height: number }> = [];
        const { calls, painter, factory: baseFactory } = recorder();
        const factory = (width: number, height: number): ExportCanvas => {
            seen.push({ width, height });
            return baseFactory(width, height);
        };
        const crop = { x: 0, y: 0, width: 200, height: 100 };
        await captureViewPng(target, crop, { caption: ['Hi'], scaleBar: null, phaseLegend: false }, factory);
        // exportPixelRatio(1, 200, 100) = 2, so the output is crop × 2.
        expect(seen).toEqual([{ width: 400, height: 200 }]);
        expect(painter.font).toBe('26px Roboto, sans-serif'); // 13 * ratio
        expect(calls).toContainEqual(['fillText', 'Hi', 28, 28]); // pad = 14 * ratio
    });

    // I2: three.js's render() silently no-ops on a lost WebGL context, so
    // without an explicit check drawImage would copy transparent (or stale)
    // pixels into what looks like an ordinary PNG.
    it('throws when the graphics context was lost, but still puts the pixel ratio back (I2)', async () => {
        const { renderer } = fakeRenderer(100, 100, true);
        const target = { renderer, render: () => {} };
        await expect(captureViewPng(target, { x: 0, y: 0, width: 100, height: 100 }, null, recorder().factory))
            .rejects.toThrow('The graphics context was lost; the image could not be captured.');
        expect(renderer.getPixelRatio()).toBe(1);
    });

    it('puts the pixel ratio back even when rendering itself throws', async () => {
        const { renderer } = fakeRenderer(100, 100);
        const target = { renderer, render: () => { if (renderer.getPixelRatio() === 2) throw new Error('render failed'); } };
        await expect(captureViewPng(target, { x: 0, y: 0, width: 100, height: 100 }, null, recorder().factory)).rejects.toThrow('render failed');
        expect(renderer.getPixelRatio()).toBe(1);
    });

    it('rejects with a stated reason when the browser cannot encode the image (toBlob returns null)', async () => {
        const { renderer } = fakeRenderer(100, 100);
        const target = { renderer, render: () => {} };
        const { painter } = recorder();
        const factory = (width: number, height: number): ExportCanvas => ({
            width, height, getContext: () => painter, toBlob: callback => callback(null),
        });
        await expect(captureViewPng(target, { x: 0, y: 0, width: 100, height: 100 }, null, factory))
            .rejects.toThrow('The browser could not encode the image.');
    });
});
