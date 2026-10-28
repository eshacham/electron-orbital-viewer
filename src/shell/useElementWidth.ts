import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Task 3 (picture control): the width of a box, in whole CSS pixels, for a child that draws to a pixel width -- Bonds'
 * curve under the R slider fills its block. A ResizeObserver reads the content box (its first report comes as soon as
 * the box is laid out, before paint) and every change after. 0 until measured, and where there is no ResizeObserver
 * (jsdom): the caller draws nothing then, rather than draw at a guessed width.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(entries => {
            const entry = entries.find(e => e.target === node) ?? entries[0];
            if (entry) setWidth(Math.floor(entry.contentRect.width));
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}
