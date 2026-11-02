// Hallmark audit, states: every custom interactive element shows a pressed (:active) step, a disabled look, and a 44 px
// hit area -- read from the source, so a rule dropped from a stylesheet fails here.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TEMPER_LEVELS, THEME_MODES } from '../../src/design/tokens';

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
/** Every declaration block whose selector list contains `selector` exactly. */
function rulesOf(text: string, selector: string): string[] {
    const found: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    const clean = withoutComments(text);
    for (let match = pattern.exec(clean); match; match = pattern.exec(clean)) {
        if (match[1].split(',').map(part => part.trim().replace(/\s+/g, ' ')).includes(selector)) found.push(match[2]);
    }
    return found;
}
const body = (path: string, selector: string) => rulesOf(read(path), selector).join(' ');

/** The pressed rule of each custom control: its stylesheet, the :active selector and the fill it steps to. */
const PRESSED: Array<[file: string, selector: string, fill: RegExp]> = [
    ['src/shell/strip.css', '.strip-tile:active .strip-tile-image', /--strip-tile-base:\s*var\(--ql-color-surface-3\)/],
    ['src/shell/strip.css', '.strip-handle:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/style.css', '.level-nav-shell-chip:not(.selected):active', /background:\s*var\(--ql-color-surface-3\) !important/],
    ['src/style.css', '.subshell-chip:not(.selected):active', /background:\s*var\(--ql-color-surface-3\) !important/],
    ['src/style.css', '.molecule-category-chip:not(.selected):active', /background:\s*var\(--ql-color-surface-3\) !important/],
    ['src/style.css', '.basic-chip:not(.selected):active', /background:\s*var\(--ql-color-surface-3\) !important/],
    ['src/info/info.css', '.info-button:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/atom_ui/element_tile.css', '.element-tile:active', /background:\s*var\(--ql-color-selected-fill\)/],
    ['src/atom_ui/periodic_table_mini.css', '.periodic-table-mini:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/style.css', '.periodic-tile:active', /filter:\s*brightness\(1\.2\)/],
    ['src/style.css', '.mo-box:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/info/info.css', '.info-back:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/shell/inspector.css', '.inspector-section-toggle:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/shell/inspector.css', '.inspector-bar-button:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/shell/inspector.css', '.inspector-bar-close:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/shell/search.css', '.global-search-option:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/shell/rail.css', '.app-rail-item:active', /background-color:\s*var\(--ql-color-surface-3\)/],
    ['src/shell/tabs.css', '.ql-tab:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/shell/top_bar.css', '.app-topbar-tab:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/shell/top_bar.css', '.app-topbar-brand:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/levels/levels.css', '.level-control-option:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/levels/levels.css', '.level-line-action:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/components/advanced_appearance.css', '.advanced-appearance-toggle:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/shell/viewport.css', '.viewport-toolbar .MuiIconButton-root:active', /background:\s*var\(--ql-color-surface-3\)/],
    ['src/style.css', 'details > summary:active', /background:\s*var\(--ql-color-surface-2\)/],
    ['src/admin/admin.css', '.admin-disclosure:active', /background:\s*var\(--ql-color-surface-3\)/],
];

describe('pressed: one tonal step, instantly, in tokens, never a size or a position change', () => {
    it.each(PRESSED)('%s: %s', (file, selector, fill) => {
        const rule = body(file, selector);
        expect(rule).toMatch(fill);
        // Every colour is a token: no hex or rgb literal.
        expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
        // Never a size or position change, and instant (the rule is no transition but `none`, where it names one).
        expect(rule).not.toMatch(/(^|[;\s])(width|height|min-width|min-height|padding|margin|top|left|right|bottom|transform|scale|translate|border-width)\s*:/);
        if (/transition/.test(rule)) expect(rule).toMatch(/transition:\s*none/);
    });

    it('the panel separator holds its brass line while pressed, as on hover', () => {
        expect(body('src/shell/app_shell.css', '.inspector-resizer:active::before')).toMatch(/background:\s*var\(--ql-color-selected-edge\)/);
    });

    // A selected control keeps its selected look and darkens its tint one step: selected-fill-active.
    it.each([
        ['src/style.css', '.level-nav-shell-chip.selected:active'],
        ['src/style.css', '.subshell-chip.selected:active'],
        ['src/style.css', '.molecule-category-chip.selected:active'],
        ['src/style.css', '.basic-chip.selected:active'],
        ['src/style.css', '.mo-box.selected:active'],
        ['src/levels/levels.css', '.level-control-option.checked:active'],
        ['src/shell/rail.css', '.app-rail-item[aria-pressed="true"]:active'],
        ['src/atom_ui/periodic_table_mini.css', '.periodic-table-mini[aria-expanded="true"]:active'],
        ['src/shell/search.css', '.global-search-option[aria-selected="true"]:active'],
        ['src/shell/tabs.css', '.ql-tab[aria-selected="true"]:active'],
        ['src/shell/top_bar.css', '.app-topbar-tab[aria-current="page"]:active'],
        ['src/admin/admin.css', '.admin-chips .admin-chip.is-selected:active'],
    ])('%s: %s darkens the selected tint', (file, selector) => {
        const rule = body(file, selector);
        expect(rule).toMatch(/var\(--ql-color-selected-fill-active\)/);
        expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    });

    it('a selected strip tile keeps its 2 px selected edge: only an unselected tile\'s edge firms', () => {
        const strip = read('src/shell/strip.css');
        expect(body('src/shell/strip.css', '.strip-tile:active:not(.selected) .strip-tile-image::after')).toMatch(/border-color:\s*var\(--ql-color-border-strong\)/);
        expect(strip).not.toMatch(/\.strip-tile\.selected:active[^{]*::after/);
        // ... and its ground takes the selected tint one step darker.
        const ground = body('src/shell/strip.css', '.strip-tile.selected:active .strip-tile-image');
        expect(ground).toMatch(/--strip-tile-base:\s*var\(--ql-color-selected-fill-active\)/);
        expect(ground).toMatch(/--strip-tile-lift:\s*var\(--ql-color-selected-fill-active\)/);
    });

    it('a selected chip holds its 1 px selected ring while pressed (MUI swaps in an elevation shadow otherwise)', () => {
        expect(body('src/style.css', '.basic-chip.selected:active')).toMatch(/box-shadow:\s*var\(--ql-shadow-selected\)/);
    });

    it('a selected periodic tile steps its brightness down one step, from 1.6 to 1.4', () => {
        expect(body('src/style.css', '.periodic-tile.selected:active')).toMatch(/filter:\s*brightness\(1\.4\)/);
    });

    it('the (i) held while on (aria-pressed) darkens its solid brass disc, in tokens', () => {
        const rule = body('src/info/info.css', '.info-button.is-active:active');
        expect(rule).toMatch(/color-mix\(in oklch, var\(--ql-color-accent-fill\) \d+%, var\(--ql-color-canvas-solid\)\)/);
    });

    it('an MUI control keeps MUI\'s ripple: no rule here switches it off', () => {
        const all = ['src/style.css', 'src/shell/viewport.css', 'src/design/design.css'].map(read).join('\n');
        expect(all).not.toMatch(/disableRipple|TouchRipple|\.MuiTouchRipple-root\s*\{[^}]*display:\s*none/);
    });
});

describe('selected-fill-active is a generated role in every block', () => {
    it('is emitted in each mode block, each temper and each field block (2 + 8 + 2)', () => {
        const css = read('src/design/tokens.css');
        expect(css.match(/--ql-color-selected-fill-active:/g)).toHaveLength(THEME_MODES.length + THEME_MODES.length * TEMPER_LEVELS.length + THEME_MODES.length);
    });
});

describe('disabled: text-3 ink, no hover or press, a default cursor', () => {
    const css = withoutComments(read('src/design/design.css'));
    const block = /:is\(([^)]*)\):is\(:disabled, \[aria-disabled="true"\]\)\s*\{([^}]*)\}/.exec(css);

    it('is one rule over the :disabled and [aria-disabled="true"] states of the custom buttons', () => {
        expect(block).not.toBeNull();
        const selectors = block![1].split(',').map(part => part.trim());
        for (const selector of [
            '.strip-handle', '.strip-tile', '.info-button', '.info-back', '.mo-box', '.periodic-tile', '.periodic-table-mini', '.element-tile',
            '.level-control-option', '.inspector-section-toggle', '.inspector-bar-button', '.inspector-bar-close',
            '.advanced-appearance-toggle', '.level-line-action', '.ql-tab', '.app-rail-item', '.global-search-option',
        ]) expect(selectors).toContain(selector);
    });
    it('sets text-3 and a default cursor', () => {
        expect(block![2]).toMatch(/color:\s*var\(--ql-color-text-3\) !important/);
        expect(block![2]).toMatch(/cursor:\s*default/);
    });
    // Final review M7 (controller ruling): a disabled control still takes the pointer, so the native title tooltip that
    // says why it is disabled still shows on hover.
    it('still takes the pointer, so a title tooltip saying why it is disabled shows', () => {
        expect(block![2]).not.toMatch(/pointer-events/);
    });
});

describe('the 44 px hit area', () => {
    const css = read('src/design/design.css');
    const SELECTORS = [
        '.strip-handle', '.app-topbar-brand', '.level-control-option', '.inspector-section-toggle', 'details > summary',
        '.info-back', '.advanced-appearance-toggle', '.ql-icon-button', '.info-button', '.ql-hit-area',
    ];
    /** Every selector in a ::before rule that draws the floor. */
    const floored = (() => {
        const found: string[] = [];
        const pattern = /([^{}]+)\{([^{}]*)\}/g;
        const clean = withoutComments(css);
        for (let match = pattern.exec(clean); match; match = pattern.exec(clean)) {
            if (/width:\s*max\(100%,\s*var\(--ql-size-touch\)\)/.test(match[2])) {
                found.push(...match[1].split(',').map(part => part.trim().replace(/\s+/g, ' ')));
            }
        }
        return found;
    })();

    it.each(SELECTORS)('%s: positioned, with a transparent ::before floored at the touch size', selector => {
        expect(rulesOf(css, selector).join(' ')).toMatch(/position:\s*relative/);
        const before = rulesOf(css, `${selector}::before`).join(' ');
        expect(before).toMatch(/content:\s*''/);
        expect(before).toMatch(/width:\s*max\(100%,\s*var\(--ql-size-touch\)\)/);
        expect(before).toMatch(/height:\s*max\(100%,\s*var\(--ql-size-touch\)\)/);
        // Centred, so the visual box does not move; transparent, so nothing is drawn.
        expect(before).toMatch(/top:\s*50%/);
        expect(before).toMatch(/left:\s*50%/);
        expect(before).toMatch(/translate\(-50%,\s*-50%\)/);
        expect(before).not.toMatch(/background|border|box-shadow/);
    });

    // A dense field keeps its own size: 44 px would cover the control beside it (the MO diagram's levels are 4 px apart).
    it.each(['.mo-box', '.periodic-tile', '.molecule-category-chip', '.inspector-resizer'])('%s is not given a floor, which would overlap its neighbours', selector => {
        expect(rulesOf(css, `${selector}::before`)).toEqual([]);
    });

    // Final review I1: a class-wide MUI selector (.MuiButton-sizeSmall) gave a floor to every small button, measured or
    // not -- and a wrapped row of m_l buttons 4 px apart routed a press to the orbital in the row below. A small button
    // opts in with .ql-hit-area where it was measured clear.
    it('names no class-wide MUI selector in the floor list: a small button opts in with .ql-hit-area', () => {
        expect(floored.length).toBeGreaterThan(0);
        expect(floored.filter(selector => /\.Mui/.test(selector))).toEqual([]);
    });

    // The small buttons B's hit scan (and the final fix wave's, drilled to Fe 3d and Nd 4f) measured clear of their
    // neighbours, each with its count of opted-in buttons in the file: the periodic pop-over's Close, the charge stepper
    // and Excite, the molecule tile's Choose/Change, Export CSV, the element button (phone header and panel), the m_l row.
    it.each([
        ['src/components/PeriodicTable.tsx', 1],
        ['src/components/SpeciesControls.tsx', 3],
        ['src/molecule_ui/MoleculeHeader.tsx', 1],
        ['src/atom_ui/PlotDataTabs.tsx', 1],
        ['src/components/LevelNav.tsx', 2],
        ['src/components/SubshellPanel.tsx', 1],
    ])('%s opts its measured small buttons in (%i)', (file, count) => {
        expect(read(file).match(/ql-hit-area/g) ?? []).toHaveLength(count);
    });

    // A wrapped row of m_l buttons (a d subshell's five wrap 4 + 1 in the desktop panel, an f subshell's seven 3 + 3 + 1):
    // an m_l button is 33.6 px tall (measured), so its floor reaches 5.2 px past each edge, and two lines need 10.4 px
    // between them. 16 keeps them apart; the 4 px between buttons on a line is enough, since each is wider than 44 px.
    it('the m_l row keeps 16 px between its wrapped lines, so its buttons\' floors never overlap', () => {
        const row = body('src/style.css', '.subshell-ml-row');
        expect(row).toMatch(/row-gap:\s*16px/);
        expect(row).toMatch(/column-gap:\s*4px/);
        expect(row).not.toMatch(/(^|[;\s])gap:/);
    });

    it('the touch size is 44 px', () => {
        expect(read('src/design/tokens.css')).toMatch(/--ql-size-touch:\s*44px/);
    });

    it('keeps the strip handle\'s visual height (28 px), so the camera inset does not change', () => {
        expect(read('src/design/tokens.css')).toMatch(/--ql-size-strip-handle:\s*28px/);
        expect(body('src/shell/strip.css', '.strip-handle')).toMatch(/height:\s*var\(--ql-size-strip-handle\)/);
    });

    it('the level switch is not clipped (it would cut each option\'s hit area); its end options round their own corners', () => {
        expect(body('src/levels/levels.css', '.level-control-segmented')).not.toMatch(/overflow\s*:\s*hidden/);
        expect(body('src/levels/levels.css', '.level-control-segmented .level-control-option:first-child')).toMatch(/border-radius/);
        expect(body('src/levels/levels.css', '.level-control-segmented .level-control-option:last-child')).toMatch(/border-radius/);
    });

    it('the search input fills its 36 px field, so the control is not a 22 px sliver', () => {
        expect(body('src/shell/search.css', '.global-search-input')).toMatch(/align-self:\s*stretch/);
    });

    // A hit area must not reach the control beside it: the (i)'s rows hold 12 px between it and what lies beside.
    it('gives the (i) 12 px of room before the chips and controls it sits beside', () => {
        expect(body('src/info/info.css', '.info-beside-row')).toMatch(/gap:\s*12px/);
        expect(body('src/info/info.css', '.info-beside-select')).toMatch(/gap:\s*12px/);
        expect(body('src/basic_ui/basic_explore.css', '.basic-row-head')).toMatch(/margin-bottom:\s*12px/);
        expect(body('src/style.css', '.level-nav-shells')).toMatch(/margin:\s*12px 0 8px/);
        expect(body('src/style.css', '.species-controls')).toMatch(/gap:\s*16px/);
        expect(body('src/style.css', '.molecule-jobs')).toMatch(/gap:\s*12px/);
    });
});
