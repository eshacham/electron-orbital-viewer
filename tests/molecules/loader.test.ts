/** @jest-environment node */
// node, not jsdom: it needs Node's fetch, Blob and DecompressionStream.
import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
    moleculePath, loadMoleculeMeta, loadMoleculeIndex, loadBasis, loadDensityGrid, decodeFloat32,
    clearMoleculeCacheForTests, MoleculeLoadError, MOLECULES_BASE_URL,
} from '../../src/molecules/loader';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';
import { MoleculeMeta } from '../../src/molecules/types';

const ROOT = join(__dirname, '../..');
const FIXTURES = join(ROOT, 'tests/fixtures/molecules');
const asArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const floats = new Float32Array([1, 2.5, -3]);

let fetchMock: jest.SpyInstance;
beforeEach(() => {
    clearMoleculeCacheForTests();
    fetchMock = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

describe('MOLECULES_BASE_URL', () => {
    it('is versioned (ruling C1): the loader reads the published release, not a floating /molecules', () => {
        expect(MOLECULES_BASE_URL).toBe(`/molecules/${MOLECULE_DATA_VERSION}`);
    });
});

describe('moleculePath', () => {
    it('maps a molecule and a scan point to their folders', () => {
        expect(moleculePath('n2')).toBe(`${MOLECULES_BASE_URL}/n2`);
        expect(moleculePath('n2@07')).toBe(`${MOLECULES_BASE_URL}/n2/scan/07`);
    });
    it.each(['', 'N2', '../x', 'n2@7', 'n2@07@1'])('refuses %p', id => {
        expect(() => moleculePath(id)).toThrow(MoleculeLoadError);
    });
});

describe('fetching', () => {
    it('names a basis after the path it came from', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ nao: 1 })));
        await expect(loadBasis('o2@03')).resolves.toEqual({ nao: 1, id: 'o2@03' });
        expect(fetchMock).toHaveBeenCalledWith(`${MOLECULES_BASE_URL}/o2/scan/03/basis.json`);
    });

    it('loads meta once and reuses it', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'n2' })));
        await loadMoleculeMeta('n2@07');
        await loadMoleculeMeta('n2@07');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${MOLECULES_BASE_URL}/n2/scan/07/meta.json`);
    });

    it('names the file and status on failure, and retries next time', async () => {
        fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
        await expect(loadMoleculeIndex()).rejects.toThrow(`Could not load ${MOLECULES_BASE_URL}/index.json (HTTP 404)`);
        fetchMock.mockResolvedValueOnce(new Response('[]'));
        await expect(loadMoleculeIndex()).resolves.toEqual([]);
    });

    it('says when it cannot reach the server', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(loadMoleculeMeta('o2')).rejects.toThrow(new RegExp(`Could not reach ${MOLECULES_BASE_URL}/o2/meta.json`));
    });
});

describe('decodeFloat32', () => {
    it('inflates gzip', async () => {
        const bytes = asArrayBuffer(gzipSync(Buffer.from(floats.buffer)));
        expect(Array.from(await decodeFloat32(bytes, 3, 'x'))).toEqual([1, 2.5, -3]);
    });

    // Review Focus 5: a server that set Content-Encoding: gzip hands over inflated bytes.
    it('accepts bytes a server already inflated', async () => {
        expect(Array.from(await decodeFloat32(floats.slice().buffer, 3, 'x'))).toEqual([1, 2.5, -3]);
    });

    it('refuses the wrong length', async () => {
        await expect(decodeFloat32(floats.slice().buffer, 4, 'd.bin.gz')).rejects.toThrow('d.bin.gz: expected 4 values, got 3');
    });

    it('says so when the browser cannot decompress', async () => {
        const saved = globalThis.DecompressionStream;
        // @ts-expect-error -- simulating an older browser
        delete globalThis.DecompressionStream;
        try {
            const bytes = asArrayBuffer(gzipSync(Buffer.from(floats.buffer)));
            await expect(decodeFloat32(bytes, 3, 'x')).rejects.toThrow(/DecompressionStream/);
        } finally {
            globalThis.DecompressionStream = saved;
        }
    });
});

describe('loadDensityGrid', () => {
    it('decodes the committed N2 grid into a GridFieldSource', async () => {
        const meta = JSON.parse(readFileSync(join(FIXTURES, 'n2/meta.json'), 'utf8')) as MoleculeMeta;
        const gz = readFileSync(join(FIXTURES, 'n2/density.bin.gz'));
        fetchMock.mockResolvedValue(new Response(new Uint8Array(gz)));
        const source = await loadDensityGrid(meta);
        expect(fetchMock).toHaveBeenCalledWith(`${MOLECULES_BASE_URL}/n2/density.bin.gz`);
        expect(source).toMatchObject({ kind: 'grid', id: 'density:n2', quantity: 'density', shape: meta.grid!.shape, origin: meta.grid!.origin, spacing: meta.grid!.spacing });
        expect(source.values.length).toBe(meta.grid!.shape[0] ** 3);
        expect(Math.max(...source.values.slice(0, 1000))).toBeLessThan(1e-3);
    });

    it('refuses a molecule without a grid', async () => {
        await expect(loadDensityGrid({ id: 'n2@03' } as MoleculeMeta)).rejects.toThrow('n2@03 ships no density grid');
    });
});
