import { useEffect } from 'react';
import type { ViewInsets } from './orbital_visualizer';

/** The viewport frame's overlay zones (spec §8.5), each measured as a camera inset. */
export const TOP_ZONES = ['.viewport-title', '.viewport-toolbar', '.periodic-table-panel'];
export const RIGHT_ZONES = ['.key-column', '.inspector-drawer'];
export const BOTTOM_ZONES = ['.thumbnail-strip', '.molecule-legend-stack'];
/** A phone's top bar and the header line under it (spec §9.8). */
export const PHONE_TOP_ZONES = ['.phone-topbar', '.phone-header'];
const OBSERVED_ZONES = [...TOP_ZONES, ...RIGHT_ZONES, ...BOTTOM_ZONES, ...PHONE_TOP_ZONES, '.phone-sheet'].join(', ');

/**
 * Which parts of the viewport cell are covered, in CSS pixels per edge. The
 * docked Explore panel and inspector sit beside the cell, not over it, so
 * they are not counted (spec §8.5); what is counted is every overlay zone
 * inside it: on a desktop the title block, toolbar and periodic table along
 * the top, the key column and the medium-width inspector drawer down the
 * right, the thumbnail strip and Molecules' key stack along the bottom; on a
 * phone the top bar and header line, and the sheet.
 */
export function measureViewInsets(container: HTMLElement, narrow: boolean): ViewInsets {
    const bounds = container.getBoundingClientRect();
    const insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const rects = (selector: string) => Array.from(container.querySelectorAll<HTMLElement>(selector))
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
    const each = (selectors: string[], apply: (rect: DOMRect) => void) => selectors.forEach(s => rects(s).forEach(apply));

    if (narrow) {
        each(PHONE_TOP_ZONES, rect => { insets.top = Math.max(insets.top, rect.bottom - bounds.top); });
        // The tabbed sheet: along the bottom of a phone held upright, down the
        // right of one turned sideways (only its tab bar, when folded).
        const sheet = rects('.phone-sheet')[0];
        if (sheet) {
            if (sheet.width > bounds.width * 0.6) insets.bottom = Math.max(0, bounds.bottom - sheet.top);
            else insets.right = Math.max(0, bounds.right - sheet.left);
        }
    } else {
        each(TOP_ZONES, rect => { insets.top = Math.max(insets.top, rect.bottom - bounds.top); });
        each(RIGHT_ZONES, rect => { insets.right = Math.max(insets.right, bounds.right - rect.left); });
        each(BOTTOM_ZONES, rect => { insets.bottom = Math.max(insets.bottom, bounds.bottom - rect.top); });
    }

    // Round so sub-pixel layout jitter does not count as a change.
    return {
        top: Math.max(0, Math.round(insets.top)),
        right: Math.max(0, Math.round(insets.right)),
        bottom: Math.max(0, Math.round(insets.bottom)),
        left: Math.max(0, Math.round(insets.left)),
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
    /** The canvas host; its parent, the viewport cell, holds the overlay zones that get measured. */
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
                .querySelectorAll(OBSERVED_ZONES)
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
