import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen, act } from '@testing-library/react';
import BondsInspector from '../../src/bonds_ui/BondsInspector';
import reducer, { selectBondsSystem, setScanPoint } from '../../src/store/bondsSlice';
import { bondsCaptions } from '../../src/bonds/captions';
import { h2plusOrbitals } from '../../src/bonds/mo_diagram';
import { orbitalEnergyText } from '../../src/format/energy';
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
    // Task 3 (picture control) replaces "has Plot and Data; Plot holds the plot given to it": the curve moved to the
    // left panel, under the R slider (BondsPanel's "Bond length" block), so the inspector keeps the numbers only --
    // one "Data" section, no tab row (spec §3: "the right panel's Plot and data keeps only the Data tab").
    it('has a single Data section, with no Plot tab and no tab row', () => {
        render(<BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} />);
        expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Data']);
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('HOMO 3σg');
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.queryByRole('tablist')).toBeNull();
        expect(screen.queryByRole('figure', { name: /potential energy curve/ })).toBeNull();
    });

    it('has no section at all below Explore (the Display line says where Data appears)', () => {
        render(<BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} showData={false} />);
        expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    });

    // Task 7a: the methods list and the near-tie caveat moved on again, to Info's "How this was computed" (bondsInfo,
    // tests/info/bonds_info.test.ts: every bondsCaptions string, typeset); the Data tab keeps the frontier values.
    it('keeps the frontier values in Data, and leaves the methods and near-tie caveats to Info', () => {
        const meta = { ...n2Meta, orbitals: n2Meta.orbitals.map(o => (o.label === '3σu*'
            ? { ...o, nearTie: { minaoWeight: 0.3484, runnerUpMinaoWeight: 0.316, runnerUpEnergyHartree: 0.2243 } } : o)) };
        render(
            <BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta }} />,
        );
        expect(screen.queryByRole('list', { name: 'methods' })).toBeNull();
        expect(screen.queryByText(/this orbital's shape mixes/)).toBeNull();
        bondsCaptions('n2', n2Scan).forEach(caption => expect(screen.queryByText(caption)).toBeNull());
    });

    // Task 7a (Task 6 ruling): the frontier energies read eV first, Ha in parentheses; the labels' g/u is a real
    // subscript, so the line's text is split around them.
    it('names the frontier orbital in Data', () => {
        const { container } = render(
            <BondsInspector variant="docked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} />,
        );
        const frontier = container.querySelector('.bonds-frontier')!;
        // Fix round 1 (I3, ruling R19): the values say they are Kohn–Sham eigenvalues, with that (i) beside them.
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(frontier).toHaveSeenText('Kohn–Sham orbital energies — HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · LUMO 1πg*: ε = −0.91 eV (−0.033 Ha)');
        expect([...frontier.querySelectorAll('sub')].map(sub => sub.textContent)).toEqual(['g', 'g']);
        expect(screen.getByRole('button', { name: 'About Kohn–Sham orbitals' })).toHaveClass('info-button');
    });

    // Task 7a fix round 1 (ruling I5): H₂⁺ keeps its Data tab, holding its two exact levels, eV first, typeset.
    it("gives H₂⁺ a Data section with its two exact levels", () => {
        const bonds = reducer(undefined, { type: '@@init' });
        const { container } = render(<BondsInspector variant="docked" bonds={bonds} data={empty} />);
        const levels = container.querySelector('.bonds-frontier')!;
        const [g, u] = h2plusOrbitals(bonds.R!);
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(levels).toHaveSeenText(`Exact levels — 1σg Eel = ${orbitalEnergyText(g.energyHartree)} · 1σu* Eel = ${orbitalEnergyText(u.energyHartree)}`);
        // At R = 2 a₀ (the reviewer's figures).
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(levels).toHaveSeenText('1σg Eel = −30.00 eV (−1.103 Ha) · 1σu* Eel = −18.16 eV (−0.668 Ha)');
        expect([...levels.querySelectorAll('sub')].map(sub => sub.textContent)).toEqual(['g', 'el', 'u', 'el']);
        expect(levels.textContent).not.toContain('_');
    });

    // Ruling T20b-display-header: the same foldable Display section heads
    // every mode's inspector, above its content section -- Bonds' is Data now (Task 3, picture control).
    it('heads the docked inspector with the Display section, above Data', () => {
        render(
            <BondsInspector variant="docked" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} />,
        );
        // Ruling R24-3: titled sections, Display above Data; Data opens by default, and opening Display folds it
        // (its header stays, below).
        const headers = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
        expect(headers).toEqual(['Display', 'Data']);
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('HOMO 3σg');
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        const display = screen.getByRole('region', { name: 'Display' });
        expect(display).toHaveTextContent('view settings');
        expect(screen.queryByRole('region', { name: 'Data' })).toBeNull();
        expect(display.compareDocumentPosition(screen.getByRole('button', { name: 'Data' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // Task 3 (picture control): the phone's sheet tab for this keeps its key 'plot' but reads "Data" (App.test); inside
    // it, the stacked inspector is Data alone, titled.
    it('stacks Data alone in the phone sheet, with no Display section (the View tab holds it there)', () => {
        const { container } = render(
            <BondsInspector variant="stacked" bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} />,
        );
        expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Data']);
        expect(container).toHaveTextContent('HOMO 3σg');
        expect(screen.queryByRole('region', { name: 'Plot' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Display' })).not.toBeInTheDocument();
    });

    // Task 3 (picture control): with the Plot tab gone the medium drawer's bar would fall back to a lone "View settings"
    // button; Bonds names Data as its bar's section instead, so one press still opens the drawer on the numbers.
    it('offers the drawer a one-press Data button that opens it on Data', () => {
        const onOpenChange = jest.fn();
        const { rerender } = render(
            <BondsInspector variant="drawer" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} open={false} onOpenChange={onOpenChange} />,
        );
        expect(screen.queryByRole('button', { name: 'View settings' })).toBeNull();
        const button = screen.getByRole('button', { name: 'Data panel' });
        expect(button).toHaveTextContent('Data');
        expect(button).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(button);
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        rerender(
            <BondsInspector variant="drawer" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} open onOpenChange={onOpenChange} />,
        );
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('HOMO 3σg');
        expect(screen.getByRole('button', { name: 'Data panel' })).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });

    // The bar's Data button opens on Data even when the reader had last left Display open in the drawer.
    it("opens the drawer on Data from its bar button, whatever section was left open", () => {
        const { rerender } = render(
            <BondsInspector variant="drawer" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} open onOpenChange={jest.fn()} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        expect(screen.getByRole('region', { name: 'Display' })).toBeInTheDocument();
        const onOpenChange = jest.fn();
        rerender(
            <BondsInspector variant="drawer" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} open={false} onOpenChange={onOpenChange} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
        rerender(
            <BondsInspector variant="drawer" display={<p>view settings</p>} bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} open onOpenChange={onOpenChange} />,
        );
        expect(screen.getByRole('region', { name: 'Data' })).toBeInTheDocument();
    });
});
