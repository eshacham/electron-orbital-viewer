import React, { useState } from 'react';
import { Typography } from '@mui/material';
import Inspector from '../shell/Inspector';
import { BondsState } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { frontierText } from '../bonds/captions';
import { withSubscripts } from '../format/subscripts';
import { h2plusLevelsText } from '../bonds/mo_diagram';
import InfoButton from '../info/InfoButton';

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
 * Plot (the potential curve) and Data -- the values: a molecule's frontier
 * orbital(s) with their Kohn–Sham energies, H₂⁺'s two exact levels. Task 7a:
 * the method captions and near-tie caveats are Info's "How this was
 * computed" (bondsInfo); Data keeps the values. Fix round 1 (I3): the
 * frontier energies say they are Kohn–Sham eigenvalues, with that (i), right
 * beside them (ruling R19); (ruling I5) H₂⁺ keeps a Data tab, so the medium
 * drawer keeps its one-press Plot button.
 */
const BondsInspector: React.FC<BondsInspectorProps> = ({ variant, info, display, open, onOpenChange, bonds, data, plot, showPlot = true }) => {
    const [tab, setTab] = useState('plot');
    const frontier = bonds.system !== 'h2plus' && data.meta ? frontierText(data.meta.orbitals) : null;
    const values = bonds.system === 'h2plus'
        ? bonds.R !== null && (
            <Typography variant="caption" className="bonds-frontier">{withSubscripts(`Exact levels — ${h2plusLevelsText(bonds.R)}`)}</Typography>
        )
        // While the next scan point loads there are no values yet; they follow once its files land.
        : frontier && (
            <div className="bonds-data-line">
                <Typography variant="caption" className="bonds-frontier">{withSubscripts(`Kohn–Sham orbital energies — ${frontier}`)}</Typography>
                <InfoButton topic="kohnSham" label="Kohn–Sham orbitals" place="data" />
            </div>
        );
    return (
        <Inspector
            variant={variant}
            info={info}
            open={open}
            onOpenChange={onOpenChange}
            sections={[
                ...(display ? [{ key: 'display', title: 'Display', content: display }] : []),
                ...(!showPlot ? [] : [{
                    key: 'plot',
                    title: 'Plot and data',
                    activeTab: tab,
                    onTab: setTab,
                    tabs: [
                        { key: 'plot', label: 'Plot', content: plot },
                        { key: 'data', label: 'Data', content: values },
                    ],
                }]),
            ]}
        />
    );
};

export default BondsInspector;
