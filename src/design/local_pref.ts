/**
 * One localStorage key behind a tiny external store (spec §6.1, §6.7): the
 * theme, the brand and the presentation preferences live here, outside
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
