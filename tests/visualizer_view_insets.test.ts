import * as THREE from 'three';

// Same reasoning as tests/atom/visualizer_dispatch.test.ts: neither module loads under ts-jest, and nothing here uses them.
jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import {
    VisualizerContext, ViewInsets, frameOrbital, handleResize, setViewInsets, updateAtomViewInScene,
} from '../src/orbital_visualizer';
import { defaultSurfaceStyle } from '../src/types/orbital';

/**
 * A VisualizerContext without a WebGLRenderer (tests/visualizer_appearance.test.ts's recipe), whose
 * canvas reports the CSS size the fake renderer was last given -- as the real one does, since
 * `renderer.setSize` writes the canvas's style width and height.
 */
function buildContext(width: number, height: number): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    const canvas = document.createElement('canvas');
    const size = { width, height };
    Object.defineProperty(canvas, 'clientWidth', { get: () => size.width });
    Object.defineProperty(canvas, 'clientHeight', { get: () => size.height });
    const renderer = {
        domElement: canvas,
        setSize: (w: number, h: number) => { size.width = w; size.height = h; },
    } as unknown as THREE.WebGLRenderer;
    return {
        scene: new THREE.Scene(), camera, renderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0, isShellView: false, transition: null,
    };
}

// The visualizer logs its scene changes as a debugging aid; muted so the run stays readable.
beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { (console.log as jest.Mock).mockRestore(); });

const distance = (context: VisualizerContext) => context.camera.position.distanceTo(context.controls.target);

/** What a fresh load at this canvas size and these insets frames rMax at. */
function freshDistance(width: number, height: number, insets: ViewInsets, rMax: number): number {
    const context = buildContext(width, height);
    setViewInsets(context, insets);
    frameOrbital(context, rMax);
    return distance(context);
}

const DESKTOP: ViewInsets = { top: 80, right: 71, bottom: 120, left: 0 };
const PHONE: ViewInsets = { top: 104, right: 0, bottom: 45, left: 0 };

/** A shell view's params (tests/atom/level_transition_animation.test.ts's atomShellParams). */
function shellParams(contourRadius = 4) {
    return {
        contourRadius,
        shellEmphasis: new Float32Array([0.1, 0.4, 1.0, 0.3, 0.05]),
        rMin: 0.1, dx: 0.5, size: 5, rMax: 0.1 * Math.exp(0.5 * 4),
    };
}

// Task 20c, bug 1 (task-20c-findings.md): narrowing a desktop window to a phone left the camera 480x too far.
describe('the camera fit follows the canvas, not only the insets', () => {
    it('a canvas collapsed to 0 px mid layout swap does not leave the camera far away (desktop -> phone)', () => {
        const context = buildContext(868, 640);
        setViewInsets(context, DESKTOP);
        frameOrbital(context, 2.7);

        handleResize(context, 0, 764);      // the desktop grid at 390 px, before React swaps to the phone layout
        setViewInsets(context, PHONE);       // the insets measured in that frame
        handleResize(context, 390, 844);     // the phone layout

        const fresh = freshDistance(390, 844, PHONE, 2.7);
        expect(distance(context)).toBeGreaterThan(fresh * 0.99);
        expect(distance(context)).toBeLessThan(fresh * 1.01);
    });

    it('a resize re-fits the camera: a tablet rotated landscape -> portrait frames as a fresh portrait load', () => {
        const context = buildContext(612, 688);
        setViewInsets(context, DESKTOP);
        frameOrbital(context, 5);

        handleResize(context, 356, 944);     // the transient canvas mid rotation
        setViewInsets(context, PHONE);
        handleResize(context, 768, 1024);

        expect(distance(context)).toBeCloseTo(freshDistance(768, 1024, PHONE, 5), 6);
    });

    it('keeps the user\'s own zoom in proportion through a resize', () => {
        const context = buildContext(868, 640);
        setViewInsets(context, DESKTOP);
        frameOrbital(context, 3);
        context.camera.position.multiplyScalar(0.5);     // the user zooms in 2x

        handleResize(context, 600, 900);

        expect(distance(context)).toBeCloseTo(freshDistance(600, 900, DESKTOP, 3) * 0.5, 6);
    });

    it('ignores a resize to a degenerate size', () => {
        const context = buildContext(868, 640);
        setViewInsets(context, DESKTOP);
        frameOrbital(context, 3);
        const before = distance(context);

        handleResize(context, 0, 764);
        expect(context.renderer.domElement.clientWidth).toBe(868);
        handleResize(context, 868, 0);
        expect(context.renderer.domElement.clientHeight).toBe(640);

        expect(distance(context)).toBe(before);
    });
});

// Task 20c, bug 2: an inset change while a shell fade ran was dropped, and the fade landed at the old fit.
describe('an inset change during a shell fade', () => {
    it('rescales the fade so it lands where a fresh load under the new insets frames', () => {
        const context = buildContext(1000, 900);
        updateAtomViewInScene(context, shellParams(), { animate: true });     // the first view: instant
        setViewInsets(context, { top: 346, right: 71, bottom: 120, left: 0 });

        updateAtomViewInScene(context, shellParams(), { animate: true });     // same species again: a shell fade
        expect(context.transition?.kind).toBe('shell-fade');
        setViewInsets(context, { top: 80, right: 71, bottom: 120, left: 0 });

        const fresh = buildContext(1000, 900);
        setViewInsets(fresh, { top: 80, right: 71, bottom: 120, left: 0 });
        updateAtomViewInScene(fresh, shellParams(), { animate: true });
        const transition = context.transition as Extract<VisualizerContext['transition'], { kind: 'shell-fade' }>;
        expect(transition.toCameraDistance).toBeCloseTo(distance(fresh), 9);
        // It starts where the camera now is, so the fade does not jump.
        expect(transition.fromCameraDistance).toBeCloseTo(distance(context), 9);
    });

    it('a round trip of insets and size, with a fade started and settled in between, returns to the starting distance', () => {
        const context = buildContext(1000, 900);
        updateAtomViewInScene(context, shellParams(), { animate: true });
        setViewInsets(context, DESKTOP);
        const start = distance(context);

        setViewInsets(context, { ...DESKTOP, top: 346 });
        updateAtomViewInScene(context, shellParams(), { animate: true });
        handleResize(context, 0, 700);
        handleResize(context, 700, 800);
        setViewInsets(context, PHONE);
        updateAtomViewInScene(context, shellParams(), { animate: false });   // settles the fade (cancelTransition)
        expect(context.transition).toBeNull();
        handleResize(context, 1000, 900);
        setViewInsets(context, DESKTOP);

        expect(Math.abs(distance(context) - start) / start).toBeLessThan(1e-9);
    });
});
