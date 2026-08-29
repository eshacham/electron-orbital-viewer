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

import {
    VisualizerContext,
    updateAtomViewInScene,
    radiusUnderPointer,
    setHoverRadius,
} from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, SurfaceStyle } from '../../src/types/orbital';

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
        expect(context.scene.children).toContain(context.currentOrbitalGroup);
    });

    it('shares clearCurrentOrbital/caps lifecycle: a second call disposes the first group and leaves exactly one in the scene', () => {
        const context = buildContext();

        updateAtomViewInScene(context, atomShellParams());
        const firstGroup = context.currentOrbitalGroup;

        updateAtomViewInScene(context, { ...atomShellParams(), contourRadius: 2 });

        expect(context.currentOrbitalGroup).not.toBe(firstGroup);
        expect(context.scene.children).not.toContain(firstGroup);
        expect(context.scene.children).toContain(context.currentOrbitalGroup);
        expect(context.scene.children.filter(c => c.userData.isCapAssembly)).toHaveLength(1);
    });

    it('shares camera framing: frames the camera to the contour radius (not the grid rMax) the first time, and does not reframe at the same scale', () => {
        const context = buildContext();

        updateAtomViewInScene(context, atomShellParams());
        // Framing tracks the contour radius, which actually bounds the
        // visible sphere -- not the much larger sampling-grid rMax (spec
        // bugfix: a heavy atom's grid rMax can be 100x its contour radius).
        expect(context.framedRMax).toBeCloseTo(atomShellParams().contourRadius);
        expect(context.clipExtent).toBeCloseTo(atomShellParams().rMax);
        const distanceAfterFirst = context.camera.position.length();

        // A second call at the same rMax must not move the camera again --
        // the user's chosen angle/zoom is preserved across e.g. an
        // enclosedFraction change that leaves the grid's outer radius alone.
        context.camera.position.set(1, 2, 30);
        updateAtomViewInScene(context, atomShellParams());
        expect(context.camera.position.length()).toBeCloseTo(Math.sqrt(1 + 4 + 900));
        expect(distanceAfterFirst).toBeGreaterThan(0);
    });

    it('shares the caps lifecycle: the whole view is only visible with a cut, because its only content lives on the cut face', () => {
        const context = buildContext({ ...defaultSurfaceStyle, clipAxis: 'none' });
        updateAtomViewInScene(context, atomShellParams());
        // Unlike a marching-cubes orbital, a shell view has no always-visible
        // surface separate from its cap -- currentOrbitalGroup and
        // currentCaps are the very same group (see updateAtomViewInScene),
        // so refreshCaps's visibility toggle covers the whole thing.
        expect(context.currentOrbitalGroup).toBe(context.currentCaps);
        expect(context.currentOrbitalGroup!.visible).toBe(false);

        const cutContext = buildContext({ ...defaultSurfaceStyle, clipAxis: 'z', clipPosition: 0 });
        updateAtomViewInScene(cutContext, atomShellParams());
        expect(cutContext.currentOrbitalGroup!.visible).toBe(true);
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
