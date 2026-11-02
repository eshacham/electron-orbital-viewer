import React, { useCallback, useEffect, useRef, useState } from 'react';
import { inspectorWidthPref } from '../design/presentation';
import { LAYOUT } from '../design/tokens';
import { usePref } from '../design/usePref';
import { DOCKED_INSPECTOR_ID } from './Inspector';

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
    /** A drag's draft: the width shown while the pointer is down, stored by nobody; null drops it. */
    preview(px: number | null): void;
}

/**
 * The docked inspector's width. A stored width above a later, smaller maximum is clamped for display only: the
 * pref is not rewritten until the viewer moves the separator again (panel fixes, owner review 2026-11-02).
 */
export function useInspectorWidth(wide: boolean): InspectorWidth {
    const stored = usePref(inspectorWidthPref);
    // Panel fixes (T2 review): a drag moves a local draft; the pref is written once, on release.
    const [draft, setDraft] = useState<number | null>(null);
    const [viewport, setViewport] = useState(() => window.innerWidth);
    useEffect(() => {
        const onResize = () => setViewport(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const set = useCallback((px: number | null) => {
        inspectorWidthPref.set(px === null ? null : clampInspectorWidth(px, window.innerWidth));
    }, []);
    const preview = useCallback((px: number | null) => {
        setDraft(px === null ? null : clampInspectorWidth(px, window.innerWidth));
    }, []);
    const fallback = wide ? LAYOUT.inspectorWide : LAYOUT.inspector;
    return {
        width: clampInspectorWidth(draft ?? stored ?? fallback, viewport),
        min: LAYOUT.inspector,
        max: inspectorMaxWidth(viewport),
        custom: draft !== null || stored !== null,
        set,
        preview,
    };
}

/**
 * The separator on the docked inspector's left edge (panel fixes, P2): drag it, or focus it and press the arrows.
 * The panel is on the right, so a leftward drag and the left arrow widen it. Home goes to the narrowest, End to the
 * widest; a double click goes back to the default. It lives in the gutter beside the panel, so it covers neither
 * the panel's own scrollbar nor the canvas's toolbar.
 */
const InspectorResizer: React.FC<{ size: InspectorWidth }> = ({ size }) => {
    const { width, min, max, set, preview } = size;
    // One pointer owns a drag; `latest` is its draft, which the release stores.
    const drag = useRef<{ pointerId: number; x: number; width: number; latest: number | null; bodyUserSelect: string } | null>(null);

    // Release, cancel, lost capture and unmount all end here: restore the page, then store what the drag reached.
    const endDrag = useCallback(() => {
        const current = drag.current;
        if (!current) return;
        drag.current = null;
        document.body.style.userSelect = current.bodyUserSelect;
        if (current.latest !== null) set(current.latest);
        preview(null);
    }, [set, preview]);
    // A separator that unmounts mid-drag (a window narrowed to the drawer) must not leave the page unselectable.
    useEffect(() => endDrag, [endDrag]);

    const ownsDrag = (event: React.PointerEvent) => drag.current !== null && drag.current.pointerId === event.pointerId;
    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || drag.current) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width, latest: null, bodyUserSelect: document.body.style.userSelect };
        document.body.style.userSelect = 'none';
        event.preventDefault();
    };
    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!drag.current || !ownsDrag(event)) return;
        const next = clampInspectorWidth(drag.current.width + (drag.current.x - event.clientX), window.innerWidth);
        drag.current.latest = next;
        preview(next);
    };
    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        if (ownsDrag(event)) endDrag();
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Alt+Left, Cmd+Left and the like are the browser's (history back); only the bare keys are the separator's.
        if (event.altKey || event.metaKey || event.ctrlKey) return;
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
            aria-controls={DOCKED_INSPECTOR_ID} aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
            onLostPointerCapture={onPointerEnd} onKeyDown={onKeyDown} onDoubleClick={() => set(null)} />
    );
};

export default InspectorResizer;
