import type { MeshData, OrbitalParams } from '../types/orbital';
import type { FieldRenderRequest } from '../field_source';
import type { GridMeshRequest } from '../molecules/grid_mesh_request';
import type { ScalarGrid } from '../molecules/esp';

/**
 * Thumbnails for the strips (spec §12 item 1), from the MAIN renderer --
 * never a second WebGL context. Meshes come from the workers that already
 * draw the main view, at a low resolution, one job at a time; at most one
 * thumbnail is rendered per animation frame (tick()); nothing starts while
 * the main picture is computing or the user is dragging the camera
 * (host.isBusy()). Images are kept in an LRU of 96, keyed by
 * theme|finish|power|size|content, so a theme switch re-renders and a
 * revisit is instant. The host (OrbitalViewer via
 * orbital_visualizer.attachThumbnails) owns the GPU; this module only
 * schedules, which is why it is testable without WebGL.
 */
export type ThumbImage = { width: number; height: number };

/**
 * How a tile's surface is coloured (Task 10): the ψ phase colours (an
 * orbital), the density's one colour (science.ts densitySurfaceHex), or an
 * ESP mapped onto it -- the same three the main view draws.
 */
export type ThumbColouring = 'phase' | 'density' | { kind: 'esp'; grid: ScalarGrid; limit: number };

/**
 * What a tile asks for. `contentKey` is everything the picture depends on
 * except the look (theme, finish, size, opacity: thumb_key.ts) -- the
 * colouring included, which the item builders write into it.
 */
export type ThumbRequest =
    /** An orbital from the orbital worker's 'calculate' (the Atom and Orbitals strips). Without a `kind`, as before Task 10. */
    | { kind?: 'orbital'; contentKey: string; params: OrbitalParams }
    /** One analytic source from the orbital worker's 'calculateFields' (Bonds' tiles). */
    | { kind: 'field'; contentKey: string; field: FieldRenderRequest; colouring: ThumbColouring }
    /** A sampled grid from the grid worker (a molecule's density or ESP surface). */
    | { kind: 'grid'; contentKey: string; grid: GridMeshRequest; colouring: ThumbColouring };

export interface ThumbHost {
    createWorker(): Worker;
    /** The grid worker (createGridMeshWorker): a molecule's density grid is meshed there, as in the main view. */
    createGridWorker(): Worker;
    isBusy(): boolean;
    themeKey(): string;
    render(meshData: MeshData, colouring: ThumbColouring): Promise<ThumbImage>;
}

const colouringOf = (request: ThumbRequest): ThumbColouring => (request.kind === 'field' || request.kind === 'grid' ? request.colouring : 'phase');

/** What a job's worker is sent: each worker's own message, exactly as the main view sends it. */
function messageOf(request: ThumbRequest): unknown {
    if (request.kind === 'field') return { type: 'calculateFields', request: request.field };
    if (request.kind === 'grid') return request.grid;
    return { type: 'calculate', params: request.params };
}

/** The mesh in a worker's reply, or null for an error (or a field reply that drew nothing). */
function meshOf(request: ThumbRequest, data: { type?: string; meshData?: MeshData; meshes?: MeshData[] } | undefined): MeshData | null {
    if (request.kind === 'field') return data?.type === 'fieldsSuccess' ? data.meshes?.[0] ?? null : null;
    return data?.type === 'success' ? data.meshData ?? null : null;
}

export type ThumbStatus = 'detached' | 'ready' | 'lost';

type Listener = (image: ThumbImage) => void;

/** Who is waiting for a picture: told when it is ready, or (ruling T16-failtile) that it will not come. */
interface Waiter { onReady: Listener; onFailed?: () => void }

/** An evicted ImageBitmap holds its pixels until closed; a canvas (the fallback) has no close. */
function release(image: ThumbImage): void {
    (image as { close?: () => void }).close?.();
}

export class ThumbnailService {
    static readonly CACHE_LIMIT = 96;
    private host: ThumbHost | null = null;
    private lost = false;
    private readonly cache = new Map<string, ThumbImage>();
    /** By full key (theme|finish|power|size|content): the tiles waiting for that picture. */
    private readonly waiting = new Map<string, { contentKey: string; waiters: Set<Waiter> }>();
    private readonly statusListeners = new Set<() => void>();
    /**
     * Jobs are keyed by content alone: a mesh does not depend on the theme.
     * The theme is read when the mesh is drawn, and the picture is filed
     * under the theme it was drawn in -- so a theme switch while a job is
     * under way can never file one theme's picture under another's key.
     */
    private queue: ThumbRequest[] = [];
    private inFlight: { contentKey: string; worker: Worker } | null = null;
    private ready: Array<{ contentKey: string; meshData: MeshData; colouring: ThumbColouring }> = [];
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
     * drops every waiting tile (cancelAll), so a tile still waiting for its
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

    private hasJob(contentKey: string): boolean {
        return this.inFlight?.contentKey === contentKey
            || this.queue.some(job => job.contentKey === contentKey)
            || this.ready.some(job => job.contentKey === contentKey);
    }

    private isWanted(contentKey: string): boolean {
        for (const entry of this.waiting.values()) if (entry.contentKey === contentKey) return true;
        return false;
    }

    /**
     * Asks for a picture; `onReady` hears it (at once from the cache), and
     * `onFailed` hears that it will not come: the worker failed or the draw
     * threw. The returned function withdraws the request.
     */
    request(request: ThumbRequest, onReady: Listener, onFailed?: () => void): () => void {
        const { contentKey } = request;
        const key = this.keyOf(contentKey);
        const cached = this.cache.get(key);
        if (cached) {
            // Refresh its place in the LRU.
            this.cache.delete(key);
            this.cache.set(key, cached);
            onReady(cached);
            return () => {};
        }
        const entry = this.waiting.get(key) ?? { contentKey, waiters: new Set<Waiter>() };
        const waiter: Waiter = { onReady, onFailed };
        entry.waiters.add(waiter);
        this.waiting.set(key, entry);
        if (!this.hasJob(contentKey)) this.queue.push(request);
        return () => {
            entry.waiters.delete(waiter);
            // Still wanted by another tile, or already answered or cancelled (a later request has its own entry).
            if (entry.waiters.size > 0 || this.waiting.get(key) !== entry) return;
            this.waiting.delete(key);
            // Only tiles still in view are worth computing (§12: IntersectionObserver).
            if (!this.isWanted(contentKey)) this.queue = this.queue.filter(job => job.contentKey !== contentKey);
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
        const entry = this.waiting.get(key);
        this.waiting.delete(key);
        entry?.waiters.forEach(waiter => waiter.onReady(image));
    }

    /** Ruling T16-failtile: every tile waiting for this content, in any theme, falls back to its glyph and label. */
    private fail(contentKey: string): void {
        for (const [key, entry] of [...this.waiting]) {
            if (entry.contentKey !== contentKey) continue;
            this.waiting.delete(key);
            entry.waiters.forEach(waiter => waiter.onFailed?.());
        }
    }

    cancelAll(): void {
        this.inFlight?.worker.terminate();
        this.inFlight = null;
        this.queue = [];
        this.ready = [];
        this.waiting.clear();
    }

    tick(): void {
        const host = this.host;
        if (!host || this.lost || host.isBusy()) return;
        if (this.ready.length > 0) {
            if (this.rendering) return;
            const { contentKey, meshData, colouring } = this.ready.shift()!;
            // Read together with the appearance host.render draws in: the picture's own theme.
            const key = this.keyOf(contentKey);
            this.rendering = true;
            host.render(meshData, colouring).then(
                image => {
                    this.rendering = false;
                    // A reply for a picture that has gone meanwhile (a lost context, a detach) is not cached.
                    if (this.host === host && !this.lost) this.store(key, image);
                    else release(image);
                },
                () => {
                    this.rendering = false;
                    if (this.host === host && !this.lost) this.fail(contentKey);
                },
            );
            return;
        }
        if (this.inFlight || this.queue.length === 0) return;
        const request = this.queue.shift()!;
        const { contentKey } = request;
        const worker = request.kind === 'grid' ? host.createGridWorker() : host.createWorker();
        this.inFlight = { contentKey, worker };
        worker.onmessage = (event: MessageEvent) => {
            worker.terminate();
            if (this.inFlight?.worker !== worker) return; // cancelled meanwhile
            this.inFlight = null;
            const meshData = meshOf(request, event.data);
            if (meshData) this.ready.push({ contentKey, meshData, colouring: colouringOf(request) });
            else this.fail(contentKey);
        };
        worker.onerror = () => {
            worker.terminate();
            if (this.inFlight?.worker !== worker) return;
            this.inFlight = null;
            this.fail(contentKey);
        };
        worker.postMessage(messageOf(request));
    }
}

/** The one service, lent the main renderer by OrbitalViewer. */
export const thumbnailService = new ThumbnailService();
