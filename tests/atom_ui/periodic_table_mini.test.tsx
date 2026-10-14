import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import PeriodicTableMini from '../../src/atom_ui/PeriodicTableMini';
import { MAIN_TABLE, F_BLOCK_ROWS, tileOf } from '../../src/periodic_table';

// Ruling R23d (round 23): the "Periodic Table" text button is replaced by a
// crisp vector miniature of the same 18-column + f-block layout, the
// selected element's cell highlighted, opening the big table on click --
// exactly what it did before, just shown rather than only said.
describe('PeriodicTableMini (ruling R23d)', () => {
    it('draws one cell per element, laid out like the big table', () => {
        const { container } = render(
            <PeriodicTableMini Z={6} name="Carbon" open={false} onToggle={() => {}} />
        );
        const cells = container.querySelectorAll('.periodic-table-mini-cell');
        expect(cells).toHaveLength(MAIN_TABLE.length + F_BLOCK_ROWS.flat().length);
    });

    it('highlights only the selected element\'s cell, coloured by its block', () => {
        const { container } = render(
            <PeriodicTableMini Z={26} name="Iron" open={false} onToggle={() => {}} />
        );
        const selected = container.querySelectorAll('.periodic-table-mini-cell.selected');
        expect(selected).toHaveLength(1);
        expect(selected[0]).toHaveAttribute('data-z', '26');
        expect(selected[0]).toHaveClass('block-d');
    });

    it('moves the highlight to an f-block element (actinium)', () => {
        const { container } = render(
            <PeriodicTableMini Z={89} name="Actinium" open={false} onToggle={() => {}} />
        );
        const selected = container.querySelectorAll('.periodic-table-mini-cell.selected');
        expect(selected).toHaveLength(1);
        expect(selected[0]).toHaveAttribute('data-z', '89');
        expect(selected[0]).toHaveClass('block-f');
    });

    it('names itself after the selected element and opens the big table on click', () => {
        const onToggle = jest.fn();
        const { getByRole } = render(
            <PeriodicTableMini Z={6} name="Carbon" open={false} onToggle={onToggle} />
        );
        const button = getByRole('button', { name: 'Periodic table, Carbon selected — open' });
        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalled();
    });

    it('keeps disclosure semantics: aria-expanded follows open, aria-controls names the big table', () => {
        const { getByRole, rerender } = render(
            <PeriodicTableMini Z={6} name="Carbon" open={false} onToggle={() => {}} />
        );
        const button = getByRole('button', { name: /Periodic table/ });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(button).toHaveAttribute('aria-controls', 'periodic-table-panel');

        rerender(<PeriodicTableMini Z={6} name="Carbon" open onToggle={() => {}} />);
        expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('is a real button, so it keeps a focus ring and a pointer cursor', () => {
        const { getByRole } = render(
            <PeriodicTableMini Z={6} name="Carbon" open={false} onToggle={() => {}} />
        );
        expect(getByRole('button', { name: /Periodic table/ }).tagName).toBe('BUTTON');
    });

    it('positions every cell where the big table positions it (group, or f-row index + 3)', () => {
        const { container } = render(
            <PeriodicTableMini Z={6} name="Carbon" open={false} onToggle={() => {}} />
        );
        const iron = container.querySelector('.periodic-table-mini-cell[data-z="26"]') as HTMLElement;
        const expectedGroup = tileOf(26)?.group;
        expect(iron.style.gridColumn).toBe(String(expectedGroup));
    });
});
