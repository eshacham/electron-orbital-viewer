import * as THREE from 'three';

// GLTFExporter ships only as an ES module, which this project's ts-jest cannot
// load (see orbital_controls_factory.ts), so the factory is mocked.
jest.mock('../../src/export/gltf_exporter_factory', () => ({ exportGlb: jest.fn(async () => new ArrayBuffer(12)) }));

import { buildGltfScene, encodeGlb } from '../../src/export/gltf';
import { exportGlb } from '../../src/export/gltf_exporter_factory';
import { octahedron } from './fixtures';

describe('glTF export', () => {
    it('builds one vertex-coloured mesh per surface, scaled to a 20 cm model', () => {
        const scene = buildGltfScene([octahedron('a'), octahedron('b')], 'Neon, 2p subshell');
        const root = scene.children[0];
        expect(root.children.map(child => child.name)).toEqual(['a', 'b']);
        expect(root.scale.x * 2).toBeCloseTo(0.2, 9);
        expect(root.userData).toMatchObject({ unit: 'bohr', description: 'Neon, 2p subshell', metresPerBohr: 0.1 });
        const mesh = root.children[0] as THREE.Mesh;
        expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
        expect(mesh.geometry.getAttribute('color').count).toBe(6);
    });

    it('hands the scene to the exporter, and refuses an empty one', async () => {
        expect((await encodeGlb([octahedron()], 'x')).byteLength).toBe(12);
        expect(exportGlb).toHaveBeenCalledTimes(1);
        await expect(encodeGlb([], 'x')).rejects.toThrow(/Nothing to export yet/);
    });
});
