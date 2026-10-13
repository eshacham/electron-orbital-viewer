import React, { useId, useState } from 'react';
import { Button } from '@mui/material';
import Inspector from '../shell/Inspector';
import TabRow from '../shell/TabRow';
import type { PlotTab } from '../atom/plot_tabs';
import type { PlotTabId } from '../design/presentation';
import type { OrbitalFacts } from '../orbital_facts';
import OrbitalFactsCard from './OrbitalFactsCard';
import './inspector_atom.css';

interface AtomInspectorProps {
    variant: 'docked' | 'drawer' | 'stacked';
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
}

/** The Atom screen's inspector (spec §9.1): Plot, with its function tabs, and Data. */
const AtomInspector: React.FC<AtomInspectorProps> = ({ variant, open, onOpenChange, plotTabs, plotTab, onPlotTab, plot, facts, csvReason, onExportCsv }) => {
    const [tab, setTab] = useState('plot');
    const id = useId();
    const plotContent = (
        <>
            <TabRow idPrefix={`${id}-plot`} label="plot" tabs={plotTabs.map(t => ({ key: t.id, label: t.label, name: t.name }))} active={plotTab.id}
                onChange={key => onPlotTab(key as PlotTabId)} />
            <div role="tabpanel" id={`${id}-plot-panel-${plotTab.id}`} aria-labelledby={`${id}-plot-tab-${plotTab.id}`} className="plot-tab-panel">
                {plot}
            </div>
        </>
    );
    const dataContent = (
        <>
            {facts && <OrbitalFactsCard facts={facts} />}
            <Button variant="outlined" size="small" disabled={csvReason !== null} title={csvReason ?? undefined} onClick={onExportCsv}>
                Export CSV of this plot
            </Button>
        </>
    );
    return (
        <Inspector
            variant={variant}
            open={open}
            onOpenChange={onOpenChange}
            activeTab={tab}
            onTab={setTab}
            tabs={[{ key: 'plot', label: 'Plot', content: plotContent }, { key: 'data', label: 'Data', content: dataContent }]}
        />
    );
};

export default AtomInspector;
