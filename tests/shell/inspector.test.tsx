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
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });

    it('stacks its tabs as sections inside the phone sheet (ruling R7)', () => {
        render(<Inspector variant="stacked" tabs={tabs} />);
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot body');
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('data body');
    });
});
