// tests/molecule_ui/quick_pick.test.tsx -- Molecules' quick pick (Phase 6G-2 Task 12; spec §9.4 Build; rulings D7, T12-fit).
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import QuickPick from '../../src/molecule_ui/QuickPick';
import { filterMolecules, formatFormula, libraryEntries } from '../../src/molecules/catalogue';
import { structureThumbAlt, structureThumbUrl } from '../../src/molecules/thumb_paths';
import { COMPUTED_CATEGORY } from '../../src/jobs/computed';
import type { MoleculeIndexEntry } from '../../src/molecules/types';
import { LIBRARY_INDEX } from '../molecules/fixtures';

const entry = (id: string, name: string, formula: string, category: string, tags: string[] = []): MoleculeIndexEntry =>
    ({ id, name, formula, category, tags });

// The brief's five, in index order. Ruling D7 (a): the fifth is "First examples" by tag only, as silane and ozone
// are in the live index -- the quick pick uses the picker chip's own membership rule (category or tag).
const INDEX: MoleculeIndexEntry[] = [
    entry('h2o', 'Water', 'H2O', 'first-examples'),
    entry('benzene', 'Benzene', 'C6H6', 'aromatic'),
    entry('nh3', 'Ammonia', 'NH3', 'first-examples'),
    entry('ch4', 'Methane', 'CH4', 'first-examples'),
    entry('co2', 'Carbon dioxide', 'CO2', 'first-examples'),
    entry('ethanol', 'Ethanol', 'C2H5OH', 'polarity', ['first-examples']),
    entry('o3', 'Ozone', 'O3', 'polarity', ['first-examples']),
];

const tiles = () => within(screen.getByRole('group', { name: 'Quick pick' })).getAllByRole('button');

describe('QuickPick (spec §9.4 Build)', () => {
    it('shows the first five "First examples" in index order, each named "<Name> (<formula>)"', () => {
        render(<QuickPick entries={INDEX} selectedId={null} onSelect={jest.fn()} />);
        expect(tiles().map(tile => tile.getAttribute('aria-label')))
            .toEqual(['Water (H₂O)', 'Ammonia (NH₃)', 'Methane (CH₄)', 'Carbon dioxide (CO₂)', 'Ethanol (C₂H₅OH)']);
    });

    it('reads the same membership as the picker\'s "First examples" chip (ruling D7 a), never a hard-coded list', () => {
        render(<QuickPick entries={LIBRARY_INDEX} selectedId={null} onSelect={jest.fn()} />);
        const expected = filterMolecules(libraryEntries(LIBRARY_INDEX), '', 'first-examples').slice(0, 5);
        expect(tiles().map(tile => tile.getAttribute('aria-label')))
            .toEqual(expected.map(e => `${e.name} (${formatFormula(e.formula)})`));
        // The fixture mirrors the live index: four by category, silane fifth by tag.
        expect(expected.map(e => e.id)).toEqual(['h2o', 'nh3', 'ch4', 'co2', 'sih4']);
    });

    it('shows each molecule\'s build-time thumbnail, with its alt text, and its name under it', () => {
        render(<QuickPick entries={INDEX} selectedId={null} onSelect={jest.fn()} />);
        const water = screen.getByRole('button', { name: 'Water (H₂O)' });
        const img = water.querySelector('img') as HTMLImageElement;
        expect(img).toHaveAttribute('alt', structureThumbAlt('Water'));
        expect(img).toHaveAttribute('src', structureThumbUrl('h2o'));
        expect(img.getAttribute('src')).toMatch(/^\/molecule-thumbs\/v\d+\/h2o\.webp$/);
        // WCAG 2.5.3: the visible caption is inside the accessible name.
        expect(water.querySelector('.quick-pick-label')).toHaveTextContent(/^Water$/);
    });

    it('shows the formula, large, when a thumbnail is missing', () => {
        render(<QuickPick entries={INDEX} selectedId={null} onSelect={jest.fn()} />);
        const methane = screen.getByRole('button', { name: 'Methane (CH₄)' });
        fireEvent.error(methane.querySelector('img') as HTMLImageElement);
        expect(methane.querySelector('img')).toBeNull();
        expect(methane.querySelector('.quick-pick-formula')).toHaveTextContent(formatFormula('CH4'));
        // The other tiles keep their pictures.
        expect(screen.getByRole('button', { name: 'Water (H₂O)' }).querySelector('img')).not.toBeNull();
    });

    it('marks the current molecule\'s tile, and a tile chooses its molecule', () => {
        const onSelect = jest.fn();
        render(<QuickPick entries={INDEX} selectedId="nh3" onSelect={onSelect} />);
        expect(screen.getByRole('button', { name: 'Ammonia (NH₃)' })).toHaveAttribute('aria-current', 'true');
        expect(tiles().filter(tile => tile.getAttribute('aria-current') === 'true')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Carbon dioxide (CO₂)' }));
        expect(onSelect).toHaveBeenCalledWith('co2');
    });

    it('shows what the category has when it has fewer than five', () => {
        render(<QuickPick entries={INDEX.slice(0, 4)} selectedId={null} onSelect={jest.fn()} />);
        expect(tiles().map(tile => tile.getAttribute('aria-label'))).toEqual(['Water (H₂O)', 'Ammonia (NH₃)', 'Methane (CH₄)']);
    });

    it('never offers a computed molecule, and shows nothing until the index has loaded', () => {
        const computed = entry('job-1', 'Water', 'H2O', COMPUTED_CATEGORY.key, ['first-examples']);
        const { rerender } = render(<QuickPick entries={[computed, ...INDEX]} selectedId={null} onSelect={jest.fn()} />);
        expect(tiles()).toHaveLength(5);
        expect(tiles()[0].querySelector('img')).toHaveAttribute('src', structureThumbUrl('h2o'));
        rerender(<QuickPick entries={null} selectedId={null} onSelect={jest.fn()} />);
        expect(screen.queryByRole('group', { name: 'Quick pick' })).toBeNull();
    });

    // Ruling T12-fit: five tiles in one row of the panel, never a sideways scroll (the prototype's 72 px row
    // hid one and a half). jsdom does no layout, so the rule's own source is read -- the project's established
    // way of asserting a CSS property (tests/App.molecules.test.tsx, tests/a11y/panel_contrast.test.ts).
    it('lays the five tiles out as one five-column row that shrinks to the panel, never scrolling sideways (T12-fit)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/molecule_ui/molecule_explore.css'), 'utf8');
        const rule = (selector: string) => {
            const start = css.indexOf(`${selector} {`);
            expect(start).toBeGreaterThanOrEqual(0);
            return css.slice(start, css.indexOf('}', start));
        };
        const row = rule('.quick-pick-row');
        expect(row).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
        expect(row).not.toMatch(/overflow-x:\s*(auto|scroll)/);
        // Captions wrap to two lines at most.
        expect(rule('.quick-pick-label')).toMatch(/-webkit-line-clamp:\s*2/);
    });
});
