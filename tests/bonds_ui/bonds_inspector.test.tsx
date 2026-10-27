import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen, act } from '@testing-library/react';
import BondsInspector from '../../src/bonds_ui/BondsInspector';
import reducer, { selectBondsSystem, setScanPoint } from '../../src/store/bondsSlice';
import { bondsCaptions } from '../../src/bonds/captions';
import { MoleculeMeta, MoleculeScan } from '../../src/molecules/types';

const empty = { scan: null, meta: null, basis: null, loading: false, error: null };

const fixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/n2', file), 'utf8'));
/** The committed N₂ fixtures: the same ones bonds_panel.test.tsx and bonds_explore.test.tsx use. */
const n2Scan: MoleculeScan = fixture('scan.json');
const n2Meta: MoleculeMeta = fixture('meta.json');
const n2 = reducer(reducer(undefined, selectBondsSystem('n2')), setScanPoint({ system: 'n2', index: 7, RBohr: n2Scan.points[7].RBohr }));

describe('BondsInspector (spec §9.3, Phase 6G-2 Task 9)', () => {
    // Ruling R24-3 / fix round 1 (R24-M3): a test that opens a section stores it (eov.display); reset even if it fails.
    afterEach(() => { act(() => { window.localStorage.removeItem('eov.display'); }); });
    it('has Plot and Data; Plot holds the plot given to it, unchanged', () => {
        render(
            <BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} plot={<p>the curve</p>} />,
        );
        expect(screen.getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('the curve')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(screen.queryByText('the curve')).not.toBeInTheDocument();
    });

    // Task 7a: the methods list and the near-tie caveat moved on again, to Info's "How this was computed" (bondsInfo,
    // tests/info/bonds_info.test.ts: every bondsCaptions string, typeset); the Data tab keeps the frontier values.
    it('keeps the frontier values in the Data tab, and leaves the methods and near-tie caveats to Info', () => {
        const meta = { ...n2Meta, orbitals: n2Meta.orbitals.map(o => (o.label === '3σu*'
            ? { ...o, nearTie: { minaoWeight: 0.3484, runnerUpMinaoWeight: 0.316, runnerUpEnergyHartree: 0.2243 } } : o)) };
        render(
            <BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta }} plot={<p>the curve</p>} />,
        );
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(screen.queryByRole('list', { name: 'methods' })).toBeNull();
        expect(screen.queryByText(/this orbital's shape mixes/)).toBeNull();
        bondsCaptions('n2', n2Scan).forEach(caption => expect(screen.queryByText(caption)).toBeNull());
    });

    // Task 7a (Task 6 ruling): the frontier energies read eV first, Ha in parentheses; the labels' g/u is a real
    // subscript, so the line's text is split around them.
    it('names the frontier orbital in the Data tab', () => {
        const { container } = render(
            <BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} plot={<p>the curve</p>} />,
        );
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        const frontier = container.querySelector('.bonds-frontier')!;
        expect(frontier).toHaveTextContent('HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · LUMO 1πg*: ε = −0.91 eV (−0.033 Ha)');
        expect([...frontier.querySelectorAll('sub')].map(sub => sub.textContent)).toEqual(['g', 'g']);
    });

    // Task 7a: H₂⁺'s exact levels name no frontier orbital, so Data would be empty -- the section holds the plot alone.
    it('gives H₂⁺ the plot alone, with no Data tab', () => {
        render(<BondsInspector variant="docked" bonds={reducer(undefined, { type: '@@init' })} data={empty} plot={<p>the curve</p>} />);
        expect(screen.getByText('the curve')).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Data' })).toBeNull();
    });

    // Ruling T20b-display-header: the same foldable Display section heads
    // every mode's inspector, above Plot | Data.
    it('heads the docked inspector with the Display section, above Plot and Data', () => {
        render(
            <BondsInspector variant="docked" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} plot={<p>the curve</p>} />,
        );
        // Ruling R24-3: titled sections, Display above "Plot and data"; the plot's section opens by default,
        // and opening Display folds it (its header stays, below).
        const headers = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
        expect(headers).toEqual(['Display', 'Plot and data']);
        expect(screen.getByRole('region', { name: 'Plot and data' })).toContainElement(screen.getByRole('tab', { name: 'Plot' }));
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        const display = screen.getByRole('region', { name: 'Display' });
        expect(display).toHaveTextContent('view settings');
        expect(screen.queryByRole('tab', { name: 'Plot' })).toBeNull();
        expect(display.compareDocumentPosition(screen.getByRole('button', { name: 'Plot and data' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('stacks Plot and Data in the phone sheet, with no Display section (the View tab holds it there)', () => {
        render(
            <BondsInspector variant="stacked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} plot={<p>the curve</p>} />,
        );
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('the curve');
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('HOMO 3σg');
        expect(screen.queryByRole('region', { name: 'Display' })).not.toBeInTheDocument();
    });
});
