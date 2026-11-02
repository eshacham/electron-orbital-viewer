import React from 'react';
import { useElementWidth } from './useElementWidth';

/** The measured width is floored to this many px, so a panel being dragged does not re-sample the plot on every pixel. */
const STEP = 4;

interface MeasuredPlotSlotProps {
    /** The narrowest the plot draws: the token's 258 px. Also what it draws where nothing can be measured (jsdom). */
    minWidth: number;
    /** The plot, drawn at the width given. */
    children: (width: number) => React.ReactNode;
}

/**
 * The docked inspector's plot slot (ruling T2-plot, panel fixes): the radial plot follows the panel's content width,
 * so a panel widened to read Info's methods does not leave the plot a 258 px island. A block-level box is measured
 * (its width is the panel's, not the plot's), and the plot is drawn at max(minWidth, that), in steps of 4 px.
 */
const MeasuredPlotSlot: React.FC<MeasuredPlotSlotProps> = ({ minWidth, children }) => {
    const [ref, measured] = useElementWidth<HTMLDivElement>();
    const width = Math.max(minWidth, Math.floor(measured / STEP) * STEP);
    return <div ref={ref} className="inspector-plot-slot">{children(width)}</div>;
};

export default MeasuredPlotSlot;
