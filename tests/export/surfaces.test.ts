import * as THREE from 'three';
import { collectExportSurfaces, markExportSurface, surfaceBounds } from '../../src/export/surfaces';
import { isWatertight, meshTopology } from '../../src/export/mesh_topology';
import { createFieldOverlayGroup } from '../../src/field_overlay_view';
import { createCompositionLobesGroup } from '../../src/atom/shell_composition_view';
import { fieldRequestFor } from '../../src/combinations';
import { generateFieldMeshes } from '../../src/orbital_mesh';
import { defaultSurfaceStyle } from '../../src/types/orbital';
import { encodeStl } from '../../src/export/stl';
import { octahedron } from './fixtures';

const triangle = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    return geometry;
};

describe('collectExportSurfaces', () => {
    it('takes only marked meshes, in world space, coloured by their material', () => {
        const root = new THREE.Group();
        root.position.set(1, 0, 0);
        const marked = new THREE.Mesh(triangle(), new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.5, 0) }));
        markExportSurface(marked, '2p_x');
        root.add(marked, new THREE.Mesh(triangle(), new THREE.MeshBasicMaterial()));
        const surfaces = collectExportSurfaces(root);
        expect(surfaces).toHaveLength(1);
        expect(surfaces[0].name).toBe('2p_x');
        expect(Array.from(surfaces[0].positions)).toEqual([1, 0, 0, 2, 0, 0, 1, 1, 0]);
        expect(Array.from(surfaces[0].indices)).toEqual([0, 1, 2]);
        expect(Array.from(surfaces[0].colors.slice(0, 3))).toEqual([1, 0.5, 0]);
    });

    it('keeps per-vertex colours where the mesh has them (the ψ phase)', () => {
        const geometry = triangle();
        geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 1, 0, 0], 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
        markExportSurface(mesh, 'surface');
        expect(Array.from(collectExportSurfaces(mesh)[0].colors)).toEqual([1, 0, 0, 0, 0, 1, 1, 0, 0]);
    });

    it('returns nothing without a scene, and measures bounds', () => {
        expect(collectExportSurfaces(null)).toEqual([]);
        expect(surfaceBounds([octahedron()]).longestSide).toBe(2);
    });

    it('splits a merged mesh into its members, each with only its own vertices', () => {
        // Two octahedra side by side in one buffer, the second shifted +3 in x.
        const one = octahedron();
        const positions = [...one.positions, ...Array.from(one.positions, (v, i) => (i % 3 === 0 ? v + 3 : v))];
        const indices = [...one.indices, ...Array.from(one.indices, i => i + 6)];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
        markExportSurface(mesh, 'pair', [
            { name: 'left', start: 0, count: 24 },
            { name: 'right', start: 24, count: 24 },
        ]);
        const surfaces = collectExportSurfaces(mesh);
        expect(surfaces.map(s => s.name)).toEqual(['left', 'right']);
        expect(surfaces[1].positions).toHaveLength(18);
        expect(Array.from(surfaces[1].positions.slice(0, 3))).toEqual([4, 0, 0]);
        expect(Array.from(surfaces[1].indices)).toEqual(Array.from(one.indices));
        expect(surfaces[1].colors).toHaveLength(18);
    });

    it('names each composition lobe after its orbital', () => {
        const component = (ml: number) => ({ n: 2, l: 1, ml, occupancyFraction: 1, colorIndex: 0 });
        const lobe = { positions: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], cells: [[0, 1, 2]] };
        const group = createCompositionLobesGroup([component(1), component(-1)], [lobe, lobe], [], 1);
        expect(collectExportSurfaces(group).map(s => s.name)).toEqual(['2p_x', '2p_y']);
    });
});

// Ruling C4: an overlay is one merged mesh, and the sp³ members meet at
// identical vertices on the symmetric grid, so welded as one they would share
// edges between four triangles. Each member is its own surface instead, and
// each of those must be a closed, consistently wound solid.
describe('an sp³ overlay, exported', () => {
    const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }, 0.9)!;
    const meshes = generateFieldMeshes(request);
    const group = createFieldOverlayGroup(meshes, request.colors, defaultSurfaceStyle, []);
    const surfaces = collectExportSurfaces(group);

    it('would not pass as one mesh: the members meet at shared vertices', () => {
        const merged = group.children[0] as THREE.Mesh;
        const positions = Float32Array.from(merged.geometry.getAttribute('position').array as ArrayLike<number>);
        const indices = Uint32Array.from(merged.geometry.getIndex()!.array as ArrayLike<number>);
        expect(meshTopology(positions, indices).nonManifoldEdges).toBeGreaterThan(0);
    });

    it('is one surface per member, holding exactly that member\'s triangles', () => {
        expect(surfaces).toHaveLength(4);
        surfaces.forEach((surface, i) => {
            expect(surface.indices.length).toBe(meshes[i].cells.length * 3);
            expect(surface.positions.length).toBe(meshes[i].positions.length * 3);
        });
    });

    it.each([0, 1, 2, 3])('member %i is manifold and consistently oriented', i => {
        const report = meshTopology(surfaces[i].positions, surfaces[i].indices);
        expect(report).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0, misorientedEdges: 0 });
        expect(isWatertight(report)).toBe(true);
    });

    it('prints, every member\'s triangles in one STL', () => {
        const triangles = meshes.reduce((sum, mesh) => sum + mesh.cells.length, 0);
        expect(new DataView(encodeStl(surfaces, 50)).getUint32(80, true)).toBe(triangles);
    });
});
