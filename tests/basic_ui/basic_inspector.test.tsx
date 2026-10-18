import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BasicInspector from '../../src/basic_ui/BasicInspector';
import { BASIC_PLOT_TABS } from '../../src/atom/plot_tabs';
import { orbitalFacts } from '../../src/orbital_facts';

const tabs = BASIC_PLOT_TABS;
const facts = orbitalFacts({ n: 3, l: 2, ml: 0 }, { enclosedFraction: 0.9, isoLevel: 1e-4, energy: null, method: '' });

describe('BasicInspector (spec §9.2: "Plot tabs as §9.1")', () => {
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
