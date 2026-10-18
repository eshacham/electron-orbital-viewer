import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BasicInspector from '../../src/basic_ui/BasicInspector';
import RadialPlot from '../../src/components/RadialPlot';
import { BASIC_PLOT_TABS } from '../../src/atom/plot_tabs';
import { orbitalFacts } from '../../src/orbital_facts';

const tabs = BASIC_PLOT_TABS;
const facts = orbitalFacts({ n: 3, l: 2, ml: 0 }, { enclosedFraction: 0.9, isoLevel: 1e-4, energy: null, method: '' });

describe('BasicInspector (spec §9.2: "Plot tabs as §9.1")', () => {
    // Ruling T13-isostale: a pending value is seen as "…" and heard as "computing" (as Atoms').
    it('speaks a fact\'s spoken value and hides its visible mark from readers', () => {
        const pending = orbitalFacts({ n: 3, l: 2, ml: 0 }, { enclosedFraction: 0.9, isoLevel: 1e-4, isoPending: true, energy: null, method: '' });
        render(<BasicInspector variant="stacked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()} combination={false}
            plot={<p>plot</p>} facts={pending} csvReason={null} onExportCsv={jest.fn()} />);
        const card = screen.getByRole('region', { name: 'orbital facts' });
        expect(card).toHaveTextContent('Iso value…computing');
        expect(screen.getByText('…')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('computing')).toHaveClass('visually-hidden');
    });

    it('has Plot and Data; Plot holds the plot tabs (names and labels), the active tab\'s plot, Data the facts and the CSV of the plot on screen', () => {
        const onPlotTab = jest.fn();
        const onExportCsv = jest.fn();
        render(<BasicInspector variant="docked" plotTabs={tabs} plotTab={tabs[2]} onPlotTab={onPlotTab} combination={false}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={onExportCsv} />);
        expect(screen.getByRole('tab', { name: 'Wave function R(r)' })).toHaveTextContent(/^R\(r\)$/);
        expect(screen.getByRole('tab', { name: 'Probability density |R|²' })).toHaveTextContent(/^\|R\|²$/);
        expect(screen.getByRole('tab', { name: 'Radial distribution D(r)' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('plot')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Wave function R(r)' }));
        expect(onPlotTab).toHaveBeenCalledWith('wave');
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(screen.getByRole('region', { name: 'orbital facts' })).toHaveTextContent('3d_z² orbital');
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
        expect(onExportCsv).toHaveBeenCalled();
    });

    // Step 4: "the active tab's plot (RadialPlot with title = the tab's title)". Ruling T7-dist (fix
    // round 1) carves the D(r) tab out of this -- App.tsx never overrides RadialPlot's own title there
    // -- so this is checked on the R(r) tab, which (like |R|²) does carry the shared tab's title.
    it('the active tab\'s plot is given that tab\'s own title (R(r)/|R|² tabs; D(r) keeps RadialPlot\'s own, ruling T7-dist)', () => {
        render(<BasicInspector variant="docked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()} combination={false}
            plot={<RadialPlot n={3} l={2} Z={1} rMax={40} title={tabs[0].title} />}
            facts={facts} csvReason={null} onExportCsv={jest.fn()} />);
        expect(screen.getByText(tabs[0].title)).toBeInTheDocument();
    });

    // Step 4: "the displayPref.plotTab choice persists (as Atoms)" -- App.tsx is the one that reads/writes
    // the preference; what BasicInspector must do is hold no plot-tab state of its own to fight it, so
    // whichever tab the stored preference names stays shown across renders.
    it('the active plot tab is fully controlled by the plotTab prop, so a stored choice persists across renders', () => {
        const { rerender } = render(<BasicInspector variant="docked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()} combination={false}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={jest.fn()} />);
        expect(screen.getByRole('tab', { name: 'Wave function R(r)' })).toHaveAttribute('aria-selected', 'true');
        rerender(<BasicInspector variant="docked" plotTabs={tabs} plotTab={tabs[1]} onPlotTab={jest.fn()} combination={false}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={jest.fn()} />);
        expect(screen.getByRole('tab', { name: 'Probability density |R|²' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Wave function R(r)' })).toHaveAttribute('aria-selected', 'false');
    });

    // Spec §9.2 last line: a combination keeps today's single plot, with no function tabs above it.
    it('hides the plot tab row while a combination is drawn, and still shows the plot', () => {
        render(<BasicInspector variant="docked" plotTabs={tabs} plotTab={tabs[2]} onPlotTab={jest.fn()} combination
            plot={<p>combination plot</p>} facts={null} csvReason={null} onExportCsv={jest.fn()} />);
        expect(screen.queryByRole('tab', { name: 'Wave function R(r)' })).not.toBeInTheDocument();
        expect(screen.getByText('combination plot')).toBeInTheDocument();
        // No facts card for a combination (ruling §3.5: a card exists only while it has something real to say).
        expect(screen.queryByRole('region', { name: 'orbital facts' })).not.toBeInTheDocument();
    });

    it('heads the docked inspector with the Display section, above Plot and Data', () => {
        render(<BasicInspector variant="docked" display={<p>display settings</p>} plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()}
            combination={false} plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={jest.fn()} />);
        const display = screen.getByRole('region', { name: 'Display' });
        expect(display).toHaveTextContent('display settings');
        expect(display.compareDocumentPosition(screen.getByRole('tab', { name: 'Plot' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('stacks Plot and Data in the phone sheet', () => {
        render(<BasicInspector variant="stacked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()} combination={false}
            plot={<p>plot</p>} facts={facts} csvReason="nothing drawn" onExportCsv={jest.fn()} />);
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot');
        expect(screen.getByRole('button', { name: 'Export CSV of this plot' })).toBeDisabled();
    });
});
