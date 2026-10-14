import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Inspector, { InspectorDisplay } from '../../src/shell/Inspector';
import { DEFAULT_DISPLAY, displayPref } from '../../src/design/presentation';

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

// Ruling T20b-display-header: the view settings get a visible "Display" heading and fold, so the plot can be
// brought above the fold on a short window. The choice is a presentation preference in eov.display.
describe('InspectorDisplay', () => {
    afterEach(() => { act(() => { displayPref.set(DEFAULT_DISPLAY); }); window.localStorage.clear(); });

    it('heads the settings with a Display heading whose button discloses them, expanded by default', () => {
        render(<InspectorDisplay><button type="button">surface opacity</button></InspectorDisplay>);
        const region = screen.getByRole('region', { name: 'Display' });
        const heading = within(region).getByRole('heading', { name: 'Display' });
        expect(heading).toHaveClass('ql-section');
        const toggle = within(heading).getByRole('button', { name: 'Display' });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(within(region).getByRole('button', { name: 'surface opacity' })).toBeInTheDocument();
        expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toContainElement(screen.getByRole('button', { name: 'surface opacity' }));
    });

    it('collapsing hides the settings and is remembered across a reload (eov.display)', () => {
        const { unmount } = render(<InspectorDisplay><button type="button">surface opacity</button></InspectorDisplay>);
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: 'surface opacity' })).toBeNull();
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toMatchObject({ displayOpen: false });
        unmount();

        render(<InspectorDisplay><button type="button">surface opacity</button></InspectorDisplay>);
        expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: 'surface opacity' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        expect(screen.getByRole('button', { name: 'surface opacity' })).toBeInTheDocument();
    });

    it('keeps the other display preferences when it folds', () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, showAxes: false, plotTab: 'rho' }); });
        render(<InspectorDisplay><p>settings</p></InspectorDisplay>);
        fireEvent.click(screen.getByRole('button', { name: 'Display' }));
        expect(displayPref.get()).toEqual({ showAxes: false, plotTab: 'rho', displayOpen: false });
    });

    // Ruling R23b-2 (owner): disclosure chevrons follow convention -- expanded
    // points up (the action is "collapse"), collapsed points down (the action
    // is "expand"). ExpandMore's own, unrotated direction already points down,
    // so only the expanded state needs a rotation, to 180deg (was rotating the
    // collapsed state to -90deg, pointing sideways instead of down).
    it('points the Display chevron down when collapsed and up when expanded', () => {
        const css = readFileSync(resolve(__dirname, '../../src/shell/inspector.css'), 'utf8');
        expect(css).toMatch(/\.inspector-display-toggle\[aria-expanded="true"\]\s*\.inspector-display-chevron\s*\{\s*transform:\s*rotate\(180deg\);\s*\}/);
        expect(css).not.toMatch(/\[aria-expanded="false"\]\s*\.inspector-display-chevron/);
    });
});
