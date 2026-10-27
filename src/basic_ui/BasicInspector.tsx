import React, { useState } from 'react';
import Inspector from '../shell/Inspector';
import { PlotTabRow, DataTabBody } from '../atom_ui/PlotDataTabs';
import type { PlotTab } from '../atom/plot_tabs';
import type { PlotTabId } from '../design/presentation';
import type { OrbitalFacts } from '../orbital_facts';

interface BasicInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
    /**
     * The Display settings (surface style, enclosed fraction, opacity, cut,
     * axes) -- Controls' view half (ruling R20b), heading the inspector
     * above Plot | Data. App leaves it out of the phone's stacked inspector:
     * there the sheet's own View tab holds it.
     */
    display?: React.ReactNode;
    /** Task 4: Info, always open above the sections (Inspector's `info`). App leaves it out of the phone's stacked inspector: there it has its own tab. */
    info?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    plotTabs: PlotTab[];
    plotTab: PlotTab;
    onPlotTab(id: PlotTabId): void;
    /**
     * A combination is drawn instead of one hydrogenic orbital: its own
     * single radial-distribution plot of ingredients and weighted sum
     * stands in place of the function tabs (spec §9.2 last line), so the
     * Plot tab shows `plot` alone, with no tab row above it.
     */
    combination: boolean;
    /** The RadialPlot for `plotTab` (or the combination's), built by App from the same curves the CSV exports. */
    plot: React.ReactNode;
    facts: OrbitalFacts | null;
    /** Why the CSV cannot be exported now (exportAvailability), or null. */
    csvReason: string | null;
    onExportCsv(): void;
    /** Task 2: false below Explore -- no "Plot and data" section at all (the Display line says where it appears). Default true. */
    showPlot?: boolean;
}

/**
 * Basic Orbitals' inspector (spec §9.2: "Plot tabs as §9.1"): the same
 * Plot/Data composition as AtomInspector, sharing its Plot-tab-row and
 * Data-card body (PlotDataTabs) rather than duplicating them.
 */
const BasicInspector: React.FC<BasicInspectorProps> = ({
    variant, info, display, open, onOpenChange, plotTabs, plotTab, onPlotTab, combination, plot, facts, csvReason, onExportCsv, showPlot = true,
}) => {
    const [tab, setTab] = useState('plot');
    const plotContent = combination
        ? <div className="plot-tab-panel">{plot}</div>
        : <PlotTabRow plotTabs={plotTabs} plotTab={plotTab} onPlotTab={onPlotTab} plot={plot} />;
    return (
        <Inspector
            variant={variant}
            info={info}
            open={open}
            onOpenChange={onOpenChange}
            sections={[
                // Ruling R24-3: titled sections, one open at a time.
                ...(display ? [{ key: 'display', title: 'Display', content: display }] : []),
                ...(!showPlot ? [] : [{
                    key: 'plot',
                    title: 'Plot and data',
                    activeTab: tab,
                    onTab: setTab,
                    tabs: [
                        { key: 'plot', label: 'Plot', content: plotContent },
                        { key: 'data', label: 'Data', content: <DataTabBody facts={facts} csvReason={csvReason} onExportCsv={onExportCsv} /> },
                    ],
                }]),
            ]}
        />
    );
};

export default BasicInspector;
