import type { GridFieldSource } from '../field_source';
import { MOLECULE_DATA_VERSION } from './data_version';
import { isJobKey, jobBaseUrl } from './job_paths';
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

/**
 * 'n2' → /molecules/<version>/n2; 'n2@07' (scan point 7) → /molecules/<version>/n2/scan/07;
 * a 64-hex job key → /molecules/jobs/<key> (spec §5.3).
 */
export function moleculePath(id: string): string {
    // A computed molecule's id is its job key, so the id alone says where it
    // lives: meta, basis, density and ESP loads -- and the MO worker, which
    // is handed nothing but the id -- need no second argument (spec §9.1).
    if (isJobKey(id)) return jobBaseUrl(id);
    // D2: the isJobKey guard above narrows id to `never` for the rest of this
    // function (it returned already whenever `id is string` held); the cast
    // restores the type tsc needs to see .split on.
    const [base, point, extra] = (id as string).split('@');
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

export const RESULT_NOT_FINISHED =
    'This computed molecule has no finished result yet: its job may still be running, or it failed. Open the link again once it has finished.';

/**
 * done.json is written last (spec §5.3), so a folder without it is a job
 * still running, one that failed, or one interrupted half-way through its
 * files: none of them is a result, and drawing any of it would be a stale or
 * partial picture. S3 behind CloudFront answers a missing object with 403
 * (no list permission), not 404, so both mean "not there". no-store: a 404
 * the browser cached while the job ran must not hide the result once it
 * exists.
 */
async function requireFinishedResult(key: string): Promise<void> {
    const url = `${jobBaseUrl(key)}/done.json`;
    let response: Response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
        throw new MoleculeLoadError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 404 || response.status === 403) throw new MoleculeLoadError(RESULT_NOT_FINISHED);
    if (!response.ok) throw new MoleculeLoadError(`Could not load ${url} (HTTP ${response.status})`);
    let done: { files?: Record<string, unknown> };
    try {
        done = (await response.json()) as { files?: Record<string, unknown> };
    } catch {
        throw new MoleculeLoadError(`${url} is not valid JSON`);
    }
    if (!done || !done.files || typeof done.files['meta.json'] !== 'string') {
        throw new MoleculeLoadError(`${url} does not list meta.json: this result is incomplete`);
    }
}

export function loadMoleculeMeta(id: string): Promise<MoleculeMeta> {
    return cached(`meta:${id}`, async () => {
        if (isJobKey(id)) await requireFinishedResult(id);
        return fetchJson<MoleculeMeta>(`${moleculePath(id)}/meta.json`);
    });
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
