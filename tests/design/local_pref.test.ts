import { createPref } from '../../src/design/local_pref';

const codec = {
    decode: (raw: string | null) => (raw === 'a' || raw === 'b' ? raw : 'a'),
    encode: (value: 'a' | 'b') => (value === 'a' ? null : value),
};

afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

describe('createPref', () => {
    it('reads, writes and removes its one key', () => {
        const pref = createPref('test.pref', codec);
        expect(pref.get()).toBe('a');
        pref.set('b');
        expect(window.localStorage.getItem('test.pref')).toBe('b');
        expect(pref.get()).toBe('b');
        pref.set('a');
        expect(window.localStorage.getItem('test.pref')).toBeNull();
    });

    it('returns the same value object until the stored text changes (useSyncExternalStore needs that)', () => {
        const pref = createPref('test.obj', { decode: raw => ({ raw }), encode: (v: { raw: string | null }) => v.raw });
        expect(pref.get()).toBe(pref.get());
    });

    it('tells subscribers of its own writes and of another tab\'s', () => {
        const pref = createPref('test.pref', codec);
        const listener = jest.fn();
        const unsubscribe = pref.subscribe(listener);
        pref.set('b');
        expect(listener).toHaveBeenCalledTimes(1);
        window.localStorage.setItem('test.pref', 'a');
        window.dispatchEvent(new StorageEvent('storage', { key: 'test.pref', newValue: 'a' }));
        expect(listener).toHaveBeenCalledTimes(2);
        window.dispatchEvent(new StorageEvent('storage', { key: 'some.other.key', newValue: 'x' }));
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        pref.set('b');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps the choice in memory when localStorage throws (Review Focus 2)', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        const pref = createPref('test.pref', codec);
        expect(pref.get()).toBe('a');
        expect(() => pref.set('b')).not.toThrow();
        expect(pref.get()).toBe('b');
    });
});
