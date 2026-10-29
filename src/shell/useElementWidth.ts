import { useLayoutEffect, useState } from 'react';

/**
 * Task 3 (picture control): the width of a box, in whole CSS pixels, for a child that draws to a pixel width -- Bonds'
 * curve under the R slider fills its block. A ResizeObserver reads the content box (its first report comes as soon as
 * the box is laid out, before paint) and every change after. 0 until measured, while there is no box, and where there
 * is no ResizeObserver (jsdom): the caller draws nothing then, rather than draw at a guessed width.
 *
 * Task 4 (T3 M4): it returns a callback ref to put on the box, and observes whichever element that ref is given -- so a
 * box mounted after the first render, or swapped for another, is measured too (a ref object's change is never seen).
 */
export function useElementWidth<T extends HTMLElement = HTMLElement>(): [ref: (node: T | null) => void, width: number] {
    const [node, setNode] = useState<T | null>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        if (!node) {
            setWidth(0);
            return undefined;
        }
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(entries => {
            const entry = entries.find(e => e.target === node) ?? entries[0];
            if (entry) setWidth(Math.floor(entry.contentRect.width));
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);
    return [setNode, width];
}
