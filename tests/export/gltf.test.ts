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

    // Final review M7: the scale is 0.2 m over the longest side, so a
    // non-finite vertex or a zero-size surface would write NaN or Infinity
    // into the root's scale and extras -- refused with STL's reasons instead.
    it('refuses a surface with coordinates that are not numbers, or with no size', async () => {
        const broken = octahedron('nan');
        broken.positions[4] = NaN;
        expect(() => buildGltfScene([broken], 'x')).toThrow('nan has coordinates that are not finite numbers, so it cannot be made into a model.');
        const point = { ...octahedron('point'), positions: new Float32Array(18) };
        expect(() => buildGltfScene([point], 'x')).toThrow('The surface has no size: every vertex is at one point, so there is nothing to scale to a model.');
        await expect(encodeGlb([point], 'x')).rejects.toThrow(/no size/);
    });
});
