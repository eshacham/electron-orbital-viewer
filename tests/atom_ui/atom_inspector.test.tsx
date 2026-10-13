import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtomInspector from '../../src/atom_ui/AtomInspector';
import { plotTabsFor } from '../../src/atom/plot_tabs';
import { orbitalFacts } from '../../src/orbital_facts';

const tabs = plotTabsFor('orbital', true, false);
const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, { enclosedFraction: 0.9, isoLevel: null, energy: null, method: 'non-relativistic LDA' });

describe('AtomInspector (spec §8.6, §9.1)', () => {
    it('has Plot and Data; Plot holds the plot tabs, Data the facts and the CSV of the plot on screen', () => {
        const onPlotTab = jest.fn();
        const onExportCsv = jest.fn();
        render(<AtomInspector variant="docked" plotTabs={tabs} plotTab={tabs[2]} onPlotTab={onPlotTab}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={onExportCsv} />);
        expect(screen.getByRole('tab', { name: 'Radial distribution' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: 'Wave function' }));
        expect(onPlotTab).toHaveBeenCalledWith('wave');
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(screen.getByRole('region', { name: 'orbital facts' })).toHaveTextContent('2p_z orbital');
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
        expect(onExportCsv).toHaveBeenCalled();
    });

    it('stacks Plot and Data in the phone sheet', () => {
        render(<AtomInspector variant="stacked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()}
            plot={<p>plot</p>} facts={facts} csvReason="nothing drawn" onExportCsv={jest.fn()} />);
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot');
        expect(screen.getByRole('button', { name: 'Export CSV of this plot' })).toBeDisabled();
    });
});
