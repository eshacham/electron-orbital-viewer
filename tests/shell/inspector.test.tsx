import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Inspector from '../../src/shell/Inspector';

const tabs = [{ key: 'plot', label: 'Plot', content: <p>plot body</p> }, { key: 'data', label: 'Data', content: <p>data body</p> }];

describe('Inspector (spec §8.6, §7 tablet)', () => {
    it('docks as the view panel with Plot and Data tabs', () => {
        const onTab = jest.fn();
        render(<Inspector variant="docked" tabs={tabs} activeTab="plot" onTab={onTab} />);
        const aside = screen.getByRole('complementary', { name: 'Inspector' });
        expect(aside).toHaveClass('view-panel');
        expect(screen.getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('plot body');
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(onTab).toHaveBeenCalledWith('data');
    });

    it('folds to a bar at medium width, opens over the view, and Esc closes it', () => {
        const onOpenChange = jest.fn();
        const { rerender } = render(<Inspector variant="drawer" body={<p>settings</p>} open={false} onOpenChange={onOpenChange} />);
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveClass('folded');
        fireEvent.click(screen.getByRole('button', { name: 'View settings' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        rerender(<Inspector variant="drawer" body={<p>settings</p>} open onOpenChange={onOpenChange} />);
        expect(screen.getByText('settings')).toBeInTheDocument();
        // Ruling T18-a11y-carry (b): Esc is the drawer's own key now -- pressed inside it, not on document.
        fireEvent.keyDown(screen.getByText('settings'), { key: 'Escape' });
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });

    // Ruling T18-a11y-carry (b), spec §13: closing must not drop focus to the page, and an
    // Esc meant for the periodic table or the search must not close the drawer as well.
    it('on Esc returns focus to the bar button that opened it, and ignores an Esc meant for something else', () => {
        const onOpenChange = jest.fn();
        render(
            <>
                <input aria-label="search elsewhere" />
                <Inspector variant="drawer" tabs={tabs} activeTab="data" open onOpenChange={onOpenChange} />
            </>,
        );
        const elsewhere = screen.getByRole('textbox', { name: 'search elsewhere' });
        elsewhere.focus();
        fireEvent.keyDown(elsewhere, { key: 'Escape' });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onOpenChange).not.toHaveBeenCalled();

        const tab = screen.getByRole('tab', { name: 'Data' });
        tab.focus();
        // Already handled by a control inside the drawer (e.g. its own popup): not the drawer's.
        const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        handled.preventDefault();
        tab.dispatchEvent(handled);
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.keyDown(tab, { key: 'Escape' });
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Data panel' }));
    });

    // Ruling R20b-atoms: the Atom screen's Display settings head the inspector, above Plot | Data,
    // docked and in the open drawer, and scroll with the tabs rather than squeezing them.
    it('puts a top section above its tabs, in one scroll area, docked and in the open drawer', () => {
        const top = <section aria-label="Display"><p>display settings</p></section>;
        const { container, rerender } = render(<Inspector variant="docked" top={top} tabs={tabs} activeTab="plot" />);
        const above = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(above(screen.getByRole('region', { name: 'Display' }), screen.getByRole('tablist', { name: 'Inspector' }))).toBe(true);
        expect(container.querySelector('.inspector-scroll')).toContainElement(screen.getByRole('region', { name: 'Display' }));
        expect(container.querySelector('.inspector-scroll')).toContainElement(screen.getByRole('tabpanel'));
        rerender(<Inspector variant="drawer" top={top} tabs={tabs} activeTab="plot" open={false} />);
        expect(screen.queryByRole('region', { name: 'Display' })).toBeNull();
        rerender(<Inspector variant="drawer" top={top} tabs={tabs} activeTab="plot" open />);
        expect(above(screen.getByRole('region', { name: 'Display' }), screen.getByRole('tablist', { name: 'Inspector' }))).toBe(true);
    });

    it('stacks its tabs as sections inside the phone sheet (ruling R7)', () => {
        render(<Inspector variant="stacked" tabs={tabs} />);
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot body');
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('data body');
    });
});
