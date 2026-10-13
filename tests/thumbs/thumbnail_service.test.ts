import { ThumbnailService, ThumbHost, ThumbImage } from '../../src/thumbs/ThumbnailService';
import type { MeshData, OrbitalParams } from '../../src/types/orbital';

const params: OrbitalParams = { n: 2, l: 1, ml: 0, Z: 6, resolution: 32, rMax: 8, enclosedFraction: 0.9 };
const mesh = (): MeshData => ({ positions: [], cells: [], psiSigns: [], densityMap: { data: new Uint8Array(1), side: 1, rMax: 1 }, isoLevel: 1 });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fakeHost(over: Partial<ThumbHost> = {}) {
    const workers: Array<{ postMessage: jest.Mock; terminate: jest.Mock; onmessage: ((e: { data: unknown }) => void) | null; onerror: (() => void) | null }> = [];
    const renders: MeshData[] = [];
    let theme = 'dark|phase|glow';
    const host: ThumbHost = {
        createWorker: () => {
            const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
            workers.push(worker);
            return worker as unknown as Worker;
        },
        isBusy: () => false,
        themeKey: () => theme,
        render: async meshData => { renders.push(meshData); return { width: 160, height: 160 } as ThumbImage; },
        ...over,
    };
    return { host, workers, renders, setTheme: (next: string) => { theme = next; } };
}

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

    it('serves a cached image at once, keyed by theme|scheme|content, and evicts past 96', async () => {
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
        setTheme('light|phase|glow');
        const miss = jest.fn();
        service.request({ contentKey: 'a', params }, miss);
        expect(miss).not.toHaveBeenCalled();
        for (let i = 0; i < 120; i++) service.store(`dark|phase|glow|k${i}`, { width: 1, height: 1 });
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
        service.store('dark|phase|glow|first', first);
        for (let i = 0; i < ThumbnailService.CACHE_LIMIT; i++) service.store(`dark|phase|glow|k${i}`, { width: 1, height: 1 });
        expect(first.close).toHaveBeenCalledTimes(1);
    });
});
