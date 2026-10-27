import { useCallback, useEffect, useState } from 'react';

/**
 * Full screen for the app shell (spec §8.5): the Fullscreen API where the
 * browser has it; iPhone Safari has no element full screen, so there it is
 * "focus mode" -- the panels collapse. Esc leaves either.
 */
export function useFullscreen(target: React.RefObject<HTMLElement | null>): { active: boolean; toggle(): void } {
    const [native, setNative] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    useEffect(() => {
        const onChange = () => setNative(Boolean(document.fullscreenElement) && document.fullscreenElement === target.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, [target]);

    useEffect(() => {
        if (!focusMode) return undefined;
        // Final review B, M7: this listener is on document, so an Esc meant for
        // something else (the search popover, a disclosure) must not also exit
        // focus mode -- consistent with the inspector drawer's own
        // document/local Escape listener.
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) setFocusMode(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [focusMode]);

    const toggle = useCallback(() => {
        const element = target.current;
        if (native) { void document.exitFullscreen?.(); return; }
        if (focusMode) { setFocusMode(false); return; }
        if (element && document.fullscreenEnabled && typeof element.requestFullscreen === 'function') {
            element.requestFullscreen().catch(() => setFocusMode(true));
        } else {
            setFocusMode(true);
        }
    }, [target, native, focusMode]);

    return { active: native || focusMode, toggle };
}
