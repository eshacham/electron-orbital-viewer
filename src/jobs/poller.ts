import { isActive, JobView } from './api_types';

/** Spec §6.7: the status is polled every 5 s while a job is not terminal. */
export const POLL_INTERVAL_MS = 5000;

export interface PollerDeps {
    fetchJob(key: string): Promise<JobView>;
    onUpdate(view: JobView): void;
    onError(key: string, error: unknown): void;
    /** A failure retrying cannot cure (an ended session, an unknown key): stop asking. */
    isFatal(error: unknown): boolean;
    now(): number;
    setTimer(callback: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
    hidden(): boolean;
    onVisibilityChange(listener: () => void): () => void;
}

interface Watch { watchers: number; timer: unknown; inFlight: boolean }

/**
 * Follows jobs at one request per job per interval, however many panels
 * watch it and however often they remount -- React's StrictMode alone
 * mounts every effect twice. Watchers are counted per key; a request is
 * never sent while one is in flight; and the next waits a full interval
 * from the last one sent, remembered across an unmount and remount. A
 * hidden tab sends nothing, and showing it again catches up with one
 * request. A job that has ended is not asked about again until restart()
 * says it was resubmitted.
 */
export class JobPoller {
    private readonly watches = new Map<string, Watch>();
    private readonly lastSent = new Map<string, number>();
    private readonly finished = new Set<string>();
    private stopListening: (() => void) | null = null;

    constructor(private readonly deps: PollerDeps) {}

    watch(key: string): () => void {
        const watch = this.watches.get(key) ?? { watchers: 0, timer: null, inFlight: false };
        this.watches.set(key, watch);
        watch.watchers += 1;
        if (!this.stopListening) this.stopListening = this.deps.onVisibilityChange(() => this.visibilityChanged());
        this.schedule(key, watch);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.release(key, watch);
        };
    }

    /** A retried job is live again: ask about it at once. */
    restart(key: string): void {
        this.finished.delete(key);
        this.lastSent.delete(key);
        const watch = this.watches.get(key);
        if (watch) this.schedule(key, watch);
    }

    private schedule(key: string, watch: Watch): void {
        if (watch.watchers === 0 || watch.inFlight || watch.timer !== null || this.finished.has(key) || this.deps.hidden()) return;
        const wait = Math.max(0, (this.lastSent.get(key) ?? -Infinity) + POLL_INTERVAL_MS - this.deps.now());
        watch.timer = this.deps.setTimer(() => {
            watch.timer = null;
            void this.poll(key, watch);
        }, wait);
    }

    private async poll(key: string, watch: Watch): Promise<void> {
        if (watch.watchers === 0 || this.deps.hidden() || this.finished.has(key)) return;
        watch.inFlight = true;
        this.lastSent.set(key, this.deps.now());
        try {
            const view = await this.deps.fetchJob(key);
            this.deps.onUpdate(view);
            if (!isActive(view.status)) this.finished.add(key);
        } catch (error) {
            this.deps.onError(key, error);
            if (this.deps.isFatal(error)) this.finished.add(key);
        } finally {
            watch.inFlight = false;
            this.schedule(key, watch);
        }
    }

    private release(key: string, watch: Watch): void {
        watch.watchers -= 1;
        if (watch.watchers > 0) return;
        if (watch.timer !== null) {
            this.deps.clearTimer(watch.timer);
            watch.timer = null;
        }
        if (this.watches.get(key) === watch) this.watches.delete(key);
        if (this.watches.size === 0 && this.stopListening) {
            this.stopListening();
            this.stopListening = null;
        }
    }

    private visibilityChanged(): void {
        for (const [key, watch] of this.watches) {
            if (this.deps.hidden()) {
                if (watch.timer !== null) {
                    this.deps.clearTimer(watch.timer);
                    watch.timer = null;
                }
            } else {
                this.schedule(key, watch);
            }
        }
    }
}
