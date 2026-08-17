import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, NARROW_VIEWPORT } from '../src/useMediaQuery';

/** A matchMedia stand-in whose result can be changed from the test. */
function installMatchMedia(initial: boolean) {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    let matches = initial;
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
        media,
        get matches() { return matches; },
        addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => { listeners.add(fn); },
        removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => { listeners.delete(fn); },
    });
    return {
        set(value: boolean) {
            matches = value;
            listeners.forEach(fn => fn({ matches: value } as MediaQueryListEvent));
        },
        listenerCount: () => listeners.size,
    };
}

describe('useMediaQuery', () => {
    const original = window.matchMedia;
    afterEach(() => { window.matchMedia = original; });

    it('reports the query state at mount', () => {
        installMatchMedia(true);
        const { result } = renderHook(() => useMediaQuery('(max-width: 760px)'));
        expect(result.current).toBe(true);
    });

    it('follows the query when the viewport changes', () => {
        const media = installMatchMedia(false);
        const { result } = renderHook(() => useMediaQuery('(max-width: 760px)'));
        expect(result.current).toBe(false);

        act(() => media.set(true));
        expect(result.current).toBe(true);

        act(() => media.set(false));
        expect(result.current).toBe(false);
    });

    it('stops listening when unmounted', () => {
        const media = installMatchMedia(false);
        const { unmount } = renderHook(() => useMediaQuery('(max-width: 760px)'));
        expect(media.listenerCount()).toBe(1);
        unmount();
        expect(media.listenerCount()).toBe(0);
    });

    it('reports false where matchMedia does not exist rather than throwing', () => {
        (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
        const { result } = renderHook(() => useMediaQuery('(max-width: 760px)'));
        expect(result.current).toBe(false);
    });
});

describe('the narrow-viewport breakpoint', () => {
    // A phone upright is caught by width; turned sideways it is wide enough to
    // pass the width test but too short for a full-height sidebar, so height has
    // to be part of the query.
    it('covers both phone orientations', () => {
        expect(NARROW_VIEWPORT).toContain('max-width');
        expect(NARROW_VIEWPORT).toContain('max-height');
    });
});
