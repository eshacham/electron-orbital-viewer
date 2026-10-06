import { isActive, JobView } from './api_types';

/** Spec §6.7: the status is polled every 5 s while a job is not terminal. */
export const POLL_INTERVAL_MS = 5000;
/**
 * A request still unanswered after this is abandoned (final review I4): a
 * laptop waking from sleep or a phone changing network can hold a socket
 * open for minutes, and the status would sit frozen with no warning.
 */
export const POLL_TIMEOUT_MS = 15000;

export class PollTimeoutError extends Error {
    constructor() {
        super(`no answer within ${POLL_TIMEOUT_MS / 1000} s`);
        this.name = 'PollTimeoutError';
    }
}

export interface PollerDeps {
    /** `signal` aborts at the deadline, so the request itself is cancelled, not just ignored. */
    fetchJob(key: string, signal: AbortSignal): Promise<JobView>;
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

interface Watch { watchers: number; timer: unknown }

/**
 * Follows jobs at one request per job per interval, however many panels
 * watch it and however often they remount -- React's StrictMode alone
 * mounts every effect twice. Watchers are counted per key; a request is
 * never sent while one is in flight for that key -- remembered by key, not
 * by watch, so a request still out across an unmount and remount counts --
 * and the next waits a full interval from the last one sent, also
 * remembered across an unmount and remount. Each request has a deadline;
 * one that misses it is an ordinary passing failure. A hidden tab sends
 * nothing, and showing it again catches up with one request. A job that
 * has ended is not asked about again until restart() says it was
 * resubmitted, or until nobody follows it any more.
 */
export class JobPoller {
    private readonly watches = new Map<string, Watch>();
    private readonly inFlight = new Set<string>();
    private readonly lastSent = new Map<string, number>();
    private readonly finished = new Set<string>();
    private stopListening: (() => void) | null = null;

    constructor(private readonly deps: PollerDeps) {}

    watch(key: string): () => void {
        this.forgetStale();
        const watch = this.watches.get(key) ?? { watchers: 0, timer: null };
        this.watches.set(key, watch);
        watch.watchers += 1;
        if (!this.stopListening) this.stopListening = this.deps.onVisibilityChange(() => this.visibilityChanged());
        this.schedule(key);
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
        this.schedule(key);
    }

    private schedule(key: string): void {
        const watch = this.watches.get(key);
        if (!watch || watch.watchers === 0 || this.inFlight.has(key) || watch.timer !== null
            || this.finished.has(key) || this.deps.hidden()) return;
        const wait = Math.max(0, (this.lastSent.get(key) ?? -Infinity) + POLL_INTERVAL_MS - this.deps.now());
        watch.timer = this.deps.setTimer(() => {
            watch.timer = null;
            void this.poll(key);
        }, wait);
    }

    private async poll(key: string): Promise<void> {
        const watch = this.watches.get(key);
        if (!watch || watch.watchers === 0 || this.inFlight.has(key) || this.deps.hidden() || this.finished.has(key)) return;
        this.inFlight.add(key);
        this.lastSent.set(key, this.deps.now());
        const abort = new AbortController();
        let deadline: unknown = null;
        const timedOut = new Promise<never>((_resolve, reject) => {
            deadline = this.deps.setTimer(() => {
                abort.abort();
                reject(new PollTimeoutError());
            }, POLL_TIMEOUT_MS);
        });
        try {
            const view = await Promise.race([this.deps.fetchJob(key, abort.signal), timedOut]);
            this.deps.onUpdate(view);
            if (!isActive(view.status)) this.finished.add(key);
        } catch (error) {
            this.deps.onError(key, error);
            if (this.deps.isFatal(error)) this.finished.add(key);
        } finally {
            this.deps.clearTimer(deadline);
            this.inFlight.delete(key);
            // Whichever watch holds the key now -- the one that sent this may have been released since.
            this.schedule(key);
        }
    }

    private release(key: string, watch: Watch): void {
        watch.watchers -= 1;
        if (watch.watchers > 0) return;
        if (watch.timer !== null) {
            this.deps.clearTimer(watch.timer);
            watch.timer = null;
        }
        if (this.watches.get(key) === watch) {
            this.watches.delete(key);
            // Nobody follows it: following it again later is a fresh look (M4: nothing kept for ever).
            this.finished.delete(key);
        }
        if (this.watches.size === 0 && this.stopListening) {
            this.stopListening();
            this.stopListening = null;
        }
    }

    /** A send time older than an interval no longer delays anything: drop it for keys nobody follows (M4). */
    private forgetStale(): void {
        const now = this.deps.now();
        for (const [key, sent] of this.lastSent) {
            if (!this.watches.has(key) && !this.inFlight.has(key) && now - sent >= POLL_INTERVAL_MS) this.lastSent.delete(key);
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
                this.schedule(key);
            }
        }
    }
}
