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
 * scrolling with no way to dismiss it. A tablet held upright (768-1024 px
 * wide) gets the phone layout too: two 340 px columns left its atom about
 * 260 px across, where the header and sheet give it the full width.
 */
export const NARROW_VIEWPORT = '(max-width: 760px), (max-height: 500px), (max-width: 1100px) and (orientation: portrait)';

/**
 * Wider than a phone, but not wide enough for both side panels and a usable
 * view between them: at 1024 px the two 340 px columns left the atom about
 * 300 px, and at 860 px about 160. Here the right-hand panel starts folded.
 * Only meaningful when NARROW_VIEWPORT does not match.
 */
export const MEDIUM_VIEWPORT = '(max-width: 1199px)';

/**
 * A user who has asked their OS for reduced motion gets the level-transition
 * animation's instant cut, never a shortened version of the animation itself
 * (level-transition spec addendum) -- so this is read once, at the point
 * that decides whether to animate at all, rather than folded into any
 * duration.
 */
export const PREFERS_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
