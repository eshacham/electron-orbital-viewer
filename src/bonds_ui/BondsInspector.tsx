import React, { useState } from 'react';
import { Typography } from '@mui/material';
import Inspector from '../shell/Inspector';
import { BondsState } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { frontierText } from '../bonds/captions';
import { withSubscripts } from '../format/subscripts';

interface BondsInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    /**
     * The view settings (Controls' view half), heading the inspector above
     * Plot | Data, as every other mode's inspector does (ruling
     * T20b-display-header). App leaves it out of the phone's stacked
     * inspector: there the sheet's own View tab holds them.
     */
    display?: React.ReactNode;
    /** Task 4: Info, always open above the sections (Inspector's `info`). App leaves it out of the phone's stacked inspector: there it has its own tab. */
    info?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    bonds: BondsState;
    data: BondsData;
    /** BondsCurvePlot, built by App exactly as it was before this task. */
    plot: React.ReactNode;
    /** Task 2: false below Explore -- no "Plot and data" section at all (the Display line says where it appears). Default true. */
    showPlot?: boolean;
}

/**
 * Bonds mode's inspector (spec §9.3, Phase 6G-2 Task 9): Display on top,
 * then "Plot and data" (titled sections, one open at a time, ruling R24-3):
 * Plot (the potential curve) and Data -- the frontier orbital(s) with their
 * energies. Task 7a: the method captions and near-tie caveats are Info's
 * "How this was computed" (bondsInfo); Data keeps the values. H₂⁺'s exact
 * levels name no frontier orbital, so it has Plot alone.
 */
const BondsInspector: React.FC<BondsInspectorProps> = ({ variant, info, display, open, onOpenChange, bonds, data, plot, showPlot = true }) => {
    const [tab, setTab] = useState('plot');
    const molecule = bonds.system !== 'h2plus';
    const frontier = molecule && data.meta ? frontierText(data.meta.orbitals) : null;
    return (
        <Inspector
            variant={variant}
            info={info}
            open={open}
            onOpenChange={onOpenChange}
            sections={[
                ...(display ? [{ key: 'display', title: 'Display', content: display }] : []),
                ...(!showPlot ? [] : [molecule ? {
                    key: 'plot',
                    title: 'Plot and data',
                    activeTab: tab,
                    onTab: setTab,
                    tabs: [
                        { key: 'plot', label: 'Plot', content: plot },
                        // The Data tab stays while the next scan point loads; its values follow once they land.
                        {
                            key: 'data',
                            label: 'Data',
                            content: frontier && <Typography variant="caption" className="bonds-frontier">{withSubscripts(frontier)}</Typography>,
                        },
                    ],
                } : { key: 'plot', title: 'Plot and data', content: plot }]),
            ]}
        />
    );
};

export default BondsInspector;
