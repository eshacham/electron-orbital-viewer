import { useEffect, useState } from 'react';

const current = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

/**
 * The screen's device pixel ratio, kept current (fix round 1 of Task 20d):
 * dragging the window to a screen with another ratio, or zooming the page,
 * changes it, and a strip tile's bitmap is made at the tile's device size
 * (thumb_key.ts), so the strip's key -- and every tile -- must follow. A
 * `(resolution: Xdppx)` query stops matching exactly when the ratio moves
 * off X; it is then re-made for the new ratio.
 */
export function useDevicePixelRatio(): number {
    const [ratio, setRatio] = useState(current);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return undefined;
        const list = window.matchMedia(`(resolution: ${ratio}dppx)`);
        const update = () => setRatio(current());
        list.addEventListener('change', update);
        // A change between the first render and this effect.
        update();
        return () => list.removeEventListener('change', update);
    }, [ratio]);
    return ratio;
}
