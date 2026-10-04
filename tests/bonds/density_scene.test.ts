import * as THREE from 'three';

jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../../src/workers/createOrbitalWorker';
import { VisualizerContext, updateFieldInScene, DENSITY_SURFACE_COLOUR } from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, MeshData } from '../../src/types/orbital';
import { FieldRenderRequest } from '../../src/field_source';
import { h2plusSource } from '../../src/bonds/h2plus';

function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
    };
}

const mesh: MeshData = {
    positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]], psiSigns: [1, 1, 1],
    densityMap: { data: new Uint8Array(8).fill(200), side: 2, rMax: 8 }, isoLevel: 0.002,
};

async function draw(request: FieldRenderRequest): Promise<VisualizerContext> {
    const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null };
    (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
    const context = buildContext();
    const pending = updateFieldInScene(context, request);
    worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [mesh] } });
    await pending;
    return context;
}

// D12: a request with `sources: []` cannot be sampled at all (updateFieldInScene
// takes boxRMax as the max of the sources' own rMax, which is -Infinity over an
// empty array) -- a real single source stands in for what Bonds mode actually sends.
const source = h2plusSource(2, '1sigma_g');
const base: FieldRenderRequest = {
    sources: [source], colors: ['#ffffff'], memberLabels: ['H₂⁺ 1σg'],
    resolution: 96, enclosedFraction: 0.9, label: 'H₂⁺ 1σg',
};
const vertexColours = (context: VisualizerContext) =>
    Array.from(((context.currentOrbitalGroup!.children[0] as THREE.Mesh).geometry.getAttribute('color').array));

describe('density colour', () => {
    it('paints a density surface and its cut face one colour', async () => {
        const context = await draw({ ...base, densityIsoValue: 0.002 });
        const c = DENSITY_SURFACE_COLOUR;
        expect(vertexColours(context)).toEqual([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b].map(Math.fround));
        const capColours: THREE.Color[] = [];
        context.currentCaps!.traverse(object => {
            const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
            if (material?.uniforms?.positivePhase) capColours.push(material.uniforms.positivePhase.value);
        });
        expect(capColours.length).toBeGreaterThan(0);
        expect(capColours.every(colour => colour.equals(c))).toBe(true);
    });

    it('keeps phase colours for an orbital', async () => {
        const context = await draw(base);
        expect(vertexColours(context).slice(0, 3)).toEqual([1, 0, 0]);
    });
});
