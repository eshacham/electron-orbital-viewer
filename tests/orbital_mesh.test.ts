import { generateOrbitalMesh } from '../src/orbital_mesh';
import { makeWaveFunctionEvaluator } from '../src/quantum_functions';
import { MeshData, OrbitalParams } from '../src/types/orbital';

/**
 * Welds vertices that share a position and reports the topology of the result.
 *
 * A closed isosurface must be watertight: every edge is shared by exactly two
 * triangles. An edge used by one triangle is a crack; an edge used by more than
 * two is a non-manifold seam. Both show up as visible holes in the render.
 */
function topology(mesh: MeshData, rMax: number) {
    const ids = new Map<string, number>();
    const welded: number[][] = [];
    const canonical = mesh.positions.map(p => {
        const key = p.map(v => Math.round(v / 1e-9)).join(',');
        if (!ids.has(key)) {
            ids.set(key, welded.length);
            welded.push(p);
        }
        return ids.get(key)!;
    });

    const edges = new Map<string, number>();
    let degenerate = 0;
    for (const [a, b, c] of mesh.cells) {
        const [u, v, w] = [canonical[a], canonical[b], canonical[c]];
        if (u === v || v === w || u === w) degenerate++;
        for (const [i, j] of [[a, b], [b, c], [c, a]]) {
            const [p, q] = [canonical[i], canonical[j]];
            if (p === q) continue;
            const key = p < q ? `${p}_${q}` : `${q}_${p}`;
            edges.set(key, (edges.get(key) ?? 0) + 1);
        }
    }

    // An opening where the surface meets a wall of the sampling box is the box
    // truncating the orbital, not a defect in the mesh. Only openings away from
    // the walls are cracks.
    const onBoxWall = (v: number) =>
        welded[v].some(c => Math.abs(Math.abs(c) - rMax) < 1e-9);

    let cracks = 0;
    let clippedAtBox = 0;
    let nonManifoldEdges = 0;
    for (const [key, count] of edges) {
        if (count > 2) nonManifoldEdges++;
        if (count !== 1) continue;
        const [u, v] = key.split('_').map(Number);
        if (onBoxWall(u) && onBoxWall(v)) clippedAtBox++;
        else cracks++;
    }
    return { cracks, clippedAtBox, nonManifoldEdges, degenerate, triangles: mesh.cells.length };
}

const orbital = (over: Partial<OrbitalParams>): OrbitalParams => ({
    n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, isoLevel: 1e-5, ...over,
});

describe('generateOrbitalMesh', () => {
    // Each of these renders with visible holes before the field is normalised.
    const cases: Array<[string, OrbitalParams]> = [
        ['3d  (n=3 l=2 ml=0) @32', orbital({ resolution: 32 })],
        ['3d  (n=3 l=2 ml=0) @64', orbital({ resolution: 64 })],
        ['7f  (n=7 l=3 ml=0) @64', orbital({ n: 7, l: 3, ml: 0, resolution: 64, rMax: 90, isoLevel: 7e-7 })],
        ['9   (n=9 l=8 ml=8) @64', orbital({ n: 9, l: 8, ml: 8, resolution: 64, rMax: 200, isoLevel: 1e-8 })],
        ['1s  (n=1 l=0 ml=0) @64', orbital({ n: 1, l: 0, ml: 0, resolution: 64, rMax: 10, isoLevel: 1e-3 })],
    ];

    it.each(cases)('produces a crack-free surface for %s', (_name, params) => {
        const mesh = generateOrbitalMesh(params);
        const t = topology(mesh, params.rMax);

        expect(t.triangles).toBeGreaterThan(0);
        expect(t.degenerate).toBe(0);
        expect(t.nonManifoldEdges).toBe(0);
        expect(t.cracks).toBe(0);
    });

    it('closes completely when the box is large enough to contain the orbital', () => {
        // 7f at the app's preset rMax=90 is truncated by the box; at 120 it fits.
        const params = orbital({ n: 7, l: 3, ml: 0, resolution: 64, rMax: 120, isoLevel: 7e-7 });
        const t = topology(generateOrbitalMesh(params), params.rMax);

        expect(t.cracks).toBe(0);
        expect(t.clippedAtBox).toBe(0);
    });

    it('emits one psi sign per vertex, each +1 or -1', () => {
        const mesh = generateOrbitalMesh(orbital({}));
        expect(mesh.psiSigns).toHaveLength(mesh.positions.length);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1, -1]));
    });

    it('reports a usable error when no isosurface exists at the given level', () => {
        expect(() => generateOrbitalMesh(orbital({ isoLevel: 1e-3 })))
            .toThrow(/no isosurface/i);
    });

    it('rejects non-positive parameters', () => {
        expect(() => generateOrbitalMesh(orbital({ rMax: 0 }))).toThrow(/must be positive/);
        expect(() => generateOrbitalMesh(orbital({ isoLevel: 0 }))).toThrow(/must be positive/);
    });
});

describe('psi sign per vertex', () => {
    // The sign carried from the inside grid sample must match psi evaluated
    // directly at the vertex, which is what the colouring used to do.
    it.each([
        ['2pz', { n: 2, l: 1, ml: 0, Z: 1, resolution: 32, rMax: 15, isoLevel: 5e-4 }],
        ['3dz2', { n: 3, l: 2, ml: 0, Z: 1, resolution: 32, rMax: 20, isoLevel: 1e-5 }],
        ['4f', { n: 4, l: 3, ml: 2, Z: 1, resolution: 32, rMax: 35, isoLevel: 4e-6 }],
    ] as Array<[string, OrbitalParams]>)('agrees with psi at the vertex for %s', (_n, params) => {
        const mesh = generateOrbitalMesh(params);
        const psi = makeWaveFunctionEvaluator(params.n, params.l, params.ml, params.Z);

        let mismatches = 0;
        mesh.positions.forEach(([x, y, z], i) => {
            const direct = psi(x, y, z) >= 0 ? 1 : -1;
            if (direct !== mesh.psiSigns[i]) mismatches++;
        });
        expect(mismatches).toBe(0);
    });

    it('puts positive psi on +z for 2pz', () => {
        const params: OrbitalParams = { n: 2, l: 1, ml: 0, Z: 1, resolution: 32, rMax: 15, isoLevel: 5e-4 };
        const mesh = generateOrbitalMesh(params);
        const topmost = mesh.positions.reduce((best, p, i) =>
            p[2] > mesh.positions[best][2] ? i : best, 0);
        expect(mesh.psiSigns[topmost]).toBe(1);
    });
});
