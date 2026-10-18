import React, { useId } from 'react';
import { Button } from '@mui/material';
import TabRow from '../shell/TabRow';
import type { PlotTab } from '../atom/plot_tabs';
import type { PlotTabId } from '../design/presentation';
import type { OrbitalFacts } from '../orbital_facts';
import OrbitalFactsCard from './OrbitalFactsCard';
import './inspector_atom.css';

/**
 * The inspector's Plot and Data tab bodies (spec §9.1), shared by every
 * screen whose inspector follows the same "Plot tabs as §9.1" composition --
 * AtomInspector today, BasicInspector (spec §9.2) from here, Bonds'
 * inspector next. Extracted so the markup, ids and CSS classes the tests and
 * `inspector_atom.css` read stay in one place rather than duplicated per screen.
 */

interface PlotTabRowProps {
    plotTabs: PlotTab[];
    plotTab: PlotTab;
    onPlotTab(id: PlotTabId): void;
    /** The RadialPlot for `plotTab`, built by the caller from the same curves the CSV exports. */
    plot: React.ReactNode;
}

/** The Plot tab's body: the plot's own function tabs (R(r) / |R|² / D(r), or ρ(r) / D(r)) above the plot itself. */
export const PlotTabRow: React.FC<PlotTabRowProps> = ({ plotTabs, plotTab, onPlotTab, plot }) => {
    const id = useId();
    return (
        <>
            <TabRow idPrefix={`${id}-plot`} label="plot" tabs={plotTabs.map(t => ({ key: t.id, label: t.label, name: t.name }))} active={plotTab.id}
                onChange={key => onPlotTab(key as PlotTabId)} />
            <div role="tabpanel" id={`${id}-plot-panel-${plotTab.id}`} aria-labelledby={`${id}-plot-tab-${plotTab.id}`} className="plot-tab-panel">
                {plot}
            </div>
        </>
    );
};

interface DataTabBodyProps {
    facts: OrbitalFacts | null;
    /** Why the CSV cannot be exported now (exportAvailability), or null. */
    csvReason: string | null;
    onExportCsv(): void;
}

/** The Data tab's body: the facts card and the CSV export of the plot on screen (ruling C6). */
export const DataTabBody: React.FC<DataTabBodyProps> = ({ facts, csvReason, onExportCsv }) => (
    <>
        {facts && <OrbitalFactsCard facts={facts} />}
        <Button variant="outlined" size="small" disabled={csvReason !== null} title={csvReason ?? undefined} onClick={onExportCsv}>
            Export CSV of this plot
        </Button>
    </>
);
