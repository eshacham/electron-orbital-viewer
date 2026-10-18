import * as THREE from 'three';

jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));
// The real one draws on a WebGLRenderer, which jsdom has not got (render_thumbnail.test.ts covers it with a stand-in).
jest.mock('../../src/thumbs/render_thumbnail', () => ({
    // size(): the bitmap's side, part of the cache key since ruling R20a-4 (the bitmap's since fix round 1 of Task 20d).
    createThumbnailRenderer: jest.fn(() => ({ render: jest.fn(async () => ({ width: 288, height: 288 })), size: () => 288, dispose: jest.fn() })),
}));

import { createOrbitalWorker } from '../../src/workers/createOrbitalWorker';
import { createThumbnailRenderer } from '../../src/thumbs/render_thumbnail';
import { afterMainFrame, attachThumbnails, cleanupVisualizer, VisualizerContext } from '../../src/orbital_visualizer';
import { ThumbnailService } from '../../src/thumbs/ThumbnailService';
import { DEFAULT_OPACITY, defaultSurfaceStyle, MeshData, OrbitalParams } from '../../src/types/orbital';
import { INITIAL_APPEARANCE, type Appearance } from '../../src/design/appearance';

/** A VisualizerContext without a WebGLRenderer (jsdom has no WebGL) -- tests/visualizer_appearance.test.ts's recipe. */
function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: document.createElement('canvas'), dispose: jest.fn() } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {}, dispose: jest.fn() } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
        frameGuard: { ema: 16, frames: 0 }, extrasSuppressed: false,
    };
}

/** A drawn surface wearing Glow's mesh lines: what ruling R10's guard watches. */
function withLines(context: VisualizerContext): void {
    const group = new THREE.Group();
    const lines = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    lines.userData.isGlowExtra = 'lines';
    group.add(lines);
    context.currentOrbitalGroup = group;
}

const params: OrbitalParams = { n: 2, l: 1, ml: 0, Z: 6, resolution: 32, rMax: 8, enclosedFraction: 0.9 };
const mesh = (): MeshData => ({ positions: [], cells: [], psiSigns: [], densityMap: { data: new Uint8Array(1), side: 1, rMax: 1 }, isoLevel: 1 });
const glow: Appearance = { ...INITIAL_APPEARANCE, finish: 'glow' };
// Task 10: the host lends its grid worker factory (OrbitalViewer passes createGridMeshWorker); a stand-in here.
let gridWorkers: Array<{ postMessage: jest.Mock; terminate: jest.Mock; onmessage: ((e: { data: unknown }) => void) | null }> = [];
const createGridWorker = () => {
    const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null };
    gridWorkers.push(worker);
    return worker as unknown as Worker;
};

describe('attachThumbnails (spec §12: the one renderer, lent)', () => {
    let workers: Array<{ postMessage: jest.Mock; terminate: jest.Mock; onmessage: ((e: { data: unknown }) => void) | null }>;
    beforeEach(() => {
        workers = [];
        gridWorkers = [];
        (createOrbitalWorker as jest.Mock).mockImplementation(() => {
            const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null };
            workers.push(worker);
            return worker;
        });
    });

    // Ruling R20a-4: the key also says whether the extras are drawn (lowPower) and the picture's size.
    it('ticks the service after each main frame, keyed by theme|finish|power|size, and stops on a lost context', () => {
        const context = buildContext();
        const service = new ThumbnailService();
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow });
        expect(service.status()).toBe('ready');
        service.request({ contentKey: 'c', params }, jest.fn());
        afterMainFrame(context, null);
        expect(workers).toHaveLength(1);
        expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'calculate', params });
        // Fix round 1 of Task 20a: the key ends in the committed opacity (the default without an opacity option).
        // Ruling R22a: the key has no scheme field (was dark|phase|glow|...). R24-1: the default is 0.9 (was 0.7).
        service.store('dark|glow|full|288|0.9|cached', { width: 1, height: 1 });
        const hit = jest.fn();
        service.request({ contentKey: 'cached', params }, hit);
        expect(hit).toHaveBeenCalled();
        // A picture drawn for a phone (no lines, no halo) or at another size is not served here.
        service.store('dark|glow|low|288|0.9|other', { width: 1, height: 1 });
        service.store('dark|glow|full|160|0.9|other', { width: 1, height: 1 });
        service.store('dark|glow|full|288|0.4|other', { width: 1, height: 1 });
        const miss = jest.fn();
        service.request({ contentKey: 'other', params }, miss);
        expect(miss).not.toHaveBeenCalled();

        context.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
        expect(service.status()).toBe('lost');
        cleanupVisualizer(context);
        expect(context.onAfterFrame).toBeUndefined();
    });

    // Review A, M1: three.js restores the main renderer on its own after a
    // context loss, but nothing told the service -- it stayed 'lost' for the
    // rest of the session and every strip tile showed its glyph fallback
    // forever, even though the main view had recovered.
    it('re-attaches the thumbnail service on a restored context', () => {
        const context = buildContext();
        const service = new ThumbnailService();
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow });
        context.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
        expect(service.status()).toBe('lost');
        context.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
        expect(service.status()).toBe('ready');
    });

    // Review A, M1: disposeThumbnails frees the render target; it must also
    // drop both context listeners so a later loss/restore on the same canvas
    // (e.g. after the host has moved on) cannot still reach this service.
    it('removes both context listeners when the thumbnails are disposed', () => {
        const context = buildContext();
        const service = new ThumbnailService();
        const removeSpy = jest.spyOn(context.renderer.domElement, 'removeEventListener');
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow });
        context.disposeThumbnails!();
        const removedTypes = removeSpy.mock.calls.map(call => call[0]);
        expect(removedTypes).toEqual(expect.arrayContaining(['webglcontextlost', 'webglcontextrestored']));
        context.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
        expect(service.status()).toBe('ready');
    });

    // Ruling R10 times the main picture. A thumbnail's render and read-back
    // land in the frame interval after it, so that interval is not fed to the
    // guard: a strip filling up must not latch Glow's lines and halo off.
    it('keeps a thumbnail render out of the frame-time guard', async () => {
        const context = buildContext();
        withLines(context);
        const service = new ThumbnailService();
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow });
        service.request({ contentKey: 'c', params }, jest.fn());
        afterMainFrame(context, null);
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        afterMainFrame(context, 16); // renders the thumbnail
        const fed = context.frameGuard!.frames;
        afterMainFrame(context, 400); // the interval that carried it
        expect(context.frameGuard!.frames).toBe(fed);
        afterMainFrame(context, 16);
        expect(context.frameGuard!.frames).toBe(fed + 1);
        expect(context.extrasSuppressed).toBe(false);
        // Thumbnails touch neither the main view's appearance nor its camera.
        expect(context.appearance).toBeUndefined();
        expect(context.camera.position.toArray()).toEqual([0, 0, 10]);
    });

    // Fix round 1 of Task 20a (R20a-4): the picture is drawn, and filed, at the main view's committed opacity.
    it('draws and files each thumbnail at the committed opacity it is given', async () => {
        const context = buildContext();
        const service = new ThumbnailService();
        let opacity = 0.4;
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow, opacity: () => opacity });
        const thumbs = (createThumbnailRenderer as jest.Mock).mock.results.at(-1)!.value as { render: jest.Mock };
        const ready = jest.fn();
        service.request({ contentKey: 'c', params }, ready);
        afterMainFrame(context, null);
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        afterMainFrame(context, 16);
        await Promise.resolve();
        await Promise.resolve();
        // Fourth argument added by review A's M4 fix: !context.extrasSuppressed (the R10 latch), true here (unsuppressed).
        // Fifth added by Task 10: the tile's colouring -- an orbital request's is 'phase'.
        expect(thumbs.render).toHaveBeenCalledWith(expect.anything(), glow, 0.4, true, 'phase');
        expect(ready).toHaveBeenCalled();
        const hit = jest.fn();
        service.request({ contentKey: 'c', params }, hit);
        expect(hit).toHaveBeenCalled();
        opacity = 0.7;
        const miss = jest.fn();
        service.request({ contentKey: 'c', params }, miss);
        expect(miss).not.toHaveBeenCalled();
    });

    // Review A, M4: once the main view's R10 guard has latched the lines/halo off for the
    // session, the strip must agree -- it must not keep drawing them in every tile.
    it('passes extrasAllowed: false once the main view\'s R10 latch has fired', async () => {
        const context = buildContext();
        withLines(context);
        const service = new ThumbnailService();
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow });
        const thumbs = (createThumbnailRenderer as jest.Mock).mock.results.at(-1)!.value as { render: jest.Mock };
        context.extrasSuppressed = true;
        service.request({ contentKey: 'c', params }, jest.fn());
        afterMainFrame(context, null);
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        afterMainFrame(context, 16);
        await Promise.resolve();
        await Promise.resolve();
        // Fifth argument added by Task 10: the tile's colouring ('phase' for an orbital request).
        expect(thumbs.render).toHaveBeenCalledWith(expect.anything(), glow, DEFAULT_OPACITY, false, 'phase');
    });

    // Task 10 (ruling P5): a Bonds tile is meshed by the orbital worker's
    // calculateFields, a molecule's grid by the grid worker the host lends,
    // and each is drawn in the colouring it asked for.
    it('meshes a field tile in the orbital worker and a grid tile in the lent grid worker, drawing each in its colouring', async () => {
        const context = buildContext();
        const service = new ThumbnailService();
        attachThumbnails(context, service, { isBusy: () => false, createGridWorker, appearance: () => glow });
        const thumbs = (createThumbnailRenderer as jest.Mock).mock.results.at(-1)!.value as { render: jest.Mock };
        const field = {
            sources: [{ kind: 'analytic' as const, id: 'h2plus', rMax: 6, recipe: { type: 'h2plus' as const, R: 2, state: '1sigma_g' as const } }],
            colors: ['#ffffff'], memberLabels: ['1σg'], resolution: 40, enclosedFraction: 0.9, label: '1σg',
        };
        service.request({ kind: 'field', contentKey: 'f', field, colouring: 'density' }, jest.fn());
        afterMainFrame(context, null);
        expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'calculateFields', request: field });
        workers[0].onmessage!({ data: { type: 'fieldsSuccess', meshes: [mesh()] } });
        afterMainFrame(context, 16);
        await Promise.resolve();
        await Promise.resolve();
        expect(thumbs.render).toHaveBeenLastCalledWith(expect.anything(), glow, DEFAULT_OPACITY, true, 'density');

        const grid = {
            type: 'calculate' as const, requestId: 0, enclosedFraction: 0.9,
            source: { kind: 'grid' as const, id: 'g', shape: [2, 2, 2] as [number, number, number], origin: [0, 0, 0] as [number, number, number], spacing: 1, quantity: 'density' as const, values: new Float32Array(8) },
        };
        service.request({ kind: 'grid', contentKey: 'g', grid, colouring: 'density' }, jest.fn());
        afterMainFrame(context, 16);
        expect(gridWorkers).toHaveLength(1);
        expect(workers).toHaveLength(1);
        expect(gridWorkers[0].postMessage).toHaveBeenCalledWith(grid);
    });
});
