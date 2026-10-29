import { useEffect, useRef } from 'react';
import { BasicSelection } from '../store/orbitalSlice';

/** Spec §9.2: a chip change dispatches the draw 150 ms after the last one, not on every click. */
export const DRAW_DEBOUNCE_MS = 150;

/**
 * Ruling P3: chips replace Update Orbital -- the selection draws itself,
 * debounced, instead of waiting for an explicit button press.
 *
 * Calls `draw(selection)` `DRAW_DEBOUNCE_MS` after the last change of
 * `selection`; never on mount (the mode-entry nonce effect in App.tsx
 * already draws the restored or default selection once); cancelled on
 * unmount or when `enabled` turns false.
 *
 * `enabled` only ever *cancels* -- it is not itself a trigger. App.tsx calls
 * this hook unconditionally (it sits beside the nonce effect, not inside
 * BasicExplore, which mounts and unmounts with the mode), with `enabled`
 * following `isBasicMode`. If flipping `enabled` on scheduled a draw the way
 * a selection change does, *entering* Basic Orbitals would draw twice: once
 * from the nonce effect at once, and once from this hook 150 ms later for
 * the very same, unchanged selection. So only n, l and mₗ changing restarts
 * the timer; `enabled` turning false during the wait cancels it, and
 * `enabled` is checked again when the timer fires, in case it changed
 * without a new timer (a selection chosen, then a combination picked before
 * 150 ms is up).
 *
 * Review Focus 1: three chip clicks within the debounce window (n, then l,
 * then mₗ) must draw once, for the last of them -- each change restarts the
 * timer rather than queuing its own.
 *
 * Final review I1 (picture control): a selection change that lands in the
 * same commit as `enabled` turning on, or while it is off, schedules
 * nothing. Whatever turned `enabled` on draws that selection itself: leaving
 * a combination (a strip tile or an n chip pressed while one is held) is
 * drawn at once by App.tsx's combination effect, and entering the mode by
 * the nonce effect. Timing the same orbital again 150 ms later rebuilt the
 * mesh just drawn.
 */
export function useDrawOnSelection(
    selection: BasicSelection,
    enabled: boolean,
    draw: (s: BasicSelection) => void,
): void {
    const mounted = useRef(false);
    // `draw` and `enabled` are read through refs so an inline arrow function
    // or `enabled` turning on (a fresh identity / value every render) does
    // not restart the debounce on its own -- only a real change of n, l or
    // ml does (see the doc comment above).
    const drawRef = useRef(draw);
    drawRef.current = draw;
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // `enabled` as of the previous commit: the selection effect below runs
    // before the effect at the end of this hook brings it up to date.
    const wasEnabledRef = useRef(enabled);

    // Cancel a pending draw the moment `enabled` turns false -- a combination
    // picked, or the mode left, before the debounce elapsed.
    useEffect(() => {
        if (!enabled && timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, [enabled]);

    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return undefined;
        }
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = null;
        if (!enabled || !wasEnabledRef.current) return undefined;
        const timer = setTimeout(() => {
            timerRef.current = null;
            if (enabledRef.current) drawRef.current(selection);
        }, DRAW_DEBOUNCE_MS);
        timerRef.current = timer;
        return () => {
            clearTimeout(timer);
            if (timerRef.current === timer) timerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selection.n, selection.l, selection.ml]);

    useEffect(() => { wasEnabledRef.current = enabled; });
}
