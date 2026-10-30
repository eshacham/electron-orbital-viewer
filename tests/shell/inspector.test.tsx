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

    // Picture control 5b re-review N1: "Close panel" must not drop focus to the page either -- it returns focus to the
    // open tab's bar button, as Esc does.
    it('"Close panel" returns focus to the open tab\'s bar button', () => {
        const onOpenChange = jest.fn();
        render(<Inspector variant="drawer" sections={[plotAndData('data')]} open onOpenChange={onOpenChange} />);
        const close = screen.getByRole('button', { name: 'Close panel' });
        close.focus();
        fireEvent.click(close);
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Data panel' }));
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

        // F5: the drawer has no inner tab row, so focus starts on the section's header, inside the drawer's body -- not on
        // the bar, where it would land anyway.
        const inside = header('Plot and data');
        inside.focus();
        expect(document.activeElement).toBe(inside);
        // Already handled by a control inside the drawer (e.g. its own popup): not the drawer's.
        const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        handled.preventDefault();
        inside.dispatchEvent(handled);
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(inside);

        fireEvent.keyDown(inside, { key: 'Escape' });
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

    // Fix round 1 (R24-M4): the "never in a link" half is App's own test (encodeStateOf before and after);
    // nothing here writes a hash, so the hash assertion that stood here proved nothing and is gone.
    it('remembers the open section across a reload (eov.display) and keeps the other preferences', () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, showAxes: false, plotTab: 'rho' }); });
        const { unmount } = render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        fireEvent.click(header('Display'));
        // Ruling P9: DisplayPrefs gained moleculeLabels (default off), untouched here.
        expect(displayPref.get()).toEqual({ showAxes: false, plotTab: 'rho', inspectorOpen: 'display', moleculeLabels: false });
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

    // Ruling R24-M1: a stored section this mode does not have (Properties, from Molecules after Task 12) opens this
    // mode's default; the viewer's own "everything folded" stays folded wherever they go.
    it('falls back to the mode\'s default for a stored section it lacks, and keeps everything folded when that was the choice', () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, inspectorOpen: 'properties' }); });
        const { unmount } = render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'true');
        expect(header('Display')).toHaveAttribute('aria-expanded', 'false');
        unmount();
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, inspectorOpen: INSPECTOR_ALL_FOLDED }); });
        render(<Inspector variant="docked" sections={[displaySection, plotAndData()]} />);
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
        expect(header('Display')).toHaveAttribute('aria-expanded', 'false');
    });

    // Ruling R24-I1: whatever section is open inside the drawer (Display, or none), the bar button of the tab
    // that opened it stays expanded, closes the drawer in one click, and is where Esc puts focus back.
    it('keeps the opening bar button expanded and one click from closing the drawer, with Display or nothing open inside', () => {
        const onOpenChange = jest.fn();
        const { rerender } = render(<Inspector variant="drawer" sections={[displaySection, plotAndData('data')]} open={false} onOpenChange={onOpenChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        rerender(<Inspector variant="drawer" sections={[displaySection, plotAndData('data')]} open onOpenChange={onOpenChange} />);
        fireEvent.click(header('Display'));
        expect(screen.getByRole('region', { name: 'Display' })).toBeInTheDocument();
        const bar = screen.getByRole('button', { name: 'Data panel' });
        expect(bar).toHaveAttribute('aria-expanded', 'true');
        expect(document.getElementById(bar.getAttribute('aria-controls')!)).toContainElement(screen.getByRole('region', { name: 'Display' }));
        expect(screen.getByRole('button', { name: 'Plot panel' })).toHaveAttribute('aria-expanded', 'false');
        fireEvent.keyDown(header('Display'), { key: 'Escape' });
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
        expect(document.activeElement).toBe(bar);
        // Everything folded: still the same button, and one click closes.
        fireEvent.click(header('Display'));
        expect(screen.queryByRole('region')).toBeNull();
        expect(bar).toHaveAttribute('aria-expanded', 'true');
        onOpenChange.mockClear();
        fireEvent.click(bar);
        expect(onOpenChange).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
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
        expect(screen.getByRole('region', { name: 'Data panel' })).toHaveTextContent('data body');
        expect(screen.getByRole('button', { name: 'Data panel' })).toHaveAttribute('aria-expanded', 'true');
        // Inside the open drawer the accordion works as docked: Display opens, Plot and data folds, both headers stay.
        fireEvent.click(header('Display'));
        expect(screen.getByRole('region', { name: 'Display' })).toBeInTheDocument();
        expect(header('Plot and data')).toHaveAttribute('aria-expanded', 'false');
    });

    // Final polish F5: the open drawer's bar already says Plot . Data and drives the tab, so the section does not
    // repeat the row. It is not rendered (not merely hidden), so it also leaves the tab order.
    describe('the drawer shows Plot . Data once, in its bar (final polish F5)', () => {
        const withControl = [
            { key: 'plot', label: 'Plot', content: <button type="button">plot control</button> },
            { key: 'data', label: 'Data', content: <button type="button">data control</button> },
        ];
        const section = (activeTab = 'plot', onTab: (key: string) => void = jest.fn()) => ({ key: 'plot', title: 'Plot and data', tabs: withControl, activeTab, onTab });
        const tabbable = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]'))
            .filter(el => el.getAttribute('tabindex') !== '-1' && !(el as HTMLButtonElement).disabled);

        it('renders no inner tab row in the drawer, and the bar\'s tabs still switch the tab', () => {
            const onTab = jest.fn();
            const onOpenChange = jest.fn();
            render(<Inspector variant="drawer" sections={[section('plot', onTab)]} open onOpenChange={onOpenChange} />);
            expect(screen.queryByRole('tablist')).toBeNull();
            expect(screen.queryByRole('tab')).toBeNull();
            // The panel is still there, a region the bar's open tab names (not a tabpanel: no tab drives it).
            expect(screen.queryByRole('tabpanel')).toBeNull();
            expect(screen.getByRole('region', { name: 'Plot panel' })).toHaveTextContent('plot control');
            fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
            expect(onTab).toHaveBeenLastCalledWith('data');
        });

        it('shows the other tab\'s content when the bar moves to it, still with no inner row', () => {
            render(<Inspector variant="drawer" sections={[section('data')]} open onOpenChange={jest.fn()} />);
            expect(screen.queryByRole('tablist')).toBeNull();
            expect(screen.getByRole('region', { name: 'Data panel' })).toHaveTextContent('data control');
        });

        it('keeps the inner row in the docked and stacked variants', () => {
            const { unmount } = render(<Inspector variant="docked" sections={[section('plot')]} />);
            expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Plot', 'Data']);
            unmount();
            render(<Inspector variant="stacked" sections={[section('plot')]} />);
            // The phone sheet stacks the tabs as sections; it never had a tab row.
            expect(screen.getByRole('region', { name: 'Plot' })).toBeInTheDocument();
            expect(screen.queryByRole('tablist')).toBeNull();
        });

        it('opening Plot and data from Display (the accordion) shows its panel with no inner row either', () => {
            act(() => { displayPref.set({ ...DEFAULT_DISPLAY, inspectorOpen: 'display' }); });
            render(<Inspector variant="drawer" sections={[displaySection, section('plot')]} open onOpenChange={jest.fn()} />);
            expect(screen.queryByRole('region', { name: 'Plot panel' })).toBeNull();
            fireEvent.click(header('Plot and data'));
            expect(header('Display')).toHaveAttribute('aria-expanded', 'false');
            expect(screen.getByRole('region', { name: 'Plot panel' })).toHaveTextContent('plot control');
            expect(screen.queryByRole('tablist')).toBeNull();
        });

        it('keyboard: Tab from the bar\'s open tab goes through Close panel and the section header to the content, with no stop in between', () => {
            render(<Inspector variant="drawer" sections={[section('plot')]} open onOpenChange={jest.fn()} />);
            const aside = screen.getByRole('complementary', { name: 'Inspector' });
            const order = tabbable(aside).map(el => el.getAttribute('aria-label') ?? el.textContent);
            const from = order.indexOf('Plot panel');
            expect(order.slice(from)).toEqual(['Plot panel', 'Data panel', 'Close panel', 'Plot and data', 'plot control']);
        });
    });

    // Task 3 (picture control): a mode with no tabbed section can name one section (`barSection`, Bonds' Data) for the
    // drawer's bar: its one button opens the drawer on that section, in one press, rather than a lone "View settings".
    it("gives the bar one button for the named section, which opens the drawer on it and closes it again", () => {
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, inspectorOpen: 'display' }); });
        const onOpenChange = jest.fn();
        const sections = [displaySection, { key: 'data', title: 'Data', content: <p>data body</p> }];
        const { rerender } = render(<Inspector variant="drawer" sections={sections} barSection="data" open={false} onOpenChange={onOpenChange} />);
        expect(screen.queryByRole('button', { name: 'View settings' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
        expect(displayPref.get().inspectorOpen).toBe('data');
        rerender(<Inspector variant="drawer" sections={sections} barSection="data" open onOpenChange={onOpenChange} />);
        expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent('data body');
        // Ruling R24-I1, as for a tab's button: it reflects the open drawer, whatever section is open inside.
        fireEvent.click(header('Display'));
        expect(screen.getByRole('button', { name: 'Data panel' })).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
        // A named section the inspector lacks (Bonds at Basics, where Data is not shown) leaves the View button.
        rerender(<Inspector variant="drawer" sections={[displaySection]} barSection="data" open={false} onOpenChange={onOpenChange} />);
        expect(screen.getByRole('button', { name: 'View settings' })).toBeInTheDocument();
    });

    // Task 5b (picture control, finish fix 2; ruling): the open drawer's bar was a full-width, 56 px, selected-fill bar
    // with its label set vertically -- the loudest blue on screen (One Blue Voice). Open, it is a quiet horizontal label
    // on surface tokens: a surface-2 strip, text-2 ink, no accent fill. Folded, it is the edge bar as before. A shell
    // fix, so every mode's drawer; the one-press open and close and the accessible name are unchanged.
    describe('the open drawer bar is a quiet horizontal label (finish fix 2)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/shell/inspector.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = (selector: string) => {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
            if (!match) throw new Error(`No rule for ${selector}`);
            return match[2];
        };

        it('lays the open bar out as a surface-2 strip in a row, its labels horizontal in text-2', () => {
            const bar = rule('.inspector-drawer.open .inspector-bar');
            expect(bar).toMatch(/flex-direction:\s*row;/);
            expect(bar).toMatch(/background:\s*var\(--ql-color-surface-2\);/);
            const button = rule('.inspector-drawer.open .inspector-bar-button');
            expect(button).toMatch(/writing-mode:\s*horizontal-tb;/);
            expect(button).toMatch(/color:\s*var\(--ql-color-text-2\);/);
        });

        it('never fills a bar button with the selection blue', () => {
            const buttonRules = css.match(/[^{}]*\.inspector-bar-button[^{}]*\{[^}]*\}/g) ?? [];
            expect(buttonRules.length).toBeGreaterThan(0);
            for (const body of buttonRules) {
                expect(body).not.toMatch(/selected-fill|accent-fill|on-fill/);
            }
        });

        // Fix round 1 (ruling M1): a chevron after the open label read as a breadcrumb ("Plot › Data") or "go into
        // Data". The open tab is marked by a text-1 underline and weight 600 (no accent, no fill); a separate "Close
        // panel" control sits at the bar's far right; the tab's own one-press close and its name are kept.
        it('marks the open tab with a text-1 underline and weight 600, and no chevron between the labels', () => {
            const open = rule('.inspector-drawer.open .inspector-bar-button[aria-expanded="true"]');
            expect(open).toMatch(/color:\s*var\(--ql-color-text-1\);/);
            expect(open).toMatch(/font-weight:\s*600;/);
            expect(open).toMatch(/box-shadow:\s*inset 0 -2px 0 var\(--ql-color-text-1\);/);
            render(<Inspector variant="drawer" sections={[plotAndData('plot')]} open onOpenChange={jest.fn()} />);
            for (const name of ['Plot panel', 'Data panel']) {
                expect(screen.getByRole('button', { name }).querySelector('svg')).toBeNull();
            }
        });

        it('puts a separate "Close panel" control at the bar\'s far right, which closes the drawer in one press', () => {
            const onOpenChange = jest.fn();
            const { container } = render(<Inspector variant="drawer" sections={[plotAndData('data')]} open onOpenChange={onOpenChange} />);
            const close = screen.getByRole('button', { name: 'Close panel' });
            expect(container.querySelector('.inspector-bar')!.lastElementChild).toBe(close);
            expect(rule('.inspector-bar-close')).toMatch(/margin-inline-start:\s*auto;/);
            expect(rule('.inspector-bar-close')).not.toMatch(/accent|selected-fill|on-fill/);
            fireEvent.click(close);
            expect(onOpenChange).toHaveBeenLastCalledWith(false);
        });

        it('keeps the open tab one press from closing, under its own name', () => {
            const onOpenChange = jest.fn();
            const sections = [displaySection, { key: 'data', title: 'Data', content: <p>data body</p> }];
            render(<Inspector variant="drawer" sections={sections} barSection="data" open onOpenChange={onOpenChange} />);
            const button = screen.getByRole('button', { name: 'Data panel' });
            expect(button).toHaveTextContent('Data');
            expect(button).toHaveAttribute('aria-expanded', 'true');
            fireEvent.click(button);
            expect(onOpenChange).toHaveBeenLastCalledWith(false);
        });

        it('shows no Close panel control on the folded edge bar', () => {
            render(<Inspector variant="drawer" sections={[displaySection]} open={false} onOpenChange={jest.fn()} />);
            expect(screen.queryByRole('button', { name: 'Close panel' })).toBeNull();
        });
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

    // Task 4: Info is always open at the top of the inspector -- above the accordion, never one of its toggles.
    describe('the Info slot (Task 4)', () => {
        const info = <section aria-label="Info"><h2>Info</h2><p>info body</p></section>;
        const toggles = () => Array.from(document.querySelectorAll('.inspector-section-toggle')).map(toggle => toggle.textContent);
        const above = (a: HTMLElement, b: HTMLElement) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

        it('docked: renders Info above the accordion, not as a toggle', () => {
            render(<Inspector variant="docked" info={info} sections={[displaySection, plotAndData()]} />);
            const aside = screen.getByRole('complementary', { name: 'Inspector' });
            expect(within(aside).getByText('info body')).toBeInTheDocument();
            expect(above(within(aside).getByText('info body'), header('Display'))).toBe(true);
            expect(toggles()).toEqual(['Display', 'Plot and data']);
            // Folding every section leaves Info where it is.
            fireEvent.click(header('Plot and data'));
            expect(within(aside).getByText('info body')).toBeInTheDocument();
        });

        it('drawer: renders Info at the top of the open drawer, above the accordion', () => {
            render(<Inspector variant="drawer" info={info} sections={[displaySection, plotAndData()]} open onOpenChange={jest.fn()} />);
            expect(above(screen.getByText('info body'), header('Display'))).toBe(true);
            expect(toggles()).toEqual(['Display', 'Plot and data']);
        });

        it('stacked: renders Info first, above the stacked sections', () => {
            render(<Inspector variant="stacked" info={info} sections={[displaySection]} />);
            expect(above(screen.getByText('info body'), screen.getByRole('heading', { name: 'Display' }))).toBe(true);
            expect(toggles()).toEqual([]);
        });

        it('keeps Info compact: it never grows past part of the inspector and scrolls inside itself (Review Focus 4)', () => {
            const css = readFileSync(resolve(__dirname, '../../src/shell/inspector.css'), 'utf8');
            expect(css).toMatch(/\.inspector-info\s*\{[^}]*flex:\s*none;[^}]*max-height:\s*45%;[^}]*overflow-y:\s*auto;/);
        });
    });
});
