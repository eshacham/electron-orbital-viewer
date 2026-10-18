import { ThumbnailService, ThumbHost, ThumbImage, type ThumbColouring } from '../../src/thumbs/ThumbnailService';
import type { MeshData, OrbitalParams } from '../../src/types/orbital';
import type { FieldRenderRequest, GridFieldSource } from '../../src/field_source';
import type { GridMeshRequest } from '../../src/molecules/grid_mesh_request';

const params: OrbitalParams = { n: 2, l: 1, ml: 0, Z: 6, resolution: 32, rMax: 8, enclosedFraction: 0.9 };
const mesh = (): MeshData => ({ positions: [], cells: [], psiSigns: [], densityMap: { data: new Uint8Array(1), side: 1, rMax: 1 }, isoLevel: 1 });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

type FakeWorker = { postMessage: jest.Mock; terminate: jest.Mock; onmessage: ((e: { data: unknown }) => void) | null; onerror: (() => void) | null };

function fakeHost(over: Partial<ThumbHost> = {}) {
    const workers: FakeWorker[] = [];
    // Task 10: the grid worker (a molecule's density/ESP grid) is a second factory, kept apart so a test can tell which was used.
    const gridWorkers: FakeWorker[] = [];
    const renders: MeshData[] = [];
    const colourings: ThumbColouring[] = [];
    const make = (into: FakeWorker[]) => () => {
        const worker: FakeWorker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
        into.push(worker);
        return worker as unknown as Worker;
    };
    // Ruling R22a: look keys carry no scheme (was dark|phase|glow).
    let theme = 'dark|glow';
    const host: ThumbHost = {
        createWorker: make(workers),
        createGridWorker: make(gridWorkers),
        isBusy: () => false,
        themeKey: () => theme,
        render: async (meshData, colouring) => { renders.push(meshData); colourings.push(colouring); return { width: 160, height: 160 } as ThumbImage; },
        ...over,
    };
    return { host, workers, gridWorkers, renders, colourings, setTheme: (next: string) => { theme = next; } };
}

/** One analytic source, as a Bonds tile asks for it (bonds_strip_items.ts). */
const field: FieldRenderRequest = {
    sources: [{ kind: 'analytic', id: 'h2plus:2:1sigma_g', rMax: 6, recipe: { type: 'h2plus', R: 2, state: '1sigma_g' } }],
    colors: ['#ffffff'], memberLabels: ['1σg'], resolution: 40, enclosedFraction: 0.9, label: 'H₂⁺ 1σg',
};
const gridSource: GridFieldSource = {
    kind: 'grid', id: 'h2o-density', shape: [2, 2, 2], origin: [0, 0, 0], spacing: 1, quantity: 'density', values: new Float32Array(8),
};
const grid: GridMeshRequest = { type: 'calculate', source: gridSource, enclosedFraction: 0.9, requestId: 0 };

describe('ThumbnailService (spec §12)', () => {
    it('starts one worker at a time and renders at most one thumbnail per frame', async () => {
        const service = new ThumbnailService();
        const { host, workers, renders } = fakeHost();
        service.attach(host);
        const ready = jest.fn();
        service.request({ contentKey: 'a', params }, ready);
        service.request({ contentKey: 'b', params: { ...params, ml: 1 } }, ready);
        service.tick();
        service.tick();
        expect(workers).toHaveLength(1);
        expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'calculate', params });
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        expect(renders).toHaveLength(1);
        expect(workers).toHaveLength(1);
        await flush();
        expect(ready).toHaveBeenCalledTimes(1);
        service.tick();
        expect(workers).toHaveLength(2);
    });

    it('never starts a job, or renders, while the main view is busy or a drag is on', () => {
        const service = new ThumbnailService();
        let busy = true;
        const { host, workers } = fakeHost({ isBusy: () => busy });
        service.attach(host);
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        expect(workers).toHaveLength(0);
        busy = false;
        service.tick();
        expect(workers).toHaveLength(1);
    });

    it('serves a cached image at once, keyed by theme|finish|content, and evicts past 96', async () => {
        const service = new ThumbnailService();
        const { host, workers, setTheme } = fakeHost();
        service.attach(host);
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        await flush();
        const hit = jest.fn();
        service.request({ contentKey: 'a', params }, hit);
        expect(hit).toHaveBeenCalledTimes(1);
        setTheme('light|glow');
        const miss = jest.fn();
        service.request({ contentKey: 'a', params }, miss);
        expect(miss).not.toHaveBeenCalled();
        for (let i = 0; i < 120; i++) service.store(`dark|glow|k${i}`, { width: 1, height: 1 });
        expect(service.cacheSize()).toBe(ThumbnailService.CACHE_LIMIT);
    });

    it('cancels everything when the species changes, and ignores a reply that arrives late', () => {
        const service = new ThumbnailService();
        const { host, workers, renders } = fakeHost();
        service.attach(host);
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        service.cancelAll();
        expect(workers[0].terminate).toHaveBeenCalled();
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        expect(renders).toHaveLength(0);
    });

    it('forgets a queued tile that scrolled out of view', () => {
        const service = new ThumbnailService();
        const { host, workers } = fakeHost();
        service.attach(host);
        const unsubscribe = service.request({ contentKey: 'a', params }, jest.fn());
        unsubscribe();
        service.tick();
        expect(workers).toHaveLength(0);
    });

    it('stops on a lost context, so tiles fall back to their glyph and label', () => {
        const service = new ThumbnailService();
        const { host, workers } = fakeHost();
        service.attach(host);
        service.markLost();
        expect(service.status()).toBe('lost');
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        expect(workers).toHaveLength(0);
        expect(new ThumbnailService().status()).toBe('detached');
    });

    // Controller ruling DC12: tiles already waiting when the context is lost
    // must hear about it -- cancelAll() drops their image listeners, so the
    // status itself is what they watch.
    it('tells status subscribers about attach, loss and detach', () => {
        const service = new ThumbnailService();
        const { host } = fakeHost();
        const seen: string[] = [];
        const unsubscribe = service.subscribeStatus(() => seen.push(service.status()));
        service.attach(host);
        service.markLost();
        service.detach();
        unsubscribe();
        service.attach(host);
        expect(seen).toEqual(['ready', 'lost', 'detached']);
    });

    it('closes an evicted ImageBitmap, which holds GPU-side memory until closed', () => {
        const service = new ThumbnailService();
        const first = { width: 1, height: 1, close: jest.fn() };
        service.store('dark|glow|first', first);
        for (let i = 0; i < ThumbnailService.CACHE_LIMIT; i++) service.store(`dark|glow|k${i}`, { width: 1, height: 1 });
        expect(first.close).toHaveBeenCalledTimes(1);
    });
    // Review fix 1 (§12 key, §3.3): a job's mesh is drawn in whatever theme is
    // on when it is drawn, so it must be filed under THAT theme -- never under
    // the theme that was on when it was asked for.
    it('files a picture under the theme it was drawn in when the theme changes mid-job', async () => {
        const service = new ThumbnailService();
        const drawnIn: string[] = [];
        const { host, workers, setTheme } = fakeHost();
        service.attach({ ...host, render: async () => { drawnIn.push(host.themeKey()); return { width: 160, height: 160 }; } });
        service.request({ contentKey: 'a', params }, jest.fn());
        service.tick();
        setTheme('light|glow');
        // The tile re-asks in the new theme: no second job for the same content.
        const light = jest.fn();
        service.request({ contentKey: 'a', params }, light);
        workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
        service.tick();
        await flush();
        expect(workers).toHaveLength(1);
        expect(drawnIn).toEqual(['light|glow']);
        expect(light).toHaveBeenCalledTimes(1);
        setTheme('dark|glow');
        const dark = jest.fn();
        service.request({ contentKey: 'a', params }, dark);
        expect(dark).not.toHaveBeenCalled();
    });

    // Ruling T16-failtile: a job that fails tells its tiles, which fall back to their glyph and label.
    describe('a failed job', () => {
        const start = () => {
            const service = new ThumbnailService();
            const fake = fakeHost();
            service.attach(fake.host);
            const ready = jest.fn();
            const failed = jest.fn();
            service.request({ contentKey: 'a', params }, ready, failed);
            service.tick();
            return { service, fake, ready, failed };
        };

        it('says so on the worker\'s error reply', () => {
            const { fake, ready, failed } = start();
            fake.workers[0].onmessage!({ data: { type: 'error', message: 'no mesh' } });
            expect(failed).toHaveBeenCalledTimes(1);
            expect(ready).not.toHaveBeenCalled();
        });

        it('says so when the worker itself errors', () => {
            const { fake, failed } = start();
            fake.workers[0].onerror!();
            expect(failed).toHaveBeenCalledTimes(1);
        });

        it('says so when the draw is rejected, and moves on to the next job', async () => {
            const service = new ThumbnailService();
            const fake = fakeHost({ render: () => Promise.reject(new Error('draw failed')) });
            service.attach(fake.host);
            const failed = jest.fn();
            service.request({ contentKey: 'a', params }, jest.fn(), failed);
            service.request({ contentKey: 'b', params: { ...params, ml: 1 } }, jest.fn());
            service.tick();
            fake.workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
            service.tick();
            await flush();
            expect(failed).toHaveBeenCalledTimes(1);
            service.tick();
            expect(fake.workers).toHaveLength(2);
        });

        it('does not count a cancelled job as failed', () => {
            const { service, fake, failed } = start();
            service.cancelAll();
            fake.workers[0].onmessage!({ data: { type: 'error', message: 'late' } });
            expect(failed).not.toHaveBeenCalled();
        });
    });

    // Task 10 (spec §12, ruling P5): Bonds' and Molecules' tiles are meshed by
    // the workers that already draw them -- a field request by the orbital
    // worker's 'calculateFields', a grid by the grid worker -- and drawn in
    // the colouring the tile asks for.
    describe('field and grid jobs (Task 10)', () => {
        it('posts a field request to the orbital worker as calculateFields and draws its one mesh in the tile\'s colouring', async () => {
            const service = new ThumbnailService();
            const { host, workers, gridWorkers, renders, colourings } = fakeHost();
            service.attach(host);
            const ready = jest.fn();
            service.request({ kind: 'field', contentKey: 'bonds|density', field, colouring: 'density' }, ready);
            service.tick();
            expect(gridWorkers).toHaveLength(0);
            expect(workers).toHaveLength(1);
            expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'calculateFields', request: field });
            const drawn = mesh();
            workers[0].onmessage!({ data: { type: 'fieldsSuccess', meshes: [drawn] } });
            service.tick();
            await flush();
            expect(renders).toEqual([drawn]);
            expect(colourings).toEqual(['density']);
            expect(ready).toHaveBeenCalledTimes(1);
        });

        it('posts a grid request to the grid worker and draws the mesh it answers with', async () => {
            const service = new ThumbnailService();
            const { host, workers, gridWorkers, renders, colourings } = fakeHost();
            service.attach(host);
            const esp: ThumbColouring = { kind: 'esp', grid: { ...gridSource, values: new Float32Array(8) }, limit: 0.05 };
            service.request({ kind: 'grid', contentKey: 'mol|h2o|esp', grid, colouring: esp }, jest.fn());
            service.tick();
            expect(workers).toHaveLength(0);
            expect(gridWorkers).toHaveLength(1);
            expect(gridWorkers[0].postMessage).toHaveBeenCalledWith(grid);
            const drawn = mesh();
            gridWorkers[0].onmessage!({ data: { type: 'success', meshData: drawn, requestId: 0 } });
            service.tick();
            await flush();
            expect(renders).toEqual([drawn]);
            expect(colourings).toEqual([esp]);
        });

        it('still takes an orbital request without a kind, and draws it in the phase colours', async () => {
            const service = new ThumbnailService();
            const { host, workers, colourings } = fakeHost();
            service.attach(host);
            service.request({ contentKey: 'a', params }, jest.fn());
            service.request({ kind: 'orbital', contentKey: 'b', params: { ...params, ml: 1 } }, jest.fn());
            service.tick();
            expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'calculate', params });
            workers[0].onmessage!({ data: { type: 'success', meshData: mesh() } });
            service.tick();
            await flush();
            service.tick();
            expect(workers[1].postMessage).toHaveBeenCalledWith({ type: 'calculate', params: { ...params, ml: 1 } });
            expect(colourings).toEqual(['phase']);
        });

        it('starts no field or grid job while the main view is busy', () => {
            const service = new ThumbnailService();
            let busy = true;
            const { host, workers, gridWorkers } = fakeHost({ isBusy: () => busy });
            service.attach(host);
            service.request({ kind: 'field', contentKey: 'f', field, colouring: 'phase' }, jest.fn());
            service.request({ kind: 'grid', contentKey: 'g', grid, colouring: 'density' }, jest.fn());
            service.tick();
            service.tick();
            expect(workers).toHaveLength(0);
            expect(gridWorkers).toHaveLength(0);
            busy = false;
            service.tick();
            expect(workers).toHaveLength(1);
        });

        // Review Focus 5's second half (App cancels on a Bonds system change; preflight D19).
        it('drops a queued field job, and the one in flight, on cancelAll', () => {
            const service = new ThumbnailService();
            const { host, workers, renders } = fakeHost();
            service.attach(host);
            const failed = jest.fn();
            service.request({ kind: 'field', contentKey: 'bonds|n2|first', field, colouring: 'density' }, jest.fn(), failed);
            service.request({ kind: 'field', contentKey: 'bonds|n2|second', field, colouring: 'phase' }, jest.fn(), failed);
            service.tick();
            service.cancelAll();
            expect(workers[0].terminate).toHaveBeenCalled();
            workers[0].onmessage!({ data: { type: 'fieldsSuccess', meshes: [mesh()] } });
            service.tick();
            service.tick();
            expect(workers).toHaveLength(1);
            expect(renders).toHaveLength(0);
            expect(failed).not.toHaveBeenCalled();
        });

        // Ruling T16-failtile, for the new kinds: a tile whose job fails shows its glyph and label.
        it('tells the tile when a field or grid worker fails', () => {
            const service = new ThumbnailService();
            const { host, workers, gridWorkers } = fakeHost();
            service.attach(host);
            const fieldFailed = jest.fn();
            const gridFailed = jest.fn();
            service.request({ kind: 'field', contentKey: 'f', field, colouring: 'phase' }, jest.fn(), fieldFailed);
            service.request({ kind: 'grid', contentKey: 'g', grid, colouring: 'density' }, jest.fn(), gridFailed);
            service.tick();
            workers[0].onmessage!({ data: { type: 'error', message: 'no basis registered' } });
            expect(fieldFailed).toHaveBeenCalledTimes(1);
            service.tick();
            gridWorkers[0].onerror!();
            expect(gridFailed).toHaveBeenCalledTimes(1);
        });

        it('counts a field reply with no mesh as a failure, never a blank tile', () => {
            const service = new ThumbnailService();
            const { host, workers, renders } = fakeHost();
            service.attach(host);
            const failed = jest.fn();
            service.request({ kind: 'field', contentKey: 'f', field, colouring: 'phase' }, jest.fn(), failed);
            service.tick();
            workers[0].onmessage!({ data: { type: 'fieldsSuccess', meshes: [] } });
            service.tick();
            expect(failed).toHaveBeenCalledTimes(1);
            expect(renders).toHaveLength(0);
        });
    });
});
