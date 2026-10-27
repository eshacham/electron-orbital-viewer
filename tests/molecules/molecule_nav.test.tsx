import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import MoleculeNav, { LIST_HIGHLIGHT_MS, revealScrollTop } from '../../src/components/MoleculeNav';
import type { MoleculeNavHandle } from '../../src/components/MoleculeNav';
import MoleculeOrbitalList from '../../src/components/MoleculeOrbitalList';
import MoleculeReadout from '../../src/components/MoleculeReadout';
import MoleculeViewOptions from '../../src/components/MoleculeViewOptions';
import {
    formatOrbitalEnergy, degeneracyCounts, formatPointGroup, orbitalGaps, orbitalTag, orbitalEnergyText, isConstructed, textbookLumo,
    labelsSentence, AXES_NOTE, GAP_CAVEAT, CONSTRUCTED_NOTE, LVMO_NOTE, UNCLASSIFIED_NOTE, UNLABELLED_NOTE, VALENCE_VIRTUAL_NOTE,
} from '../../src/molecules/orbital_display';
import { LIBRARY_INDEX, waterMeta, waterAtoms } from './fixtures';

const navProps = {
    entries: LIBRARY_INDEX, indexError: null, meta: waterMeta(), selectedId: 'h2o', isLoading: false,
    surface: { kind: 'density' } as const, onSelectMolecule: jest.fn(), onSurfaceChange: jest.fn(),
};

describe('orbital display', () => {
    it('formats energies in Ha with eV beside', () => {
        expect(formatOrbitalEnergy(-0.4913)).toBe('−0.491 Ha (−13.37 eV)');
    });
    it('counts degenerate sets', () => {
        const counts = degeneracyCounts([{ index: 2, energyHartree: -0.5 }, { index: 3, energyHartree: -0.50001 }, { index: 4, energyHartree: -0.5 + 1e-5 }, { index: 5, energyHartree: 0.1 }]);
        expect([counts.get(2), counts.get(5)]).toEqual([3, 1]);
    });
    // D34: PySCF writes Dooh/Coov (ASCII for infinity); the UI shows the
    // conventional D∞h/C∞v wherever a point group is displayed.
    it('maps PySCF\'s ASCII linear point groups to D∞h/C∞v', () => {
        expect(formatPointGroup('Dooh')).toBe('D∞h');
        expect(formatPointGroup('Coov')).toBe('C∞v');
        expect(formatPointGroup('C2v')).toBe('C2v');
    });
    // Ruling no-jargon: user-facing text never names an internal phase.
    it('never names an internal phase in the unclassified note', () => {
        expect(UNCLASSIFIED_NOTE).toBe('Virtual orbitals are not classified in this data (computed before the app '
            + 'classified empty (virtual) orbitals as valence or diffuse): the LUMO may be a diffuse, basis-dependent '
            + 'state rather than an antibonding orbital.');
        expect(UNCLASSIFIED_NOTE).not.toMatch(/Phase/);
    });
});

describe('MoleculeOrbitalList', () => {
    // Task 2: below Advanced the list keeps the frontier, HOMO−3…LUMO+3, the orbital drawn wherever it is, and one line.
    describe('below Advanced', () => {
        const ladder = Array.from({ length: 12 }, (_, i) => ({
            index: i, label: `o${i}`, energyHartree: -1.2 + 0.1 * i, occupation: i < 6 ? 2 : 0,
        })) as ReturnType<typeof waterMeta>['orbitals'];
        const labels = () => screen.getAllByRole('button').map(row => row.textContent?.match(/^o\d+/)?.[0]);

        it('lists LUMO+3 down to HOMO−3, and says where the rest are', () => {
            render(<MoleculeOrbitalList orbitals={ladder} selectedIndex={null} onSelect={() => {}} allOrbitals={false}
                method="B3LYP/def2-TZVPD" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
            expect(labels()).toEqual(['o9', 'o8', 'o7', 'o6', 'o5', 'o4', 'o3', 'o2']);
            expect(screen.getByText('Show all orbitals at Advanced')).toBeInTheDocument();
        });

        it('keeps the orbital drawn listed, even outside the window', () => {
            render(<MoleculeOrbitalList orbitals={ladder} selectedIndex={0} onSelect={() => {}} allOrbitals={false}
                method="B3LYP/def2-TZVPD" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
            expect(labels()).toEqual(['o9', 'o8', 'o7', 'o6', 'o5', 'o4', 'o3', 'o2', 'o0']);
        });

        it('says nothing when the window already holds every orbital', () => {
            // Four occupied and four virtual: exactly the window.
            render(<MoleculeOrbitalList orbitals={ladder.slice(2, 10)} selectedIndex={null} onSelect={() => {}} allOrbitals={false}
                method="B3LYP/def2-TZVPD" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
            expect(screen.queryByText('Show all orbitals at Advanced')).toBeNull();
        });
    });

    it('lists highest first, marks HOMO and LUMO, states the method and that energies are not ionisation energies', () => {
        const onSelect = jest.fn();
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={4} onSelect={onSelect}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        const rows = screen.getAllByRole('button');
        expect(rows[0]).toHaveTextContent('4a1');
        expect(rows[1]).toHaveTextContent('1b1');
        expect(rows[1]).toHaveTextContent('HOMO');
        expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
        expect(rows[0]).toHaveTextContent('LUMO');
        fireEvent.click(rows[2]);
        expect(onSelect).toHaveBeenCalledWith(3);
        expect(container.textContent).toMatch(/Kohn–Sham orbital energies, B3LYP\/def2-TZVP\. Not ionisation energies\./);
    });
    // Ruling T16-b: descending order stays (it reads like an MO diagram), so the gap between the last virtual and
    // the HOMO is marked. Owner R25-A4 moves its words -- the gap and the Kohn–Sham caveat -- below the list as its
    // caption (they sat between the rows, over the HOMO); a plain rule still marks where the occupied orbitals begin.
    it('marks the HOMO–LUMO gap with a rule between the virtuals and the occupied orbitals, and says it under the list (R25-A4)', () => {
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        // Fix round 1: a note, not a separator -- screen readers skip a separator's children, so the gap and its
        // caveat would go unannounced.
        const note = screen.getByRole('note');
        expect(note.textContent).toBe(`HOMO–LUMO gap 0.320 Ha (8.71 eV). ${GAP_CAVEAT}.`);
        expect(screen.queryByRole('separator')).toBeNull();
        const [lumo, homo] = screen.getAllByRole('button');
        const rule = container.querySelector('.molecule-orbital-gap-rule') as HTMLElement;
        expect(rule).toHaveAttribute('aria-hidden', 'true');
        expect(lumo.compareDocumentPosition(rule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(rule.compareDocumentPosition(homo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // The words follow every row, outside the part that scrolls.
        const rows = screen.getAllByRole('button');
        expect(rows[rows.length - 1].compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect((container.querySelector('.molecule-orbital-list') as HTMLElement).contains(note)).toBe(false);
    });
    // Final review M6: open-shell NO₂ (ROKS) has a singly occupied orbital
    // between the HOMO and the LUMO, so its divider spans SOMO -> LUMO.
    it('names the gap SOMO–LUMO when the highest occupied orbital is a SOMO', () => {
        const orbitals = [
            { index: 10, label: '1a2', energyHartree: -0.40, occupation: 2, role: 'HOMO' },
            { index: 11, label: '6a1', energyHartree: -0.30, occupation: 1, role: 'SOMO' },
            { index: 12, label: '2b1', energyHartree: -0.10, occupation: 0, role: 'LUMO' },
        ] as ReturnType<typeof waterMeta>['orbitals'];
        render(<MoleculeOrbitalList orbitals={orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVPD" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        expect(screen.getByRole('note').textContent).toBe(`SOMO–LUMO gap 0.200 Ha (5.44 eV). ${GAP_CAVEAT}.`);
        expect(screen.queryByText(/HOMO–LUMO gap/)).toBeNull();
    });
    // Ruling T16-b: the list opens scrolled so the HOMO is in view -- by
    // scrolling the list itself, so a desktop's right-hand column does not
    // jump to it as scrollIntoView would.
    it('opens scrolled so the HOMO is centred in the list', () => {
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
            if (this.classList.contains('molecule-orbital-list')) return at(100, 200);
            // (R25-A4: the gap note is under the list now, so nothing over the HOMO is placed here any more.)
            if (this.textContent?.includes('HOMO') && this.tagName === 'BUTTON') return at(520, 30);
            return at(0, 0);
        });
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVP" symmetry={{ pointGroup: 'C2v', labelGroup: 'C2v' }} />);
        // The row's top sits 420 px below the list's; centring a 30 px row in 200 px leaves 85 px above it.
        expect((container.querySelector('.molecule-orbital-list') as HTMLElement).scrollTop).toBe(335);
        rects.mockRestore();
    });
    // D34: the linear-molecule caption names D∞h/C∞v, never PySCF's raw Dooh/Coov.
    it('shows the conventional symbol for a linear molecule\'s point group (D34)', () => {
        const { container } = render(<MoleculeOrbitalList orbitals={waterMeta().orbitals} selectedIndex={null} onSelect={() => {}}
            method="B3LYP/def2-TZVPD" symmetry={{ pointGroup: 'Dooh', labelGroup: 'Coov' }} />);
        expect(container.textContent).toMatch(/D∞h/);
        expect(container.textContent).toMatch(/C∞v/);
        expect(container.textContent).not.toMatch(/Dooh/);
        expect(container.textContent).not.toMatch(/Coov/);
    });
});

describe('MoleculeNav', () => {
    it('opens the picker from the phone header', () => {
        const onOpenPicker = jest.fn();
        render(<MoleculeNav {...navProps} variant="header" onOpenPicker={onOpenPicker} />);
        fireEvent.click(screen.getByRole('button', { name: 'Change molecule, currently Water' }));
        expect(onOpenPicker).toHaveBeenCalled();
    });
    // Task 12 (ruling P1) replaces "shows the picker until a molecule is chosen, then folds it (desktop)": the
    // desktop's name, formula and picker moved to the Explore header tile (MoleculeHeader, its "Change ▾"
    // popover -- tests/molecule_ui/molecule_header.test.tsx); a phone's Explore tab keeps the inline list.
    it('leaves the name and the picker to the header tile on a desktop; a phone\'s Explore tab keeps the inline list', () => {
        const onSelectMolecule = jest.fn();
        const { container, rerender } = render(<MoleculeNav {...navProps} onSelectMolecule={onSelectMolecule} />);
        expect(container.querySelector('.molecule-nav-title')).toBeNull();
        expect(screen.queryByRole('list', { name: 'molecules' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Change molecule/ })).toBeNull();
        rerender(<MoleculeNav {...navProps} variant="body" onSelectMolecule={onSelectMolecule} />);
        expect(container.querySelector('.molecule-nav-title')).toBeNull();
        fireEvent.click(within(screen.getByRole('list', { name: 'molecules' })).getByRole('button', { name: /Ammonia/ }));
        expect(onSelectMolecule).toHaveBeenCalledWith('nh3');
    });
    it('switches surfaces; Orbitals opens at the HOMO', () => {
        const onSurfaceChange = jest.fn();
        render(<MoleculeNav {...navProps} onSurfaceChange={onSurfaceChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Electrostatic potential' }));
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'esp' });
        fireEvent.click(screen.getByRole('button', { name: 'Orbitals' }));
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'mo', index: 4 });
    });
    // Owner R25-A4: "not clear what none is" -- the switch has a visible "Surface" label above it, which names the
    // group, and its fourth choice reads "No surface" (visible text and name alike; the link's show=none is unchanged).
    it('labels the switch "Surface" above it, and its fourth choice "No surface" (R25-A4)', () => {
        const onSurfaceChange = jest.fn();
        const { container } = render(<MoleculeNav {...navProps} onSurfaceChange={onSurfaceChange} />);
        const group = screen.getByRole('group', { name: 'Surface' });
        const label = container.querySelector(`#${group.getAttribute('aria-labelledby')}`) as HTMLElement;
        expect(label).toHaveTextContent(/^Surface$/);
        expect(label.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual(['Density', 'Electrostatic potential', 'Orbitals', 'No surface']);
        const none = within(group).getByRole('button', { name: 'No surface' });
        expect(none).not.toHaveAttribute('aria-label');
        fireEvent.click(none);
        expect(onSurfaceChange).toHaveBeenLastCalledWith({ kind: 'none' });
        expect(screen.queryByText(/^None$/)).toBeNull();
    });
    // Ruling R23f (replacing T16-a): the list sits beside the switch on
    // every variant now -- a desktop's docked Explore panel ('full') and a
    // phone's Explore tab ('body') alike -- so there is nothing left for
    // 'full' to say instead of it (the old "Showing <orbital> -- pick
    // another in the orbital list on the right" summary is retired: the
    // list itself, right here, already names what is drawn via its own
    // `.selected` row and `aria-pressed`).
    it('shows the orbital list beside the switch on every variant', () => {
        const { container, rerender } = render(<MoleculeNav {...navProps} surface={{ kind: 'mo', index: 4 }} />);
        const list = () => container.querySelector('.molecule-orbital-list');
        expect(list()).not.toBeNull();
        expect(within(list() as HTMLElement).getByRole('button', { name: /1b1/ })).toHaveAttribute('aria-pressed', 'true');
        rerender(<MoleculeNav {...navProps} variant="body" surface={{ kind: 'mo', index: 4 }} />);
        expect(list()).not.toBeNull();
    });
    // R25-A4 live check: with "No surface" and the reserved scrollbar gutter, the switch's four labels needed 282 px
    // at body size in a docked Explore column of 266 (desktop) / 251 (tablet) -- the last segment was clipped. At
    // caption size with 4 px side padding they need 241 (measured, /tmp/r25a-measure.mjs). jsdom has no layout, so
    // the rule's own source is pinned; the phone sheet (356 px) keeps its own size.
    it('fits the switch in the docked Explore column: caption-size labels, 4 px side padding (R25-A4)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        const start = css.indexOf('.explore-panel .molecule-surface-toggle .MuiToggleButton-root {');
        expect(start).toBeGreaterThanOrEqual(0);
        const rule = css.slice(start, css.indexOf('}', start));
        expect(rule).toMatch(/padding-left: 4px/);
        expect(rule).toMatch(/padding-right: 4px/);
        expect(rule).toMatch(/font-size: var\(--ql-type-caption-size\)/);
    });
    // Owner R25-A2: the strip's "Orbital list" tile asks the card to reveal its list -- scroll it into view in the
    // panel that holds it, focus the drawn row, and highlight the list for about a second.
    it('reveals the list: scrolls only as far as needed, focuses the drawn row, highlights it briefly (R25-A2)', () => {
        jest.useFakeTimers();
        try {
            const ref = React.createRef<MoleculeNavHandle>();
            const { container } = render(
                <div className="molecule-explore-scroll"><MoleculeNav {...navProps} surface={{ kind: 'mo', index: 3 }} ref={ref} /></div>,
            );
            const list = container.querySelector('.molecule-orbital-list') as HTMLElement;
            expect(list).not.toHaveClass('highlight');
            act(() => { ref.current!.revealOrbitalList(); });
            expect(document.activeElement).toBe(within(list).getByRole('button', { name: /3a1/ }));
            expect(list).toHaveClass('highlight');
            act(() => { jest.advanceTimersByTime(LIST_HIGHLIGHT_MS - 1); });
            expect(list).toHaveClass('highlight');
            act(() => { jest.advanceTimersByTime(1); });
            expect(list).not.toHaveClass('highlight');
        } finally {
            jest.useRealTimers();
        }
    });
    it('waits a render for a list that is not on screen yet, and drops the wish if it never comes (R25-A2)', () => {
        const ref = React.createRef<MoleculeNavHandle>();
        const { container, rerender } = render(<MoleculeNav {...navProps} ref={ref} />);
        // The surface switched to Orbitals in the same event: the list is there one render later.
        act(() => { ref.current!.revealOrbitalList(); });
        expect(container.querySelector('.molecule-orbital-list')).toBeNull();
        rerender(<MoleculeNav {...navProps} surface={{ kind: 'mo', index: 4 }} ref={ref} />);
        const list = container.querySelector('.molecule-orbital-list') as HTMLElement;
        expect(document.activeElement).toBe(within(list).getByRole('button', { name: /1b1/ }));
        expect(list).toHaveClass('highlight');
        // A wish the next render cannot meet is dropped, never kept to steal focus later.
        const { container: other, rerender: rerenderOther } = render(<MoleculeNav {...navProps} ref={ref} />);
        act(() => { ref.current!.revealOrbitalList(); });
        rerenderOther(<MoleculeNav {...navProps} surface={{ kind: 'esp' }} ref={ref} />);
        (document.activeElement as HTMLElement).blur();
        rerenderOther(<MoleculeNav {...navProps} surface={{ kind: 'mo', index: 4 }} ref={ref} />);
        expect(other.querySelector('.molecule-orbital-list')).not.toHaveClass('highlight');
        expect(document.activeElement).toBe(document.body);
    });
    // R25-A-I1 (review): a list in the DOM but not displayed (a folded tablet Explore, full screen) is a list not
    // there yet -- the one-render wait covers its unfolding, and nothing is focused or highlighted unseen.
    it('treats a list that is not displayed as missing, and reveals it once it shows (R25-A-I1)', () => {
        const ref = React.createRef<MoleculeNavHandle>();
        const tree = (hidden: boolean) => <div hidden={hidden}><MoleculeNav {...navProps} surface={{ kind: 'mo', index: 4 }} ref={ref} /></div>;
        const { container, rerender } = render(tree(true));
        const list = container.querySelector('.molecule-orbital-list') as HTMLElement;
        act(() => { ref.current!.revealOrbitalList(); });
        expect(list).not.toHaveClass('highlight');
        expect(document.activeElement).toBe(document.body);
        rerender(tree(false));
        expect(document.activeElement).toBe(within(list).getByRole('button', { name: /1b1/ }));
        expect(list).toHaveClass('highlight');
    });
    // R25-A-M1 (review): a second press within the second replays the fade -- the class alternates with a replay
    // class whose animation has another name (the same name would not restart), and the second runs a full second.
    it('replays the highlight on a second press within the second (R25-A-M1)', () => {
        jest.useFakeTimers();
        try {
            const ref = React.createRef<MoleculeNavHandle>();
            const { container } = render(<MoleculeNav {...navProps} surface={{ kind: 'mo', index: 4 }} ref={ref} />);
            const list = container.querySelector('.molecule-orbital-list') as HTMLElement;
            act(() => { ref.current!.revealOrbitalList(); });
            expect(list).toHaveClass('highlight');
            expect(list).not.toHaveClass('highlight-replay');
            act(() => { jest.advanceTimersByTime(600); });
            act(() => { ref.current!.revealOrbitalList(); });
            expect(list).toHaveClass('highlight');
            expect(list).toHaveClass('highlight-replay');
            act(() => { jest.advanceTimersByTime(LIST_HIGHLIGHT_MS - 1); });
            expect(list).toHaveClass('highlight');
            act(() => { jest.advanceTimersByTime(1); });
            expect(list).not.toHaveClass('highlight');
            act(() => { ref.current!.revealOrbitalList(); });
            expect(list).not.toHaveClass('highlight-replay');
        } finally {
            jest.useRealTimers();
        }
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        expect(css).toMatch(/\.molecule-orbital-list\.highlight \{ animation: ql-list-highlight /);
        expect(css).toMatch(/\.molecule-orbital-list\.highlight\.highlight-replay \{ animation-name: ql-list-highlight-replay; \}/);
        expect(css).toMatch(/@keyframes ql-list-highlight-replay/);
    });
    // R25-A-M4 (review): the label sits 4 px over the switch through a field wrapper's own gap, not a negative margin.
    it('spaces the "Surface" label from the switch with its own field gap, no negative margin (R25-A-M4)', () => {
        const { container } = render(<MoleculeNav {...navProps} />);
        const field = container.querySelector('.molecule-surface-field') as HTMLElement;
        expect(field).not.toBeNull();
        expect(within(field).getByText('Surface')).toBeInTheDocument();
        expect(within(field).getByRole('group', { name: 'Surface' })).toBeInTheDocument();
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        const start = css.indexOf('.molecule-surface-field {');
        expect(start).toBeGreaterThanOrEqual(0);
        expect(css.slice(start, css.indexOf('}', start))).toMatch(/gap: 4px/);
        expect(css).not.toMatch(/\.molecule-surface-label \{[^}]*margin-bottom: -/);
    });
    it('scrolls a panel only as far as it must to show an element, 8 px in from its edge (R25-A2)', () => {
        const box = (top: number, height: number) => ({ getBoundingClientRect: () => ({ top, bottom: top + height, height }) }) as unknown as HTMLElement;
        const panel = (scrollTop: number) => ({ ...box(100, 400), scrollTop }) as unknown as HTMLElement;
        // Already in view: no scroll.
        expect(revealScrollTop(panel(50), box(200, 100))).toBe(50);
        // Below: down until its bottom clears (1000 − 500 + 8), never so far its top leaves.
        expect(revealScrollTop(panel(0), box(700, 300))).toBe(508);
        expect(revealScrollTop(panel(0), box(150, 600))).toBe(42);
        // Above: up until its top shows, 8 px in; never below zero.
        expect(revealScrollTop(panel(300), box(20, 100))).toBe(212);
        expect(revealScrollTop(panel(10), box(20, 100))).toBe(0);
    });
    it('states where the geometry and the density come from', () => {
        const { container } = render(<MoleculeNav {...navProps} />);
        expect(container.textContent).toMatch(/Geometry: experiment \(CCCBDB\)/);
        expect(container.textContent).toMatch(/Density, potential and orbitals: B3LYP\/def2-TZVP \(PySCF\)/);
    });
});

// Phase 6D: what library v3 and compute-version-2 jobs write. Water at def2-TZVPD: its LUMO partly diffuse, a
// second virtual diffuse at positive energy, and its LVMO constructed from the valence part of the virtual space
// (orbitals.py appends it as one more row). The row's `note` is the generator's older wording on purpose: the list
// renders from the flags, never from `note` verbatim.
type Orbitals = ReturnType<typeof waterMeta>['orbitals'];
const WATER_V3 = [
    { index: 0, label: '1a1', energyHartree: -19.13, occupation: 2 },
    { index: 1, label: '2a1', energyHartree: -1.00, occupation: 2 },
    { index: 2, label: '1b2', energyHartree: -0.53, occupation: 2 },
    { index: 3, label: '3a1', energyHartree: -0.38, occupation: 2 },
    { index: 4, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
    { index: 5, label: '4a1', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.55, class: 'diffuse' },
    { index: 6, label: '2b2', energyHartree: 0.05, occupation: 0, valenceCharacter: 0.27, class: 'diffuse' },
    { index: 7, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', valenceCharacter: 1, class: 'valence',
        kind: 'valence-virtual', constructed: true, energyApproximate: true,
        note: 'constructed from the valence part of the virtual space — not an orbital of this calculation; energy approximate (≈)' },
] as Orbitals;
// A molecule whose LVMO is one of the calculation's own orbitals (CO2's 2πu at def2-TZVPD is 97 % valence).
const COMPUTED_LVMO = [
    { index: 0, label: '1πg', energyHartree: -0.30, occupation: 2, role: 'HOMO' },
    { index: 1, label: '5σg', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.4, class: 'diffuse' },
    { index: 2, label: '2πu', energyHartree: 0.20, occupation: 0, role: 'LVMO', valenceCharacter: 0.97, class: 'valence' },
] as Orbitals;
const V3_SYMMETRY = { pointGroup: 'C2v', labelGroup: 'C2v', labels: 'full-group' as const };
const list = (orbitals: Orbitals = WATER_V3, symmetry: Parameters<typeof labelsSentence>[0] = V3_SYMMETRY) => render(
    <MoleculeOrbitalList orbitals={orbitals} selectedIndex={null} onSelect={() => {}} method="B3LYP-D3(BJ)/def2-TZVPD" symmetry={symmetry} />);

describe('Phase 6D: honest virtuals, the gaps, full-group labels', () => {
    it('marks the diffuse virtuals and says "unbound" only of one at positive energy (Ruling D4)', () => {
        const { container } = list();
        const lumo = screen.getByRole('button', { name: /4a1/ });
        expect(within(lumo).getByRole('img', { name: 'partly diffuse (55 % valence): its shape depends on the basis' })).toHaveTextContent('◌');
        expect(lumo.textContent).not.toMatch(/unbound/);
        const second = screen.getByRole('button', { name: /2b2/ });
        expect(within(second).getByRole('img', {
            name: 'partly diffuse (27 % valence): its shape depends on the basis; positive energy: an unbound state, not a bound orbital' }))
            .toHaveTextContent('◌');
        expect(container.textContent).toContain('◌ partly diffuse virtual (under 75 % valence): its shape depends on the basis.');
        expect(container.textContent).toContain('Those at positive energy are unbound, basis-set dependent states, not bound orbitals.');
    });
    it('makes no "unbound" claim when no diffuse virtual lies above zero', () => {
        const { container } = list(WATER_V3.filter(o => o.index !== 6));
        expect(container.textContent).toContain('◌ partly diffuse virtual');
        expect(container.textContent).not.toMatch(/unbound/);
    });
    it('shows a constructed LVMO\'s energy as an upper estimate, never ≈, and says what it is (Ruling D4-energy)', () => {
        const { container } = list();
        const lvmo = screen.getByRole('button', { name: /LVMO/ });
        expect(lvmo).toHaveTextContent('0.190 Ha (5.17 eV)');
        // Fix round 1: the row shows the short "upper est." (the legend explains it); the accessible name has it in full.
        expect(within(lvmo).getByText('upper est.')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByRole('button', { name: /0\.190 Ha \(5\.17 eV\) upper estimate LVMO/ })).toBe(lvmo);
        expect(within(lvmo).getByRole('img', { name: 'constructed: not an orbital of this calculation' })).toHaveTextContent('◇');
        // Task 16d item 6 (T15-M3): the row's own name says it is constructed, as the strip tile's does.
        expect(lvmo).toHaveAccessibleName(expect.stringContaining('constructed: not an orbital of this calculation'));
        expect(container.textContent).not.toContain('≈');
        expect(container.textContent).toContain(`◇ LVMO ${CONSTRUCTED_NOTE}.`);
        // Ruling LVMO-wording: not every LVMO is antibonding (BF3's is boron's empty 2p).
        expect(container.textContent).toContain(
            "LVMO: the lowest empty valence orbital — the one textbooks draw (antibonding, or an empty valence orbital such as boron's 2p in BF3).");
        expect(container.textContent).not.toMatch(/antibonding orbital textbooks draw/);
        expect(container.textContent).toContain('Labels: irreducible representations of C2v, numbered in energy order within each, core included.');
    });
    it('gives only the Kohn–Sham HOMO–LUMO gap, with its caveat, when the LVMO is constructed', () => {
        const { container } = list();
        expect(screen.getByRole('note').textContent).toBe(`HOMO–LUMO gap 0.300 Ha (8.16 eV). ${GAP_CAVEAT}.`);
        expect(container.textContent).not.toMatch(/HOMO–LVMO/);
    });
    it('gives both gaps, labelled, when the LVMO is one of the calculation\'s own orbitals', () => {
        const { container } = list(COMPUTED_LVMO, { pointGroup: 'Dooh', labelGroup: 'Dooh', labels: 'full-group' });
        expect(screen.getByRole('note').textContent).toBe(
            `HOMO–LUMO gap 0.290 Ha (7.89 eV) · HOMO–LVMO gap 0.500 Ha (13.61 eV). ${GAP_CAVEAT}.`);
        const lvmo = screen.getByRole('button', { name: /LVMO/ });
        expect(lvmo).not.toHaveTextContent(/upper est/);
        expect(within(lvmo).queryByRole('img')).toBeNull();
        expect(container.textContent).not.toContain('◇');
        expect(container.textContent).toContain('Labels: irreducible representations of D∞h, numbered in energy order within each, core included.');
    });
    it('renders v2-shaped orbitals as before, and says their virtuals are unclassified (Review Focus 5)', () => {
        const { container } = list(waterMeta().orbitals, { pointGroup: 'C2v', labelGroup: 'C2v' });
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.queryByText('LVMO')).toBeNull();
        expect(container.textContent).not.toMatch(/upper estimate|unbound|◌|◇/);
        expect(container.textContent).toContain(UNCLASSIFIED_NOTE);
        expect(container.textContent).toContain('Labels: irreducible representations of C2v.');
    });
    it('names a subgroup fallback, an unlabelled set, a geometry-labelled set and an unlabelled molecule in the caption', () => {
        const orbitals = [{ index: 0, label: '?', energyHartree: -0.5, occupation: 2, role: 'HOMO',
            labelNote: 'characters (2.00, -1.00) match no single irrep of Td: an accidental degeneracy or numerical noise, so left unlabelled' }] as Orbitals;
        const { container, unmount } = list(orbitals, { pointGroup: 'D2d', labelGroup: 'D2', labels: 'subgroup',
            labelNote: 'irreducible representations of D2, a subgroup of D2d: full-group labels are not available for D2d' });
        expect(container.textContent).toContain('Labels: irreducible representations of D2, a subgroup of D2d: full-group labels are not available for D2d.');
        expect(container.textContent).toContain('?: characters (2.00, -1.00) match no single irrep of Td');
        unmount();
        expect(labelsSentence({ pointGroup: 'C2v', labelGroup: 'C2v', labels: 'full-group',
            labelNote: 'the SCF ran without point-group symmetry: labelled from the geometry\'s own point group, by character projection' }))
            .toBe('Labels: irreducible representations of C2v, numbered in energy order within each, core included; '
                + 'the SCF ran without point-group symmetry: labelled from the geometry\'s own point group, by character projection. '
                + AXES_NOTE);
        expect(labelsSentence({ pointGroup: 'SO3', labelGroup: null, labels: 'none', labelNote: 'the SCF ran without point-group symmetry' }))
            .toBe('Labels: ψ, numbered in energy order (no symmetry labels: the SCF ran without point-group symmetry).');
    });
    // Final review M1: an atom's labels are 1s, 2s, 2p … by principal quantum number, not SO3's irreps.
    it('says an atom is labelled by principal quantum number', () => {
        expect(labelsSentence({ pointGroup: 'SO3', labelGroup: 'SO3', labels: 'full-group' }))
            .toBe('Labels: atomic orbitals (1s, 2s, 2p, 3d …), numbered by principal quantum number, core included.');
    });
    // Final review M4: B labels in C2v, D2 and D2h depend on which axes are called x, y and z (ethylene's π HOMO is
    // 1b2u in PySCF's frame, 1b3u in Mulliken's); the sentence says whose axes these are. Other groups do not.
    it('states the axis convention where the B labels depend on it', () => {
        expect(AXES_NOTE).toBe("The b labels depend on which axes are called x, y and z: these follow the calculation's (PySCF's) "
            + 'axes, which a textbook may assign differently (ethylene\'s π HOMO reads 1b2u in the library, 1b3u in Mulliken\'s convention).');
        for (const group of ['C2v', 'D2h']) {
            expect(labelsSentence({ pointGroup: group, labelGroup: group, labels: 'full-group' })).toMatch(new RegExp(`core included\\. ${AXES_NOTE.slice(0, 20)}`));
        }
        expect(labelsSentence({ pointGroup: 'D2d', labelGroup: 'D2', labels: 'subgroup', labelNote: 'irreducible representations of D2, a subgroup of D2d' }))
            .toBe(`Labels: irreducible representations of D2, a subgroup of D2d. ${AXES_NOTE}`);
        for (const group of ['Td', 'C3v', 'Dooh', 'Cs', 'C2h']) {
            expect(labelsSentence({ pointGroup: group, labelGroup: group, labels: 'full-group' })).not.toContain(AXES_NOTE);
        }
    });
    it('tags orbitals, reads the flags rather than the note, finds the gaps and the textbook LUMO', () => {
        expect(orbitalTag(WATER_V3[5])).toBe('partly diffuse (55 % valence): its shape depends on the basis');
        expect(orbitalTag(WATER_V3[7])).toBe(VALENCE_VIRTUAL_NOTE);
        expect(orbitalTag(COMPUTED_LVMO[2])).toBe(LVMO_NOTE);
        expect(LVMO_NOTE).toBe("the lowest empty valence orbital — the one textbooks draw (antibonding, or an empty valence orbital such as boron's 2p in BF3)");
        expect(orbitalTag(WATER_V3[4])).toBeNull();
        expect(orbitalTag(waterMeta().orbitals[5])).toBeNull();          // v2: no class, no claim
        expect(isConstructed({ kind: 'valence-virtual' })).toBe(true);
        expect(isConstructed({ constructed: true })).toBe(true);
        expect(isConstructed({})).toBe(false);
        expect(orbitalEnergyText(WATER_V3[7])).toBe('0.190 Ha (5.17 eV), upper estimate');
        expect(orbitalEnergyText({ energyHartree: 0.19, energyApproximate: true })).toBe('0.190 Ha (5.17 eV), upper estimate');
        expect(orbitalEnergyText(WATER_V3[5])).toBe('−0.010 Ha (−0.27 eV)');
        expect(orbitalGaps(WATER_V3).map(g => g.name)).toEqual(['HOMO–LUMO']);
        expect(orbitalGaps(COMPUTED_LVMO).map(g => [g.name, g.hartree.toFixed(3)])).toEqual([['HOMO–LUMO', '0.290'], ['HOMO–LVMO', '0.500']]);
        expect(orbitalGaps(waterMeta().orbitals).map(g => g.name)).toEqual(['HOMO–LUMO']);
        expect(textbookLumo(COMPUTED_LVMO)?.orbital.index).toBe(2);
        expect(textbookLumo(COMPUTED_LVMO)?.note).toBe(
            `the LVMO, ${LVMO_NOTE}: the LUMO itself is partly diffuse (40 % valence): its shape depends on the basis`);
        expect(textbookLumo(WATER_V3)?.orbital.index).toBe(7);
        expect(textbookLumo(WATER_V3)?.note?.startsWith(`the LVMO, ${LVMO_NOTE}, constructed from the valence part`)).toBe(true);
        expect(textbookLumo(waterMeta().orbitals)).toEqual({ orbital: waterMeta().orbitals[5], note: null });
    });
    // Ruling R23f retires the "Showing <orbital> -- pick another in the
    // orbital list on the right" summary this test used to check (MoleculeNav
    // no longer says anything extra about the drawn orbital: the list beside
    // the switch, tested directly in "MoleculeOrbitalList" and "Phase 6D"
    // above, already carries its label, role chip, marks and energy). What
    // MoleculeNav must still get right is wiring `surface.index` through as
    // the list's `selectedIndex` across a rerender.
    it('passes the drawn orbital through to the list as it changes', () => {
        const meta = waterMeta({ orbitals: [...WATER_V3, { ...COMPUTED_LVMO[2], index: 8 }], symmetry: V3_SYMMETRY });
        const { container, rerender } = render(<MoleculeNav {...navProps} meta={meta} surface={{ kind: 'mo', index: 5 }} />);
        const selected = () => (container.querySelector('.molecule-orbital-row.selected') as HTMLElement).textContent;
        expect(selected()).toContain('4a1');
        rerender(<MoleculeNav {...navProps} meta={meta} surface={{ kind: 'mo', index: 7 }} />);
        expect(selected()).toContain('a1');
        expect(selected()).toContain('upper est.');
        rerender(<MoleculeNav {...navProps} meta={meta} surface={{ kind: 'mo', index: 8 }} />);
        expect(selected()).toContain('2πu');
    });
    // Fix round 1 (review Important): every distinct label note, under its own label -- a combined label such as
    // BF3's 1a1′+1e′ carries one too, and a "?" with no note still gets a sentence.
    it('lists each label note under its own label, once per degenerate set', () => {
        const combined = 'near-degenerate combinations of a1′ and e′ (ΔE < 1e-5 Ha), mixed in these orbitals';
        const unknown = 'characters (2.00, -1.00) match no single irrep of D3h, so left unlabelled';
        const bf3 = [
            ...[0, 1, 2].map(index => ({ index, label: '1a1′+1e′', energyHartree: -24.7, occupation: 2, labelNote: combined })),
            { index: 3, label: '2a1′', energyHartree: -7.0, occupation: 2 },
            { index: 4, label: '1a2″', energyHartree: -0.33, occupation: 2, role: 'HOMO' },
            { index: 5, label: '2a2″', energyHartree: -0.05, occupation: 0, role: 'LUMO', valenceCharacter: 0.9, class: 'valence' },
        ] as Orbitals;
        const { container, unmount } = list(bf3, { pointGroup: 'D3h', labelGroup: 'D3h', labels: 'full-group' });
        expect(container.textContent).toContain(`1a1′+1e′: ${combined}.`);
        expect(container.textContent!.split(combined).length - 1).toBe(1);
        expect(container.textContent).not.toContain('?:');
        unmount();
        const both = [...bf3, ...[6, 7].map(index => ({ index, label: '?', energyHartree: 0.3, occupation: 0, labelNote: unknown }))] as Orbitals;
        const second = list(both, { pointGroup: 'D3h', labelGroup: 'D3h', labels: 'full-group' });
        expect(second.container.textContent).toContain(`1a1′+1e′: ${combined}.`);
        expect(second.container.textContent).toContain(`?: ${unknown}.`);
        second.unmount();
        const silent = [...bf3.slice(3), { index: 6, label: '?', energyHartree: 0.3, occupation: 0, role: 'LVMO', kind: 'valence-virtual',
            constructed: true, valenceCharacter: 1, class: 'valence' }] as Orbitals;
        const third = list(silent, { pointGroup: 'D3h', labelGroup: 'D3h', labels: 'full-group' });
        expect(third.container.textContent).toContain(`?: ${UNLABELLED_NOTE}.`);
    });
    // Fix round 1 keyed the marks at the top of the list, held there as it scrolled. Owner R25-A4: the list comes
    // first; the key is part of its caption under the last row, beside the gap note it now sits with.
    it('keys the marks under the list, after every row (R25-A4)', () => {
        const { container } = list();
        const key = container.querySelector('.molecule-orbital-legend')!;
        expect(key.textContent).toBe('◌ partly diffuse virtual (under 75 % valence) · '
            + '◇ constructed LVMO, not an orbital of this calculation · upper est.: its energy is an upper estimate');
        const rows = screen.getAllByRole('button');
        expect(rows[rows.length - 1].compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect((container.querySelector('.molecule-orbital-list') as HTMLElement).contains(key)).toBe(false);
        const { container: legacy } = list(waterMeta().orbitals, { pointGroup: 'C2v', labelGroup: 'C2v' });
        expect(legacy.querySelector('.molecule-orbital-legend')).toBeNull();
    });
    // 6G-2 Task 17 fix (Fail 2) kept the gap note clear of the sticky key with an opening scroll of its own. Owner
    // R25-A4 moved both under the list, so that rule is gone (the list opens with the HOMO centred, above) and this
    // pins what made it unnecessary: the part that scrolls holds the rows and the plain gap rule only, and none of the
    // list's rules is sticky -- nothing can lie over a row.
    it('lets nothing cover a row: the scrolling part holds only rows and the gap rule, and nothing in it is sticky (R25-A4)', () => {
        const { container } = list();
        const scrolling = container.querySelector('.molecule-orbital-list') as HTMLElement;
        for (const child of Array.from(scrolling.children)) {
            expect(child.classList.contains('molecule-orbital-row') || child.classList.contains('molecule-orbital-gap-rule')).toBe(true);
        }
        const notes = container.querySelector('.molecule-orbital-notes') as HTMLElement;
        expect(scrolling.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(notes.querySelector('.molecule-orbital-legend')).not.toBeNull();
        expect(within(notes).getByRole('note')).toBeInTheDocument();
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        const rules = css.match(/^\.molecule-orbital[^{]*\{[^}]*\}/gm) ?? [];
        expect(rules.length).toBeGreaterThan(5);
        for (const rule of rules) expect(rule).not.toMatch(/position:\s*sticky/);
    });
    // Fix round 1: at the card's 300 px a row with ×3, the LVMO chip and the estimate (silane's constructed t2) overflowed.
    // jsdom has no layout, so this pins the rules that let it fit: the energy column may shrink below its content and
    // wraps between the Ha and eV parts, and the short estimate takes its own line. (A live check at 300 px is the proof.)
    it('lets a crowded row wrap rather than overflow the 300 px card', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        const rule = (selector: string) => {
            const start = css.search(new RegExp(`^${selector.replace(/[.]/g, '\\.')} \\{`, 'm'));
            return css.slice(start, css.indexOf('}', start));
        };
        expect(rule('.molecule-orbital-row')).toMatch(/grid-template-columns: [^;]*minmax\(0, 1fr\)/);
        expect(rule('.molecule-orbital-energy-part')).toMatch(/white-space: nowrap/);
        expect(rule('.molecule-orbital-estimate')).toMatch(/display: block/);
        const silane = [
            { index: 0, label: '1t2', energyHartree: -0.34, occupation: 2, role: 'HOMO' },
            ...[1, 2, 3].map(index => ({ index, label: 't2', energyHartree: 0.163, occupation: 0, role: 'LVMO', valenceCharacter: 0.93,
                class: 'valence', kind: 'valence-virtual', constructed: true, energyApproximate: true })),
        ] as Orbitals;
        list(silane, { pointGroup: 'Td', labelGroup: 'Td', labels: 'full-group' });
        const row = screen.getAllByRole('button', { name: /LVMO/ })[0];
        const parts = row.querySelectorAll('.molecule-orbital-energy-part');
        expect([...parts].map(p => p.textContent)).toEqual(['0.163 Ha', '(4.44 eV)']);
        expect(row).toHaveTextContent('×3');
    });
});

describe('readout and view options', () => {
    it('reads out a pick, or says how to get one', () => {
        const { rerender, container } = render(<MoleculeReadout atoms={waterAtoms()} pick={{ kind: 'atom', index: 0 }} geometrySource="experiment (CCCBDB)" touch={false} />);
        expect(container.textContent).toMatch(/∠H–O–H 104\.5°/);
        expect(container.textContent).toMatch(/geometry: experiment \(CCCBDB\)/);
        rerender(<MoleculeReadout atoms={waterAtoms()} pick={null} geometrySource="experiment (CCCBDB)" touch />);
        expect(container.textContent).toMatch(/Tap an atom or bond/);
    });
    // Ruling T13-I4: a phone's hint under space filling offers atoms only -- there are no bonds to tap.
    it('offers only atoms to tap under space filling', () => {
        const { container } = render(<MoleculeReadout atoms={waterAtoms()} pick={null} geometrySource="experiment (CCCBDB)" touch spaceFilling />);
        expect(container.textContent).toMatch(/Tap an atom for its angles and neighbours/);
        expect(container.textContent).not.toMatch(/bond/);
    });
    // Ruling R23c-3: on a desktop (not `touch`) the hint moves to a viewport-corner
    // caption (App.tsx), so the Explore-panel readout says nothing extra while
    // unpicked -- just the always-on geometry/connectivity note.
    it('says nothing extra on a desktop while unpicked, leaving the hint to the viewport caption', () => {
        const { container } = render(<MoleculeReadout atoms={waterAtoms()} pick={null} geometrySource="experiment (CCCBDB)" touch={false} />);
        expect(container.textContent).not.toMatch(/hover|tap/i);
        expect(container.textContent).toMatch(/geometry: experiment \(CCCBDB\)/);
    });
    it('toggles structure and dipole and states the arrow convention', () => {
        const onShowDipole = jest.fn();
        // Task 13 (ruling P8): the structure is a representation now (the switch became the Structure segments).
        const { container } = render(<MoleculeViewOptions representation="ball-and-stick" onRepresentationChange={() => {}} spaceFillingUnavailable={null} surfaceShown
            showDipole onShowDipole={onShowDipole} dipoleText="μ = 1.86 D" />);
        fireEvent.click(screen.getByLabelText('Dipole arrow'));   // role is checkbox or switch depending on the MUI minor
        expect(onShowDipole).toHaveBeenCalledWith(false);
        expect(container.textContent).toMatch(/points from − to \+/);
    });
    // Ruling T7-O3: ozone's dipole carries meta.caveat beside it, never shown alone.
    it('shows the caveat beside the dipole when the molecule carries one (T7-O3, ozone)', () => {
        // Task 13 (ruling P8): representation props in place of the old showStructure switch's.
        const { container } = render(<MoleculeViewOptions representation="ball-and-stick" onRepresentationChange={() => {}} spaceFillingUnavailable={null} surfaceShown
            showDipole onShowDipole={() => {}}
            dipoleText="μ = 0.65 D" caveat="Ozone has strong multireference character: single-reference B3LYP overestimates its dipole moment." />);
        expect(container.textContent).toMatch(/μ = 0\.65 D/);
        expect(container.textContent).toMatch(/Ozone has strong multireference character: single-reference B3LYP overestimates its dipole moment\./);
    });
});
