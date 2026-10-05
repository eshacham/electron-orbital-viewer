import * as THREE from 'three';

jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { VisualizerContext, presentFieldMesh, clearFieldMesh, setMoleculeOverlay, pointerRaycaster } from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, MeshData } from '../../src/types/orbital';

/** As tests/atom/visualizer_dispatch.test.ts: a context without a WebGL renderer. */
function buildContext(): VisualizerContext {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: canvas } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
    };
}

const mesh = (): MeshData => ({
    positions: [[0, 0, 0], [2, 0, 0], [0, 2, 0]], cells: [[0, 1, 2]], psiSigns: [1, 1, 1],
    densityMap: { data: new Uint8Array(1), side: 1, rMax: 6 }, isoLevel: 0.001,
});

describe('presentFieldMesh', () => {
    it('draws the mesh with the given vertex colours verbatim', () => {
        const context = buildContext();
        const colors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        expect(presentFieldMesh(context, mesh(), { vertexColors: colors, boxRMax: 6 })).toBeCloseTo(2, 9);
        const surface = context.currentOrbitalGroup!.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh;
        expect(Array.from((surface.geometry.getAttribute('color') as THREE.BufferAttribute).array)).toEqual(Array.from(colors));
    });
    it('refuses colours that do not match the vertices', () => {
        expect(() => presentFieldMesh(buildContext(), mesh(), { vertexColors: new Float32Array(3), boxRMax: 6 })).toThrow(/3 vertices/);
    });
    it('re-frames only when the box changes, and supersedes any calculation in flight', () => {
        const context = buildContext();
        const worker = { terminate: jest.fn() } as unknown as Worker;
        context.activeWorker = worker;
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(worker.terminate).toHaveBeenCalled();
        expect(context.requestCounter).toBe(1);
        const framed = context.camera.position.clone();
        context.camera.position.set(1, 2, 3);
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(context.camera.position.toArray()).toEqual([1, 2, 3]);
        presentFieldMesh(context, mesh(), { boxRMax: 7 });
        expect(context.camera.position.length()).toBeCloseTo(framed.length(), 6);
    });
    it('clearFieldMesh empties the scene of the surface', () => {
        const context = buildContext();
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        clearFieldMesh(context);
        expect(context.currentOrbitalGroup).toBeNull();
    });
});

describe('the molecule overlay', () => {
    it('is added, replaced (disposing the old one) and removed, independent of the surface', () => {
        const context = buildContext();
        const first = new THREE.Group();
        const material = new THREE.MeshBasicMaterial();
        const dispose = jest.spyOn(material, 'dispose');
        first.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
        setMoleculeOverlay(context, first);
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(context.scene.children).toContain(first);
        const second = new THREE.Group();
        setMoleculeOverlay(context, second);
        expect(context.scene.children).not.toContain(first);
        expect(dispose).toHaveBeenCalled();
        setMoleculeOverlay(context, null);
        expect(context.scene.children).not.toContain(second);
    });
    it('casts the pointer ray through the canvas', () => {
        const ray = pointerRaycaster(buildContext(), { clientX: 50, clientY: 50 } as PointerEvent).ray;
        expect(ray.direction.z).toBeCloseTo(-1, 6);
    });
});
