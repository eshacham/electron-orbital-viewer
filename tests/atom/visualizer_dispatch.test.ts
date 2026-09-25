import * as THREE from 'three';

// orbital_visualizer.ts's marching-cubes path constructs its worker through
// this module specifically so that `import.meta.url` (unparseable by
// ts-jest's CommonJS transform -- see createOrbitalWorker.ts's own doc
// comment) never has to appear in orbital_visualizer.ts itself. Mocking it
// out here is what makes importing orbital_visualizer.ts below possible at
// all; none of the functions under test in this file go anywhere near it.
jest.mock('../../src/workers/createOrbitalWorker', () => ({
    createOrbitalWorker: jest.fn(),
}));
// Same reasoning, for OrbitControls: it ships only as an ES module, which
// this project's Babel-less ts-jest setup cannot load from node_modules.
jest.mock('../../src/orbital_controls_factory', () => ({
    createOrbitalControls: jest.fn(),
}));

import { createOrbitalWorker } from '../../src/workers/createOrbitalWorker';
import {
    VisualizerContext,
    updateAtomViewInScene,
    updateOrbitalInScene,
    radiusUnderPointer,
    setHoverRadius,
    defaultCameraPosition,
} from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, SurfaceStyle, MeshData, OrbitalParams } from '../../src/types/orbital';

/** What is in the scene apart from the axes, which are a helper, not a view. */
const sceneContent = (context: { scene: THREE.Scene }) =>
    context.scene.children.filter(child => !child.userData.isAxes);

/**
 * Builds a VisualizerContext-shaped object without going through
 * initVisualizer, which constructs a real THREE.WebGLRenderer and cannot run
 * under jsdom (no WebGL context). Every field the functions under test
 * actually touch is real (THREE.Scene/Camera/Plane); `renderer` and
 * `controls` are the minimal stand-ins frameOrbital/radiusUnderPointer need.
 */
function buildContext(surfaceStyle: SurfaceStyle = { ...defaultSurfaceStyle }): VisualizerContext {
    const canvas = document.createElement('canvas');
    // jsdom's getBoundingClientRect returns all zeros, which would make the
    // pointer-to-radius math divide by a zero width; give it a real size.
    canvas.getBoundingClientRect = () => ({
        left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100,
        x: 0, y: 0, toJSON: () => ({}),
    });

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);

    return {
        scene: new THREE.Scene(),
        camera,
        renderer: { domElement: canvas } as unknown as THREE.WebGLRenderer,
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
    };
}

function atomShellParams() {
    return {
        level: 'atom' as const,
        contourRadius: 4,
        shellEmphasis: new Float32Array([0.1, 0.4, 1.0, 0.3, 0.05]),
        rMin: 0.1,
        dx: 0.5,
        size: 5,
        rMax: 0.1 * Math.exp(0.5 * 4),
    };
}

function pointerEventAt(clientX: number, clientY: number): PointerEvent {
    return { clientX, clientY } as PointerEvent;
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

/**
 * A minimal stand-in for the real Worker updateOrbitalInScene creates via
 * createOrbitalWorker (mocked at the top of this file). Lets a test hold the
 * "calculation in flight" state open and fire its result at a chosen moment,
 * which is exactly what reproducing the cold-load race below needs.
 */
function fakeWorker() {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null as ((e: { data: unknown }) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
    };
}

describe('visualizer dispatch: levels 1-2 render a shell view, not marching cubes', () => {
    it('builds a shell view group (sphere stencils + one shaded cap face) rather than a sampled mesh', () => {
        const context = buildContext();

        updateAtomViewInScene(context, atomShellParams());

        expect(context.currentOrbitalGroup).not.toBeNull();
        expect(context.currentOrbitalGroup!.userData.isCapAssembly).toBe(true);

        const stencils: THREE.Mesh[] = [];
        const faces: THREE.Mesh[] = [];
        context.currentOrbitalGroup!.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            if (child.userData.isCapStencil) stencils.push(child);
            if (child.userData.isCap) faces.push(child);
        });
        expect(stencils).toHaveLength(2);
        expect(faces).toHaveLength(1);
        for (const stencil of stencils) {
            expect(stencil.geometry).toBeInstanceOf(THREE.SphereGeometry);
        }
        expect(sceneContent(context)).toContain(context.currentOrbitalGroup);
    });

    it('shares clearCurrentOrbital/caps lifecycle: a second call disposes the first group and leaves exactly one in the scene', () => {
        const context = buildContext();

        updateAtomViewInScene(context, atomShellParams());
        const firstGroup = context.currentOrbitalGroup;

        updateAtomViewInScene(context, { ...atomShellParams(), contourRadius: 2 });

        expect(context.currentOrbitalGroup).not.toBe(firstGroup);
        expect(sceneContent(context)).not.toContain(firstGroup);
        expect(sceneContent(context)).toContain(context.currentOrbitalGroup);
        expect(sceneContent(context).filter(c => c.userData.isCapAssembly)).toHaveLength(1);
    });

    it('shares camera framing: frames the camera to the contour radius (not the grid rMax) the first time, and does not reframe at the same scale', () => {
        const context = buildContext();

        updateAtomViewInScene(context, atomShellParams());
        // Framing tracks the contour radius, which actually bounds the
        // visible sphere -- not the much larger sampling-grid rMax (spec
        // bugfix: a heavy atom's grid rMax can be 100x its contour radius).
        expect(context.framedRMax).toBeCloseTo(atomShellParams().contourRadius);
        // The cut is scaled to the sphere drawn, not the grid, so the depth
        // slider's travel spans the atom rather than mostly empty space.
        expect(context.clipExtent).toBeCloseTo(atomShellParams().contourRadius);
        const distanceAfterFirst = context.camera.position.length();

        // A second call at the same rMax must not move the camera again --
        // the user's chosen angle/zoom is preserved across e.g. an
        // enclosedFraction change that leaves the grid's outer radius alone.
        context.camera.position.set(1, 2, 30);
        updateAtomViewInScene(context, atomShellParams());
        expect(context.camera.position.length()).toBeCloseTo(Math.sqrt(1 + 4 + 900));
        expect(distanceAfterFirst).toBeGreaterThan(0);
    });

    // Bug fix (task 22, bug 4): this used to assert the *opposite* --
    // clipAxis: 'none' left the group invisible, on the reasoning quoted
    // below. That reasoning is exactly backwards for a shell view: unlike a
    // marching-cubes orbital, it has no always-visible surface to fall back
    // on when "no cut" is selected, so 'none' left it rendering nothing at
    // all, permanently, until the whole surfaceStyle was reset back to a
    // real axis (see shellViewClipAxis's doc comment in
    // orbital_visualizer.ts and the dedicated regression test below for the
    // exact mechanism this reproduces live: switching through hydrogen-like
    // mode with the cut off and back).
    it('shares the caps lifecycle: the whole view is visible regardless of the shared cut/mode style, because its only content lives on the cut face', () => {
        const context = buildContext({ ...defaultSurfaceStyle, clipAxis: 'none' });
        updateAtomViewInScene(context, atomShellParams());
        // Unlike a marching-cubes orbital, a shell view has no always-visible
        // surface separate from its cap -- currentOrbitalGroup and
        // currentCaps are the very same group (see updateAtomViewInScene),
        // so refreshCaps's visibility toggle covers the whole thing.
        expect(context.currentOrbitalGroup).toBe(context.currentCaps);
        expect(context.currentOrbitalGroup!.visible).toBe(true);

        const cutContext = buildContext({ ...defaultSurfaceStyle, clipAxis: 'z', clipPosition: 0 });
        updateAtomViewInScene(cutContext, atomShellParams());
        expect(cutContext.currentOrbitalGroup!.visible).toBe(true);

        // Wireframe mode has the same "no separate surface" problem 'none'
        // does -- refreshCaps used to hide the cap outside 'solid' mode too.
        const wireframeContext = buildContext({ ...defaultSurfaceStyle, mode: 'wireframe' });
        updateAtomViewInScene(wireframeContext, atomShellParams());
        expect(wireframeContext.currentOrbitalGroup!.visible).toBe(true);
    });

    // The regression test for bug 4's actual mechanism, not just the
    // symptom above: 'none' must not even reach the clip plane a shell view
    // is built with, because the plane itself -- not just cap visibility --
    // is what the stencil technique and the cap's cut-face quad both depend
    // on (updateClipPlane pushes a 'none' plane 1e9 units away, which would
    // leave the stencil buffer at zero everywhere no matter what
    // setCapsVisible says). This is the exact path the live bug report
    // traced back to: switching to hydrogen-like mode, turning the cut off
    // there (an entirely reasonable thing to do, to see the whole lobe),
    // and switching back to atom mode -- surfaceStyle is shared, global
    // state untouched by the mode switch itself.
    it('substitutes a real clip plane for a shell view even when the shared style says "no cut" -- not just a visibility patch over a broken plane', () => {
        const context = buildContext({ ...defaultSurfaceStyle, clipAxis: 'none' });
        updateAtomViewInScene(context, atomShellParams());

        // The plane actually used to build the stencils/cut face must be a
        // real, nearby one -- not the 1e9-away "no clip" constant a
        // marching-cubes orbital would correctly get for the same style.
        expect(Math.abs(context.clipPlane.constant)).toBeLessThan(atomShellParams().rMax * 10);
        expect(context.currentOrbitalGroup!.visible).toBe(true);

        // The substitution must not leak back into the shared style itself
        // -- a later marching-cubes view (hydrogen-like mode, or level 3)
        // still has to see the "no cut" the user actually chose.
        expect(context.surfaceStyle.clipAxis).toBe('none');
    });
});

// Regression test for the cold-load race (spec bugfix): App.tsx used to fire
// hydrogen-like mode's default marching-cubes render unconditionally on
// mount, which raced atom mode's own SCF solve and shell view -- both paths
// land in the same scene, and whichever finished second silently overwrote
// the other's mesh. The App.tsx fix stops the stray dispatch at the source;
// this test guards the other half, at the level shared by both call sites --
// updateAtomViewInScene must invalidate an in-flight marching-cubes worker
// the same way a newer updateOrbitalInScene call already invalidates an
// older one, so whichever request is actually newest wins regardless of
// which kind it is.
describe('shell view vs. marching cubes: only the newer request may own the scene', () => {
    it('a shell view drawn while a marching-cubes worker is still in flight supersedes it -- the stale result is dropped, not drawn over the shell view', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();

        // The cold-load race: a marching-cubes request starts (e.g. the old
        // unconditional hydrogen-like default)...
        const pending = updateOrbitalInScene(context, hydrogenLikeParams());

        // ...but atom mode's shell view lands before that worker responds.
        updateAtomViewInScene(context, atomShellParams());
        const shellViewGroup = context.currentOrbitalGroup;
        expect(context.isShellView).toBe(true);
        expect(sceneContent(context)).toContain(shellViewGroup);

        // The stale marching-cubes worker now reports success, after the
        // fact. Its terminate() has already been called by the shell view.
        expect(worker.terminate).toHaveBeenCalled();
        worker.onmessage!({ data: { type: 'success', meshData: fakeMeshData() } });
        const outcome = await pending;

        expect(outcome).toEqual({ status: 'superseded' });
        // The shell view must still be exactly what is on screen -- nothing
        // drew a stray orbital mesh over it, and nothing was left doubled up.
        expect(context.currentOrbitalGroup).toBe(shellViewGroup);
        expect(context.isShellView).toBe(true);
        expect(sceneContent(context)).toEqual([shellViewGroup]);
    });

    it('the reverse direction still works: a marching-cubes result that lands after a newer request of its own kind still supersedes fine (no regression from the shared counter)', async () => {
        const firstWorker = fakeWorker();
        const secondWorker = fakeWorker();
        (createOrbitalWorker as jest.Mock)
            .mockReturnValueOnce(firstWorker)
            .mockReturnValueOnce(secondWorker);
        const context = buildContext();

        const firstPending = updateOrbitalInScene(context, hydrogenLikeParams());
        const secondPending = updateOrbitalInScene(context, { ...hydrogenLikeParams(), n: 2, l: 1 });

        // The stale first worker reports after the second has already taken over.
        firstWorker.onmessage!({ data: { type: 'success', meshData: fakeMeshData() } });
        secondWorker.onmessage!({ data: { type: 'success', meshData: fakeMeshData() } });

        expect(await firstPending).toEqual({ status: 'superseded' });
        expect((await secondPending).status).toBe('rendered');
        expect(context.isShellView).toBe(false);
    });
});

describe('pointer -> radius (level 1-2 cross-view linkage)', () => {
    it('maps the pointer at the canvas centre to the radius where the ray meets the cut plane', () => {
        const context = buildContext({ ...defaultSurfaceStyle, clipAxis: 'z', clipPosition: 0 });
        // Plane z = 3 (normal (0,0,-1), constant 3 => -z + 3 = 0 => z = 3).
        context.clipPlane.set(new THREE.Vector3(0, 0, -1), 3);

        const r = radiusUnderPointer(context, pointerEventAt(50, 50));

        // Camera at (0,0,10) looking at the origin: the ray through the
        // canvas centre runs straight down -z and meets z=3 at (0,0,3).
        expect(r).not.toBeNull();
        expect(r as number).toBeCloseTo(3);
    });

    it('returns null when there is no cut to read a radius off', () => {
        const context = buildContext({ ...defaultSurfaceStyle, clipAxis: 'none' });

        expect(radiusUnderPointer(context, pointerEventAt(50, 50))).toBeNull();
    });
});

describe('setHoverRadius (radius -> highlight ring, the reverse direction)', () => {
    it('drives the highlight uniform on the current shell view', () => {
        const context = buildContext();
        updateAtomViewInScene(context, atomShellParams());

        setHoverRadius(context, 2.5);

        let material: THREE.ShaderMaterial | undefined;
        context.currentOrbitalGroup!.traverse(child => {
            if (child instanceof THREE.Mesh && child.userData.isCap) material = child.material as THREE.ShaderMaterial;
        });
        expect(material!.uniforms.highlightR.value).toBe(2.5);

        setHoverRadius(context, null);
        expect(material!.uniforms.highlightR.value).toBeLessThan(0);
    });

    it('does nothing when there is no current view (never throws)', () => {
        const context = buildContext();
        expect(() => setHoverRadius(context, 1)).not.toThrow();
        expect(() => setHoverRadius(null, 1)).not.toThrow();
    });
});

// Regression test: the default camera used to sit at (0, 0, initialCameraZ),
// which looks straight down the z axis -- exactly the symmetry axis of every
// m=0 orbital (2p_z, 3d_z^2, 4f_z^3, ...). Viewed from there the near lobe
// hides the far one and the orbital reads as a featureless ball until the
// viewer drags it. defaultCameraPosition must sit off every axis and every
// pairwise symmetry plane so this holds for any m=0 orbital, not just one
// aligned with a particular axis.
describe('defaultCameraPosition (spec bugfix: no axis is viewed edge-on by default)', () => {
    it('is not on the x, y or z axis', () => {
        const p = defaultCameraPosition(12);
        expect(p.x).not.toBe(0);
        expect(p.y).not.toBe(0);
        expect(p.z).not.toBe(0);
    });

    it('is not on the x=y, y=z or x=z symmetry plane', () => {
        const p = defaultCameraPosition(12);
        expect(p.x).not.toBeCloseTo(p.y);
        expect(p.y).not.toBeCloseTo(p.z);
        expect(p.x).not.toBeCloseTo(p.z);
    });

    it('sits at exactly the requested distance from the origin', () => {
        expect(defaultCameraPosition(12).length()).toBeCloseTo(12);
        expect(defaultCameraPosition(1).length()).toBeCloseTo(1);
    });
});

/**
 * End-to-end regression test for task 22's bug 4 ("after i played with the
 * hydrogen-like views, the atom ones don't show anything ... to fix it, i
 * have to reload the page"), reproducing the mechanism through the same two
 * entry points OrbitalViewer.tsx actually calls, in the same order a real
 * session hits them -- not just the isolated unit checks above.
 *
 * The mechanism: `surfaceStyle` (Cut away / Surface) is shared, global state
 * -- switching between atom and hydrogen-like mode never resets it. Turning
 * the cut off is a completely reasonable thing to do in hydrogen-like mode
 * (to see the whole lobe rather than a cross-section), but a shell view (see
 * shellViewClipAxis's doc comment in orbital_visualizer.ts) has no separate
 * surface to fall back on when there is no cut -- its cut face *is* the
 * whole visible object. Before the fix, the inherited 'none' left every
 * subsequent atom-mode shell view invisible, with nothing left to dispatch
 * that would ever correct it -- reproducing "have to reload the page": a
 * fresh mount is the only thing that resets surfaceStyle back to a real
 * axis (see App.tsx's own once-only nudge of the default to 'z').
 */
describe('bug 4 regression: a shell view survives an inherited "no cut" from hydrogen-like mode', () => {
    it('stays visible after switching to hydrogen-like mode with the cut off, then back to atom mode', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();

        // Atom mode's first shell view, cut on (the app's own default nudge).
        updateAtomViewInScene(context, atomShellParams());
        expect(context.currentOrbitalGroup!.visible).toBe(true);

        // Switch to hydrogen-like mode and turn the cut off -- exactly what
        // "playing with the hydrogen-like views" naturally includes, and
        // what OrbitalViewer.tsx's marching-cubes effect calls on every
        // entry into hydrogen-like mode regardless of what changed.
        context.surfaceStyle = { ...context.surfaceStyle, clipAxis: 'none' };
        const pending = updateOrbitalInScene(context, hydrogenLikeParams());
        worker.onmessage!({ data: { type: 'success', meshData: fakeMeshData() } });
        await pending;
        expect(context.isShellView).toBe(false);

        // Switch back to atom mode -- surfaceStyle.clipAxis is still 'none',
        // untouched by either mode switch. Before the fix this shell view
        // rendered with an out-of-range clip plane and a hidden cap: visible
        // for not even one real frame, since both were wrong from the
        // moment this function returned.
        updateAtomViewInScene(context, atomShellParams(), { animate: false });

        expect(context.isShellView).toBe(true);
        expect(context.currentOrbitalGroup!.visible).toBe(true);
        expect(Math.abs(context.clipPlane.constant)).toBeLessThan(atomShellParams().rMax * 10);
        // The fix must not silently "fix" the user's own choice elsewhere --
        // only this shell view's own rendering substitutes a real axis.
        expect(context.surfaceStyle.clipAxis).toBe('none');
    });
});
