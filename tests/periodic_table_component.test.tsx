import React from 'react';
import { render, fireEvent, within } from '@testing-library/react';
import PeriodicTable from '../src/components/PeriodicTable';

const tilesIn = (container: HTMLElement, selector: string) =>
    [...container.querySelectorAll<HTMLElement>(selector)].map(t => Number(t.dataset.z));

describe('PeriodicTable', () => {
    it('renders every element as a tile carrying its number and symbol', () => {
        const { container } = render(<PeriodicTable Z={1} onSelect={() => {}} />);
        const tiles = container.querySelectorAll('.periodic-tile');
        expect(tiles).toHaveLength(118);

        const iron = container.querySelector('.periodic-tile[data-z="26"]')!;
        expect(iron.textContent).toContain('26');
        expect(iron.textContent).toContain('Fe');
    });

    it('keeps the lanthanides and actinides in their own detached rows', () => {
        const { getByRole } = render(<PeriodicTable Z={1} onSelect={() => {}} />);
        const lanthanides = within(getByRole('group', { name: /lanthanides/i }));
        const actinides = within(getByRole('group', { name: /actinides/i }));
        expect(lanthanides.getByText('La')).toBeInTheDocument();
        expect(lanthanides.getByText('Lu')).toBeInTheDocument();
        expect(actinides.getByText('Ac')).toBeInTheDocument();
        expect(actinides.getByText('Lr')).toBeInTheDocument();
    });

    // Addendum 3: colour is block, not chemical family, because block is
    // what the engine computes with.
    it('colours by block, and says so in a legend', () => {
        const { container, getByText } = render(<PeriodicTable Z={1} onSelect={() => {}} />);
        expect(container.querySelector('.periodic-tile[data-z="3"]')).toHaveAttribute('data-block', 's');
        expect(container.querySelector('.periodic-tile[data-z="9"]')).toHaveAttribute('data-block', 'p');
        expect(container.querySelector('.periodic-tile[data-z="26"]')).toHaveAttribute('data-block', 'd');
        expect(container.querySelector('.periodic-tile[data-z="92"]')).toHaveAttribute('data-block', 'f');
        for (const label of ['s-block', 'p-block', 'd-block', 'f-block']) {
            expect(getByText(label)).toBeInTheDocument();
        }
    });

    it('reports a clicked element and marks the current one', () => {
        const onSelect = jest.fn();
        const { container } = render(<PeriodicTable Z={26} onSelect={onSelect} />);

        const selected = container.querySelectorAll('.periodic-tile.selected');
        expect(selected).toHaveLength(1);
        expect(selected[0]).toHaveAttribute('data-z', '26');
        expect(selected[0]).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(container.querySelector('.periodic-tile[data-z="79"]')!);
        expect(onSelect).toHaveBeenCalledWith(79);
    });

    // "A group *is* a column precisely because its members share a valence
    // configuration" -- lighting the column is the point of the selector.
    describe('column highlighting', () => {
        it('lights the selected element\'s whole group', () => {
            const { container } = render(<PeriodicTable Z={17} onSelect={() => {}} />);
            // The halogens: F, Cl, Br, I, At, Ts.
            expect(tilesIn(container, '.periodic-tile.in-column')).toEqual([9, 17, 35, 53, 85, 117]);
        });

        it('follows the pointer to another column, and back to the selection when it leaves', () => {
            const { container } = render(<PeriodicTable Z={17} onSelect={() => {}} />);
            const lithium = container.querySelector('.periodic-tile[data-z="3"]')!;

            fireEvent.mouseEnter(lithium);
            // The alkali metals, plus hydrogen, which shares group 1.
            expect(tilesIn(container, '.periodic-tile.in-column')).toEqual([1, 3, 11, 19, 37, 55, 87]);

            fireEvent.mouseLeave(lithium);
            expect(tilesIn(container, '.periodic-tile.in-column')).toEqual([9, 17, 35, 53, 85, 117]);
        });

        it('pairs a lanthanide with the actinide below it, the rows having no groups of their own', () => {
            const { container } = render(<PeriodicTable Z={58} onSelect={() => {}} />);
            expect(tilesIn(container, '.periodic-tile.in-column')).toEqual([58, 90]);
        });

        it('follows keyboard focus too, so the column is not a mouse-only affordance', () => {
            const { container } = render(<PeriodicTable Z={17} onSelect={() => {}} />);
            fireEvent.focus(container.querySelector('.periodic-tile[data-z="3"]')!);
            expect(tilesIn(container, '.periodic-tile.in-column')).toEqual([1, 3, 11, 19, 37, 55, 87]);
        });
    });

    it('collapses to its header, and comes back', () => {
        const { container, getByRole } = render(<PeriodicTable Z={1} onSelect={() => {}} />);
        const toggle = getByRole('button', { name: /hide table/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(toggle);
        expect(getByRole('button', { name: /change element/i })).toHaveAttribute('aria-expanded', 'false');
        // Still says which element is current while collapsed.
        expect(container.querySelector('.periodic-table-current')?.textContent).toMatch(/Hydrogen/);
    });

    // Open, the table covers the top third of the view and the atom has to
    // shrink below it; like a dropdown, it closes once a choice is made.
    it('folds to its header once an element is picked', () => {
        const onSelect = jest.fn();
        const { container, getByRole } = render(<PeriodicTable Z={1} onSelect={onSelect} />);
        fireEvent.click(container.querySelector('.periodic-tile[data-z="26"]')!);
        expect(onSelect).toHaveBeenCalledWith(26);
        expect(getByRole('button', { name: /change element/i })).toHaveAttribute('aria-expanded', 'false');
    });

    it('names the current element and its block in the header', () => {
        const { container } = render(<PeriodicTable Z={92} onSelect={() => {}} />);
        expect(container.querySelector('.periodic-table-current')?.textContent)
            .toMatch(/92 — U \(Uranium\) · f-block/);
    });
});
