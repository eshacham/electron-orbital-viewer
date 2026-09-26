import * as THREE from 'three';

jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../src/workers/createOrbitalWorker';
import { VisualizerContext, updateFieldInScene, setSurfaceStyle, cancelPendingRender, clearScene } from '../src/orbital_visualizer';
import { overlayVertexColors, NEGATIVE_PHASE_SHADE } from '../src/field_overlay_view';
import { defaultSurfaceStyle, MeshData } from '../src/types/orbital';
import { FieldRenderRequest } from '../src/field_source';
import { fieldRequestFor } from '../src/combinations';

function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(),
        camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null,
        currentAxesHelper: null,
        isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle },
        clipPlane,
        clippingPlanes: [clipPlane],
        currentCaps: null,
        activeWorker: null,
        requestCounter: 0,
    };
}

function fakeMesh(offset: number, signs: number[] = [1, 1, -1]): MeshData {
    return {
        positions: [[offset, 0, 0], [offset + 1, 0, 0], [offset, 1, 0]],
        cells: [[0, 1, 2]],
        psiSigns: signs,
        densityMap: { data: new Uint8Array(1), side: 1, rMax: 21 },
        isoLevel: 1e-4,
    };
}

function fakeWorker() {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null as ((e: { data: unknown }) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
    };
}

const overlay: FieldRenderRequest = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp', member: 'all' }, 0.9)!;
const single: FieldRenderRequest = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp', member: 0 }, 0.9)!;

describe('overlayVertexColors', () => {
    it('colours each member its own colour, darker where ψ < 0', () => {
        const colors = overlayVertexColors([fakeMesh(0), fakeMesh(5, [1, -1, 1])], ['#ffd166', '#06d6a0']);
        const first = new THREE.Color('#ffd166');
        const second = new THREE.Color('#06d6a0');
        expect(Array.from(colors.slice(0, 3))).toEqual([first.r, first.g, first.b].map(c => Math.fround(c)));
        expect(Array.from(colors.slice(6, 9))).toEqual([first.r, first.g, first.b].map(c => Math.fround(c * NEGATIVE_PHASE_SHADE)));
        expect(Array.from(colors.slice(12, 15))).toEqual([second.r, second.g, second.b].map(c => Math.fround(c * NEGATIVE_PHASE_SHADE)));
    });
});

describe('updateFieldInScene', () => {
    it('asks the worker for every source in one message', () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        void updateFieldInScene(buildContext(), overlay);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'calculateFields', request: overlay });
    });

    it('draws several sources as one merged overlay mesh, without cut-face caps', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, overlay);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });

        expect(await pending).toEqual({ status: 'rendered', isoLevel: 1e-4 });
        const group = context.currentOrbitalGroup!;
        expect(group.userData.isFieldOverlay).toBe(true);
        const meshes = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
        expect(meshes).toHaveLength(1);
        expect(meshes[0].geometry.getAttribute('position').count).toBe(6);
        expect(Array.from(meshes[0].geometry.getIndex()!.array)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(context.currentCaps).toBeNull();
    });

    it('draws a single source like any orbital, with its cut-face caps', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, single);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0)] } });
        await pending;
        expect(context.currentOrbitalGroup!.userData.isFieldOverlay).toBeUndefined();
        expect(context.currentCaps).not.toBeNull();
    });

    it('drops a result a newer request has superseded', async () => {
        const first = fakeWorker();
        const second = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second);
        const context = buildContext();
        const firstPending = updateFieldInScene(context, overlay);
        const secondPending = updateFieldInScene(context, single);
        first.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });
        second.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0)] } });
        expect(await firstPending).toEqual({ status: 'superseded' });
        expect((await secondPending).status).toBe('rendered');
        expect(context.currentOrbitalGroup!.userData.isFieldOverlay).toBeUndefined();
    });

    it('reports a worker error as a failure', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const pending = updateFieldInScene(buildContext(), single);
        worker.onmessage!({ data: { type: 'error', message: 'A field of 0.08 a.u. is refused' } });
        await expect(pending).rejects.toThrow(/refused/);
    });

    it('drops a fieldsSuccess reply that arrives after the context was disposed, without building an overlay', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, overlay);
        // cleanupVisualizer terminates the worker but never bumps
        // requestCounter, so a reply already posted before it runs can still
        // reach onmessage with superseded() false -- isDisposed is the only
        // signal left to catch it.
        context.isDisposed = true;
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });

        expect(await pending).toEqual({ status: 'superseded' });
        expect(context.currentOrbitalGroup).toBeNull();
        expect(context.scene.children).toHaveLength(0);
    });

    // Review Focus 5.
    it('restyles the overlay without recomputing', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, overlay);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });
        await pending;
        (createOrbitalWorker as jest.Mock).mockClear();

        setSurfaceStyle(context, { mode: 'wireframe', opacity: 0.4, clipAxis: 'x', clipPosition: 0 });
        const material = (context.currentOrbitalGroup!.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(material.wireframe).toBe(true);
        expect(material.opacity).toBeCloseTo(0.4, 12);
        expect(context.clipPlane.normal.toArray()).toEqual([-1, 0, 0]);
        expect(createOrbitalWorker).not.toHaveBeenCalled();
    });
});

// Final review: nothing asked for any more -- a refused selection, or a
// combination dropped on the way to atom mode -- must stop the worker and
// make its late result a no-op, and in Basic Orbitals take the picture down.
describe('cancelPendingRender and clearScene', () => {
    it('stops a field worker in flight, so its result never lands', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, overlay);

        cancelPendingRender(context);
        expect(worker.terminate).toHaveBeenCalled();
        expect(context.activeWorker).toBeNull();

        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });
        expect(await pending).toEqual({ status: 'superseded' });
        expect(context.currentOrbitalGroup).toBeNull();
    });

    it('leaves the scene alone when nothing is in flight', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, single);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0)] } });
        await pending;
        const counter = context.requestCounter;

        cancelPendingRender(context);
        expect(context.requestCounter).toBe(counter);
        expect(context.currentOrbitalGroup).not.toBeNull();
    });

    it('clearScene takes down what is drawn and anything still coming', async () => {
        const first = fakeWorker();
        const second = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second);
        const context = buildContext();
        const drawn = updateFieldInScene(context, single);
        first.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0)] } });
        await drawn;
        expect(context.scene.children.length).toBeGreaterThan(0);
        const pending = updateFieldInScene(context, overlay);

        clearScene(context);
        expect(context.currentOrbitalGroup).toBeNull();
        expect(context.currentAxesHelper).toBeNull();
        expect(context.scene.children).toHaveLength(0);
        second.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });
        expect(await pending).toEqual({ status: 'superseded' });
        expect(context.scene.children).toHaveLength(0);
    });
});
