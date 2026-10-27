import React, { useLayoutEffect, useRef } from 'react';

/** Room left between the header's bottom edge and the overlays under it. */
const GAP_PX = 8;

/**
 * A phone's header (Task 8 fix round 1, I2): the nav row, if the mode has one, and the caption naming what is drawn.
 * Its height varies -- a long molecule name and its tier chip wrap onto a second line, a subscript, a turned phone --
 * so it measures itself and sets `--phone-overlay-top` on the viewport to its own bottom edge plus a gap. The overlays
 * under it (the scale readout, the key column, the visit notice, a molecule's error) sit there, so none can be covered
 * by it, in any mode. style.css's fixed values are only the first paint's.
 */
const PhoneHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const header = ref.current;
        const viewport = header?.parentElement;
        if (!header || !viewport) return undefined;
        const place = () => {
            const bottom = header.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top;
            viewport.style.setProperty('--phone-overlay-top', `${Math.ceil(bottom) + GAP_PX}px`);
        };
        place();
        // Its height follows its content and the width (the row wraps); a turn of the phone re-measures it.
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
        observer?.observe(header);
        return () => {
            observer?.disconnect();
            viewport.style.removeProperty('--phone-overlay-top');
        };
    }, []);
    return <div ref={ref} className="phone-header">{children}</div>;
};

export default PhoneHeader;
