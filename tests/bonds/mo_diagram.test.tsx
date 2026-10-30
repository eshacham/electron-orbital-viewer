import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { bondOrderFromOrbitals, buildMoDiagram, bondOrderText, h2plusOrbitals, spinOrderNote } from '../../src/bonds/mo_diagram';
import { BondsSystemId, TEXTBOOK_BOND_ORDER } from '../../src/bonds/systems';
import MoDiagram from '../../src/components/MoDiagram';
import { MoleculeMeta, MoleculeOrbitalInfo } from '../../src/molecules/types';
import { seenText } from '../seen_text';

/** The generated v1 meta.json (tests/fixtures/molecules: copies of what is published). */
const fixtureOrbitals = (id: string): MoleculeOrbitalInfo[] =>
    (JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', id, 'meta.json'), 'utf8')) as MoleculeMeta).orbitals;

const r = (index: number, label: string, energyHartree: number, occupation: number): MoleculeOrbitalInfo =>
    ({ index, label, energyHartree, occupation, spin: 'restricted' });
const n2 = [r(0, '1σg', -14.4, 2), r(1, '1σu*', -14.4, 2), r(2, '2σg', -1.1, 2), r(3, '2σu*', -0.5, 2),
    r(4, '1πu', -0.43, 2), r(5, '1πu', -0.43, 2), r(6, '3σg', -0.38, 2), r(7, '1πg*', -0.08, 0), r(8, '1πg*', -0.08, 0)];
const o2alpha = (index: number, label: string, e: number, occupation: number): MoleculeOrbitalInfo => ({ index, label, energyHartree: e, occupation, spin: 'alpha' });
const o2beta = (index: number, label: string, e: number, occupation: number): MoleculeOrbitalInfo => ({ index, label, energyHartree: e, occupation, spin: 'beta' });
const o2 = [o2alpha(0, '1πu', -0.6, 1), o2alpha(1, '1πu', -0.6, 1), o2alpha(2, '1πg*', -0.35, 1), o2alpha(3, '1πg*', -0.35, 1),
    o2beta(4, '1πu', -0.55, 1), o2beta(5, '1πu', -0.55, 1), o2beta(6, '1πg*', -0.25, 0), o2beta(7, '1πg*', -0.25, 0)];

describe('buildMoDiagram', () => {
    it('groups degenerate pairs into one level and fills boxes from occupations', () => {
        const model = buildMoDiagram(n2);
        const pi = model.levels.find(level => level.label === '1πu')!;
        expect(pi.boxes).toEqual([{ orbitalIndex: 4, up: true, down: true }, { orbitalIndex: 5, up: true, down: true }]);
        expect(model.levels.find(level => level.label === '1πg*')!.boxes.every(b => !b.up && !b.down)).toBe(true);
    });

    it('puts levels below the largest gap over 1 Ha into the core', () => {
        const model = buildMoDiagram(n2);
        expect(model.levels.filter(l => l.core).map(l => l.label)).toEqual(['1σg', '1σu*']);
    });

    it("shows O2's two unpaired π* electrons: α up arrows, no β partner", () => {
        const model = buildMoDiagram(o2);
        expect(model.unrestricted).toBe(true);
        const piStar = model.levels.find(level => level.label === '1πg*')!;
        expect(piStar.boxes).toEqual([{ orbitalIndex: 2, up: true, down: false }, { orbitalIndex: 3, up: true, down: false }]);
        expect(model.levels.find(level => level.label === '1πu')!.boxes.every(b => b.up && b.down)).toBe(true);
    });

    it('states the bond order, and He2 has none', () => {
        expect(bondOrderText(3)).toBe('Bond order 3');
        expect(bondOrderText(0)).toBe('Bond order 0 — no bond: the antibonding electrons cancel the bonding ones.');
        expect(bondOrderText(0.5)).toBe('Bond order ½');
        expect(bondOrderText(null)).toBe('Bond order is not defined by g/u counting for a heteronuclear molecule.');
    });

    it('builds the exact H2+ levels, one electron in 1σg', () => {
        const levels = h2plusOrbitals(2);
        expect(levels.map(o => [o.label, o.occupation])).toEqual([['1σg', 1], ['1σu*', 0]]);
        expect(levels[0].energyHartree).toBeCloseTo(-1.1026342145, 9);
    });
});

/**
 * Ruling R23e: the System select's per-option bond order (systems.ts'
 * TEXTBOOK_BOND_ORDER) against (bonding − antibonding)/2 over each
 * homonuclear system's own shipped occupations (v3, tools/molecules/out --
 * label/occupation pairs copied from the published meta.json, same shape
 * fixtureOrbitals above reads from disk for N₂/O₂/HF). CO and HF's labels
 * carry no antibonding star (heteronuclear: g/u symmetry, and so the star,
 * does not apply -- meta.json's own bondOrder is null for them too, the
 * comment on MoleculeMeta.bondOrder says so), so there is nothing to derive
 * them from; TEXTBOOK_BOND_ORDER carries their value unchecked, and this
 * only confirms bondOrderFromOrbitals correctly declines to guess.
 */
describe('bondOrderFromOrbitals', () => {
    const occ = (label: string, occupation: number) => ({ label, occupation });
    const SHIPPED: Record<Exclude<BondsSystemId, 'h2plus'>, Array<{ label: string; occupation: number }>> = {
        h2: [occ('1σg', 2), occ('1σu*', 0)],
        he2: [occ('1σg', 2), occ('1σu*', 2)],
        li2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 0)],
        b2: [occ('1σg', 1), occ('1σu*', 1), occ('2σg', 1), occ('2σu*', 1), occ('1πu', 1), occ('1πu', 1), occ('3σg', 0),
            occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0), occ('1σg', 1), occ('1σu*', 1), occ('2σg', 1), occ('2σu*', 1),
            occ('3σg', 0), occ('1πu', 0), occ('1πu', 0), occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0)],
        c2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 2), occ('1πu', 2), occ('1πu', 2), occ('3σg', 0),
            occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0)],
        n2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 2), occ('1πu', 2), occ('1πu', 2), occ('3σg', 2),
            occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0)],
        o2: [occ('1σg', 1), occ('1σu*', 1), occ('2σg', 1), occ('2σu*', 1), occ('1πu', 1), occ('1πu', 1), occ('3σg', 1),
            occ('1πg*', 1), occ('1πg*', 1), occ('3σu*', 0), occ('1σg', 1), occ('1σu*', 1), occ('2σg', 1), occ('2σu*', 1),
            occ('3σg', 1), occ('1πu', 1), occ('1πu', 1), occ('1πg*', 0), occ('1πg*', 0), occ('3σu*', 0)],
        f2: [occ('1σg', 2), occ('1σu*', 2), occ('2σg', 2), occ('2σu*', 2), occ('3σg', 2), occ('1πu', 2), occ('1πu', 2),
            occ('1πg*', 2), occ('1πg*', 2), occ('3σu*', 0)],
        co: [occ('1σ', 2), occ('2σ', 2), occ('3σ', 2), occ('4σ', 2), occ('1π', 2), occ('1π', 2), occ('5σ', 2),
            occ('2π', 0), occ('2π', 0), occ('6σ', 0)],
        hf: [occ('1σ', 2), occ('2σ', 2), occ('3σ', 2), occ('1π', 2), occ('1π', 2), occ('4σ', 0)],
    };

    it.each(['h2', 'he2', 'li2', 'b2', 'c2', 'n2', 'o2', 'f2'] as const)('matches the textbook value for %s', id => {
        expect(bondOrderFromOrbitals(SHIPPED[id])).toBe(TEXTBOOK_BOND_ORDER[id]);
    });

    it('declines to guess for a heteronuclear molecule (no antibonding star to sum by)', () => {
        expect(bondOrderFromOrbitals(SHIPPED.co)).toBeNull();
        expect(bondOrderFromOrbitals(SHIPPED.hf)).toBeNull();
    });

    it('is null with nothing to sum', () => {
        expect(bondOrderFromOrbitals([])).toBeNull();
    });
});

// Final review I1: O₂'s diagram draws α energies, where 1πu (−0.573 Ha) lies
// below 3σg (−0.559 Ha); in β (3σg −0.521, 1πu −0.470) and in the
// photoelectron spectrum (b⁴Σg⁻, a 3σg hole, 18.17 eV above a⁴Πu's 16.10 eV,
// adiabatic) the order is the textbook O₂ one. The diagram must say so.
describe('spinOrderNote', () => {
    it("names O2's swapped pair from the generated orbitals, with the photoelectron spectra", () => {
        const model = buildMoDiagram(fixtureOrbitals('o2'));
        expect(model.betaOrderSwaps).toEqual([{ lower: '3σg', upper: '1πu', occupied: true }]);
        expect(spinOrderNote(model)).toBe(
            'Levels drawn at α energies; in β — and in photoelectron spectra — 3σg lies below 1πu. ↓ marks the matching β orbital.');
    });

    it('has nothing to say for a restricted molecule (N2 and HF from the generated data, F2 as v1 ships it)', () => {
        const f2 = [r(0, '1σg', -24.797, 2), r(1, '1σu*', -24.797, 2), r(2, '2σg', -1.355, 2), r(3, '2σu*', -1.116, 2),
            r(4, '3σg', -0.611, 2), r(5, '1πu', -0.549, 2), r(6, '1πu', -0.549, 2), r(7, '1πg*', -0.421, 2), r(8, '1πg*', -0.421, 2),
            r(9, '3σu*', -0.162, 0)];
        for (const orbitals of [fixtureOrbitals('n2'), fixtureOrbitals('hf'), f2]) {
            const model = buildMoDiagram(orbitals);
            expect(model.betaOrderSwaps).toEqual([]);
            expect(spinOrderNote(model)).toBeNull();
        }
    });

    it('keeps the plain α note when α and β agree on the order', () => {
        const model = buildMoDiagram(o2);
        expect(model.betaOrderSwaps).toEqual([]);
        expect(spinOrderNote(model)).toBe('Levels drawn at α energies; ↓ marks the matching β orbital.');
    });

    // B₂ (v1): in β, 3σg (−0.161) lies below 1πu (−0.136), both empty. A
    // photoelectron spectrum only ionises occupied levels, so it is not cited.
    it('leaves the photoelectron spectra out when the swapped β levels are empty', () => {
        const b2 = [o2alpha(0, '2σu*', -0.302, 1), o2alpha(1, '1πu', -0.253, 1), o2alpha(2, '1πu', -0.253, 1), o2alpha(3, '3σg', -0.171, 0),
            o2beta(4, '2σu*', -0.270, 1), o2beta(5, '3σg', -0.161, 0), o2beta(6, '1πu', -0.136, 0), o2beta(7, '1πu', -0.136, 0)];
        const model = buildMoDiagram(b2);
        expect(model.betaOrderSwaps).toEqual([{ lower: '3σg', upper: '1πu', occupied: false }]);
        expect(spinOrderNote(model)).toBe('Levels drawn at α energies; in β, 3σg lies below 1πu. ↓ marks the matching β orbital.');
    });

    it('ignores the core pair, drawn side by side rather than in energy order', () => {
        const model = buildMoDiagram([o2alpha(0, '1σg', -19.2928, 1), o2alpha(1, '1σu*', -19.2927, 1), o2alpha(2, '2σg', -1.3, 1),
            o2beta(3, '1σg', -19.2619, 1), o2beta(4, '1σu*', -19.2622, 1), o2beta(5, '2σg', -1.25, 1)]);
        expect(model.betaOrderSwaps).toEqual([]);
    });
});

describe('MoDiagram', () => {
    // Task 7a: O₂'s α/β note is Info's now (bondsInfo, from Advanced: tests/info/bonds_info.test.ts); spinOrderNote,
    // above, still writes it. The diagram keeps its levels, with the labels' g/u as a real subscript.
    it("leaves O2's α/β note to Info, and subscripts its labels' g/u", () => {
        const { container } = render(<MoDiagram orbitals={fixtureOrbitals('o2')} selectedIndex={null} />);
        expect(screen.queryByText(/photoelectron spectra/)).toBeNull();
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        const label = [...container.querySelectorAll('.mo-label')].find(span => seenText(span) === '3σg')!;
        expect(label.querySelector('sub')).toHaveTextContent('g');
    });

    // Science corrections S2: the tooltip reads eV first, as Info and the frontier line do (orbitalEnergyText).
    it('titles each level eV first: "3σg: ε = −10.34 eV (−0.380 Ha)"', () => {
        render(<MoDiagram orbitals={n2} selectedIndex={null} />);
        expect(screen.getByRole('button', { name: '3σg orbital, 2 electrons' })).toHaveAttribute('title', '3σg: ε = −10.34 eV (−0.380 Ha)');
        expect(screen.getByRole('button', { name: '2σg orbital, 2 electrons' })).toHaveAttribute('title', '2σg: ε = −29.93 eV (−1.100 Ha)');
        for (const button of screen.getAllByRole('button')) expect(button.getAttribute('title')).toMatch(/^.+: ε = −[\d.]+ eV \(−[\d.]+ Ha\)$/);
    });

    // Final review M9: aria-label on a bare div is not reliably announced; a
    // group (it holds the level buttons) is a named landmark for them.
    it('is a named group of level buttons', () => {
        render(<MoDiagram orbitals={n2} selectedIndex={null} />);
        expect(screen.getByRole('group', { name: 'molecular orbital energy diagram' })).toBeInTheDocument();
    });

    it('says nothing about spin order for N2', () => {
        const { container } = render(<MoDiagram orbitals={fixtureOrbitals('n2')} selectedIndex={null} />);
        expect(container.querySelector('.mo-note')).toBeNull();
    });

    it('draws arrows and selects a box on click', () => {
        const onSelect = jest.fn();
        // Task 7a: no footer -- the bond order is Info's (bondsInfo).
        render(<MoDiagram orbitals={n2} selectedIndex={6} onSelect={onSelect} />);
        expect(screen.getAllByText('↑')).toHaveLength(7);
        expect(screen.getAllByText('↓')).toHaveLength(7);
        fireEvent.click(screen.getByRole('button', { name: /^1πg\* orbital \(2 of 2\)/ }));
        expect(onSelect).toHaveBeenCalledWith(8);
        expect(screen.getByRole('button', { name: /^3σg orbital,/ })).toHaveClass('selected');
        expect(screen.queryByText(/Bond order/)).toBeNull();
    });

    // Accessibility: each level is a real button named for what pressing it draws -- "2σg orbital, 2 electrons", plain
    // digits (ruling M6), a degenerate partner's place in its pair as the strip names it ("1πu orbital (1 of 2)") --
    // and the one on screen is marked with aria-pressed (not colour alone). Owner R26-3: the energy is Info's fact.
    it('marks the selected level and names each one for what pressing it draws (owner R26-3)', () => {
        render(<MoDiagram orbitals={n2} selectedIndex={6} onSelect={jest.fn()} />);
        const selected = screen.getByRole('button', { name: '3σg orbital, 2 electrons' });
        expect(selected.tagName).toBe('BUTTON');
        expect(selected).toHaveAttribute('type', 'button');
        expect(selected).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '2σg orbital, 2 electrons' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: '1πu orbital (1 of 2), 2 electrons' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '1πg* orbital (2 of 2), empty' })).toBeInTheDocument();
    });

    it("names O2's singly occupied levels with their one electron (owner R26-3)", () => {
        render(<MoDiagram orbitals={o2} selectedIndex={null} onSelect={jest.fn()} />);
        expect(screen.getByRole('button', { name: '1πg* orbital (1 of 2), 1 electron' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '1πu orbital (2 of 2), 2 electrons' })).toBeInTheDocument();
    });

    // Owner R26-3 ("there is no indication these are links"): a level looks pressable -- a tonal tile at rest, a
    // stronger tone on hover, the app's selected style (Deep Selection, as chips) when it is the one drawn, the pointer
    // cursor -- and keeps the global 2 px focus ring (no outline of its own drawn over it). Tokens only.
    it('styles each level as pressable: rest, hover, selected and focus, in tokens (owner R26-3)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = (selector: string) => {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
            if (!match) throw new Error(`no rule for ${selector}`);
            return match[1];
        };
        expect(rule('.mo-box')).toMatch(/cursor:\s*pointer/);
        expect(rule('.mo-box')).toMatch(/background:\s*var\(--ql-color-surface-2\)/);
        expect(rule('.mo-box:hover')).toMatch(/background:\s*var\(--ql-color-surface-3\)/);
        const selected = rule('.mo-box.selected,\n.mo-box.selected:hover');
        expect(selected).toMatch(/background:\s*var\(--ql-color-selected-fill\)/);
        expect(selected).toMatch(/color:\s*var\(--ql-color-on-fill\)/);
        expect(selected).toMatch(/box-shadow:\s*var\(--ql-shadow-selected\)/);
        expect(css).not.toMatch(/\.mo-box[^{]*\{[^}]*outline/);
    });

    // Science corrections S1 (critique P1): one true eV scale, read off an axis. He₂'s 4 mHa pair sits at (nearly) one
    // height, side by side; H₂'s 490 mHa pair is 67 px apart -- never both stretched to fill the panel.
    it("draws He2's pair side by side at its true heights, and H2's far apart", () => {
        const top = (el: Element) => parseFloat((el as HTMLElement).style.top);
        const left = (el: Element) => parseFloat((el as HTMLElement).style.left);
        const he2 = render(<MoDiagram orbitals={[r(0, '1σg', -0.5797, 2), r(1, '1σu*', -0.5757, 2)]} selectedIndex={null} />);
        const [g, u] = Array.from(he2.container.querySelectorAll('.mo-level'));
        expect(top(g) - top(u)).toBeLessThan(1);
        expect(left(u)).toBeGreaterThan(left(g));
        he2.unmount();
        const h2 = render(<MoDiagram orbitals={[r(0, '1σg', -0.43, 2), r(1, '1σu*', 0.06, 0)]} selectedIndex={null} />);
        const [hg, hu] = Array.from(h2.container.querySelectorAll('.mo-level'));
        expect(top(hg) - top(hu)).toBeCloseTo(0.49 * 27.211386245988 * 5, 6);
        expect(left(hu)).toBe(left(hg));
    });

    it('draws an eV axis with labelled ticks, a true minus, and the break marked on it', () => {
        const { container } = render(<MoDiagram orbitals={n2} selectedIndex={null} />);
        const axis = container.querySelector('.mo-axis')!;
        expect(axis).toHaveAttribute('aria-hidden', 'true');
        expect(axis.querySelector('.mo-axis-line')).not.toBeNull();
        expect([...axis.querySelectorAll('.mo-axis-label')].map(label => label.textContent)).toEqual(['−10', '−20']);
        expect(axis.querySelector('.mo-axis-unit')).toHaveTextContent('eV');
        expect(axis.querySelectorAll('.mo-axis-break')).toHaveLength(1);
        expect(container.querySelector('.mo-axis-note')).toBeNull();
        // No core, no break.
        const { container: h2 } = render(<MoDiagram orbitals={[r(0, '1σg', -0.43, 2), r(1, '1σu*', 0.06, 0)]} selectedIndex={null} />);
        expect(h2.querySelector('.mo-axis-break')).toBeNull();
    });

    it('says "scale reduced to fit" under an axis it had to shrink', () => {
        const wide = [r(0, '2σg', -3, 2), r(1, '2σu*', -2.2, 2), r(2, '3σg', -1.4, 2), r(3, '1πu', -0.6, 2), r(4, '1πg*', 0.2, 0), r(5, '3σu*', 1, 0)];
        const { container } = render(<MoDiagram orbitals={wide} selectedIndex={null} />);
        expect(container.querySelector('.mo-axis-note')).toHaveTextContent('scale reduced to fit');
        expect(parseFloat((container.querySelector('.mo-levels') as HTMLElement).style.height)).toBeLessThanOrEqual(320);
    });

    // The axis is a plot: a thin plot-axis line, text-3 tick labels and note (DESIGN.md, ink ladder). Tokens only.
    it('styles the axis in plot tokens', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = (selector: string) => {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
            if (!match) throw new Error(`no rule for ${selector}`);
            return match[1];
        };
        expect(rule('.mo-axis-line')).toMatch(/stroke:\s*var\(--ql-color-plot-axis\)/);
        expect(rule('.mo-axis-line')).toMatch(/stroke-width:\s*1\b/);
        expect(rule('.mo-axis-label')).toMatch(/fill:\s*var\(--ql-color-text-3\)/);
        expect(rule('.mo-axis-note')).toMatch(/color:\s*var\(--ql-color-text-3\)/);
    });

    // Found live (Task 13, N₂): the "≈ core" break was drawn across the 1σg
    // box below it and the 2σg box above. Science corrections S1: a level's top
    // is its energy line, its 18 px boxes standing on it (translateY(-100%));
    // the label is an 11 px line (13 px tall).
    it('keeps the core break clear of the lowest valence level and the core row', () => {
        const { container } = render(<MoDiagram orbitals={n2} selectedIndex={null} />);
        const top = (el: Element) => parseFloat((el as HTMLElement).style.top);
        const levels = Array.from(container.querySelectorAll('.mo-level'));
        const core = levels.filter(el => el.textContent?.includes('1σg') || el.textContent?.includes('1σu*'));
        const valence = levels.filter(el => !core.includes(el));
        const breakTop = top(container.querySelector('.mo-break')!);
        expect(Math.max(...valence.map(top)) + 9).toBeLessThanOrEqual(breakTop);
        core.forEach(el => expect(breakTop + 13).toBeLessThanOrEqual(top(el) - 9));
        core.forEach(el => expect(breakTop + 13).toBeLessThanOrEqual(top(el) - 18));
    });
});
