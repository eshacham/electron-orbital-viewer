// Brass Instrument Task 4: the engraved graticule and the selection audit -- read from the CSS source, like
// final_polish_css.test.ts and serif_signature.test.ts.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');
/** Every declaration block whose selector list contains `selector` exactly, joined. */
function rulesOf(text: string, selector: string): string {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const found: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    for (let match = pattern.exec(stripped); match; match = pattern.exec(stripped)) {
        if (match[1].split(',').map(part => part.trim()).includes(selector)) found.push(match[2]);
    }
    return found.join(' ');
}
const EDGE = 'var(--ql-color-selected-edge)';
const RING = 'var(--ql-shadow-selected)'; // 0 0 0 1px selected-edge (tokens.ts SHADOWS)

describe('the engraved scale bar (graticule)', () => {
    const style = src('style.css');

    it('is a 1 px accent rule, 8 px end ticks and 4 px graduations, all in the accent', () => {
        expect(rulesOf(style, '.scale-readout-bar')).toMatch(/border-bottom:\s*1px solid var\(--ql-color-accent\)/);
        expect(rulesOf(style, '.scale-readout-bar')).toMatch(/height:\s*9px/); // the 9 px the old bracket took: no layout moves
        expect(rulesOf(style, '.scale-tick')).toMatch(/width:\s*1px/);
        expect(rulesOf(style, '.scale-tick')).toMatch(/background:\s*var\(--ql-color-accent\)/);
        expect(rulesOf(style, '.scale-tick-end')).toMatch(/height:\s*8px/);
        expect(rulesOf(style, '.scale-tick-graduation')).toMatch(/height:\s*4px/);
    });

    it('sets the label in text-1, the same size as before', () => {
        const readout = rulesOf(style, '.scale-readout');
        expect(readout).toMatch(/color:\s*var\(--ql-color-text-1\)/);
        expect(readout).toMatch(/font-size:\s*14px/);
        expect(rulesOf(style, '.scale-readout-label')).not.toMatch(/color:/); // inherits text-1
    });

    // Finish ruling F8: the graticule sits straight on the field -- no card (no fill, no visible border, no shadow) --
    // and keeps its box (padding and a transparent 1 px border), so its camera-inset zone and position do not move.
    it('sits straight on the field: no card, the same box', () => {
        const readout = rulesOf(style, '.scale-readout');
        expect(readout).toMatch(/background:\s*none/);
        expect(readout).toMatch(/border:\s*1px solid transparent/);
        expect(readout).not.toMatch(/surface-|border-subtle|box-shadow/);
        expect(readout).toMatch(/padding:\s*10px 14px 8px/);
    });

    it('puts the ticks on whole pixels from the DOM (no percentage left, no margin nudge)', () => {
        expect(rulesOf(style, '.scale-tick-end:last-child')).toBe('');
        expect(rulesOf(style, '.scale-tick')).not.toMatch(/%/);
    });

    it('leaves no 2 px text-1 bracket on the bar', () => {
        expect(rulesOf(style, '.scale-readout-bar')).not.toMatch(/2px solid/);
        expect(rulesOf(style, '.scale-readout-bar')).not.toMatch(/text-1/);
    });
});

// Selection is never carried by a fill alone: each selected state also shows the brass edge (selected-edge) -- tabs a
// 2 px underline, toggles and chips a 1 px edge, the strip tile a 2 px ring.
describe('every selected state shows the brass edge, not the fill alone', () => {
    it('panel tabs and mode tabs: a 2 px selected-edge underline', () => {
        const tabs = src('shell/tabs.css');
        const underline = rulesOf(tabs, '.ql-tab[aria-selected="true"]::after');
        expect(underline).toMatch(/height:\s*2px/);
        expect(underline).toMatch(new RegExp(`background:\\s*${EDGE.replace(/[()]/g, '\\$&')}`));
        const bar = src('shell/top_bar.css');
        const mode = rulesOf(bar, '.app-topbar-tab[aria-current="page"]::after');
        expect(mode).toMatch(/height:\s*2px/);
        expect(mode).toContain(`background: ${EDGE}`);
        // The phone's sheet tabs mark the selected one with a 2 px top edge.
        const phone = src('style.css');
        expect(rulesOf(phone, '.phone-sheet-tab')).toMatch(/border-top:\s*2px solid transparent/);
        expect(rulesOf(phone, '.phone-sheet-tab[aria-selected="true"]')).toContain(`border-top-color: ${EDGE}`);
    });

    it('the phone\'s mode menu item: the selected-edge border and ring', () => {
        const item = rulesOf(src('shell/rail.css'), '.app-rail-item[aria-pressed="true"]');
        expect(item).toContain(`border-color: ${EDGE}`);
        expect(item).toContain(`box-shadow: ${RING}`);
    });

    it('the strip tile: a 2 px selected-edge ring', () => {
        expect(rulesOf(src('shell/strip.css'), '.strip-tile.selected .strip-tile-image::after')).toMatch(new RegExp(`border:\\s*2px solid ${EDGE.replace(/[()]/g, '\\$&')}`));
    });

    // Ruling T4-b: a selected chip is the selected-fill tint with on-fill ink and the selected-edge ring -- never MUI's
    // solid accent fill, which is the same brass as the edge (the ring would not show). Each rule below would fail on
    // an accent (or accent-fill) background.
    it('the chips: selected-fill background, on-fill ink and the selected ring, never the accent fill', () => {
        const style = src('style.css');
        for (const chip of ['.level-nav-shell-chip', '.subshell-chip', '.molecule-category-chip']) {
            for (const state of ['.selected', '.selected:hover', '.selected.Mui-focusVisible']) {
                const rule = rulesOf(style, `${chip}${state}`);
                expect([`${chip}${state}`, rule]).toEqual([`${chip}${state}`, expect.stringMatching(/background:\s*var\(--ql-color-selected-fill\) !important/)]);
                expect(rule).toContain('color: var(--ql-color-on-fill)');
                expect(rule).toContain(`box-shadow: ${RING}`);
                expect(rule).not.toMatch(/accent/);
            }
        }
        expect(rulesOf(style, '.level-nav-shell-chip.selected .MuiChip-deleteIcon')).toContain('color: var(--ql-color-on-fill)');
        expect(rulesOf(src('basic_ui/basic_explore.css'), '.basic-chip.selected')).toMatch(/background:\s*var\(--ql-color-selected-fill\)/);
        expect(rulesOf(src('basic_ui/basic_explore.css'), '.basic-chip.selected')).toContain(`border: 1px solid ${EDGE}`);
        expect(rulesOf(src('admin/admin.css'), '.admin-chips .admin-chip.is-selected')).toContain(`border-color: ${EDGE}`);
    });

    // Ruling T4-c: the keyboard-active option (aria-selected, not hover) wears the 2 px selected-edge marker.
    it('the keyboard-active search option: a 2 px inset selected-edge marker, on aria-selected only', () => {
        const search = src('shell/search.css');
        expect(rulesOf(search, '.global-search-option[aria-selected="true"]')).toContain(`box-shadow: inset 2px 0 0 ${EDGE}`);
        expect(rulesOf(search, '.global-search-option:hover')).not.toMatch(/box-shadow/);
    });

    it('the magnetic-number buttons: the selected ring besides the tint', () => {
        expect(rulesOf(src('style.css'), '.subshell-ml-button.selected')).toContain(`box-shadow: ${RING}`);
    });

    it('the MO level buttons: a selected-edge border (not the fill\'s colour) and the ring', () => {
        const box = rulesOf(src('style.css'), '.mo-box.selected');
        expect(box).toContain(`border-color: ${EDGE}`);
        expect(box).toContain(`box-shadow: ${RING}`);
        expect(box).not.toMatch(/border-color:\s*var\(--ql-color-selected-fill\)/);
    });

    it('the orbital rows and the level control\'s options (bar and phone menu): the selected edge', () => {
        expect(rulesOf(src('style.css'), '.molecule-orbital-row.selected')).toContain(`border-color: ${EDGE}`);
        const levels = rulesOf(src('levels/levels.css'), '.level-control-option.checked');
        expect(levels).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--ql-color-selected-edge\)/);
    });

    it('the periodic table tiles: the selected ring', () => {
        expect(rulesOf(src('style.css'), '.periodic-tile.selected')).toContain(`box-shadow: 0 0 0 2px ${EDGE}`);
        expect(rulesOf(src('atom_ui/periodic_table_mini.css'), '.periodic-table-mini-cell.selected')).toContain(`box-shadow: 0 0 0 1px ${EDGE}`);
    });

    it('the pressed (i): the selected-edge border, over the fill', () => {
        const info = src('info/info.css');
        expect(rulesOf(info, '.info-button')).toMatch(/border:\s*1\.5px solid/);
        expect(rulesOf(info, '.info-button.is-active')).toContain(`border-color: ${EDGE}`);
    });
});

// Parked from Task 2: the title is set once, at the token size (17/24); nothing sets a 14 px title over it.
describe('Info\'s title keeps its token size', () => {
    it('has no .info-title rule that sets 14 px', () => {
        for (const file of ['info/info.css', 'style.css', 'shell/inspector.css', 'shell/viewport.css', 'design/design.css']) {
            expect(rulesOf(src(file), '.info-title')).not.toMatch(/font-size:\s*14px/);
            expect(rulesOf(src(file), '.info-title')).not.toMatch(/font:\s*[^;]*14px/);
        }
    });
});

// Finish ruling F5: the browser's own surfaces take the world, as /admin.html's do: a text selection in the selected
// fill with text-1, the caret in the accent, scrollbars in border-strong on a transparent track -- in each scope.
describe('the browser\'s surfaces in the viewer', () => {
    const style = src('style.css');
    it('selects text in the selected fill and text-1', () => {
        const selection = rulesOf(style, '::selection');
        expect(selection).toMatch(/background:\s*var\(--ql-color-selected-fill\)/);
        expect(selection).toMatch(/color:\s*var\(--ql-color-text-1\)/);
    });
    it('draws the caret in the accent and the scrollbars in border-strong on transparent, in every scope', () => {
        for (const selector of [':root', '[data-theme]']) {
            const rule = rulesOf(style, selector);
            expect([selector, rule]).toEqual([selector, expect.stringMatching(/caret-color:\s*var\(--ql-color-accent\)/)]);
            expect([selector, rule]).toEqual([selector, expect.stringMatching(/scrollbar-color:\s*var\(--ql-color-border-strong\) transparent/)]);
        }
    });
});

// Finish ruling F6: Molecules' Selection slot draws no empty track. While nothing is hovered or picked the readout has
// no fill and no visible border, and keeps one line's height, so nothing moves when it fills. No placeholder copy.
describe('the empty Selection readout', () => {
    const style = src('style.css');
    it('draws no track while empty and keeps its one-line height', () => {
        const empty = rulesOf(style, '.molecule-readout:empty');
        expect(empty).toMatch(/background:\s*none/);
        expect(empty).toMatch(/border-color:\s*transparent/);
        expect(empty).toMatch(/min-height:\s*1lh/);
        expect(empty).not.toMatch(/content:/);
    });
    // Finish verdict: the heading must not sit over blank space -- the slot reads its state, drawn but not spoken
    // (empty alt text), and never repeats the field's "Hover or tap" hint.
    it('reads "Nothing selected" in text-3, unspoken, and not the hint', () => {
        const before = rulesOf(style, '.molecule-readout:empty::before');
        expect(before).toMatch(/content:\s*"Nothing selected"\s*\/\s*""/);
        expect(before).toMatch(/color:\s*var\(--ql-color-text-3\)/);
        expect(before).not.toMatch(/Hover|tap/i);
    });
});

// DESIGN.md's No Shouting rule (brass documenter): no uppercase labels and no tracking anywhere in the viewer's chrome.
describe('no shouting', () => {
    it('sets no uppercase and no letter-spacing in the viewer and search sheets', () => {
        for (const sheet of ['style.css', 'shell/search.css']) {
            const css = src(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
            expect(css).not.toMatch(/text-transform:\s*uppercase/);
            expect(css).not.toMatch(/letter-spacing:\s*0\.0[1-9]em/);
        }
    });
});
