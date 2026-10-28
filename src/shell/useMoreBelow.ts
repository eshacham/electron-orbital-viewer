import { useCallback } from 'react';

/** The class a scroller wears while its content runs past its bottom edge (inspector.css, style.css draw the cue). */
export const MORE_BELOW = 'has-more-below';

/**
 * Task 9b (finish review, fix 4): a callback ref for a scroller that says whether there is more below -- Info's docked or
 * drawer slot, and the phone sheet's body. It sets MORE_BELOW while `scrollTop + clientHeight < scrollHeight` and
 * clears it at the bottom, re-reading on every scroll and on any change of size: the scroller's own (a resized window)
 * or its content's (a new selection, a level that adds a band), which a ResizeObserver on the scroller and each child
 * reports; a child swapped for another (the phone sheet's tabs) is observed in its turn. The cue itself is CSS, tonal
 * only (a mask), and nothing animates it.
 */
export function useMoreBelow(): (node: HTMLElement | null) => (() => void) | undefined {
    return useCallback((node: HTMLElement | null) => {
        if (!node) return undefined;
        // One pixel of slack: a fractional scrollTop at the very bottom is still the bottom.
        const update = () => node.classList.toggle(MORE_BELOW, node.scrollTop + node.clientHeight < node.scrollHeight - 1);
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
            node.classList.remove(MORE_BELOW);
        };
    }, []);
}
