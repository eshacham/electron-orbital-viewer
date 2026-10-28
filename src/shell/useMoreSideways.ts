import { useEffect, useState, type RefObject } from 'react';

/**
 * Task 2 (picture control): the sideways twin of useMoreBelow (src/shell/useMoreBelow.ts) -- the same technique, a
 * scroll listener plus a ResizeObserver over the scroller and its children and a MutationObserver that re-observes
 * when a child swaps for another (a new Shell n's groups, keyed `${label}-${index}`), all cleaned up together --
 * but shaped for a caller that already holds its own ref to the scroller (ThumbnailStrip's `listRef`) and wants the
 * two edges back as state to put in its own className, rather than a class the hook writes onto the node itself.
 *
 * Task 2 review fix round 1 (I1): keyed on `[ref, enabled, resetKey]`, not run on every render. The first cut ran
 * unconditionally, in every mode (Atoms, Bonds, Molecules too), rebuilding its observers and forcing a synchronous
 * layout read on every App render -- the opt-in boundary held in the DOM (the classes still only showed under
 * `groupScroll`) but not in the work done. `enabled` is `groupScroll` itself: while it is false (every strip but
 * Orbitals), this hook does nothing at all -- no observer, no listener, both flags held at `false`. `resetKey` is
 * the same DX2 pattern `useRovingFocus` already uses for a listbox that remounts (a collapse/expand): pass whatever
 * gates the scroller's own mount so a fresh node is picked up.
 */
export function useMoreSideways(
    ref: RefObject<HTMLElement | null>,
    { enabled, resetKey }: { enabled: boolean; resetKey?: unknown },
): { before: boolean; after: boolean } {
    const [before, setBefore] = useState(false);
    const [after, setAfter] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!enabled || !node) {
            setBefore(false);
            setAfter(false);
            return undefined;
        }
        // One pixel of slack, as useMoreBelow's bottom edge takes: a fractional scrollLeft right at an edge is still the edge.
        const update = () => {
            setBefore(node.scrollLeft > 1);
            setAfter(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
        };
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        const observe = () => {
            if (!resize) return;
            resize.disconnect();
            resize.observe(node);
            for (const child of Array.from(node.children)) resize.observe(child);
        };
        const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { observe(); update(); });
        observe();
        children?.observe(node, { childList: true });
        node.addEventListener('scroll', update, { passive: true });
        update();
        return () => {
            node.removeEventListener('scroll', update);
            resize?.disconnect();
            children?.disconnect();
        };
    }, [ref, enabled, resetKey]);

    return { before, after };
}
