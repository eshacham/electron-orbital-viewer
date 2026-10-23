import * as THREE from 'three';

jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { VisualizerContext, presentFieldMesh, clearFieldMesh, frameStructure, frameOrbital, setMoleculeOverlay, pointerRaycaster } from '../../src/orbital_visualizer';
import { overlayExtent } from '../../src/molecules/ball_and_stick';
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

// Ruling T13-I2: with no surface the camera frames the structure by the rule a surface is framed by, and
// leaves the next surface to frame itself exactly as that surface's own link would.
describe('frameStructure', () => {
    it('frames a structure of radius r exactly as a surface of radius r is framed', () => {
        const surface = buildContext();
        presentFieldMesh(surface, mesh(), { boxRMax: 6 }); // mesh radius 2
        const structure = buildContext();
        frameStructure(structure, 2);
        expect(structure.camera.position.length()).toBeCloseTo(surface.camera.position.length(), 9);
    });
    it('keeps the viewing direction, and frames nothing for an empty overlay', () => {
        const context = buildContext();
        context.camera.position.set(0, 6, 8);
        frameStructure(context, 2);
        expect(context.camera.position.clone().normalize().toArray().map(v => Number(v.toFixed(9)))).toEqual([0, 0.6, 0.8]);
        const before = context.camera.position.clone();
        frameStructure(context, 0);
        expect(context.camera.position.toArray()).toEqual(before.toArray());
    });
    it('density → none → density lands the density where its own link would', () => {
        const link = buildContext();
        presentFieldMesh(link, mesh(), { boxRMax: 6 });
        const context = buildContext();
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        clearFieldMesh(context);
        frameStructure(context, 5);
        presentFieldMesh(context, mesh(), { boxRMax: 6 });
        expect(context.camera.position.length()).toBeCloseTo(link.camera.position.length(), 9);
    });
});

// Task 16d item 2 (carried since 6G-1): a molecule whose atoms sit off the origin (glycine's N is at the origin,
// its far O 8.3 a₀ out) was framed by a sphere about the origin, twice its own size, so its first view was small.
// Molecules frames -- and orbits -- the molecule's own centre; the radius is measured about it. Every other caller
// passes no centre and keeps the origin.
describe('framing about a molecule\'s own centre (Task 16d)', () => {
    // A surface 2 a₀ in radius about (8, 0, 0): 10 a₀ from the origin at its far side.
    const offCentre = (): MeshData => ({
        positions: [[6, 0, 0], [10, 0, 0], [8, 2, 0], [8, -2, 0]], cells: [[0, 1, 2], [0, 1, 3]], psiSigns: [1, 1, 1, 1],
        densityMap: { data: new Uint8Array(1), side: 1, rMax: 12 }, isoLevel: 0.001,
    });
    const centred = (): MeshData => ({
        positions: [[-2, 0, 0], [2, 0, 0], [0, 2, 0], [0, -2, 0]], cells: [[0, 1, 2], [0, 1, 3]], psiSigns: [1, 1, 1, 1],
        densityMap: { data: new Uint8Array(1), side: 1, rMax: 12 }, isoLevel: 0.001,
    });
    it('frames an off-centre surface as large as the same surface at the origin, and turns about its centre', () => {
        const atOrigin = buildContext();
        presentFieldMesh(atOrigin, centred(), { boxRMax: 12 });
        const context = buildContext();
        context.camera.position.set(0, 6, 8);
        presentFieldMesh(context, offCentre(), { boxRMax: 12, frameCentre: [8, 0, 0] });
        expect(context.controls.target.toArray()).toEqual([8, 0, 0]);
        const offset = context.camera.position.clone().sub(context.controls.target);
        expect(offset.length()).toBeCloseTo(atOrigin.camera.position.length(), 9);
        // The viewing direction is kept.
        expect(offset.normalize().toArray().map(v => Number(v.toFixed(9)))).toEqual([0, 0.6, 0.8]);
        expect(context.framedCentre).toEqual([8, 0, 0]);
        // What it was before: framed about the origin, 10 a₀ out -- five times as far for this one.
        const before = buildContext();
        presentFieldMesh(before, offCentre(), { boxRMax: 12 });
        expect(before.controls.target.toArray()).toEqual([0, 0, 0]);
        expect(before.camera.position.length()).toBeCloseTo(5 * atOrigin.camera.position.length(), 6);
    });
    it('keeps the clip extent on the surface\'s reach from the origin (the cut plane is about the origin)', () => {
        const context = buildContext();
        expect(presentFieldMesh(context, offCentre(), { boxRMax: 12, frameCentre: [8, 0, 0] })).toBeCloseTo(10, 9);
        expect(context.clipExtent).toBeCloseTo(10, 9);
    });
    it('frames a structure about the centre it is given', () => {
        const context = buildContext();
        frameStructure(context, 2, [8, 0, 0]);
        expect(context.controls.target.toArray()).toEqual([8, 0, 0]);
        const atOrigin = buildContext();
        frameStructure(atOrigin, 2);
        expect(context.camera.position.distanceTo(context.controls.target)).toBeCloseTo(atOrigin.camera.position.length(), 9);
        expect(atOrigin.framedCentre).toBeUndefined();
    });
    it('measures a structure\'s extent about that centre', () => {
        const overlay = new THREE.Group();
        const atom = new THREE.Mesh(new THREE.SphereGeometry(0.5));
        atom.position.set(9, 0, 0);
        overlay.add(atom);
        expect(overlayExtent(overlay)).toBeCloseTo(9.5, 6);
        expect(overlayExtent(overlay, [8, 0, 0])).toBeCloseTo(1.5, 6);
    });
    it('a later frame with no centre (another mode) turns about the origin again', () => {
        const context = buildContext();
        presentFieldMesh(context, offCentre(), { boxRMax: 12, frameCentre: [8, 0, 0] });
        frameOrbital(context, 3);
        expect(context.controls.target.toArray()).toEqual([0, 0, 0]);
        expect(context.framedCentre).toBeUndefined();
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
