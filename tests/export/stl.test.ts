import { encodeStl, StlExportError } from '../../src/export/stl';
import { ExportSurface } from '../../src/export/surfaces';
import { octahedron } from './fixtures';

const floatsAt = (buffer: ArrayBuffer, offset: number, count: number) =>
    Array.from({ length: count }, (_, i) => new DataView(buffer).getFloat32(offset + 4 * i, true));

const triangleCount = (buffer: ArrayBuffer) => new DataView(buffer).getUint32(80, true);

/** The octahedron with one more pair of triangles, so each extra triangle is back-to-back with the other. */
function withTriangles(extra: number[], name = 'octa'): ExportSurface {
    const base = octahedron(name);
    return { ...base, indices: Uint32Array.from([...base.indices, ...extra]) };
}

/** Every triangle its own three vertices, as an STL reader or a naive mesher hands them over. */
function soup(surface: ExportSurface): ExportSurface {
    const positions = Float32Array.from(Array.from(surface.indices).flatMap(v => Array.from(surface.positions.subarray(3 * v, 3 * v + 3))));
    return {
        name: surface.name, positions,
        indices: Uint32Array.from(surface.indices, (_, i) => i),
        colors: new Float32Array(positions.length).fill(1),
    };
}

describe('encodeStl', () => {
    it('writes binary STL: an 80-byte header, a count, 50 bytes per triangle', () => {
        const buffer = encodeStl([octahedron()], 50);
        expect(buffer.byteLength).toBe(84 + 50 * 8);
        expect(triangleCount(buffer)).toBe(8);
        const header = String.fromCharCode(...new Uint8Array(buffer, 0, 80));
        expect(header.startsWith('solid')).toBe(false);
        expect(header).toContain('millimetres, 1 a0 = 25.00 mm');
    });

    it('states the scale to four significant figures, however small', () => {
        // 2 bohr printed 3 mm across: 1.5 mm per bohr; 2 bohr at 0.03 mm would read "0.02" at two decimals.
        const header = (mm: number) => String.fromCharCode(...new Uint8Array(encodeStl([octahedron()], mm), 0, 80));
        expect(header(3)).toContain('1 a0 = 1.500 mm');
        expect(header(0.0333)).toContain('1 a0 = 0.01665 mm');
    });

    it('scales the longest side to the chosen size in millimetres', () => {
        // First triangle's first vertex: (1, 0, 0) bohr, 2 bohr across, printed 50 mm across.
        expect(floatsAt(encodeStl([octahedron()], 50), 84 + 12, 3)).toEqual([25, 0, 0]);
    });

    it('winds every triangle outward, flipping a surface wound inward -- the vertices, not only the stored normal', () => {
        const inward = octahedron();
        for (let t = 0; t < inward.indices.length; t += 3) [inward.indices[t + 1], inward.indices[t + 2]] = [inward.indices[t + 2], inward.indices[t + 1]];
        const buffer = encodeStl([inward], 50);
        for (let t = 0; t < 8; t++) {
            const [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz] = floatsAt(buffer, 84 + 50 * t, 12);
            const centroid = [ax + bx + cx, ay + by + cy, az + bz + cz];
            expect(nx * centroid[0] + ny * centroid[1] + nz * centroid[2]).toBeGreaterThan(0);
            // The right-hand normal of the written corners, a -> b -> c: what a slicer reads when it ignores the stored one.
            const [ux, uy, uz, wx, wy, wz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
            const winding = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
            expect(winding[0] * centroid[0] + winding[1] * centroid[1] + winding[2] * centroid[2]).toBeGreaterThan(0);
        }
    });

    it('welds a triangle soup, and prints it as the solid it is', () => {
        const buffer = encodeStl([soup(octahedron())], 50);
        expect(triangleCount(buffer)).toBe(8);
    });

    it('drops a triangle with no area and prints the rest', () => {
        // A seventh vertex on top of vertex 0: the triangle (0, 6, 2) has two corners at one point.
        const base = octahedron();
        const surface = {
            ...base,
            positions: Float32Array.from([...base.positions, 1, 0, 0]),
            indices: Uint32Array.from([...base.indices, 0, 6, 2]),
            colors: new Float32Array(21).fill(1),
        };
        expect(triangleCount(encodeStl([surface], 50))).toBe(8);
    });

    it('writes welded corners with bit-identical coordinates', () => {
        // Vertex 0 again, a hair off: within the weld tolerance, so the check saw one vertex -- the file must too.
        const base = soup(octahedron());
        const nudged = base.positions.slice();
        for (let i = 0; i < nudged.length; i += 3) if (nudged[i] === 1) nudged[i] = Math.fround(1 + 1e-7);
        nudged[0] = 1;
        const buffer = encodeStl([{ ...base, positions: nudged }], 50);
        const xs = new Set<number>();
        for (let t = 0; t < 8; t++) {
            for (let corner = 0; corner < 3; corner++) {
                const [x, y, z] = floatsAt(buffer, 84 + 50 * t + 12 + 12 * corner, 3);
                if (y === 0 && z === 0 && x > 0) xs.add(x);
            }
        }
        // One value, not two a float apart (the scale itself moves a hair with the nudged bounds).
        expect(xs.size).toBe(1);
    });

    describe('refuses, saying why', () => {
        it('an open surface, suggesting a lower enclosed fraction', () => {
            const open = { ...octahedron('2p_z'), indices: octahedron().indices.slice(0, 21) };
            expect(() => encodeStl([open], 50)).toThrow(StlExportError);
            expect(() => encodeStl([open], 50)).toThrow('2p_z is not watertight (3 open edges), so it would not print as a solid. Try a lower enclosed fraction.');
        });

        it('edges shared by more than two triangles, without the enclosed-fraction hint', () => {
            // A fin: triangle (0, 2, 4) doubled, back to back, on top of the octahedron's own.
            expect(() => encodeStl([withTriangles([0, 2, 4, 0, 4, 2], 'fin')], 50))
                .toThrow('fin is not watertight (3 edges shared by more than two triangles), so it would not print as a solid.');
            expect(() => encodeStl([withTriangles([0, 2, 4, 0, 4, 2])], 50)).not.toThrow(/enclosed fraction/);
        });

        it('a triangle wound against its neighbours, without the hint', () => {
            const flipped = octahedron('flip');
            [flipped.indices[1], flipped.indices[2]] = [flipped.indices[2], flipped.indices[1]];
            expect(() => encodeStl([flipped], 50))
                .toThrow('flip is not watertight (3 edges wound inconsistently), so it would not print as a solid.');
        });

        it('a surface whose every triangle has no area', () => {
            const flat = { ...octahedron('flat'), indices: Uint32Array.from([0, 0, 2]) };
            expect(() => encodeStl([flat], 50))
                .toThrow('flat is not watertight (no triangles with area), so it would not print as a solid.');
        });

        it('nothing at all', () => {
            expect(() => encodeStl([], 50)).toThrow(/Nothing to export yet/);
        });

        it('a surface with no size, or with coordinates that are not numbers -- not "pick a print size"', () => {
            const point = { ...octahedron('dot'), positions: new Float32Array(18) };
            expect(() => encodeStl([point], 50)).toThrow('The surface has no size: every vertex is at one point, so there is nothing to scale to a print.');
            const broken = octahedron('nan');
            broken.positions[4] = NaN;
            expect(() => encodeStl([broken], 50)).toThrow('nan has coordinates that are not finite numbers, so it cannot be printed.');
            broken.positions[4] = Infinity;
            expect(() => encodeStl([broken], 50)).toThrow(/not finite/);
        });

        it('a print size that is not one', () => {
            for (const mm of [0, -5, NaN, Infinity]) expect(() => encodeStl([octahedron()], mm)).toThrow('Pick a print size.');
        });
    });
});
