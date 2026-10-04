import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildMoDiagram, bondOrderText, h2plusOrbitals } from '../../src/bonds/mo_diagram';
import MoDiagram from '../../src/components/MoDiagram';
import { MoleculeOrbitalInfo } from '../../src/molecules/types';

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

describe('MoDiagram', () => {
    it('draws arrows and selects a box on click', () => {
        const onSelect = jest.fn();
        render(<MoDiagram orbitals={n2} selectedIndex={6} onSelect={onSelect} footer="Bond order 3" />);
        expect(screen.getAllByText('↑')).toHaveLength(7);
        expect(screen.getAllByText('↓')).toHaveLength(7);
        fireEvent.click(screen.getByRole('button', { name: /1πg\* \(2 of 2\)/ }));
        expect(onSelect).toHaveBeenCalledWith(8);
        expect(screen.getByRole('button', { name: /3σg \(1 of 1\)/ })).toHaveClass('selected');
        expect(screen.getByText('Bond order 3')).toBeInTheDocument();
    });

    // Accessibility: a level's box states its energy, occupation and spin, and
    // marks the one on screen with aria-pressed (not colour alone).
    it('marks the selected box and names each one fully for assistive tech', () => {
        render(<MoDiagram orbitals={n2} selectedIndex={6} onSelect={jest.fn()} />);
        const selected = screen.getByRole('button', { name: /3σg \(1 of 1\), -0\.380 Ha, occupation 2/ });
        expect(selected).toHaveAttribute('aria-pressed', 'true');
        const other = screen.getByRole('button', { name: /2σg \(1 of 1\), -1\.100 Ha, occupation 2/ });
        expect(other).toHaveAttribute('aria-pressed', 'false');
    });

    it("names O2's alpha levels with their spin", () => {
        render(<MoDiagram orbitals={o2} selectedIndex={null} onSelect={jest.fn()} />);
        expect(screen.getByRole('button', { name: /1πg\* \(1 of 2\), -0\.350 Ha, occupation 1, alpha spin/ })).toBeInTheDocument();
    });

    // Found live (Task 13, N₂): the "≈ core" break was drawn across the 1σg
    // box below it and the 2σg box above. Levels are centred on their top
    // (translateY(-50%)) with 18 px boxes; the label is an 11 px line (13 px tall).
    it('keeps the core break clear of the lowest valence level and the core row', () => {
        const { container } = render(<MoDiagram orbitals={n2} selectedIndex={null} />);
        const top = (el: Element) => parseFloat((el as HTMLElement).style.top);
        const levels = Array.from(container.querySelectorAll('.mo-level'));
        const core = levels.filter(el => el.textContent?.includes('1σg') || el.textContent?.includes('1σu*'));
        const valence = levels.filter(el => !core.includes(el));
        const breakTop = top(container.querySelector('.mo-break')!);
        expect(Math.max(...valence.map(top)) + 9).toBeLessThanOrEqual(breakTop);
        core.forEach(el => expect(breakTop + 13).toBeLessThanOrEqual(top(el) - 9));
    });
});
