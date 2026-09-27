import { encodeStl, StlExportError } from '../../src/export/stl';
import { octahedron } from './fixtures';

const floatsAt = (buffer: ArrayBuffer, offset: number, count: number) =>
    Array.from({ length: count }, (_, i) => new DataView(buffer).getFloat32(offset + 4 * i, true));

describe('encodeStl', () => {
    it('writes binary STL: an 80-byte header, a count, 50 bytes per triangle', () => {
        const buffer = encodeStl([octahedron()], 50);
        expect(buffer.byteLength).toBe(84 + 50 * 8);
        expect(new DataView(buffer).getUint32(80, true)).toBe(8);
        const header = String.fromCharCode(...new Uint8Array(buffer, 0, 80));
        expect(header.startsWith('solid')).toBe(false);
        expect(header).toContain('millimetres, 1 a0 = 25.00 mm');
    });

    it('scales the longest side to the chosen size in millimetres', () => {
        // First triangle's first vertex: (1, 0, 0) bohr, 2 bohr across, printed 50 mm across.
        expect(floatsAt(encodeStl([octahedron()], 50), 84 + 12, 3)).toEqual([25, 0, 0]);
    });

    it('winds every triangle outward, flipping a surface wound inward', () => {
        const inward = octahedron();
        for (let t = 0; t < inward.indices.length; t += 3) [inward.indices[t + 1], inward.indices[t + 2]] = [inward.indices[t + 2], inward.indices[t + 1]];
        const buffer = encodeStl([inward], 50);
        for (let t = 0; t < 8; t++) {
            const [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz] = floatsAt(buffer, 84 + 50 * t, 12);
            expect(nx * (ax + bx + cx) + ny * (ay + by + cy) + nz * (az + bz + cz)).toBeGreaterThan(0);
        }
    });

    it('refuses an open surface or nothing at all, saying why', () => {
        const open = { ...octahedron('2p_z'), indices: octahedron().indices.slice(0, 21) };
        expect(() => encodeStl([open], 50)).toThrow(StlExportError);
        expect(() => encodeStl([open], 50)).toThrow(/2p_z is not watertight/);
        expect(() => encodeStl([], 50)).toThrow(/Nothing to export yet/);
    });
});
