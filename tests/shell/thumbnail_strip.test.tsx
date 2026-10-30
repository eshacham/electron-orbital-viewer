import React, { useState } from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ThumbnailStrip, { tileBacking } from '../../src/shell/ThumbnailStrip';
import { atomStripItems, basicStripItems, type StripItem } from '../../src/thumbs/strip_items';
import { waterAtoms } from '../molecules/fixtures';
import { subshellLabel } from '../../src/atom/configurations';
import { thumbnailService, type ThumbHost } from '../../src/thumbs/ThumbnailService';
import { goldProfile, neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';
import { Provider } from 'react-redux';
import { createAppStore } from '../../src/store';
import { useAppSelector } from '../../src/store/hooks';
import { previewOpacity, setSurfaceStyle } from '../../src/store/orbitalSlice';
import { THUMB_TILE_PX, thumbLookKey, thumbTileDevicePx } from '../../src/thumbs/thumb_key';
import { CANVAS_BACKDROPS, SHADOWS, TOKENS, TYPE } from '../../src/design/tokens';
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { useDevicePixelRatio } from '../../src/thumbs/useDevicePixelRatio';
import { usePref } from '../../src/design/usePref';
import { GLOW_SETTLE_MS, glowOverridesOf, setGlowKnob, settledGlowPref } from '../../src/design/glow_pref';
import { seenText } from '../seen_text';

const profile = neonProfile();
const rGrid = Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
const items = atomStripItems({ profile, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

// Task 6 (ruling): orbital names are flat ("2pz orbital"), never "2p_z" -- a screen reader reads the underscore aloud.
describe('ThumbnailStrip (spec §9.1, §13)', () => {
    it('is a listbox of labelled options, grouped by subshell, the shown orbital selected', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const list = screen.getByRole('listbox', { name: 'orbitals in view' });
        expect(screen.getByRole('group', { name: '2p' })).toBeInTheDocument();
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(screen.getByRole('option', { name: '2pz orbital' })).toHaveAttribute('aria-selected', 'true');
        // Every tile but the back tile (an arrow) draws into its own 2D canvas -- never a WebGL one.
        expect(list.querySelectorAll('canvas.thumb-canvas')).toHaveLength(items.length - 1);
    });

    it('selects with a click or Enter, moves with the arrows, and folds to its handle', () => {
        const onSelect = jest.fn();
        const onCollapsedChange = jest.fn();
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={onSelect} onCollapsedChange={onCollapsedChange} />);
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        fireEvent.click(screen.getByRole('option', { name: '2px orbital' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        const selected = screen.getByRole('option', { name: '2pz orbital' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2px orbital' }));
        fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
        expect(onSelect).toHaveBeenLastCalledWith({ level: 'orbital', n: 2, l: 1, ml: 1 });
        // Ruling R23b-3: the handle's name is now "Hide orbitals" / "Show orbitals" (was "Hide/Show the orbital strip").
        fireEvent.click(screen.getByRole('button', { name: 'Hide orbitals' }));
        expect(onCollapsedChange).toHaveBeenCalledWith(true);
    });

    // Ruling R23b-3 (owner): the collapse/expand control names what it opens, visibly,
    // and its accessible name is exactly that visible text -- no aria-label divergence.
    it('shows the handle\'s action as visible text matching its accessible name', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} onCollapsedChange={jest.fn()} />);
        const handle = screen.getByRole('button', { name: 'Hide orbitals' });
        expect(handle).toHaveTextContent('Hide orbitals');
        // Final polish F2: the chevron is a hidden MUI icon (down open, up folded), never a "▾"/"▴" in the text.
        expect(handle.querySelector('svg[data-testid="ExpandMoreIcon"]')).toHaveAttribute('aria-hidden', 'true');
        expect(handle.textContent).toBe('Hide orbitals');
    });

    it('points the folded handle up with a hidden icon, its name unchanged', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} collapsed onCollapsedChange={jest.fn()} />);
        const handle = screen.getByRole('button', { name: 'Show orbitals' });
        expect(handle.querySelector('svg[data-testid="ExpandLessIcon"]')).toHaveAttribute('aria-hidden', 'true');
        expect(handle.textContent).toBe('Show orbitals');
    });

    // Controller ruling DX2: the listbox mounts only while expanded, so the
    // roving focus must re-attach to the new list after collapse -> expand.
    it('is one tab stop with working arrows again after a collapse and an expand', () => {
        function Controlled() {
            const [collapsed, setCollapsed] = useState(false);
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()}
                collapsed={collapsed} onCollapsedChange={setCollapsed} />;
        }
        render(<Controlled />);
        // Ruling R23b-3: the handle's name is now "Hide orbitals" / "Show orbitals" (was "Hide/Show the orbital strip").
        fireEvent.click(screen.getByRole('button', { name: 'Hide orbitals' }));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show orbitals' }));
        const options = screen.getAllByRole('option');
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(options.filter(option => option.tabIndex === 0)).toEqual([screen.getByRole('option', { name: '2pz orbital' })]);
        const selected = screen.getByRole('option', { name: '2pz orbital' });
        selected.focus();
        fireEvent.keyDown(selected, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('option', { name: '2px orbital' }));
    });

    // M6 (Task 1 review): `collapsible={false}` (Orbitals) had no unit test of its own, only through App --
    // the listbox always shows, and no handle renders, even while `collapsed` is true and `onCollapsedChange` is
    // given (the shared preference some other mode may have set, which Orbitals must still ignore).
    it('with collapsible={false}, the listbox always shows and no handle renders, even while collapsed', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()}
            collapsible={false} collapsed onCollapsedChange={jest.fn()} />);
        expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Hide orbitals' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show orbitals' })).not.toBeInTheDocument();
    });

    // Task 18's keyboard walk: Chrome moves its sequential focus starting point to
    // whatever scrollIntoView scrolls to, so the first Tab on a fresh page (and after
    // every pick) skipped the top bar, rail and Explore and landed after the strip.
    // The strip now scrolls its own list to centre the shown orbital (spec §13 order).
    it('centres the shown orbital by scrolling its own list, never through scrollIntoView', () => {
        const scrollIntoView = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
        const scrollTo = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('role') === 'listbox' ? 300 : 0;
        });
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 72, height: 72, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
            if (this.getAttribute('role') === 'listbox') return at(100, 300);
            if (this.getAttribute('aria-selected') === 'true') return at(600, 72);
            return at(0, 0);
        });
        try {
            render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
            expect(scrollIntoView).not.toHaveBeenCalled();
            // The tile starts 500 px into the list; centring 72 px in 300 px leaves 114 px before it.
            expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 386 }));
        } finally {
            rects.mockRestore();
            width.mockRestore();
            Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
            Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
        }
    });

    // Task 2 (picture control), opt-in: `groupScroll` (Orbitals only) adds the sideways scroll-snap classes and
    // the tonal cue's has-more-before/has-more-after (useMoreSideways); every other strip (Atoms, Bonds,
    // Molecules) never passes it, so none of these classes may appear there.
    it('with groupScroll, the list gets has-more-before/has-more-after and groups get strip-group-snap; without it, neither appears', () => {
        const { rerender } = render(
            <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} groupScroll />
        );
        const list = screen.getByRole('listbox', { name: 'orbitals in view' });
        expect(list).toHaveClass('group-scroll');
        expect(list).not.toHaveClass('has-more-before');
        expect(list).not.toHaveClass('has-more-after');
        for (const group of screen.getAllByRole('group')) expect(group).toHaveClass('strip-group-snap');

        Object.defineProperty(list, 'scrollWidth', { configurable: true, get: () => 800 });
        Object.defineProperty(list, 'clientWidth', { configurable: true, get: () => 300 });
        list.scrollLeft = 0;
        fireEvent.scroll(list);
        expect(list).toHaveClass('has-more-after');
        expect(list).not.toHaveClass('has-more-before');

        // M6 (Task 2 review, fix round 1): the strip-level test only ever saw has-more-after; scroll to the other
        // end and see has-more-before too (use_more_sideways.test.tsx already covers the hook's own formula).
        list.scrollLeft = 500; // 800 - 300 = 500: fully scrolled right.
        fireEvent.scroll(list);
        expect(list).toHaveClass('has-more-before');
        expect(list).not.toHaveClass('has-more-after');

        // Without groupScroll (every other strip): none of these classes appear, even with the same overflow.
        rerender(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const plain = screen.getByRole('listbox', { name: 'orbitals in view' });
        expect(plain).not.toHaveClass('group-scroll');
        Object.defineProperty(plain, 'scrollWidth', { configurable: true, get: () => 800 });
        Object.defineProperty(plain, 'clientWidth', { configurable: true, get: () => 300 });
        plain.scrollLeft = 0;
        fireEvent.scroll(plain);
        expect(plain).not.toHaveClass('has-more-before');
        expect(plain).not.toHaveClass('has-more-after');
        expect(screen.getAllByRole('group').some(group => group.classList.contains('strip-group-snap'))).toBe(false);
    });

    // Review Focus 2: n = 9 is 81 tiles (basicStripItems). The selected tile (here the very last one) must still
    // scroll into view (the existing effect above, unaffected by groupScroll) and the arrow keys and End must
    // still reach it.
    it('Review Focus 2: n = 9 (81 tiles), the selected last tile scrolls into view, and ArrowRight/End reach it', () => {
        const scrollTo = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('role') === 'listbox' ? 300 : 0;
        });
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 72, height: 72, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
            if (this.getAttribute('role') === 'listbox') return at(0, 300);
            if (this.getAttribute('aria-selected') === 'true') return at(6000, 72);
            return at(0, 0);
        });
        try {
            // Last in iteration order: n = 9, l = 8 (the highest subshell), mₗ = 8 (the highest within it).
            const n9 = basicStripItems({ n: 9, selected: { l: 8, ml: 8 }, enclosedFraction: 0.9 });
            expect(n9).toHaveLength(81);
            render(<ThumbnailStrip items={n9} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} groupScroll />);
            // M5 (Task 2 review, fix round 1): the exact value, as the sibling "centres the shown orbital" test
            // above asserts 386 -- 6000 − (300 − 72) / 2 = 5886.
            expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 5886 }));

            const options = screen.getAllByRole('option');
            expect(options).toHaveLength(81);
            options[0].focus();
            fireEvent.keyDown(options[0], { key: 'End' });
            expect(document.activeElement).toBe(options[options.length - 1]);

            options[options.length - 2].focus();
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
            expect(document.activeElement).toBe(options[options.length - 1]);
        } finally {
            rects.mockRestore();
            width.mockRestore();
            Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
        }
    });
});

// Task 5b (picture control, finish fix 7): the strip is Orbitals' picker, so its group labels are its menu's headings.
// Under `groupScroll` (Orbitals only) each label is sticky inside its group, just past the 24 px fade once the strip
// has scrolled, so the group on screen is always named; it is set in DESIGN.md's section type; and on a phone a long
// tile label breaks on purpose before "(" -- "9g" / "(mₗ = -2)" -- not mid-expression ("9g (mₗ =" / "-2)").
describe('the strip as a picker: its group labels and tile labels (finish fix 7)', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/strip.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (selector: string) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
        if (!match) throw new Error(`No rule for ${selector}`);
        return match[2];
    };

    it('keeps each group label in view inside its group, just past the fade once the strip has scrolled', () => {
        const label = rule('.strip-list.group-scroll .strip-group-label');
        expect(label).toMatch(/position:\s*sticky;/);
        expect(label).toMatch(/align-self:\s*flex-start;/);
        // At rest (nothing before) it stands where it is laid out; scrolled, just past the 24 px fade.
        expect(label).toMatch(/left:\s*0;/);
        // A sticky offset counts from inside the list's own 8 px padding (found live): 16 px puts the label at 24 px.
        expect(rule('.strip-list')).toMatch(/padding:\s*8px;/);
        expect(rule('.strip-list.group-scroll.has-more-before .strip-group-label')).toMatch(/left:\s*16px;/);
    });

    it('sets the group labels in section type, from tokens', () => {
        const label = rule('.strip-list.group-scroll .strip-group-label');
        expect(label).toMatch(/font:\s*var\(--ql-type-section-weight\) var\(--ql-type-section-size\) \/ var\(--ql-type-section-line\) var\(--ql-font-sans\);/);
        expect(label).toMatch(/color:\s*var\(--ql-color-text-1\);/);
        // Every other strip keeps its quiet labels.
        expect(rule('.strip-group-label')).toMatch(/font:\s*500 11px/);
    });

    it('breaks a long tile label before "(" and nowhere inside either part, under groupScroll only', () => {
        const n9 = basicStripItems({ n: 9, selected: { l: 4, ml: 0 }, enclosedFraction: 0.9 });
        const { rerender } = render(<ThumbnailStrip items={n9} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} variant="sheet" groupScroll />);
        // orbitalName writes mₗ's sign as the hyphen-minus it has always used (orbital_names.ts).
        const tile = screen.getByRole('option', { name: /^9g \(mₗ = -2\) orbital$/ });
        const parts = [...tile.querySelectorAll('.strip-tile-label .strip-tile-label-part')].map(part => part.textContent);
        expect(parts).toEqual(['9g', '(mₗ = -2)']);
        expect(tile.querySelector('.strip-tile-label')!.textContent).toBe('9g (mₗ = -2)');
        expect(rule('.strip-tile-label-part')).toMatch(/white-space:\s*nowrap;/);
        // A name with a subscript keeps its typeset label, whole.
        expect(screen.getByRole('option', { name: '9pz orbital' }).querySelector('.strip-tile-label-part')).toBeNull();
        rerender(<ThumbnailStrip items={n9} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} variant="sheet" />);
        expect(document.querySelector('.strip-tile-label-part')).toBeNull();
    });
});

// Task 5b (finish fix 8): under groupScroll a pick rests where a snap would -- its group's rest, shifted so the next
// group peeks -- when the picked tile is in clear view there; every other strip, and a tile that would not be, is
// centred as before (the Review Focus 2 test above: n = 9's last tile, wider than its group's rest shows).
describe('ThumbnailStrip: a pick rests where a snap does (finish fix 8)', () => {
    it("scrolls to the picked tile's group rest under groupScroll, and centres it without", () => {
        const scrollTo = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('role') === 'listbox' ? 763 : 0;
        });
        // n = 3: 3s, 3p, 3d. The list at x = 0, unscrolled; 3d's group from 400 to 812 with its middle tile at 560–632,
        // so 3d's rest is 376 and its clear view 400 … 1115 -- the next group? None: 3d is last, no shift.
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = (left: number, w: number) => ({ left, width: w, right: left + w, top: 0, bottom: 72, height: 72, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
            if (this.getAttribute('role') === 'listbox') return at(0, 763);
            if (this.getAttribute('aria-selected') === 'true') return at(560, 72);
            if (this.getAttribute('role') === 'group') {
                const label = this.getAttribute('aria-label') ?? '';
                return /3s/.test(label) ? at(8, 72) : /3p/.test(label) ? at(92, 296) : at(400, 412);
            }
            return at(0, 0);
        });
        try {
            const n3 = basicStripItems({ n: 3, selected: { l: 2, ml: 0 }, enclosedFraction: 0.9 });
            const { unmount } = render(<ThumbnailStrip items={n3} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} groupScroll />);
            expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 376 }));
            unmount();
            render(<ThumbnailStrip items={n3} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} />);
            // Centred: 560 − (763 − 72) / 2 = 214.5.
            expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 214.5 }));
        } finally {
            rects.mockRestore();
            width.mockRestore();
            Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
        }
    });
});

// Task 5b fix round 1 (review M3, M4): the shift lands on the right group's snap edge, a pick in a shifted group rests
// where a snap would (or at the group's own snap for a tile the shift would hide), the strip scrolls once on load, and
// a resize alone never scrolls it back to the selection.
describe('ThumbnailStrip: the peek, wired (fix round 1)', () => {
    // n = 3 in a 340 px view: 3s at 8–80, 3p at 92–360, 3d at 372–812. 3p's rest (68) is clear to 384 and 3d starts at
    // 372, short of it by 44 px of peek: 3p snaps on by 372 + 32 − 384 = 20. 3s already shows 3p; 3d is last.
    const boxes: Record<string, [number, number]> = { '3s': [8, 80], '3p': [92, 360], '3d': [372, 812] };
    const tiles: Record<string, [number, number]> = { '3py orbital': [92, 164], '3pz orbital': [180, 252], '3px orbital': [268, 340] };
    let scrollTo: jest.Mock;
    let width: jest.SpyInstance;
    let rects: jest.SpyInstance;
    const resizers: Array<() => void> = [];
    const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
        scrollTo = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
        width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.getAttribute('role') === 'listbox' ? 340 : 0;
        });
        rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const at = ([left, right]: [number, number]) => ({ left, right, width: right - left, top: 0, bottom: 90, height: 90, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
            if (this.getAttribute('role') === 'listbox') return at([0, 340]);
            if (this.getAttribute('role') === 'group') return at(boxes[this.getAttribute('aria-label') ?? ''] ?? [0, 0]);
            if (this.getAttribute('role') === 'option') return at(tiles[this.getAttribute('aria-label') ?? ''] ?? [0, 0]);
            return at([0, 0]);
        });
        resizers.length = 0;
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
            constructor(callback: () => void) { resizers.push(callback); }
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    });
    afterEach(() => {
        rects.mockRestore();
        width.mockRestore();
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver;
    });
    const strip = (ml: number) => (
        <ThumbnailStrip items={basicStripItems({ n: 3, selected: { l: 1, ml }, enclosedFraction: 0.9 })} label="orbitals in view" rGrid={[]}
            themeKey="dark|glow" onSelect={jest.fn()} groupScroll />
    );

    it("writes the shift on the shifted group's snap edge only", () => {
        render(strip(0));
        const margin = (name: string) => screen.getByRole('group', { name }).style.scrollMarginLeft;
        expect([margin('3s'), margin('3p'), margin('3d')]).toEqual(['', '-20px', '']);
    });

    it("rests a pick in the shifted group at its shifted rest, once, and a first tile the shift would hide at the group's own snap", () => {
        const { unmount } = render(strip(0));
        // 3pz (180–252) is clear of both fades at 68 + 20 = 88 (clear 112 … 404). One scroll on load, not two.
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 88 }));
        unmount();
        render(strip(-1));
        // 3py (92–164) starts under the shifted rest's left fade; at 3p's own snap, 68, it is clear from 92.
        expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 68 }));
    });

    it('does not scroll back to the selection on a resize alone, only when the selection changes', () => {
        const { rerender } = render(strip(0));
        const calls = scrollTo.mock.calls.length;
        // A resize that moves 3d on by 8 px: 3p's shift becomes 28, and the strip stays where the reader left it.
        boxes['3d'] = [380, 820];
        try {
            act(() => resizers.forEach(resize => resize()));
            expect(screen.getByRole('group', { name: '3p' }).style.scrollMarginLeft).toBe('-28px');
            expect(scrollTo.mock.calls.length).toBe(calls);
        } finally {
            boxes['3d'] = [372, 812];
        }
        rerender(strip(1));
        expect(scrollTo.mock.calls.length).toBe(calls + 1);
    });
});

// Controller ruling DC12 (spec §12: "On WebGL context loss, tiles show a
// glyph and their text label"): tiles already waiting for an image when the
// context goes must switch to their glyph, not stay blank.
describe('ThumbnailStrip on a lost WebGL context', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('turns tiles still waiting for their image into their glyph and label', () => {
        const host: ThumbHost = {
            // A worker that never answers: every orbital tile stays pending.
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: () => new Promise(() => {}),
        };
        thumbnailService.attach(host);
        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        act(() => { thumbnailService.tick(); });
        expect(container.querySelectorAll('.strip-tile-glyph')).toHaveLength(0);

        act(() => { thumbnailService.markLost(); });
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        const glyphs = [...container.querySelectorAll('.strip-tile-glyph')].map(glyph => seenText(glyph));
        expect(glyphs).toEqual(['2s', '2py', '2pz', '2px']);
        // Task 6 fix round 1 (M9): the fallback glyph is the name with a real subscript (OrbitalLabel), not flat text.
        expect([...container.querySelectorAll('.strip-tile-glyph sub')].map(sub => sub.textContent)).toEqual(['y', 'z', 'x']);
        // The text label under each tile stays, and so does each option's name.
        // Ruling T16-optname (spec §13): options are named "<label> orbital"; the brief pinned the bare label.
        expect(screen.getByRole('option', { name: '2py orbital' })).toHaveTextContent('2py');
    });
});

// Ruling T16-failtile: a job that fails -- here the worker's error reply --
// leaves its tile on the glyph and label, as a lost context does.
describe('ThumbnailStrip when a thumbnail cannot be made', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('shows the glyph and label of the tile whose job failed', () => {
        const workers: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = [];
        thumbnailService.attach({
            // Ruling T10-M7: a complete ThumbHost since Task 10 (this strip queues no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            createWorker: () => {
                const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
                workers.push(worker);
                return worker as unknown as Worker;
            },
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: () => new Promise(() => {}),
        });
        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        act(() => { thumbnailService.tick(); });
        expect(container.querySelectorAll('.strip-tile-glyph')).toHaveLength(0);
        act(() => { workers[0].onmessage!({ data: { type: 'error', message: 'no mesh' } }); });
        // The first job is 2s's; only its tile falls back, the others still wait.
        expect([...container.querySelectorAll('.strip-tile-glyph')].map(glyph => glyph.textContent)).toEqual(['2s']);
        expect(thumbnailService.status()).toBe('ready');
    });
});

// Preflight D15 (fixed in Task 10): shoot.mjs counts `data-drawn="true"` as
// "this tile's picture is showing". A tile still waiting for its image shows
// neither glyph nor picture, so it must not count -- it did, which made
// thumbsDrawn read "all drawn" the moment a strip appeared.
describe('ThumbnailStrip data-drawn (D15)', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('marks an orbital tile drawn only once its image has arrived; a ring glyph at once', async () => {
        const workers: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = [];
        thumbnailService.attach({
            createWorker: () => {
                const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
                workers.push(worker);
                return worker as unknown as Worker;
            },
            createGridWorker: () => { throw new Error('no grid tile here'); },
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: async () => ({ width: 72, height: 72 }),
        });
        const whole = atomStripItems({ profile, level: 'atom', selectedShell: null, selectedOrbital: null, enclosedFraction: 0.9, palette: CURVE_COLORS });
        const rings = render(<ThumbnailStrip items={whole} label="shells" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const ringCanvases = [...rings.container.querySelectorAll('canvas.thumb-canvas')];
        expect(ringCanvases.length).toBeGreaterThan(0);
        expect(ringCanvases.every(canvas => canvas.getAttribute('data-drawn') === 'true')).toBe(true);
        rings.unmount();

        const { container } = render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const drawnFlags = () => [...container.querySelectorAll('canvas.thumb-canvas')].map(canvas => canvas.getAttribute('data-drawn'));
        act(() => { thumbnailService.tick(); });
        expect(drawnFlags()).toEqual(['false', 'false', 'false', 'false']);
        act(() => { workers[0].onmessage!({ data: { type: 'success', meshData: { positions: [], cells: [], psiSigns: [] } } }); });
        await act(async () => { thumbnailService.tick(); await Promise.resolve(); await Promise.resolve(); });
        // The first job is 2s's: only its tile is drawn; the others still wait.
        expect(drawnFlags()).toEqual(['true', 'false', 'false', 'false']);
    });
});

// Ruling T10-I1: a 'pending' tile -- Bonds' strip while the next scan point's
// files load -- shows its glyph and label, asks the service for nothing, and
// does not count as drawn.
describe('ThumbnailStrip pending tiles (T10-I1)', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); });

    it('shows a pending tile\'s glyph and label and requests nothing for it', () => {
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false,
            themeKey: () => 'dark|glow',
            render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        try {
            const pending = items.slice(1).map(item => ({ ...item, thumb: { kind: 'pending' as const } }));
            const { container } = render(<ThumbnailStrip items={pending} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
            expect(request).not.toHaveBeenCalled();
            // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
            expect([...container.querySelectorAll('.strip-tile-glyph')].map(glyph => seenText(glyph))).toEqual(['2s', '2py', '2pz', '2px']);
            // Task 6 fix round 1 (M9): a pending tile's glyph has the real subscript too.
            expect(container.querySelectorAll('.strip-tile-glyph sub')).toHaveLength(3);
            expect([...container.querySelectorAll('canvas.thumb-canvas')].map(canvas => canvas.getAttribute('data-drawn'))).toEqual(['false', 'false', 'false', 'false']);
            expect(screen.getByRole('option', { name: '2pz orbital' })).toHaveAttribute('aria-selected', 'true');
        } finally {
            request.mockRestore();
        }
    });
});

// Ruling T16-spoken: under spin–orbit a group is a j-level; it reads
// "6p j = 3/2" to a screen reader and shows "6p³⁄₂". Bismuth-shaped: gold's
// fixture with its 6p split into j = 1/2 and 3/2, as Bi's valence 6p is.
describe('ThumbnailStrip under spin–orbit (bismuth)', () => {
    const bismuth = { ...goldProfile('spinOrbit', { j: true }), Z: 83, speciesKey: '83' };
    const biGrid = Array.from({ length: bismuth.size }, (_, j) => bismuth.rMin * Math.exp(j * bismuth.dx));
    const biItems = atomStripItems({ profile: bismuth, level: 'orbital', selectedShell: 6, selectedOrbital: { n: 6, l: 1, ml: 0, j: 1.5 }, enclosedFraction: 0.9, palette: CURVE_COLORS });

    it('names each j-level group in its spoken form, shows the j-label, and opens the j-level\'s own orbital', () => {
        const onSelect = jest.fn();
        render(<ThumbnailStrip items={biItems} label="orbitals in view" rGrid={biGrid} themeKey="dark|glow" onSelect={onSelect} />);
        const half = screen.getByRole('group', { name: '6p j = 1/2' });
        const threeHalves = screen.getByRole('group', { name: '6p j = 3/2' });
        expect(half).toHaveTextContent(subshellLabel(6, 1, 0.5));
        expect(threeHalves).toHaveTextContent(subshellLabel(6, 1, 1.5));
        expect(screen.getByRole('option', { name: '6pz orbital of 6p j = 3/2' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: '6pz orbital of 6p j = 1/2' })).toHaveAttribute('aria-selected', 'false');
        fireEvent.click(screen.getByRole('option', { name: '6px orbital of 6p j = 1/2' }));
        expect(onSelect).toHaveBeenCalledWith({ level: 'orbital', n: 6, l: 1, ml: 1, j: 0.5 });
        const tile = biItems.find(item => item.spoken === '6px orbital of 6p j = 1/2')!;
        expect(tile.thumb.kind === 'orbital' && tile.thumb.request.contentKey).toBe('83|spinOrbit|6|1|1|0.5|0.9');
    });
});

// Ruling R20a-4: a tile's canvas holds its CSS size in device pixels. Ruling R20d: exactly that, on a
// 1× screen too (was at least 2×, which the browser then shrank), so the tile's bitmap -- made at the
// same device size -- is drawn 1:1 and shown unscaled.
describe('tileBacking', () => {
    it('is the tile in device pixels, the size of the bitmap it is given', () => {
        expect(tileBacking(72, 1)).toBe(72);
        expect(tileBacking(72, 2)).toBe(144);
        expect(tileBacking(72, 3)).toBe(216);
        expect(tileBacking(56, 3)).toBe(168);
        expect(tileBacking(56, Number.NaN)).toBe(56);
        for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) expect(tileBacking(THUMB_TILE_PX, dpr)).toBe(thumbTileDevicePx(dpr));
    });
});

// Fix round 1 of Task 20a (R20a-4): the tiles follow the main view's opacity, but only as committed --
// a slider drag (previewOpacity) re-requests nothing; its release (setSurfaceStyle) re-requests every tile.
describe('ThumbnailStrip and the committed opacity', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); jest.restoreAllMocks(); });

    it('re-requests the tiles once a new opacity is committed, and not on drag ticks', () => {
        const store = createAppStore();
        const look = { theme: 'dark' as const, finish: 'glow' as const, lowPower: false };
        const keyNow = () => thumbLookKey({ appearance: look, opacity: store.getState().orbital.thumbOpacity, size: 288 });
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: keyNow, render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        function Strip() {
            const opacity = useAppSelector(state => state.orbital.thumbOpacity);
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} onSelect={jest.fn()}
                themeKey={thumbLookKey({ appearance: look, opacity, size: 288 })} />;
        }
        render(<Provider store={store}><Strip /></Provider>);
        const orbitalTiles = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(request).toHaveBeenCalledTimes(orbitalTiles);
        // Ruling R22a: the look key has no scheme field (was dark|phase|glow|...). R24-1: the default opacity is 0.9 (was 0.7).
        expect(keyNow()).toBe('dark|glow|full|288|0.9');

        act(() => { [0.65, 0.5, 0.4].forEach(value => store.dispatch(previewOpacity(value))); });
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.4);
        expect(request).toHaveBeenCalledTimes(orbitalTiles);

        act(() => { store.dispatch(setSurfaceStyle({ opacity: 0.4 })); });
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
        expect(keyNow()).toBe('dark|glow|full|288|0.4');
    });
});

// Task 16b ("Advanced appearance"): the viewer's own Glow values are part of the tiles' look, but as SETTLED
// (settledGlowPref) -- a slider drag asks the service for nothing; GLOW_SETTLE_MS after it rests, every tile
// is asked for once, under a key that names the new values.
describe('ThumbnailStrip and the viewer\'s own Glow values', () => {
    afterEach(() => { act(() => { thumbnailService.detach(); }); jest.restoreAllMocks(); jest.useRealTimers(); window.localStorage.clear(); });

    it('re-requests the tiles once a slider has rested, and never while it is dragged', () => {
        jest.useFakeTimers();
        const look = { theme: 'dark' as const, finish: 'glow' as const, lowPower: false };
        const keys: string[] = [];
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: () => keys.at(-1)!, render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        function Strip() {
            const glow = glowOverridesOf(usePref(settledGlowPref), 'dark');
            const key = thumbLookKey({ appearance: { ...look, glow }, opacity: 0.9, size: 72 });
            keys.push(key);
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} onSelect={jest.fn()} themeKey={key} />;
        }
        render(<Strip />);
        const orbitalTiles = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(request).toHaveBeenCalledTimes(orbitalTiles);
        expect(keys.at(-1)).toBe('dark|glow|full|72|0.9');

        // A drag: ticks 50 ms apart, then held still for less than the settle time.
        for (const value of [0.8, 0.9, 1.0, 1.1, 1.2]) {
            act(() => { setGlowKnob('dark', 'rimStrength', value); jest.advanceTimersByTime(50); });
        }
        act(() => { jest.advanceTimersByTime(GLOW_SETTLE_MS - 51); });
        expect(request).toHaveBeenCalledTimes(orbitalTiles);
        expect(keys.at(-1)).toBe('dark|glow|full|72|0.9');

        act(() => { jest.advanceTimersByTime(1); });
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
        expect(keys.at(-1)).toBe('dark|glow|full|72|0.9|glow:rimStrength=1.2');
    });
});

// Fix round 1 of Task 20d: a tile's bitmap is made at the screen's device size, so moving the window to a
// screen with another ratio (or zooming the page) must re-request every tile in the new size.
describe('ThumbnailStrip and the device pixel ratio', () => {
    const listeners = new Set<() => void>();
    let ratio = 1;
    beforeEach(() => {
        ratio = 1;
        listeners.clear();
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => ratio });
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: (query: string) => ({
                matches: query === `(resolution: ${ratio}dppx)`, media: query,
                addEventListener: (_: string, listener: () => void) => listeners.add(listener),
                removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
            }),
        });
    });
    afterEach(() => { act(() => { thumbnailService.detach(); }); jest.restoreAllMocks(); });
    const changeRatio = (next: number) => act(() => { ratio = next; [...listeners].forEach(listener => listener()); });

    it('re-requests every tile, at the new bitmap size, when the ratio changes', () => {
        const look = { theme: 'dark' as const, finish: 'glow' as const, lowPower: false };
        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: () => thumbLookKey({ appearance: look, opacity: 0.7, size: thumbTileDevicePx(ratio) }),
            render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        function Strip() {
            const dpr = useDevicePixelRatio();
            return <ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} onSelect={jest.fn()}
                themeKey={thumbLookKey({ appearance: look, opacity: 0.7, size: thumbTileDevicePx(dpr) })} />;
        }
        const { container } = render(<Strip />);
        const orbitalTiles = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(request).toHaveBeenCalledTimes(orbitalTiles);
        expect((container.querySelector('canvas.thumb-canvas') as HTMLCanvasElement).width).toBe(72);

        changeRatio(1.5);
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
        expect((container.querySelector('canvas.thumb-canvas') as HTMLCanvasElement).width).toBe(108);
        changeRatio(1.5);
        expect(request).toHaveBeenCalledTimes(2 * orbitalTiles);
    });
});

// Ruling R20d: labels one step larger, and the selected tile clearly marked -- the concept's selected 2p_z tile.
describe('strip tile styles (ruling R20d)', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/strip.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (selector: string) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
        if (!match) throw new Error(`No rule for ${selector}`);
        return match[2];
    };
    const rgb = (hex: string) => parseCssColor(hex).slice(0, 3) as [number, number, number];

    it('sets tile labels at the body size from tokens (13 px, was the 12 px caption)', () => {
        expect(rule('.strip-tile-label')).toMatch(/font:\s*500 var\(--ql-type-body-size\) \/ var\(--ql-size-thumb-label\)/);
        expect(TYPE.body.size).toBe(13);
        expect(TYPE.body.size).toBeGreaterThan(TYPE.caption.size);
    });

    // Fix round 1 of Task 20d (§4.3 "On a phone, body is 14"): the sheet's labels are 14 px, and a long one
    // ("Whole atom") wraps to two centred lines rather than running past its 56 px tile; every sheet label
    // keeps two lines' height, so the tile images stay in one row.
    it('sets the phone sheet\'s labels at 14 px, wrapping to two centred lines', () => {
        const sheet = rule('.thumbnail-strip.sheet .strip-tile-label');
        expect(sheet).toMatch(/font-size:\s*14px/);
        expect(sheet).toMatch(/white-space:\s*normal/);
        expect(sheet).toMatch(/text-align:\s*center/);
        expect(sheet).toMatch(/max-width:\s*var\(--ql-size-thumb\)/);
        const line = Number(/line-height:\s*(\d+)px/.exec(sheet)![1]);
        expect(line).toBeGreaterThanOrEqual(14);
        expect(sheet).toMatch(new RegExp(`height:\\s*${2 * line}px`));
        expect(sheet).not.toMatch(/text-overflow|overflow:\s*hidden/);
    });

    // Task 15: the Molecules strip's word labels ("Electrostatic potential") wrap to two centred lines in a column
    // a little wider than the tile -- one line each widened the columns until eight tiles ran off the canvas.
    it('wraps a wrap-labels overlay strip\'s labels to two centred lines, a little wider than the tile', () => {
        const wrapped = rule('.thumbnail-strip.overlay.wrap-labels .strip-tile-label');
        expect(wrapped).toMatch(/white-space:\s*normal/);
        expect(wrapped).toMatch(/text-align:\s*center/);
        expect(wrapped).toMatch(/height:\s*calc\(2 \* var\(--ql-size-thumb-label\)\)/);
        expect(wrapped).toMatch(/max-width:\s*calc\(var\(--ql-size-thumb\) \+ 16px\)/);
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} wrapLabels />);
        expect(screen.getByRole('listbox', { name: 'orbitals in view' }).closest('.thumbnail-strip')).toHaveClass('wrap-labels');
    });

    // Ruling R23b-3 (owner): the handle names what it opens; its accessible name
    // is exactly the visible label (the chevron stays aria-hidden), set in caption size from tokens.
    it('sets the strip handle\'s text label at caption size from tokens', () => {
        expect(rule('.strip-handle-label')).toMatch(/font:\s*var\(--ql-type-caption-weight\) var\(--ql-type-caption-size\) \/ var\(--ql-type-caption-line\) var\(--ql-font-sans\)/);
    });

    it('rings the selected tile in a 2 px selected-edge, with a soft glow of that hue in Deep Space only (§4.6)', () => {
        expect(rule('.strip-tile.selected .strip-tile-image::after')).toMatch(/border:\s*2px solid var\(--ql-color-selected-edge\)/);
        expect(rule('.strip-tile.selected .strip-tile-image')).toMatch(/box-shadow:\s*var\(--ql-shadow-selected-tile\)/);
        const [r, g, b] = rgb(TOKENS.dark['selected-edge']);
        expect(SHADOWS.dark['selected-tile']).toContain(`rgba(${r},${g},${b},`);
        expect(SHADOWS.light['selected-tile']).toBe('none');
    });

    // §13: the selected edge is a control edge in its selected state, >= 3:1 against the tile and the canvas behind it.
    it('keeps the selected ring at 3:1 or better against the tile and the canvas, in both themes', () => {
        for (const mode of ['dark', 'light'] as const) {
            const edge = rgb(TOKENS[mode]['selected-edge']);
            for (const behind of [TOKENS[mode]['surface-2'], ...CANVAS_BACKDROPS[mode].slice(0, 2)]) {
                expect(contrastRatio(edge, rgb(behind))).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it('draws the tile edge over a picture that spans the whole tile, so the canvas is never scaled', () => {
        expect(rule('.strip-tile-image canvas')).toMatch(/position:\s*absolute;\s*inset:\s*0;\s*width:\s*100%;\s*height:\s*100%/);
        expect(rule('.strip-tile-image')).not.toMatch(/(^|;)\s*border:/);
        expect(rule('.strip-tile-image::after')).toMatch(/border:\s*1px solid var\(--ql-color-border-subtle\)/);
    });
});

// Task 8: StripItem<T>/ThumbnailStrip<T> are generic over what a tile
// dispatches -- NavigationTarget by default (every test above), or (Basic
// Orbitals' own strip) a plain BasicSelection with no `level` field at all.
// This is as much a compile-time check (onSelect below is typed
// `(target: BasicSelection) => void`, inferred from `items`) as a runtime
// one: the strip's own behaviour -- listbox, groups, option names, clicks --
// does not change for a T other than NavigationTarget.
describe('ThumbnailStrip<T> (Task 8): generic over the dispatched target', () => {
    it('renders and dispatches a non-NavigationTarget T (BasicSelection) exactly as it does NavigationTarget', () => {
        const basicItems = basicStripItems({ n: 3, selected: { l: 2, ml: 0 }, enclosedFraction: 0.9 });
        const onSelect = jest.fn();
        render(<ThumbnailStrip items={basicItems} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={onSelect} />);
        expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: '3d' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '3dz² orbital' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('option', { name: '3px orbital' }));
        expect(onSelect).toHaveBeenCalledWith({ n: 3, l: 1, ml: 1 });
    });

    // Task 5: Orbitals' tiles print the orbital's name with a real subscript (OrbitalLabel), not "3d_z²".
    it('labels Orbitals\' tiles with real subscripts', () => {
        const basicItems = basicStripItems({ n: 3, selected: { l: 2, ml: 0 }, enclosedFraction: 0.9 });
        render(<ThumbnailStrip items={basicItems} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} />);
        const label = screen.getByRole('option', { name: '3dz² orbital' }).querySelector('.strip-tile-label')!;
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(label).toHaveSeenText(/^3dz²$/);
        expect(label.querySelector('sub')).toHaveTextContent('z²');
    });

    // Task 8 (addendum 7, 9): a Bonds or Molecules tile named by its MO label typesets it -- 1π<sub>u</sub>, 1b<sub>1</sub>.
    it('labels MO tiles with real subscripts', () => {
        const moItems = [
            { ...items[0], key: 'mo-a', label: '1πu', spoken: '1πu orbital', orbital: undefined },
            { ...items[0], key: 'mo-b', label: '1b1', spoken: '1b1 orbital', orbital: undefined, selected: false },
        ];
        render(<ThumbnailStrip items={moItems} label="orbitals in view" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} />);
        const label = (name: string) => screen.getByRole('option', { name }).querySelector('.strip-tile-label')!.innerHTML;
        expect(label('1πu orbital')).toContain('1π<sub>u</sub>');
        expect(label('1b1 orbital')).toContain('1b<sub>1</sub>');
    });

    // Task 6: the Atom strip's tiles too -- "2p" with a real subscript z, never "2p_z".
    it('labels Atoms\' orbital tiles with real subscripts', () => {
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);
        const label = screen.getByRole('option', { name: '2pz orbital' }).querySelector('.strip-tile-label')!;
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(label).toHaveSeenText(/^2pz$/);
        expect(label.querySelector('sub')).toHaveTextContent('z');
        expect(screen.getByRole('listbox').textContent).not.toContain('_');
    });
});

// Controller preflight D15/Step 1: §12 "only tiles in view are requested" --
// the IntersectionObserver gating itself. jsdom has no IntersectionObserver
// at all (the other tests above rely on that absence, which falls back to
// requesting at once -- see ThumbnailStrip.tsx's `typeof IntersectionObserver
// === 'undefined'` branch), so proving the gating needs a real stand-in that
// never reports an intersection.
describe('ThumbnailStrip visibility gating (spec §12, D15 Step 1)', () => {
    const originalIntersectionObserver = (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    afterEach(() => {
        (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = originalIntersectionObserver;
        act(() => { thumbnailService.detach(); });
    });

    it('does not request an off-screen tile\'s picture, and requests it once it is reported on screen', () => {
        const observed: Element[] = [];
        // One real observer per tile (ThumbnailStrip.tsx constructs its own): capture every
        // callback, keyed by the canvas it watches, so each tile can be reported separately.
        const callbacks = new Map<Element, IntersectionObserverCallback>();
        class NeverIntersectingObserver {
            private cb: IntersectionObserverCallback;
            constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
            observe(el: Element) { observed.push(el); callbacks.set(el, this.cb); }
            unobserve() {}
            disconnect() {}
            takeRecords() { return []; }
        }
        (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NeverIntersectingObserver;

        thumbnailService.attach({
            createWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            // Ruling T10-M7: a complete ThumbHost since Task 10 (these strips queue no grid job).
            createGridWorker: () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker,
            isBusy: () => false, themeKey: () => 'dark|glow', render: () => new Promise(() => {}),
        });
        const request = jest.spyOn(thumbnailService, 'request');
        render(<ThumbnailStrip items={items} label="orbitals in view" rGrid={rGrid} themeKey="dark|glow" onSelect={jest.fn()} />);

        // Every orbital tile's canvas was handed to its own observer; none has been asked for yet.
        const orbitalTileCount = items.filter(item => item.thumb.kind === 'orbital').length;
        expect(observed.length).toBe(orbitalTileCount);
        expect(request).not.toHaveBeenCalled();

        // Report just the first tile's canvas on screen: only that one tile is requested.
        const [firstCanvas] = observed;
        act(() => { callbacks.get(firstCanvas)!([{ isIntersecting: true, target: firstCanvas } as IntersectionObserverEntry], {} as IntersectionObserver); });
        expect(request).toHaveBeenCalledTimes(1);

        // The rest stay off-screen, and unrequested.
        for (const canvas of observed.slice(1)) {
            act(() => { callbacks.get(canvas)!([{ isIntersecting: false, target: canvas } as IntersectionObserverEntry], {} as IntersectionObserver); });
        }
        expect(request).toHaveBeenCalledTimes(1);
    });
});

// Task 15 (ruling P6): the Molecules strip's structure tiles are Canvas-2D glyphs of the molecule
// (structure_glyph.ts), drawn at once like a ring glyph, in the theme's colours; "Orbital list" (owner R25-A2's
// name for "All orbitals") is an icon tile.
describe('ThumbnailStrip structure and icon tiles (Task 15)', () => {
    type Target = { pick: string };
    const water = waterAtoms();
    const molecule: StripItem<Target>[] = [
        { key: 'ball', label: 'Ball and stick', spoken: 'Ball and stick structure', group: null, groupSpoken: null, target: { pick: 'ball' }, selected: true,
            thumb: { kind: 'structure', atoms: water, representation: 'ball-and-stick' } },
        { key: 'space', label: 'Space filling', spoken: 'Space filling structure', group: null, groupSpoken: null, target: { pick: 'space' }, selected: false,
            thumb: { kind: 'structure', atoms: water, representation: 'space-filling' } },
        { key: 'all', label: 'Orbital list', spoken: 'Orbital list — go to the list', group: null, groupSpoken: null, target: { pick: 'all' }, selected: false,
            thumb: { kind: 'icon' } },
    ];
    afterEach(() => { jest.restoreAllMocks(); });

    it('draws each structure tile\'s glyph at once, marks it drawn, and redraws it in the other theme\'s colours', () => {
        const strokes: string[] = [];
        const ctx = {
            fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: 'butt',
            clearRect: jest.fn(), beginPath: jest.fn(), arc: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), fill: jest.fn(),
            stroke: jest.fn(function (this: { strokeStyle: string }) { strokes.push(ctx.strokeStyle); }),
            // Task 16d item 3: the glyph shades its discs and sticks with gradients (structure_glyph.test.ts checks them).
            createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
        };
        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as RenderingContext);
        // (The visibility test above leaves its spy in place; start this count from zero.)
        const request = jest.spyOn(thumbnailService, 'request');
        request.mockClear();
        const { container, rerender } = render(<ThumbnailStrip items={molecule} label="views of this molecule" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()} />);
        // Two water glyphs: three atoms each; ball and stick's two bonds as four half-sticks on two outlines, space filling none.
        expect(ctx.arc).toHaveBeenCalledTimes(6);
        expect(ctx.lineTo).toHaveBeenCalledTimes(6);
        expect(strokes).toContain(TOKENS.dark['text-3']);
        expect(request).not.toHaveBeenCalled();
        expect([...container.querySelectorAll('canvas.thumb-canvas')].map(canvas => canvas.getAttribute('data-drawn'))).toEqual(['true', 'true']);
        strokes.length = 0;
        rerender(<ThumbnailStrip items={molecule} label="views of this molecule" rGrid={[]} themeKey="light|glow" onSelect={jest.fn()} />);
        expect(strokes).toContain(TOKENS.light['text-3']);
        expect(strokes).not.toContain(TOKENS.dark['text-3']);
    });

    it('shows the icon tile as a three-circle picture with its label, and forwards its target', () => {
        const onSelect = jest.fn();
        const { container } = render(<ThumbnailStrip items={molecule} label="views of this molecule" rGrid={[]} themeKey="dark|glow" onSelect={onSelect} />);
        const option = screen.getByRole('option', { name: 'Orbital list — go to the list' });
        expect(option.querySelector('canvas')).toBeNull();
        const icon = option.querySelector('svg.strip-tile-icon') as SVGElement;
        expect(icon).toHaveAttribute('aria-hidden', 'true');
        expect(icon.querySelectorAll('circle')).toHaveLength(3);
        expect(option).toHaveTextContent('Orbital list');
        fireEvent.click(option);
        expect(onSelect).toHaveBeenCalledWith({ pick: 'all' });
        expect(container.querySelectorAll('canvas.thumb-canvas')).toHaveLength(2);
    });

    // Ruling R23b-3: the handle names what it opens -- here the molecule's views, not "orbitals".
    it('names its handle for what the strip holds', () => {
        render(<ThumbnailStrip items={molecule} label="views of this molecule" rGrid={[]} themeKey="dark|glow" onSelect={jest.fn()}
            onCollapsedChange={jest.fn()} handleNoun="views" />);
        expect(screen.getByRole('button', { name: 'Hide views' })).toHaveTextContent('Hide views');
    });
});

// 6G-2 Task 17 fix (Fail 3): at medium width (tablet) the strip ran 29 px under the folded inspector drawer bar,
// clipping the last tile's label. Ruling DB3 already pulls the toolbar and the key column in by the bar's width;
// the strip joins that rule (jsdom does no layout: shoot.mjs's `overlaps.strip` is the live proof, 0 px).
describe('strip at medium width (ruling DB3, Task 17 fix)', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/viewport.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    it('clears the folded drawer bar as the toolbar and the key column do', () => {
        const match = /([^{}]*\.app-shell\.medium \.thumbnail-strip\.overlay[^{}]*)\{([^}]*)\}/.exec(css);
        expect(match).not.toBeNull();
        const selectors = match![1].split(',').map(s => s.trim());
        expect(selectors).toEqual(expect.arrayContaining([
            '.app-shell.medium .viewport-toolbar', '.app-shell.medium .key-column', '.app-shell.medium .thumbnail-strip.overlay',
        ]));
        expect(match![2]).toMatch(/right:\s*calc\(var\(--ql-size-inspector-bar\) \+ 12px\);/);
    });

    it('outranks the strip\'s own 12 px right inset (strip.css)', () => {
        const strip = readFileSync(resolve(__dirname, '../../src/shell/strip.css'), 'utf8');
        // `.thumbnail-strip.overlay` (two classes) sets right: 12px; the medium rule (four classes) wins wherever both apply.
        expect(strip).toMatch(/\.thumbnail-strip\.overlay \{[^}]*right: 12px;/);
    });
});
