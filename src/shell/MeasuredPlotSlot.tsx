import React from 'react';
import { useElementWidth } from './useElementWidth';

interface MeasuredPlotSlotProps {
    /** What it draws where nothing is measured yet or can be (first paint, jsdom): the token's 258 px. */
    fallbackWidth: number;
    /** The plot, drawn at the width given. */
    children: (width: number) => React.ReactNode;
}

/**
 * The docked inspector's plot slot (ruling T2-plot, panel fixes): the radial plot follows the panel's content width,
 * so a panel widened to read Info's methods does not leave the plot a 258 px island. A block-level box is measured
 * (its width is the panel's, not the plot's), and the plot is drawn at that width whenever there is one (ruling
 * T2-plot-b: at the default 290 panel it is 241 px, and no longer overflows its slot), else at the fallback.
 */
const MeasuredPlotSlot: React.FC<MeasuredPlotSlotProps> = ({ fallbackWidth, children }) => {
    const [ref, measured] = useElementWidth<HTMLDivElement>();
    const width = measured > 0 ? measured : fallbackWidth;
    return <div ref={ref} className="inspector-plot-slot">{children(width)}</div>;
};

export default MeasuredPlotSlot;
