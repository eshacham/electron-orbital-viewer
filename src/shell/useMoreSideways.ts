import { useEffect, useState, type RefObject } from 'react';

/**
 * Task 2 (picture control): the sideways twin of useMoreBelow (src/shell/useMoreBelow.ts) -- the same technique, a
 * scroll listener plus a ResizeObserver over the scroller and its children, cleaned up every time it runs -- but
 * shaped for a caller that already holds its own ref to the scroller (ThumbnailStrip's `listRef`) and wants the
 * two edges back as state to put in its own className, rather than a class the hook writes onto the node itself.
 * Runs on every render, not just on mount or a resize: a new item list (a different Shell n, a collapse that
 * mounts a fresh listbox) changes `scrollWidth` without changing the node's own box, so there is no resize to
 * observe -- re-reading on every render picks it up at once instead of waiting for one.
 */
export function useMoreSideways(ref: RefObject<HTMLElement | null>): { before: boolean; after: boolean } {
    const [before, setBefore] = useState(false);
    const [after, setAfter] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;
        // One pixel of slack, as useMoreBelow's bottom edge takes: a fractional scrollLeft right at an edge is still the edge.
        const update = () => {
            setBefore(node.scrollLeft > 1);
            setAfter(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
        };
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        resize?.observe(node);
        for (const child of Array.from(node.children)) resize?.observe(child);
        node.addEventListener('scroll', update, { passive: true });
        update();
        return () => {
            node.removeEventListener('scroll', update);
            resize?.disconnect();
        };
    });

    return { before, after };
}
