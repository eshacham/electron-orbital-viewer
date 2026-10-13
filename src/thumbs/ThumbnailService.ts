import type { MeshData, OrbitalParams } from '../types/orbital';

/**
 * Thumbnails for the strips (spec §12 item 1), from the MAIN renderer --
 * never a second WebGL context. Meshes come from the existing orbital worker
 * at a low resolution, one job at a time; at most one thumbnail is rendered
 * per animation frame (tick()); nothing starts while the main picture is
 * computing or the user is dragging the camera (host.isBusy()). Images are
 * kept in an LRU of 96, keyed by theme|scheme|finish|content, so a theme
 * switch re-renders and a revisit is instant. The host (OrbitalViewer via
 * orbital_visualizer.attachThumbnails) owns the GPU; this module only
 * schedules, which is why it is testable without WebGL.
 */
export type ThumbImage = { width: number; height: number };

export interface ThumbRequest {
    /** Everything the picture depends on except the theme: species, relativity, orbital, fraction. */
    contentKey: string;
    params: OrbitalParams;
}

export interface ThumbHost {
    createWorker(): Worker;
    isBusy(): boolean;
    themeKey(): string;
    render(meshData: MeshData): Promise<ThumbImage>;
}

export type ThumbStatus = 'detached' | 'ready' | 'lost';

type Listener = (image: ThumbImage) => void;

/** An evicted ImageBitmap holds its pixels until closed; a canvas (the fallback) has no close. */
function release(image: ThumbImage): void {
    (image as { close?: () => void }).close?.();
}

export class ThumbnailService {
    static readonly CACHE_LIMIT = 96;
    private host: ThumbHost | null = null;
    private lost = false;
    private readonly cache = new Map<string, ThumbImage>();
    private readonly listeners = new Map<string, Set<Listener>>();
    private readonly statusListeners = new Set<() => void>();
    private queue: Array<{ key: string; params: OrbitalParams }> = [];
    private inFlight: { key: string; worker: Worker } | null = null;
    private ready: Array<{ key: string; meshData: MeshData }> = [];
    private rendering = false;

    attach(host: ThumbHost): void {
        this.host = host;
        this.lost = false;
        this.notifyStatus();
    }

    detach(): void {
        this.cancelAll();
        this.host = null;
        this.lost = false;
        this.notifyStatus();
    }

    // Arrow properties, so a tile can hand them to useSyncExternalStore as they are.
    status = (): ThumbStatus => (this.lost ? 'lost' : this.host ? 'ready' : 'detached');

    /**
     * Controller ruling DC12: tells a tile when the status changes. markLost()
     * drops every image listener (cancelAll), so a tile still waiting for its
     * image learns of the loss here and shows its glyph and label (§12).
     */
    subscribeStatus = (listener: () => void): (() => void) => {
        this.statusListeners.add(listener);
        return () => { this.statusListeners.delete(listener); };
    };

    private notifyStatus(): void {
        this.statusListeners.forEach(listener => listener());
    }

    markLost(): void {
        this.lost = true;
        this.cancelAll();
        this.notifyStatus();
    }

    cacheSize(): number {
        return this.cache.size;
    }

    private keyOf(contentKey: string): string {
        return `${this.host?.themeKey() ?? 'detached'}|${contentKey}`;
    }

    request(request: ThumbRequest, onReady: Listener): () => void {
        const key = this.keyOf(request.contentKey);
        const cached = this.cache.get(key);
        if (cached) {
            // Refresh its place in the LRU.
            this.cache.delete(key);
            this.cache.set(key, cached);
            onReady(cached);
            return () => {};
        }
        const set = this.listeners.get(key) ?? new Set<Listener>();
        set.add(onReady);
        this.listeners.set(key, set);
        const pending = this.queue.some(job => job.key === key) || this.inFlight?.key === key || this.ready.some(job => job.key === key);
        if (!pending) this.queue.push({ key, params: request.params });
        return () => {
            set.delete(onReady);
            // Still wanted by another tile, or already answered or cancelled (a later request has its own set).
            if (set.size > 0 || this.listeners.get(key) !== set) return;
            this.listeners.delete(key);
            // Only tiles still in view are worth computing (§12: IntersectionObserver).
            this.queue = this.queue.filter(job => job.key !== key);
        };
    }

    /** Stores an image (most recent last) and tells whoever asked for it. */
    store(key: string, image: ThumbImage): void {
        const previous = this.cache.get(key);
        if (previous && previous !== image) release(previous);
        this.cache.delete(key);
        this.cache.set(key, image);
        while (this.cache.size > ThumbnailService.CACHE_LIMIT) {
            const oldest = this.cache.keys().next().value as string;
            release(this.cache.get(oldest)!);
            this.cache.delete(oldest);
        }
        const set = this.listeners.get(key);
        this.listeners.delete(key);
        set?.forEach(listener => listener(image));
    }

    cancelAll(): void {
        this.inFlight?.worker.terminate();
        this.inFlight = null;
        this.queue = [];
        this.ready = [];
        this.listeners.clear();
    }

    tick(): void {
        const host = this.host;
        if (!host || this.lost || host.isBusy()) return;
        if (this.ready.length > 0) {
            if (this.rendering) return;
            const { key, meshData } = this.ready.shift()!;
            this.rendering = true;
            host.render(meshData).then(
                image => {
                    this.rendering = false;
                    // A reply for a picture that has gone meanwhile (a lost context, a detach) is not cached.
                    if (this.host === host && !this.lost) this.store(key, image);
                    else release(image);
                },
                () => { this.rendering = false; },
            );
            return;
        }
        if (this.inFlight || this.queue.length === 0) return;
        const { key, params } = this.queue.shift()!;
        const worker = host.createWorker();
        this.inFlight = { key, worker };
        worker.onmessage = (event: MessageEvent) => {
            worker.terminate();
            if (this.inFlight?.worker !== worker) return; // cancelled meanwhile
            this.inFlight = null;
            if (event.data?.type === 'success') this.ready.push({ key, meshData: event.data.meshData as MeshData });
        };
        worker.onerror = () => {
            worker.terminate();
            if (this.inFlight?.worker === worker) this.inFlight = null;
        };
        worker.postMessage({ type: 'calculate', params });
    }
}

/** The one service, lent the main renderer by OrbitalViewer. */
export const thumbnailService = new ThumbnailService();
