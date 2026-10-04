import type { GridFieldSource } from '../field_source';
import { MOLECULE_DATA_VERSION } from './data_version';
import { MoleculeBasis, MoleculeIndexEntry, MoleculeMeta, MoleculeScan } from './types';

/**
 * Lazy, cached access to the published molecule-data release (spec §4.2,
 * §4.5). Nothing is fetched until a molecule is chosen; each file is fetched
 * once per session, and a failed fetch is forgotten so the next attempt
 * really retries.
 */
export const MOLECULES_BASE_URL = `/molecules/${MOLECULE_DATA_VERSION}`;

export class MoleculeLoadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MoleculeLoadError';
    }
}

const MOLECULE_ID = /^[a-z0-9]+$/;
const SCAN_POINT = /^\d{2}$/;

/** 'n2' → /molecules/<version>/n2; 'n2@07' (scan point 7) → /molecules/<version>/n2/scan/07. */
export function moleculePath(id: string): string {
    const [base, point, extra] = id.split('@');
    if (!MOLECULE_ID.test(base) || extra !== undefined || (point !== undefined && !SCAN_POINT.test(point))) {
        throw new MoleculeLoadError(`Not a molecule id: ${JSON.stringify(id)}`);
    }
    return point === undefined ? `${MOLECULES_BASE_URL}/${base}` : `${MOLECULES_BASE_URL}/${base}/scan/${point}`;
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = cache.get(key) as Promise<T> | undefined;
    if (!pending) {
        pending = load();
        cache.set(key, pending);
        pending.catch(() => cache.delete(key));
    }
    return pending;
}

export function clearMoleculeCacheForTests(): void {
    cache.clear();
}

async function fetchOk(url: string): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new MoleculeLoadError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new MoleculeLoadError(`Could not load ${url} (HTTP ${response.status})`);
    return response;
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetchOk(url);
    try {
        return (await response.json()) as T;
    } catch {
        throw new MoleculeLoadError(`${url} is not valid JSON`);
    }
}

export function loadMoleculeIndex(): Promise<MoleculeIndexEntry[]> {
    return cached('index', () => fetchJson<MoleculeIndexEntry[]>(`${MOLECULES_BASE_URL}/index.json`));
}

export function loadMoleculeMeta(id: string): Promise<MoleculeMeta> {
    return cached(`meta:${id}`, () => fetchJson<MoleculeMeta>(`${moleculePath(id)}/meta.json`));
}

/** The id comes from the path asked for, so a basis.json written without one still registers correctly. */
export function loadBasis(id: string): Promise<MoleculeBasis> {
    return cached(`basis:${id}`, async () => ({ ...(await fetchJson<MoleculeBasis>(`${moleculePath(id)}/basis.json`)), id }));
}

export function loadScan(id: string): Promise<MoleculeScan> {
    return cached(`scan:${id}`, () => fetchJson<MoleculeScan>(`${moleculePath(id)}/scan.json`));
}

/**
 * Little-endian float32s, gzipped. Bytes that do not start with the gzip
 * magic number are taken as already inflated: a server that labels the file
 * Content-Encoding: gzip makes the browser inflate it before we see it (the
 * published bucket instead serves .gz as application/octet-stream with no
 * Content-Encoding, so the magic-byte check is what actually fires in v1).
 */
export async function decodeFloat32(bytes: ArrayBuffer, expectedLength: number, url: string): Promise<Float32Array> {
    let raw = bytes;
    const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    if (head[0] === 0x1f && head[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') {
            throw new MoleculeLoadError('This browser cannot decompress molecule data (it has no DecompressionStream); a current Chrome, Firefox or Safari can.');
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        raw = await new Response(stream).arrayBuffer();
    }
    if (raw.byteLength !== expectedLength * 4) {
        throw new MoleculeLoadError(`${url}: expected ${expectedLength} values, got ${raw.byteLength / 4}`);
    }
    return new Float32Array(raw);
}

export function loadDensityGrid(meta: MoleculeMeta): Promise<GridFieldSource> {
    const grid = meta.grid;
    if (!grid) return Promise.reject(new MoleculeLoadError(`${meta.id} ships no density grid`));
    const url = `${moleculePath(meta.id)}/density.bin.gz`;
    return cached(`density:${meta.id}`, async () => {
        const bytes = await (await fetchOk(url)).arrayBuffer();
        const values = await decodeFloat32(bytes, grid.shape[0] * grid.shape[1] * grid.shape[2], url);
        return {
            kind: 'grid', id: `density:${meta.id}`, quantity: 'density',
            shape: [...grid.shape], origin: [...grid.origin], spacing: grid.spacing, values,
        } satisfies GridFieldSource;
    });
}
