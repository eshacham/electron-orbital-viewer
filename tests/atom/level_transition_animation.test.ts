import * as THREE from 'three';

// Same reasoning as visualizer_dispatch.test.ts: these two modules cannot be
// loaded for real under this project's Babel-less ts-jest (import.meta.url /
// an ES-module-only dependency), and nothing under test here goes anywhere
// near either.
jest.mock('../../src/workers/createOrbitalWorker', () => ({
    createOrbitalWorker: jest.fn(),
}));
jest.mock('../../src/orbital_controls_factory', () => ({
    createOrbitalControls: jest.fn(),
}));

import { createOrbitalWorker } from '../../src/workers/createOrbitalWorker';
import {
    VisualizerContext,
    updateAtomViewInScene,
    updateOrbitalInScene,
} from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, SurfaceStyle, MeshData, OrbitalParams } from '../../src/types/orbital';

/**
 * A VisualizerContext-shaped object built without initVisualizer, which
 * constructs a real THREE.WebGLRenderer and cannot run under jsdom (see
 * visualizer_dispatch.test.ts, which this is deliberately styled after).
 */
function buildContext(surfaceStyle: SurfaceStyle = { ...defaultSurfaceStyle }): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);

    return {
        scene: new THREE.Scene(),
        camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null,
        currentAxesHelper: null,
        isDisposed: false,
        surfaceStyle,
        clipPlane,
        clippingPlanes: [clipPlane],
        currentCaps: null,
        activeWorker: null,
        requestCounter: 0,
        isShellView: false,
        transition: null,
    };
}

function atomShellParams(overrides: Partial<{ contourRadius: number }> = {}) {
    return {
        contourRadius: overrides.contourRadius ?? 4,
        shellEmphasis: new Float32Array([0.1, 0.4, 1.0, 0.3, 0.05]),
        rMin: 0.1,
        dx: 0.5,
        size: 5,
        rMax: 0.1 * Math.exp(0.5 * 4),
    };
}

function shellParamsFor(n: number) {
    // A different curve/contour per "shell", so a fade between two of these
    // is actually interpolating between different endpoints.
    return atomShellParams({ contourRadius: n });
}

function hydrogenLikeParams(): OrbitalParams {
    return { n: 3, l: 2, ml: 0, Z: 1, resolution: 4, rMax: 20, enclosedFraction: 0.9 };
}

function fakeMeshData(): MeshData {
    return {
        positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        cells: [[0, 1, 2]],
        psiSigns: [1, 1, 1],
        densityMap: { data: new Uint8Array(1), side: 1, rMax: 20 },
        isoLevel: 0.5,
    };
}

/** Minimal stand-in for the real Worker (see visualizer_dispatch.test.ts). */
function fakeWorker() {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null as ((e: { data: unknown }) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
    };
}

/** Reads the opacity a shell view's cap shader currently carries. */
function shellViewOpacity(group: THREE.Object3D): number {
    let opacity: number | undefined;
    group.traverse(child => {
        if (child instanceof THREE.Mesh && child.userData.isCap) {
            opacity = (child.material as THREE.ShaderMaterial).uniforms.opacity.value;
        }
    });
    expect(opacity).toBeDefined();
    return opacity!;
}

describe('prefers-reduced-motion bypasses the animation entirely', () => {
    it('with animate:false (what the caller passes when reduced motion is requested), a second shell view is an instant rebuild, not a fade', () => {
        const context = buildContext();

        updateAtomViewInScene(context, shellParamsFor(1), { animate: true });
        const first = context.currentOrbitalGroup;
        // Nothing to animate *from* the very first shell view, so this is
        // already the instant path -- confirm that, then check the
        // meaningful case: a second call with animate:false.
        expect(context.transition).toBeNull();

        updateAtomViewInScene(context, shellParamsFor(2), { animate: false });

        // Instant cut: a brand new group, not the same one mutated in place,
        // and no transition left running.
        expect(context.currentOrbitalGroup).not.toBe(first);
        expect(context.transition).toBeNull();
        expect(context.scene.children).not.toContain(first);
        expect(context.scene.children).toEqual([context.currentOrbitalGroup]);
    });

    it('omitting the animate option entirely behaves the same way (the pre-existing default)', () => {
        const context = buildContext();

        updateAtomViewInScene(context, shellParamsFor(1), { animate: true });
        const first = context.currentOrbitalGroup;

        updateAtomViewInScene(context, shellParamsFor(2));

        expect(context.currentOrbitalGroup).not.toBe(first);
        expect(context.transition).toBeNull();
    });
});

describe('atom<->shell fade: interrupting mid-flight', () => {
    it('a second shell selected before the first fade finishes settles cleanly onto the new target, still just one group', () => {
        const context = buildContext();

        updateAtomViewInScene(context, shellParamsFor(1), { animate: true });
        const view = context.currentOrbitalGroup;

        // Drilling from shell 1 to shell 2 -- starts a shell-fade transition.
        updateAtomViewInScene(context, shellParamsFor(2), { animate: true });
        expect(context.transition?.kind).toBe('shell-fade');
        // Mutated in place: still the same group, not a new one.
        expect(context.currentOrbitalGroup).toBe(view);

        // Before that fade finishes, the user picks a third shell.
        updateAtomViewInScene(context, shellParamsFor(3), { animate: true });

        // Still exactly one group in the scene throughout -- a shell-fade
        // never has a second, orphaned group the way a cross-fade does.
        expect(context.scene.children).toEqual([view]);
        expect(context.currentOrbitalGroup).toBe(view);
        // The interrupted first fade was settled (not left frozen mid-fade)
        // before the new one began.
        expect(context.transition?.kind).toBe('shell-fade');
    });
});

describe('shell<->orbital cross-fade: interrupting mid-flight leaves exactly one group, opacity restored', () => {
    it('cancels the outgoing side and restores the incoming side to the resting opacity when a new request supersedes the cross-fade', async () => {
        const restingOpacity = 0.6;
        const context = buildContext({ ...defaultSurfaceStyle, opacity: restingOpacity });

        // Level 3: a marching-cubes orbital is showing.
        const firstOrbitalWorker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValueOnce(firstOrbitalWorker);
        const orbitalRender = updateOrbitalInScene(context, hydrogenLikeParams());
        firstOrbitalWorker.onmessage!({ data: { type: 'success', meshData: fakeMeshData() } });
        await orbitalRender;
        const orbitalGroup = context.currentOrbitalGroup;
        expect(context.isShellView).toBe(false);

        // Drilling out to level 2: a cross-fade starts. The shell view
        // builds synchronously (no worker), so it is already
        // `currentOrbitalGroup` -- the orbital becomes `transition.outgoing`,
        // kept alive in the scene rather than disposed immediately.
        updateAtomViewInScene(context, shellParamsFor(1), { animate: true });
        expect(context.transition?.kind).toBe('cross-fade');
        const shellViewGroup = context.currentOrbitalGroup!;
        expect(shellViewGroup).not.toBe(orbitalGroup);
        expect(context.scene.children).toHaveLength(2);
        expect(context.scene.children).toEqual(expect.arrayContaining([orbitalGroup, shellViewGroup]));
        // Faded in from zero -- not yet at the resting opacity.
        expect(shellViewOpacity(shellViewGroup)).toBe(0);

        // Before that cross-fade finishes, the user drills back into an
        // orbital. Its own worker has not resolved yet, so nothing new has
        // landed in the scene at this point -- this is exactly the moment
        // to check that the *interrupted* cross-fade was cleaned up rather
        // than left stranded.
        const secondOrbitalWorker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValueOnce(secondOrbitalWorker);
        const secondRender = updateOrbitalInScene(context, { ...hydrogenLikeParams(), n: 2, l: 1 }, true, { animate: true });

        // Exactly one geometry group left in the scene -- the outgoing
        // orbital was disposed and removed, not left behind. (The scene may
        // also hold the new orbital request's axes helper, added
        // synchronously ahead of its own not-yet-resolved worker -- that is
        // unrelated to the cross-fade this is testing.)
        const capAssemblies = context.scene.children.filter(child => child.userData.isCapAssembly);
        expect(capAssemblies).toEqual([shellViewGroup]);
        expect(context.scene.children).not.toContain(orbitalGroup);
        // Opacity restored to its resting value, not left at the
        // part-way-through-the-fade value it had a moment ago.
        expect(shellViewOpacity(shellViewGroup)).toBeCloseTo(restingOpacity);
        expect(context.transition).toBeNull();
        expect(context.currentOrbitalGroup).toBe(shellViewGroup);

        // Let the still-pending second request resolve, so the test itself
        // does not leave a dangling promise/worker behind.
        secondOrbitalWorker.onmessage!({ data: { type: 'success', meshData: fakeMeshData() } });
        await secondRender;
    });
});
