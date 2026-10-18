import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import AtomInspector from '../../src/atom_ui/AtomInspector';
import { plotTabsFor } from '../../src/atom/plot_tabs';
import { orbitalFacts } from '../../src/orbital_facts';

const tabs = plotTabsFor('orbital', true, false);
const facts = orbitalFacts({ n: 2, l: 1, ml: 0 }, { enclosedFraction: 0.9, isoLevel: null, energy: null, method: 'non-relativistic LDA' });

describe('AtomInspector (spec §8.6, §9.1)', () => {
    // Ruling R24-3 / fix round 1 (R24-M3): a test that opens a section stores it (eov.display); reset even if it fails.
    afterEach(() => { act(() => { window.localStorage.removeItem('eov.display'); }); });
    // Ruling T13-isostale: a pending value is seen as "…" and heard as "computing".
    it('speaks a fact\'s spoken value and hides its visible mark from readers', () => {
        const pending = orbitalFacts({ n: 2, l: 1, ml: 0 }, { enclosedFraction: 0.9, isoLevel: 1e-3, isoPending: true, energy: null, method: 'non-relativistic LDA' });
        render(<AtomInspector variant="stacked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()}
            plot={<p>plot</p>} facts={pending} csvReason={null} onExportCsv={jest.fn()} />);
        const card = screen.getByRole('region', { name: 'orbital facts' });
        expect(card).toHaveTextContent('Iso value…computing');
        expect(screen.getByText('…')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('computing')).toHaveClass('visually-hidden');
    });

    it('has Plot and Data; Plot holds the plot tabs, Data the facts and the CSV of the plot on screen', () => {
        const onPlotTab = jest.fn();
        const onExportCsv = jest.fn();
        render(<AtomInspector variant="docked" plotTabs={tabs} plotTab={tabs[2]} onPlotTab={onPlotTab}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={onExportCsv} />);
        // Ruling T13-tablabels: tabs show the curve symbol; the name is the words plus that symbol.
        expect(screen.getByRole('tab', { name: 'Radial distribution D(r)' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: 'Wave function R(r)' }));
        expect(onPlotTab).toHaveBeenCalledWith('wave');
        expect(screen.getByRole('tab', { name: 'Wave function R(r)' })).toHaveTextContent(/^R\(r\)$/);
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(screen.getByRole('region', { name: 'orbital facts' })).toHaveTextContent('2p_z orbital');
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
        expect(onExportCsv).toHaveBeenCalled();
    });

    // Ruling R20b-atoms: the Display settings head the inspector, above Plot | Data.
    it('heads the docked inspector with the Display section, above Plot and Data', () => {
        render(<AtomInspector variant="docked" display={<p>display settings</p>} plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()}
            plot={<p>plot</p>} facts={facts} csvReason={null} onExportCsv={jest.fn()} />);
        // Ruling R24-3: titled sections, Display above "Plot and data"; the plot's section opens by default,
        // and opening Display folds it (its header stays, below).
        const headers = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
        expect(headers).toEqual(['Display', 'Plot and data']);
        expect(screen.getByRole('region', { name: 'Plot and data' })).toContainElement(screen.getByRole('tab', { name: 'Plot' }));
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        const display = screen.getByRole('region', { name: 'Display' });
        expect(display).toHaveTextContent('display settings');
        expect(screen.queryByRole('tab', { name: 'Plot' })).toBeNull();
        expect(display.compareDocumentPosition(screen.getByRole('button', { name: 'Plot and data' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('stacks Plot and Data in the phone sheet', () => {
        render(<AtomInspector variant="stacked" plotTabs={tabs} plotTab={tabs[0]} onPlotTab={jest.fn()}
            plot={<p>plot</p>} facts={facts} csvReason="nothing drawn" onExportCsv={jest.fn()} />);
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot');
        expect(screen.getByRole('button', { name: 'Export CSV of this plot' })).toBeDisabled();
    });
});
