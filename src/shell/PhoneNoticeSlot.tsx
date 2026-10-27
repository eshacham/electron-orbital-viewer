import React, { useLayoutEffect, useRef } from 'react';

/**
 * Task 2 fix round 1 (M2): a phone's notice (the visit level's) in its own room under the header. The overlays
 * placed there -- the scale readout, the key column, a molecule's error -- sit at `--phone-overlay-top` plus
 * `--phone-notice-offset` (style.css), and this sets that offset on the viewport to the notice's own height while
 * it is shown, so the notice pushes them down rather than covering them.
 */
const PhoneNoticeSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const slot = ref.current;
        const viewport = slot?.parentElement;
        if (!slot || !viewport) return undefined;
        const place = () => viewport.style.setProperty('--phone-notice-offset', `${Math.ceil(slot.getBoundingClientRect().height) + 8}px`);
        place();
        // Its height follows the width (the text wraps); a turn of the phone re-measures it.
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
        observer?.observe(slot);
        return () => {
            observer?.disconnect();
            viewport.style.removeProperty('--phone-notice-offset');
        };
    }, []);
    return <div ref={ref} className="phone-notice-slot">{children}</div>;
};

export default PhoneNoticeSlot;
