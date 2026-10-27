import React, { useState } from 'react';
import Inspector from '../shell/Inspector';
import { PlotTabRow, DataTabBody } from './PlotDataTabs';
import type { PlotTab } from '../atom/plot_tabs';
import type { PlotTabId } from '../design/presentation';
import type { OrbitalFacts } from '../orbital_facts';

interface AtomInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    /**
     * The Display settings (surface style, enclosed fraction,
     * opacity, cut, axes), heading the inspector above Plot | Data (ruling
     * R20b-atoms). App leaves it out of the phone's stacked inspector: there
     * the sheet's View tab holds them.
     */
    display?: React.ReactNode;
    /** Task 4: Info, always open above the sections (Inspector's `info`). App leaves it out of the phone's stacked inspector: there it has its own tab. */
    info?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    plotTabs: PlotTab[];
    plotTab: PlotTab;
    onPlotTab(id: PlotTabId): void;
    /** The RadialPlot for `plotTab`, built by App from the same curves the CSV exports. */
    plot: React.ReactNode;
    facts: OrbitalFacts | null;
    /** Why the CSV cannot be exported now (exportAvailability), or null. */
    csvReason: string | null;
    onExportCsv(): void;
    /** Task 2: false below Explore -- no "Plot and data" section at all (the Display line says where it appears). Default true. */
    showPlot?: boolean;
}

/**
 * The Atom screen's inspector (spec §9.1): Display on top (ruling R20b-atoms), then "Plot and data" -- Plot,
 * with its function tabs, and Data -- as titled sections, one open at a time (ruling R24-3).
 */
const AtomInspector: React.FC<AtomInspectorProps> = ({
    variant, info, display, open, onOpenChange, plotTabs, plotTab, onPlotTab, plot, facts, csvReason, onExportCsv, showPlot = true,
}) => {
    const [tab, setTab] = useState('plot');
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
                        { key: 'plot', label: 'Plot', content: <PlotTabRow plotTabs={plotTabs} plotTab={plotTab} onPlotTab={onPlotTab} plot={plot} /> },
                        { key: 'data', label: 'Data', content: <DataTabBody facts={facts} csvReason={csvReason} onExportCsv={onExportCsv} /> },
                    ],
                }]),
            ]}
        />
    );
};

export default AtomInspector;
