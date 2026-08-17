import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query from React.
 *
 * The layout has to change shape below phone width — the control panel becomes a
 * sheet, the overlays shrink — and some of that shape lives in components rather
 * than in the stylesheet, so the breakpoint has to be readable from both.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(
        () => typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia(query).matches
    );

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const list = window.matchMedia(query);
        const update = (event: MediaQueryListEvent) => setMatches(event.matches);
        setMatches(list.matches);
        list.addEventListener('change', update);
        return () => list.removeEventListener('change', update);
    }, [query]);

    return matches;
}

/**
 * Below either of these the panel stops being a sidebar you live with and
 * becomes a sheet you open.
 *
 * Width catches phones held upright. Height catches them turned sideways, where
 * the sidebar still fits across but is too tall for the screen — it ends up
 * scrolling with no way to dismiss it.
 */
export const NARROW_VIEWPORT = '(max-width: 760px), (max-height: 500px)';
