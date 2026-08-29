import '@testing-library/jest-dom';

// jsdom's test global does not carry over Node's own structuredClone, which
// the atom worker's serialisation contract test uses to exercise the same
// clone mechanism postMessage/onmessage relies on.
//
// A polyfill built on Node's real structuredClone (or node:v8's
// serialize/deserialize) would rebuild typed arrays using *Node's* realm
// constructors, while everything under test here is built with *jsdom's*
// Float64Array/Float32Array -- a cross-realm mismatch that makes Jest's
// `toEqual` report the two as unequal even though they print identically.
// Recursing with each value's own `constructor` instead keeps every rebuilt
// object and typed array in the same realm as its source, which is all this
// app's payloads (plain objects/arrays/typed arrays/numbers) need; a
// function is the one thing the real algorithm refuses to clone, so that
// case is rejected here too rather than silently passed through.
if (typeof globalThis.structuredClone === 'undefined') {
    const clone = (value: unknown): unknown => {
        if (typeof value === 'function') {
            throw new Error('structuredClone polyfill: functions cannot be cloned.');
        }
        if (value === null || typeof value !== 'object') return value;
        if (ArrayBuffer.isView(value)) {
            const TypedArrayConstructor = value.constructor as new (source: ArrayLike<number>) => unknown;
            return new TypedArrayConstructor(value as unknown as ArrayLike<number>);
        }
        if (Array.isArray(value)) return value.map(clone);
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) result[key] = clone(item);
        return result;
    };
    globalThis.structuredClone = clone as typeof structuredClone;
}

// jsdom does not implement matchMedia, which the responsive layout reads to
// decide between the sidebar and the phone sheet. Report desktop width.
if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
