import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ElementTile from '../../src/atom_ui/ElementTile';
import ElementPickerDialog from '../../src/components/ElementPickerDialog';

const props = { tableOpen: false, onOpenTable: jest.fn(), onToggleTable: jest.fn(), onOpenList: jest.fn() };

describe('ElementTile (spec §9.1)', () => {
    it('shows Z, the electron count, the symbol, the name and the standard weight', () => {
        render(<ElementTile {...props} species={{ Z: 6, charge: 0, excitation: null }} />);
        const tile = screen.getByRole('button', { name: 'change element, currently Carbon' });
        expect(tile).toHaveTextContent('6');
        expect(tile).toHaveTextContent('6 e⁻');
        expect(tile).toHaveTextContent('Carbon');
        expect(tile).toHaveTextContent('12.011');
        expect(tile.getAttribute('title')).toMatch(/IUPAC CIAAW 2021/);
    });

    it('reads an ion: Na⁺ with 11 protons and 10 electrons', () => {
        render(<ElementTile {...props} species={{ Z: 11, charge: 1, excitation: null }} />);
        const tile = screen.getByRole('button', { name: 'change element, currently Na⁺ · Sodium' });
        expect(tile).toHaveTextContent('10 e⁻');
        expect(tile.querySelector('.element-tile-symbol')).toHaveTextContent('Na⁺');
    });

    // Controller ruling DB7 (M10): an excited neutral atom is not the plain
    // element, so the name keeps saying so ("Na* · Sodium"), as LevelNav's
    // element button did; the visible symbol stays the charge-only one.
    it('names an excited neutral atom as the species, not just the element', () => {
        render(<ElementTile {...props} species={{ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } }} />);
        const tile = screen.getByRole('button', { name: 'change element, currently Na* · Sodium' });
        expect(tile).toHaveTextContent('11 e⁻');
        expect(tile.querySelector('.element-tile-symbol')).toHaveTextContent(/^Na$/);
    });

    it('opens the periodic table from the tile or its button, and the list from ▾', () => {
        const onOpenTable = jest.fn();
        const onToggleTable = jest.fn();
        const onOpenList = jest.fn();
        render(<ElementTile species={{ Z: 6, charge: 0, excitation: null }} tableOpen={false}
            onOpenTable={onOpenTable} onToggleTable={onToggleTable} onOpenList={onOpenList} />);
        fireEvent.click(screen.getByRole('button', { name: /^change element/ }));
        expect(onOpenTable).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Periodic Table' }));
        expect(onToggleTable).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Choose an element from a list' }));
        expect(onOpenList).toHaveBeenCalledWith(expect.any(HTMLElement));
    });
});

describe('the ▾ element list (ElementPickerDialog variant="popover", spec §9.1)', () => {
    it('opens under its anchor with the filter focused, and Enter picks the first match and closes', async () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const onSelect = jest.fn();
        const onClose = jest.fn();
        render(<ElementPickerDialog variant="popover" anchorEl={anchor} open Z={6} onSelect={onSelect} onClose={onClose} />);
        const list = screen.getByRole('dialog', { name: 'Choose an element' });
        const filter = within(list).getByRole('textbox', { name: 'filter elements' });
        await waitFor(() => expect(filter).toHaveFocus());
        fireEvent.change(filter, { target: { value: 'Fe' } });
        fireEvent.keyDown(filter, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(26);
        expect(onClose).toHaveBeenCalled();
        anchor.remove();
    });
});
