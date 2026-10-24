/**
 * One localStorage key behind a tiny external store (spec §6.1, §6.7): the
 * theme and the presentation preferences live here, outside
 * Redux, so nothing in them can reach a share link. When storage is
 * unavailable or throws (Safari private mode) the value lasts the session in
 * memory. The `storage` event keeps other tabs and /admin.html in step.
 * No React import: export modules read prefs too.
 */
export interface Pref<T> {
    get(): T;
    set(value: T): void;
    subscribe(listener: () => void): () => void;
}

export interface PrefCodec<T> {
    decode(raw: string | null): T;
    /** null removes the key. */
    encode(value: T): string | null;
}

function storageOrNull(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

export function createPref<T>(key: string, codec: PrefCodec<T>): Pref<T> {
    // undefined: storage is the truth; anything else: storage failed and this is.
    let memory: string | null | undefined;
    let cache: { raw: string | null; value: T } | null = null;
    const listeners = new Set<() => void>();

    const readRaw = (): string | null => {
        if (memory !== undefined) return memory;
        try {
            return storageOrNull()?.getItem(key) ?? null;
        } catch {
            return null;
        }
    };

    const get = (): T => {
        const raw = readRaw();
        if (!cache || cache.raw !== raw) cache = { raw, value: codec.decode(raw) };
        return cache.value;
    };

    const set = (value: T): void => {
        const raw = codec.encode(value);
        try {
            const storage = storageOrNull();
            if (!storage) throw new Error('no localStorage');
            if (raw === null) storage.removeItem(key);
            else storage.setItem(key, raw);
            memory = undefined;
        } catch {
            memory = raw;
        }
        listeners.forEach(listener => listener());
    };

    const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => {
            if (event.key === key || event.key === null) listener();
        };
        if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
        return () => {
            listeners.delete(listener);
            if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
        };
    };

    return { get, set, subscribe };
}

/** What a reader of a pref needs: its value and its changes (usePref takes either). */
export type PrefView<T> = Pick<Pref<T>, 'get' | 'subscribe'>;

/**
 * `source` as it was once it stopped changing for `ms` (Task 16b): while a
 * burst of sets is under way -- a slider being dragged -- readers keep the
 * value from before it; `ms` after the last set they hear the new one, once.
 * With no reader subscribed it simply is the source. No timers of its own
 * outlive its last subscriber.
 */
export function settledView<T>(source: Pref<T>, ms: number): PrefView<T> {
    const listeners = new Set<() => void>();
    let shown: { value: T } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopSource: (() => void) | null = null;

    const settle = () => {
        timer = null;
        shown = { value: source.get() };
        listeners.forEach(listener => listener());
    };
    const onSourceChange = () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(settle, ms);
    };
    const get = (): T => {
        // Nothing pending: the source is settled, and is the value.
        if (timer === null || shown === null) shown = { value: source.get() };
        return shown.value;
    };
    const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener);
        stopSource ??= source.subscribe(onSourceChange);
        return () => {
            listeners.delete(listener);
            if (listeners.size > 0) return;
            stopSource?.();
            stopSource = null;
            if (timer !== null) clearTimeout(timer);
            timer = null;
        };
    };
    return { get, subscribe };
}
