/** @jest-environment node */
// node, not jsdom (D18): it needs Node's fetch and the real gzip/DecompressionStream
// path loader.test.ts already exercises; no jsdom + node:stream/web shim here.
import { gzipSync, gunzipSync } from 'zlib';
import { readFileSync } from 'fs';
import path from 'path';
import { fetchFloat32Grid } from '../../src/molecules/binary';
import { MoleculeLoadError, MOLECULES_BASE_URL } from '../../src/molecules/loader';
import { sampleTrilinear, loadEspGrid, ScalarGrid } from '../../src/molecules/esp';
import { asLibraryMeta } from '../../src/molecules/library_types';
import { waterMeta } from './fixtures';

const floats = (values: number[]) => new Uint8Array(new Float32Array(values).buffer);

let fetchMock: jest.SpyInstance;
beforeEach(() => { fetchMock = jest.spyOn(globalThis, 'fetch'); });
afterEach(() => fetchMock.mockRestore());

describe('fetchFloat32Grid', () => {
    it('decodes the expected number of floats', async () => {
        fetchMock.mockResolvedValue(new Response(new Uint8Array(gzipSync(Buffer.from(floats([1, 2, 3, 4]))))));
        expect(Array.from(await fetchFloat32Grid('/x.bin.gz', 4))).toEqual([1, 2, 3, 4]);
    });
    it('says what went wrong, never returns a short grid', async () => {
        fetchMock.mockResolvedValueOnce(new Response(floats([1, 2, 3])));
        await expect(fetchFloat32Grid('/x.bin.gz', 4)).rejects.toThrow('expected 4 values, got 3');
        fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
        await expect(fetchFloat32Grid('/x.bin.gz', 4)).rejects.toThrow(MoleculeLoadError);
        fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
        await expect(fetchFloat32Grid('/x.bin.gz', 4)).rejects.toThrow('HTTP 404');
    });
});

describe('sampleTrilinear', () => {
    it('reads the shared Python fixture at the same (i, j, k): 100 i + 10 j + k', () => {
        const bytes = gunzipSync(readFileSync(path.resolve(__dirname, '../fixtures/molecules/axis_order.bin.gz')));
        const grid: ScalarGrid = { shape: [2, 3, 4], origin: [0, 0, 0], spacing: 1, values: new Float32Array(bytes.buffer, bytes.byteOffset, 24) };
        expect(sampleTrilinear(grid, 1, 2, 3)).toBe(123);
        expect(sampleTrilinear(grid, 0.5, 1, 0)).toBeCloseTo(60, 6);
    });
    it('is exact for a linear field and clamps outside the box', () => {
        const n = 5;
        const values = new Float32Array(n ** 3);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) values[(i * n + j) * n + k] = 2 * i - j + 0.5 * k;
        const grid: ScalarGrid = { shape: [n, n, n], origin: [-2, -2, -2], spacing: 1, values };
        const f = (x: number, y: number, z: number) => 2 * (x + 2) - (y + 2) + 0.5 * (z + 2);
        expect(sampleTrilinear(grid, 0.3, -1.7, 1.25)).toBeCloseTo(f(0.3, -1.7, 1.25), 5);
        expect(sampleTrilinear(grid, 99, -99, 0)).toBeCloseTo(f(2, -2, 0), 5);
    });
});

describe('loadEspGrid and asLibraryMeta', () => {
    it('loads the coarse grid named in meta.espGrid, from the versioned folder (D7)', async () => {
        const meta = waterMeta({ espGrid: { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2 } });
        fetchMock.mockResolvedValue(new Response(floats([0, 1, 2, 3, 4, 5, 6, 7])));
        const grid = await loadEspGrid(meta);
        expect(fetchMock).toHaveBeenCalledWith(`${MOLECULES_BASE_URL}/h2o/esp.bin.gz`);
        expect(grid.values[7]).toBe(7);
        expect(grid.shape).toEqual([2, 2, 2]);
    });
    it('accepts an explicit baseUrl (tests only)', async () => {
        const meta = waterMeta({ espGrid: { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2 } });
        fetchMock.mockResolvedValue(new Response(floats([0, 1, 2, 3, 4, 5, 6, 7])));
        await loadEspGrid(meta, '/molecules');
        expect(fetchMock).toHaveBeenCalledWith('/molecules/h2o/esp.bin.gz');
    });
    it('refuses a meta.json that predates the library', () => {
        const { espGrid, ...old } = waterMeta() as unknown as Record<string, unknown>;
        void espGrid;
        expect(() => asLibraryMeta(old as never)).toThrow('h2o: meta.json has no espGrid');
    });
    // Every library surface is meshed from, or framed on, the density grid's box (render_plan's gridHalfWidth).
    it('refuses a meta.json with no density grid', () => {
        const { grid, ...old } = waterMeta() as unknown as Record<string, unknown>;
        void grid;
        expect(() => asLibraryMeta(old as never)).toThrow('h2o: meta.json has no grid');
    });
});
