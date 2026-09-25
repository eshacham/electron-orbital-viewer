import { useEffect } from 'react';
import type { ViewInsets } from './orbital_visualizer';

/**
 * Which parts of the canvas are covered by panels, in CSS pixels per edge.
 *
 * On a desktop the side panel covers the left, the view panel the right and
 * the periodic table the top; on a phone the navigation card covers the top
 * (or the left, in landscape) and the controls sheet, when open, the bottom. The atom used to be
 * centred on the whole canvas regardless, so the table sat over its top half
 * on a desktop and the plot over it on a phone.
 */
export function measureViewInsets(container: HTMLElement, narrow: boolean): ViewInsets {
    const bounds = container.getBoundingClientRect();
    const insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const rectOf = (selector: string) => {
        const element = container.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? rect : null;
    };

    if (narrow) {
        // The navigation card spans the top of a phone held upright, and is
        // a column down the left of one turned sideways. The scale readout
        // and the folded plot are small corner overlays and do not count:
        // shrinking the atom to clear them cost more than they cover.
        const nav = rectOf('.level-nav') ?? rectOf('#panel-toggle');
        if (nav) {
            if (nav.width > bounds.width * 0.6) {
                insets.top = Math.max(0, nav.bottom - bounds.top);
            } else {
                insets.left = Math.max(0, nav.right - bounds.left);
            }
        }
        const sheet = rectOf('#controls.open');
        if (sheet && sheet.top < bounds.bottom) {
            insets.bottom = Math.max(0, bounds.bottom - sheet.top);
        }
    } else {
        const table = rectOf('.periodic-table-panel');
        if (table) insets.top = Math.max(0, table.bottom - bounds.top);
        const side = rectOf('.side-panel');
        if (side) insets.left = Math.max(0, side.right - bounds.left);
        const view = rectOf('.view-panel');
        if (view) insets.right = Math.max(0, bounds.right - view.left);
    }

    // Round so sub-pixel layout jitter does not count as a change.
    return {
        top: Math.round(insets.top),
        right: Math.round(insets.right),
        bottom: Math.round(insets.bottom),
        left: Math.round(insets.left),
    };
}

/**
 * Keeps `onChange` told of the covered insets as panels open, close, grow
 * and move. Panels mount and unmount with the drill-down level, and the
 * phone sheet slides rather than resizing, so a ResizeObserver alone would
 * miss most of it: this also watches the container's subtree for changes
 * and transitions ending, and batches everything into one measurement per
 * frame.
 */
export function useViewInsets(
    /** The canvas host; its parent holds the panels that get measured. */
    hostRef: React.RefObject<HTMLElement | null>,
    narrow: boolean,
    onChange: (insets: ViewInsets) => void
): void {
    useEffect(() => {
        const container = hostRef.current?.parentElement;
        if (!container) return;

        let frame = 0;
        const schedule = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const insets = measureViewInsets(container, narrow);
                // Overlays that belong with the atom (the busy notice, the
                // ψ key) centre on the free area through these.
                const width = container.clientWidth;
                const height = container.clientHeight;
                container.style.setProperty('--free-center-x', `${insets.left + (width - insets.left - insets.right) / 2}px`);
                container.style.setProperty('--free-center-y', `${insets.top + (height - insets.top - insets.bottom) / 2}px`);
                container.style.setProperty('--free-left', `${insets.left}px`);
                onChange(insets);
            });
        };

        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        const observeAll = () => {
            if (!resizeObserver) return;
            resizeObserver.disconnect();
            resizeObserver.observe(container);
            container
                .querySelectorAll('.level-nav, .side-panel, .view-panel, .periodic-table-panel, .radial-plot, #controls')
                .forEach(element => resizeObserver.observe(element));
        };
        const mutationObserver = new MutationObserver(() => {
            observeAll();
            schedule();
        });
        mutationObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        container.addEventListener('transitionend', schedule);
        window.addEventListener('resize', schedule);

        observeAll();
        schedule();
        return () => {
            if (frame) cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
            container.removeEventListener('transitionend', schedule);
            window.removeEventListener('resize', schedule);
        };
    }, [hostRef, narrow, onChange]);
}
