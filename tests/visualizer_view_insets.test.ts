import * as THREE from 'three';

// Same reasoning as tests/atom/visualizer_dispatch.test.ts: neither module loads under ts-jest, and nothing here uses them.
jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import {
    VisualizerContext, ViewInsets, frameOrbital, handleResize, setViewInsets, tickTransition, updateAtomViewInScene,
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
        // minDistance 0.1 matches the real OrbitControls setup
        // (orbital_visualizer.ts's createOrbitalControls) -- ruling R22b's
        // Fix B clamps against it, so the fixture needs the real value for
        // the "fit tests" describe block below to exercise the real clamp.
        controls: { target: new THREE.Vector3(), update: () => {}, minDistance: 0.1 } as unknown as VisualizerContext['controls'],
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

        // Ruling T20c-fade: tightened from a 1 % band -- the re-fit is exact, so it lands on the fresh distance.
        expect(distance(context)).toBeCloseTo(freshDistance(390, 844, PHONE, 2.7), 6);
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

// Ruling T20c-fade (carried into Task 20d): a fade interrupted by a non-animated update (reduced motion
// switched on mid-fade, say) used to leave the camera wherever the fade had got to.
describe('a shell fade interrupted by a non-animated update', () => {
    it('ends at the distance a fresh load frames, not part-way', () => {
        const context = buildContext(1000, 900);
        setViewInsets(context, DESKTOP);
        updateAtomViewInScene(context, shellParams(8), { animate: true });     // the first view: instant
        updateAtomViewInScene(context, shellParams(2), { animate: true });     // drilling in: a shell fade
        expect(context.transition?.kind).toBe('shell-fade');
        const from = distance(context);

        tickTransition(context, 0);
        tickTransition(context, 425);                                          // the camera half-way through its move
        expect(context.transition?.kind).toBe('shell-fade');
        const fresh = buildContext(1000, 900);
        setViewInsets(fresh, DESKTOP);
        updateAtomViewInScene(fresh, shellParams(2), { animate: false });
        expect(distance(context)).toBeLessThan(from * 0.99);
        expect(distance(context)).toBeGreaterThan(distance(fresh) * 1.01);

        updateAtomViewInScene(context, shellParams(2), { animate: false });
        expect(context.transition).toBeNull();
        expect(distance(context)).toBeCloseTo(distance(fresh), 6);
        // The clip range follows the camera, as tickShellFade sets it.
        expect(context.camera.near).toBeCloseTo(Math.max(0.01, distance(fresh) / 1000), 9);
        expect(context.camera.far).toBeCloseTo(distance(fresh) * 10, 9);
    });

    it('an animated update mid-fade eases on from where the camera is, without a jump', () => {
        const context = buildContext(1000, 900);
        setViewInsets(context, DESKTOP);
        updateAtomViewInScene(context, shellParams(8), { animate: true });
        updateAtomViewInScene(context, shellParams(2), { animate: true });
        tickTransition(context, 0);
        tickTransition(context, 425);
        const partWay = distance(context);

        updateAtomViewInScene(context, shellParams(4), { animate: true });     // a quick second click
        const transition = context.transition as Extract<VisualizerContext['transition'], { kind: 'shell-fade' }>;
        expect(transition.kind).toBe('shell-fade');
        expect(distance(context)).toBeCloseTo(partWay, 9);
        expect(transition.fromCameraDistance).toBeCloseTo(partWay, 9);
    });

    // Ruling T20d-strand: if the view cannot be faded from (no curve or radius to read), the next update
    // falls back to the instant path -- which must re-frame, not trust the cancelled fade's framedRMax.
    it('re-frames when the next fade cannot start and falls back to the instant path', () => {
        const context = buildContext(1000, 900);
        setViewInsets(context, DESKTOP);
        updateAtomViewInScene(context, shellParams(8), { animate: true });
        updateAtomViewInScene(context, shellParams(2), { animate: true });
        tickTransition(context, 0);
        tickTransition(context, 425);
        // Nothing left to read a curve from: beginShellFade's fallback.
        context.currentOrbitalGroup!.traverse(child => { child.userData.isCap = false; });

        updateAtomViewInScene(context, shellParams(2), { animate: true });
        expect(context.transition).toBeNull();
        const fresh = buildContext(1000, 900);
        setViewInsets(fresh, DESKTOP);
        updateAtomViewInScene(fresh, shellParams(2), { animate: false });
        expect(distance(context)).toBeCloseTo(distance(fresh), 6);
    });
});

/**
 * Fix B (ruling R22b, task-22b-findings.md §4): frameOrbital derives near/far
 * from the *unclamped* fit distance, then calls controls.update(), which
 * clamps the camera's actual distance to controls.minDistance. When the fit
 * distance comes in below minDistance -- which it did for a degenerate,
 * nucleus-voxel orbital mesh (Fix A in orbital_mesh.ts fixes that case, but
 * this guard is for any future one) -- far ends up smaller than the camera's
 * real, clamped distance, and the whole scene sits beyond the far plane: an
 * empty canvas, not even the axes helper drawn.
 */
describe('frameOrbital clamps to minDistance before deriving near/far (Fix B)', () => {
    it('keeps far > distance > near for a box far smaller than minDistance', () => {
        const context = buildContext(1000, 900);
        setViewInsets(context, DESKTOP);
        // rMax = 1e-4: the same order of magnitude as the degenerate Ac 6s
        // mesh's radius (5.1e-4 a0) that produced an empty main view.
        frameOrbital(context, 1e-4);

        const d = distance(context);
        expect(context.camera.far).toBeGreaterThan(d);
        expect(d).toBeGreaterThan(context.camera.near);
        // The clamp is exactly controls.minDistance, not merely "big enough".
        expect(d).toBeCloseTo(context.controls.minDistance, 9);
    });

    it('leaves a normally-sized orbital framing untouched', () => {
        const context = buildContext(1000, 900);
        setViewInsets(context, DESKTOP);
        frameOrbital(context, 2.7);

        const d = distance(context);
        expect(context.camera.far).toBeGreaterThan(d);
        expect(d).toBeGreaterThan(context.camera.near);
        expect(d).toBeGreaterThan(context.controls.minDistance * 10);
    });
});

