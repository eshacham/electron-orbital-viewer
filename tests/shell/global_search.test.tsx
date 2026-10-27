import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GlobalSearch from '../../src/shell/GlobalSearch';
import { LIBRARY_INDEX } from '../molecules/fixtures';

const setup = () => {
    const onPick = jest.fn();
    const onWantIndex = jest.fn();
    render(<GlobalSearch sources={{ molecules: LIBRARY_INDEX }} onPick={onPick} onWantIndex={onWantIndex} />);
    const input = screen.getByRole('combobox', { name: 'Search elements, molecules and orbitals' });
    return { onPick, onWantIndex, input };
};

describe('GlobalSearch (spec §8.3)', () => {
    it('lists grouped results and opens the first with Enter', () => {
        const { onPick, input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'fe' } });
        const list = screen.getByRole('listbox', { name: 'Search results' });
        expect(within(list).getByRole('group', { name: 'Elements' })).toBeInTheDocument();
        const options = within(list).getAllByRole('option');
        expect(options[0]).toHaveTextContent('Iron (Fe)');
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onPick).toHaveBeenCalledWith({ kind: 'element', Z: 26 });
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('moves with the arrows and points aria-activedescendant at the active option', () => {
        const { input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'c' } });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        const options = screen.getAllByRole('option');
        expect(options[1]).toHaveAttribute('aria-selected', 'true');
        expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    });

    // Task 8 (addendum 5): an orbital result is typeset, 3d<sub>z²</sub>, with no "_" anywhere in the list.
    it('typesets an orbital result with a real subscript', () => {
        const { input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '3dz' } });
        const option = screen.getByRole('option', { name: /^3dz²/ });
        expect(option.querySelector('.global-search-label')!.innerHTML).toContain('3d<sub>z²</sub>');
        expect(screen.getByRole('listbox', { name: 'Search results' }).textContent).not.toContain('_');
    });

    it('opens a molecule with a click', () => {
        const { onPick, input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'h2o' } });
        fireEvent.click(screen.getByRole('option', { name: /Water/ }));
        expect(onPick).toHaveBeenCalledWith({ kind: 'molecule', id: 'h2o' });
    });

    it('says No matches for nonsense (Review Focus 5)', () => {
        const { input } = setup();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'zz' } });
        expect(screen.getByRole('status')).toHaveTextContent('No matches');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes with Esc, asks for the index on focus, and takes Ctrl+K from anywhere', () => {
        const { input, onWantIndex } = setup();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(document.activeElement).toBe(input);
        fireEvent.focus(input);
        expect(onWantIndex).toHaveBeenCalled();
        fireEvent.change(input, { target: { value: 'fe' } });
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    // Ruling T18-a11y-carry (e): the combobox says what kind of popup it opens.
    it('says its popup is a listbox', () => {
        const { input } = setup();
        expect(input).toHaveAttribute('aria-haspopup', 'listbox');
    });
});
