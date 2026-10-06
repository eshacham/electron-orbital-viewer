import {
    clearMoleculeCacheForTests, loadMoleculeMeta, moleculePath, MOLECULES_BASE_URL, RESULT_NOT_FINISHED,
} from '../../src/molecules/loader';
import { computedResultFiles, isJobKey, jobFileUrl, JOBS_BASE_URL } from '../../src/molecules/job_paths';
import { loadEspGrid } from '../../src/molecules/esp';
import { asLibraryMeta } from '../../src/molecules/library_types';
import type { MoleculeMeta } from '../../src/molecules/types';
import { waterMeta } from '../molecules/fixtures';

const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';
const DONE = `/molecules/jobs/${KEY}/done.json`;
const META = `/molecules/jobs/${KEY}/meta.json`;

type Route = { status: number; body?: unknown; bytes?: Uint8Array };
function routeFetch(routes: Record<string, Route>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const route = routes[url] ?? { status: 404 };
        return {
            ok: route.status >= 200 && route.status < 300, status: route.status,
            json: async () => route.body,
            arrayBuffer: async () => (route.bytes ?? new Uint8Array(0)).slice().buffer,
        } as unknown as Response;
    }) as unknown as typeof fetch;
    return calls;
}
const finished = (): Record<string, Route> => ({
    [DONE]: { status: 200, body: { key: KEY, files: { 'meta.json': 'ab12' }, writtenAt: '2026-10-10T12:01:15Z' } },
    [META]: { status: 200, body: waterMeta({ id: KEY, tier: 'computed' }) },
});

beforeEach(() => clearMoleculeCacheForTests());

describe('job keys and paths', () => {
    it('tells a job key from a library id', () => {
        expect(isJobKey(KEY)).toBe(true);
        expect(isJobKey('h2o')).toBe(false);
        expect(isJobKey(KEY.toUpperCase())).toBe(false);
        expect(isJobKey(KEY.slice(1))).toBe(false);
        expect(isJobKey(null)).toBe(false);
    });
    it('a job key resolves to the jobs folder, a library id to the versioned library', () => {
        expect(moleculePath(KEY)).toBe(`/molecules/jobs/${KEY}`);
        expect(moleculePath('h2o')).toBe(`${MOLECULES_BASE_URL}/h2o`);
        expect(jobFileUrl(KEY, 'input.py')).toBe(`${JOBS_BASE_URL}/${KEY}/input.py`);
        expect(computedResultFiles('single')).toEqual(['input.py', 'output.log', 'geometry.xyz', 'job.json']);
        expect(computedResultFiles('optimise')).toContain('trajectory.xyz');
    });
});

describe('opening a computed molecule', () => {
    it('reads meta.json only after done.json lists it', async () => {
        const calls = routeFetch(finished());
        expect((await loadMoleculeMeta(KEY)).id).toBe(KEY);
        expect(calls.map(c => c.url)).toEqual([DONE, META]);
    });

    it.each([404, 403])('says the result is not finished when done.json is missing (HTTP %i), and never reads meta.json', async status => {
        const calls = routeFetch({ [DONE]: { status }, [META]: finished()[META] });
        await expect(loadMoleculeMeta(KEY)).rejects.toThrow(RESULT_NOT_FINISHED);
        expect(calls.map(c => c.url)).toEqual([DONE]);
    });

    it('refuses a done.json that does not list meta.json', async () => {
        routeFetch({ [DONE]: { status: 200, body: { key: KEY, files: {} } }, [META]: finished()[META] });
        await expect(loadMoleculeMeta(KEY)).rejects.toThrow(/does not list meta\.json/);
    });

    it('forgets the failure, so the same link works once the job has finished', async () => {
        routeFetch({});
        await expect(loadMoleculeMeta(KEY)).rejects.toThrow(RESULT_NOT_FINISHED);
        routeFetch(finished());
        await expect(loadMoleculeMeta(KEY)).resolves.toEqual(expect.objectContaining({ id: KEY }));
    });

    it('asks for done.json past the HTTP cache: a 404 cached while the job ran must not outlive it', async () => {
        const calls = routeFetch(finished());
        await loadMoleculeMeta(KEY);
        expect(calls[0].init).toEqual({ cache: 'no-store' });
    });

    it('reads library molecules as before, with no done.json', async () => {
        const calls = routeFetch({ [`${MOLECULES_BASE_URL}/h2o/meta.json`]: { status: 200, body: waterMeta() } });
        await loadMoleculeMeta('h2o');
        expect(calls.map(c => c.url)).toEqual([`${MOLECULES_BASE_URL}/h2o/meta.json`]);
    });

    it("reads a computed molecule's ESP grid from its job folder", async () => {
        const meta = asLibraryMeta(waterMeta({ id: KEY, espGrid: { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2 } }) as unknown as MoleculeMeta);
        const calls = routeFetch({ [`/molecules/jobs/${KEY}/esp.bin.gz`]: { status: 200, bytes: new Uint8Array(new Float32Array(8).fill(0.5).buffer) } });
        const grid = await loadEspGrid(meta);
        expect(calls.map(c => c.url)).toEqual([`/molecules/jobs/${KEY}/esp.bin.gz`]);
        expect(grid.values[7]).toBe(0.5);
    });
});
