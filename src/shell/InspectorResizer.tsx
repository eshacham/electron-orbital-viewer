import React, { useCallback, useEffect, useRef, useState } from 'react';
import { inspectorWidthPref } from '../design/presentation';
import { LAYOUT } from '../design/tokens';
import { usePref } from '../design/usePref';

/** The docked right panel's widest: 560 px, and never more than this share of the viewport (panel fixes, P2). */
const MAX_WIDTH = 560;
const MAX_SHARE = 0.45;
/** One arrow press, in px. */
const KEY_STEP = 16;

/** The widest the panel may be at this viewport width: min(560, 45 % of it), rounded. */
export function inspectorMaxWidth(viewport: number): number {
    return Math.round(Math.min(MAX_WIDTH, MAX_SHARE * viewport));
}

/** A width kept inside [the token minimum, the maximum for this viewport], rounded. */
export function clampInspectorWidth(px: number, viewport: number): number {
    return Math.round(Math.min(Math.max(px, LAYOUT.inspector), inspectorMaxWidth(viewport)));
}

export interface InspectorWidth {
    /** The width in px the column has now: the stored one clamped for this viewport, or the default. */
    width: number;
    min: number;
    max: number;
    /** True when the viewer has chosen a width (the grid then reads it; otherwise the stylesheet's 290 / 320 stands). */
    custom: boolean;
    /** A width in px (clamped, then stored), or null to go back to the default. */
    set(px: number | null): void;
}

/**
 * The docked inspector's width. A stored width above a later, smaller maximum is clamped for display only: the
 * pref is not rewritten until the viewer moves the separator again (panel fixes, owner review 2026-11-02).
 */
export function useInspectorWidth(wide: boolean): InspectorWidth {
    const stored = usePref(inspectorWidthPref);
    const [viewport, setViewport] = useState(() => window.innerWidth);
    useEffect(() => {
        const onResize = () => setViewport(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const set = useCallback((px: number | null) => {
        inspectorWidthPref.set(px === null ? null : clampInspectorWidth(px, window.innerWidth));
    }, []);
    const fallback = wide ? LAYOUT.inspectorWide : LAYOUT.inspector;
    return {
        width: clampInspectorWidth(stored ?? fallback, viewport),
        min: LAYOUT.inspector,
        max: inspectorMaxWidth(viewport),
        custom: stored !== null,
        set,
    };
}

/**
 * The separator on the docked inspector's left edge (panel fixes, P2): drag it, or focus it and press the arrows.
 * The panel is on the right, so a leftward drag and the left arrow widen it. Home goes to the narrowest, End to the
 * widest; a double click goes back to the default. It lives in the gutter beside the panel, so it covers neither
 * the panel's own scrollbar nor the canvas's toolbar.
 */
const InspectorResizer: React.FC<{ size: InspectorWidth }> = ({ size }) => {
    const { width, min, max, set } = size;
    const drag = useRef<{ x: number; width: number; bodyUserSelect: string } | null>(null);

    const endDrag = useCallback(() => {
        if (!drag.current) return;
        document.body.style.userSelect = drag.current.bodyUserSelect;
        drag.current = null;
    }, []);
    // A separator that unmounts mid-drag (a window narrowed to the drawer) must not leave the page unselectable.
    useEffect(() => endDrag, [endDrag]);

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { x: event.clientX, width, bodyUserSelect: document.body.style.userSelect };
        document.body.style.userSelect = 'none';
        event.preventDefault();
    };
    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (drag.current) set(drag.current.width + (drag.current.x - event.clientX));
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const next = event.key === 'ArrowLeft' ? width + KEY_STEP
            : event.key === 'ArrowRight' ? width - KEY_STEP
            : event.key === 'Home' ? min
            : event.key === 'End' ? max
            : null;
        if (next === null) return;
        event.preventDefault();
        set(next);
    };

    return (
        <div className="inspector-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the right panel"
            aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
            onLostPointerCapture={endDrag} onKeyDown={onKeyDown} onDoubleClick={() => set(null)} />
    );
};

export default InspectorResizer;
