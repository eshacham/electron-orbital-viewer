import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Inspector from '../../src/shell/Inspector';
import { DEFAULT_DISPLAY, displayPref, INSPECTOR_ALL_FOLDED } from '../../src/design/presentation';

const tabs = [{ key: 'plot', label: 'Plot', content: <p>plot body</p> }, { key: 'data', label: 'Data', content: <p>data body</p> }];

// Ruling R24-3: every section is a titled header; the Plot | Data tabs live inside "Plot and data".
const plotAndData = (activeTab = 'plot', onTab: (key: string) => void = jest.fn()) => ({ key: 'plot', title: 'Plot and data', tabs, activeTab, onTab });
const displaySection = { key: 'display', title: 'Display', content: <button type="button">surface opacity</button> };
const header = (name: string) => screen.getByRole('button', { name });

describe('Inspector (spec §8.6, §7 tablet)', () => {
    afterEach(() => { act(() => { displayPref.set(DEFAULT_DISPLAY); }); window.localStorage.clear(); });

    // Ruling R24-3: the tabs sit inside the titled "Plot and data" section (were the inspector's own top row).
    it('docks as the view panel with Plot and Data tabs', () => {
        const onTab = jest.fn();
        render(<Inspector variant="docked" sections={[plotAndData('plot', onTab)]} />);
        const aside = screen.getByRole('complementary', { name: 'Inspector' });
        expect(aside).toHaveClass('view-panel');
        expect(screen.getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('plot body');
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        expect(onTab).toHaveBeenCalledWith('data');
    });

    // Ruling R24-3: the body is a titled section now (was a bare `body`).
    it('folds to a bar at medium width, opens over the view, and Esc closes it', () => {
        const onOpenChange = jest.fn();
        const sections = [{ key: 'display', title: 'Display', content: <p>settings</p> }];
        const { rerender } = render(<Inspector variant="drawer" sections={sections} open={false} onOpenChange={onOpenChange} />);
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveClass('folded');
        fireEvent.click(screen.getByRole('button', { name: 'View settings' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        rerender(<Inspector variant="drawer" sections={sections} open onOpenChange={onOpenChange} />);
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
                <Inspector variant="drawer" sections={[plotAndData('data')]} open onOpenChange={onOpenChange} />
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

    // Final review B, M6: the drawer bar buttons had aria-expanded but no aria-controls,
    // so assistive tech had no way to jump straight to the panel a button opened.
    it('points the open drawer bar button at the panel it opened with aria-controls', () => {
        render(<Inspector variant="drawer" sections={[plotAndData('data')]} open onOpenChange={jest.fn()} />);
        const button = screen.getByRole('button', { name: 'Data panel' });
        const controls = button.getAttribute('aria-controls');
        expect(controls).toBeTruthy();
        expect(document.getElementById(controls!)).toContainElement(screen.getByText('data body'));
    });

    // Ruling R7; R24-3: the phone sheet shares the component, so each section gets its title, all open.
    it('stacks its tabs as sections inside the phone sheet, under the section title (ruling R7)', () => {
        render(<Inspector variant="stacked" sections={[plotAndData()]} />);
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Plot and data' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Plot' })).toHaveTextContent('plot body');
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('data body');
    });
});

// Ruling R24-3 (owner: "there is no way to know the other panel is closed"): every section is a titled
// accordion header, one open at a time; folded headers stay visible above and below the open one.
describe('Inspector sections (ruling R24-3)', () => {
    afterEach(() => { act(() => { displayPref.set(DEFAULT_DISPLAY); }); window.localStorage.clear(); });
    const above = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('titles every section with an h2 header button and opens the content section by default', () => {
        render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        const display = within(screen.getByRole('heading', { name: 'Display' })).getByRole('button', { name: 'Display' });
        const plot = within(screen.getByRole('heading', { name: 'Plot and data' })).getByRole('button', { name: 'Plot and data' });
        expect(screen.getByRole('heading', { name: 'Display' })).toHaveClass('ql-section');
        expect(above(display, plot)).toBe(true);
        expect(display).toHaveAttribute('aria-expanded', 'false');
        expect(display).not.toHaveAttribute('aria-controls');
        expect(plot).toHaveAttribute('aria-expanded', 'true');
        const region = screen.getByRole('region', { name: 'Plot and data' });
        expect(document.getElementById(plot.getAttribute('aria-controls')!)).toBe(region);
        expect(region).toContainElement(screen.getByRole('tabpanel'));
        expect(screen.queryByRole('button', { name: 'surface opacity' })).toBeNull();
    });

    it('opens one section at a time, keeps every header visible and focus on the header', () => {
        render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        header('Display').focus();
        fireEvent.click(header('Display'));
        expect(header('Display')).toHaveAttribute('aria-expanded', 'true');
        expect(document.activeElement).toBe(header('Display'));
        expect(screen.getByRole('region', { name: 'Display' })).toContainElement(screen.getByRole('button', { name: 'surface opacity' }));
        // The other section folds, but its header is still there, below the open one.
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('tabpanel')).toBeNull();
        expect(above(screen.getByRole('region', { name: 'Display' }), header('Plot and data'))).toBe(true);
        fireEvent.click(header('Plot and data'));
        expect(header('Display')).toHaveAttribute('aria-expanded', 'false');
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.queryByRole('region', { name: 'Display' })).toBeNull();
    });

    it('remembers the open section across a reload (eov.display), never in a link, and keeps the other preferences', () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, showAxes: false, plotTab: 'rho' }); });
        const { unmount } = render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        fireEvent.click(header('Display'));
        expect(displayPref.get()).toEqual({ showAxes: false, plotTab: 'rho', inspectorOpen: 'display' });
        expect(window.location.hash).not.toMatch(/display|inspector/);
        unmount();
        render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        expect(header('Display')).toHaveAttribute('aria-expanded', 'true');
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
    });

    it('folds the open section on a second press, leaving every header folded, and remembers that', () => {
        const { unmount } = render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        fireEvent.click(header('Plot and data'));
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
        expect(header('Display')).toHaveAttribute('aria-expanded', 'false');
        expect(displayPref.get().inspectorOpen).toBe(INSPECTOR_ALL_FOLDED);
        unmount();
        render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        expect(screen.queryByRole('region')).toBeNull();
    });

    it('migrates a stored displayOpen: true to an open Display section', () => {
        window.localStorage.setItem('eov.display', '{"showAxes":true,"plotTab":"distribution","displayOpen":true}');
        render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        expect(header('Display')).toHaveAttribute('aria-expanded', 'true');
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens the only section where Display is all there is (Molecules), and a stored section it lacks falls back to it', () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, inspectorOpen: 'plot' }); });
        render(<Inspector variant="docked" sections={[displaySection]} />);
        expect(header('Display')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('region', { name: 'Display' })).toBeInTheDocument();
    });

    it('opens the drawer from its bar at the tabbed section and that tab, folding Display', () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, inspectorOpen: 'display' }); });
        const onTab = jest.fn();
        const onOpenChange = jest.fn();
        const { rerender } = render(<Inspector variant="drawer" sections={[displaySection, plotAndData('plot', onTab)]} open={false} onOpenChange={onOpenChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
        expect(onTab).toHaveBeenLastCalledWith('data');
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        expect(displayPref.get().inspectorOpen).toBe('plot');
        rerender(<Inspector variant="drawer" sections={[displaySection, plotAndData('data', onTab)]} open onOpenChange={onOpenChange} />);
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'true');
        expect(header('Display')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('data body');
        expect(screen.getByRole('button', { name: 'Data panel' })).toHaveAttribute('aria-expanded', 'true');
        // Inside the open drawer the accordion works as docked: Display opens, Plot and data folds, both headers stay.
        fireEvent.click(header('Display'));
        expect(screen.getByRole('region', { name: 'Display' })).toBeInTheDocument();
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
    });

    // The open section fills what is left of the inspector and scrolls inside itself, so the headers never scroll away.
    it('lets the open section fill the remaining height and scroll inside itself', () => {
        const css = readFileSync(resolve(__dirname, '../../src/shell/inspector.css'), 'utf8');
        expect(css).toMatch(/\.inspector-section-body\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
        expect(css).toMatch(/\.inspector-section-heading\s*\{[^}]*flex:\s*none;/);
    });

    // Ruling R23b-2 (owner): disclosure chevrons follow convention -- expanded points up, collapsed down.
    // R24-3: every section header uses it (was the Display header's own class).
    it('points every header chevron down when collapsed and up when expanded', () => {
        const css = readFileSync(resolve(__dirname, '../../src/shell/inspector.css'), 'utf8');
        expect(css).toMatch(/\.inspector-section-toggle\[aria-expanded="true"\]\s*\.inspector-section-chevron\s*\{\s*transform:\s*rotate\(180deg\);\s*\}/);
        expect(css).not.toMatch(/\[aria-expanded="false"\]\s*\.inspector-section-chevron/);
    });
});
