import React, { useState } from 'react';
import { Typography } from '@mui/material';
import Inspector from '../shell/Inspector';
import { bondsDataLines } from '../components/BondsPanel';
import { BondsState } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';

interface BondsInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    /**
     * The view settings (Controls' view half), heading the inspector above
     * Plot | Data, as every other mode's inspector does (ruling
     * T20b-display-header). App leaves it out of the phone's stacked
     * inspector: there the sheet's own View tab holds them.
     */
    display?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    bonds: BondsState;
    data: BondsData;
    /** BondsCurvePlot, built by App exactly as it was before this task. */
    plot: React.ReactNode;
}

/**
 * Bonds mode's inspector (spec §9.3, Phase 6G-2 Task 9): Display on top,
 * then "Plot and data" (titled sections, one open at a time, ruling R24-3):
 * Plot (the potential curve, unchanged) and Data -- the frontier
 * orbital(s), any near-tie caveat and the method captions `bondsCaptions`
 * returns, moved out of the Explore panel's BondsPanel (ruling P19: that
 * panel chooses what to draw; this is where it came from).
 */
const BondsInspector: React.FC<BondsInspectorProps> = ({ variant, display, open, onOpenChange, bonds, data, plot }) => {
    const [tab, setTab] = useState('plot');
    const { frontier, caveats, captions } = bondsDataLines(bonds, data);
    return (
        <Inspector
            variant={variant}
            open={open}
            onOpenChange={onOpenChange}
            sections={[
                ...(display ? [{ key: 'display', title: 'Display', content: display }] : []),
                {
                    key: 'plot',
                    title: 'Plot and data',
                    activeTab: tab,
                    onTab: setTab,
                    tabs: [
                        { key: 'plot', label: 'Plot', content: plot },
                        {
                            key: 'data',
                            label: 'Data',
                            content: (
                                <>
                                    {frontier && <Typography variant="caption" className="bonds-frontier">{frontier}</Typography>}
                                    {caveats.map(caveat => <Typography key={caveat} variant="caption" className="bonds-note">{caveat}</Typography>)}
                                    <ul className="bonds-captions" aria-label="methods">
                                        {captions.map(caption => <li key={caption}>{caption}</li>)}
                                    </ul>
                                </>
                            ),
                        },
                    ],
                },
            ]}
        />
    );
};

export default BondsInspector;
