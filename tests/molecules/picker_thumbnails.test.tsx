// tests/molecules/picker_thumbnails.test.tsx -- owner R25-A3: the Quick pick row is gone (QuickPick.tsx and
// tests/molecule_ui/quick_pick.test.tsx removed; rulings T12-fit and D7 superseded); the build-time structure
// thumbnails it showed now sit in every row of the Change ▾ picker -- the desktop/tablet popover, the phone's
// full-screen dialog and the phone's inline browse list, which are all MoleculePicker. This file carries the
// quick pick's picture tests over to the picker rows.
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import MoleculePicker from '../../src/components/MoleculePicker';
import MoleculePickerDialog from '../../src/components/MoleculePickerDialog';
import { formatFormula } from '../../src/molecules/catalogue';
import { structureThumbAlt, structureThumbUrl } from '../../src/molecules/thumb_paths';
import { computedEntries } from '../../src/jobs/computed';
import { LIBRARY_INDEX } from './fixtures';
import { jobFixture } from '../jobs/api_fixtures';

const rows = () => within(screen.getByRole('list', { name: 'molecules' })).getAllByRole('button');
const row = (formula: string, name: string) => screen.getByRole('button', { name: `${formatFormula(formula)} ${name}` });

describe('the molecule picker\'s rows (owner R25-A3)', () => {
    it('shows each library molecule\'s build-time structure thumbnail, 40 px, with its alt text, beside formula and name', () => {
        const onSelect = jest.fn();
        render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={onSelect} />);
        expect(rows()).toHaveLength(LIBRARY_INDEX.length);
        for (const item of rows()) expect(item.querySelector('img.molecule-picker-image')).not.toBeNull();
        const water = row('H2O', 'Water');
        const img = water.querySelector('img') as HTMLImageElement;
        expect(img).toHaveAttribute('src', structureThumbUrl('h2o'));
        expect(img.getAttribute('src')).toMatch(/^\/molecule-thumbs\/v\d+\/h2o\.webp$/);
        expect(img).toHaveAttribute('alt', structureThumbAlt('Water'));
        expect(img).toHaveAttribute('width', '40');
        expect(img).toHaveAttribute('height', '40');
        // Seventy-odd pictures in a scrolling list: only those scrolled to are fetched.
        expect(img).toHaveAttribute('loading', 'lazy');
        // Picture, then formula, then name; the row's name is its visible text (WCAG 2.5.3), not the alt text again.
        const [picture, formula, name] = Array.from(water.children);
        expect(picture).toContainElement(img);
        expect(formula).toHaveTextContent(/^H₂O$/);
        expect(name).toHaveTextContent(/^Water$/);
        // A row still chooses its molecule.
        fireEvent.click(row('NH3', 'Ammonia'));
        expect(onSelect).toHaveBeenCalledWith('nh3');
    });

    it('falls back to the row\'s formula when a thumbnail is missing; the other rows keep theirs', () => {
        render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={jest.fn()} />);
        const methane = row('CH4', 'Methane');
        fireEvent.error(methane.querySelector('img') as HTMLImageElement);
        expect(methane.querySelector('img')).toBeNull();
        // The slot stays (so the formula column stays aligned), empty; the formula beside it names the molecule.
        expect(methane.querySelector('.molecule-picker-thumb')).not.toBeNull();
        expect(methane.querySelector('.molecule-picker-formula')).toHaveTextContent(/^CH₄$/);
        expect(row('H2O', 'Water').querySelector('img')).not.toBeNull();
    });

    it('never asks for a thumbnail for a computed molecule (none is built for it)', () => {
        const computed = computedEntries([jobFixture('get_done')]);
        render(<MoleculePicker entries={[...LIBRARY_INDEX, ...computed]} error={null} selectedId={null} onSelect={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Computed' }));
        const [only] = rows();
        expect(only.querySelector('img')).toBeNull();
        expect(only.querySelector('.molecule-picker-thumb')).not.toBeNull();
        expect(only.querySelector('.molecule-picker-formula')).toHaveTextContent(formatFormula(computed[0].formula));
    });

    it('shows the thumbnails in the phone\'s full-screen picker and in the desktop popover alike', () => {
        const { unmount } = render(<MoleculePickerDialog open entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={jest.fn()} onClose={jest.fn()} />);
        expect(row('H2O', 'Water').querySelector('img')).toHaveAttribute('alt', structureThumbAlt('Water'));
        unmount();
        render(<MoleculePickerDialog open variant="popover" anchorEl={document.body} entries={LIBRARY_INDEX} error={null} selectedId={null}
            onSelect={jest.fn()} onClose={jest.fn()} />);
        expect(row('H2O', 'Water').querySelector('img')).toHaveAttribute('alt', structureThumbAlt('Water'));
    });

    // jsdom does no layout, so the rule's own source is read (the project's way of pinning a CSS property).
    it('sizes the picture slot at 40 px, picture or not', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        const start = css.indexOf('.molecule-picker-thumb {');
        expect(start).toBeGreaterThanOrEqual(0);
        const rule = css.slice(start, css.indexOf('}', start));
        expect(rule).toMatch(/width: 40px/);
        expect(rule).toMatch(/height: 40px/);
        expect(rule).toMatch(/flex: 0 0 40px/);
    });
});
