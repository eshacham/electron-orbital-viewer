import { meshTopology, isWatertight } from '../../src/export/mesh_topology';
import { generateOrbitalMesh } from '../../src/orbital_mesh';
import { computeSamplingRadius } from '../../src/orbital_presets';
import { octahedron } from './fixtures';

describe('meshTopology', () => {
    it('passes a closed, outward-wound solid', () => {
        const { positions, indices } = octahedron();
        const report = meshTopology(positions, indices);
        expect(report).toMatchObject({ triangles: 8, boundaryEdges: 0, nonManifoldEdges: 0, misorientedEdges: 0 });
        expect(report.signedVolume).toBeCloseTo(4 / 3, 9);
        expect(isWatertight(report)).toBe(true);
    });

    it('finds an opening and a flipped triangle', () => {
        const { positions, indices } = octahedron();
        expect(meshTopology(positions, indices.slice(0, 21)).boundaryEdges).toBe(3);
        const flipped = indices.slice();
        [flipped[1], flipped[2]] = [flipped[2], flipped[1]];
        expect(meshTopology(positions, flipped).misorientedEdges).toBe(3);
        expect(isWatertight(meshTopology(positions, flipped))).toBe(false);
    });

    // Spec §5 Phase 2: "exported STL passes a manifold check" — on the app's real surfaces.
    it.each([[2, 1, 0], [3, 2, 0]])('the app\'s own %i,%i,%i surface is watertight', (n, l, ml) => {
        const mesh = generateOrbitalMesh({ n, l, ml, Z: 1, resolution: 32, rMax: computeSamplingRadius(n, l, 1), enclosedFraction: 0.9 });
        const report = meshTopology(Float32Array.from(mesh.positions.flat()), Uint32Array.from(mesh.cells.flat()));
        expect(isWatertight(report)).toBe(true);
    });
});
