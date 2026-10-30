import { useEffect, useRef } from 'react';
import { BasicSelection } from '../store/orbitalSlice';

/** Spec §9.2: a chip change dispatches the draw 150 ms after the last one, not on every click. */
export const DRAW_DEBOUNCE_MS = 150;

/**
 * Ruling P3: chips replace Update Orbital -- the selection draws itself,
 * debounced, instead of waiting for an explicit button press.
 *
 * Final polish F1: this hook is the one place Basic Orbitals draws its plain
 * orbital, so every pick draws it once. It draws `selection`:
 * - at once, when `drawNonce` changes (a restored link's requestBasicRender,
 *   or setMode entering the mode), including at mount for a request already
 *   made (a link opened at boot);
 * - at once, when `enabled` turns true (entering the mode, or leaving a
 *   combination -- a ⌘K pick, a strip tile, an n chip or a link);
 * - `DRAW_DEBOUNCE_MS` after the last change of n, l or mₗ while `enabled`
 *   stays true (a chip, a strip tile, a ⌘K pick in the mode).
 * Any of these landing in one commit draws once, at once: the debounce is
 * only for a change nothing else has drawn. A debounced draw of the orbital
 * this hook last drew is skipped -- a pick back to the orbital on screen, or
 * a ⌘K pick of it, draws it no extra time (Review Focus 1). Never on mount
 * without a request; cancelled on unmount or when `enabled` turns false.
 *
 * `enabled` is false while a combination is drawn instead (App.tsx's
 * combination effect draws it) and outside the mode: n/l/mₗ changing then
 * must not replace the picture.
 *
 * Review Focus 1 (6G-2): three chip clicks within the debounce window (n,
 * then l, then mₗ) draw once, for the last of them -- each change restarts
 * the timer rather than queuing its own.
 *
 * The draws this replaced: App.tsx's nonce effect drew at once and this hook
 * again 150 ms later (a ⌘K pick or a link to a new orbital while in the
 * mode), and App.tsx's combination effect drew a left combination's orbital
 * beside the ⌘K pick's or the nonce effect's own draw (two at once).
 */
export function useDrawOnSelection(
    selection: BasicSelection,
    enabled: boolean,
    drawNonce: number,
    draw: (s: BasicSelection) => void,
): void {
    // `draw` is read through a ref so an inline arrow function (a fresh
    // identity every render) does not restart the debounce on its own.
    const drawRef = useRef(draw);
    drawRef.current = draw;
    const key = `${selection.n},${selection.l},${selection.ml}`;
    // What the previous run of the effect below saw. The nonce starts at 0, so
    // a request already made before mount (a link at boot) is one to draw;
    // `enabled` and the selection start as they are, so mounting is neither
    // "turning on" nor "a change".
    const seen = useRef({ nonce: 0, enabled, key });
    // The orbital this hook last drew while `enabled` stayed true, or null.
    const drawnKey = useRef<string | null>(null);

    useEffect(() => {
        const previous = seen.current;
        seen.current = { nonce: drawNonce, enabled, key };
        if (!enabled) {
            // A combination or another mode is on the canvas now.
            drawnKey.current = null;
            return undefined;
        }
        const drawNow = () => {
            drawnKey.current = key;
            drawRef.current(selection);
        };
        if (drawNonce !== previous.nonce || !previous.enabled) {
            drawNow();
            return undefined;
        }
        if (key === previous.key) return undefined;
        const timer = setTimeout(() => {
            if (key !== drawnKey.current) drawNow();
        }, DRAW_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // selection is read through `key`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled, drawNonce]);
}
