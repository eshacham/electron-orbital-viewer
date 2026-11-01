import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
    LAYOUT, SHADOWS, TEMPERS, TEMPER_LEVELS, THEME_MODES, TOKENS, VIEWPORT_MODE, colorsAt, cssVar, tokensCss, type TemperLevel,
} from '../../src/design/tokens';

/**
 * The Brass Instrument plan's temper table, copied verbatim (columns: basics, explore, advanced, research) and
 * kept apart from tokens.ts so a typo there cannot hide itself. Rows are the roles the table names; the derived
 * roles (rail-active, avatar, on-fill) are pinned below.
 */
const TABLE: Record<string, { dark: string[]; light: string[] }> = {
    'bg-app': { dark: ['#18140E', '#141513', '#131513', '#101618'], light: ['#F8EFE0', '#F4F0E6', '#F2F0E9', '#ECF1F3'] },
    'bg-bar': { dark: ['#18140E', '#141513', '#131513', '#101618'], light: ['#FFF9EA', '#FEFAF1', '#FCFAF3', '#F6FBFD'] },
    'surface-1': { dark: ['#27221C', '#22231F', '#212321', '#1E2426'], light: ['#FFFBEC', '#FFFCF5', '#FEFCF5', '#F8FDFF'] },
    'surface-2': { dark: ['#2E2923', '#2A2A28', '#282B28', '#262B2D'], light: ['#FDF3E4', '#F8F4EC', '#F6F4ED', '#F0F5F7'] },
    'surface-3': { dark: ['#37322C', '#323330', '#313431', '#2E3436'], light: ['#F2E8DA', '#EDE9E1', '#EBEAE2', '#E5EAEC'] },
    'border-subtle': { dark: ['#3C342B', '#353632', '#323733', '#2E373B'], light: ['#EADCC6', '#E3DED1', '#E1DED3', '#D8DFE2'] },
    'border-strong': { dark: ['#635337', '#625238', '#5F543E', '#5A5546'], light: ['#D5C1A7', '#D4C6A8', '#CFC3AD', '#C9C4B5'] },
    'text-1': { dark: ['#EEE7D8', '#EEE7D8', '#EEE7D8', '#E1E9EC'], light: ['#292720', '#292720', '#292720', '#22282B'] },
    'text-2': { dark: ['#BDAD9A', '#B9AF99', '#A9B3AB', '#A1B3BB'], light: ['#6E5939', '#655C49', '#615D4D', '#545F63'] },
    // The plan's text-3 values missed 4.5:1 on surface-3 in all eight tempers; moved by OKLCH L steps of 0.01 (tokens.ts).
    'text-3': { dark: ['#A89886', '#A39A87', '#959E96', '#8D9EA6'], light: ['#7B6544', '#716855', '#6D6959', '#606B6F'] },
    accent: { dark: ['#DAAA54', '#C4A15A', '#BD9E5E', '#B8A87C'], light: ['#8E6011', '#806020', '#795D24', '#675B37'] },
    'selected-fill': { dark: ['#443212', '#403319', '#3F341C', '#3B3525'], light: ['#F8E1C3', '#F3E2C7', '#F1E3CA', '#EAE4D2'] },
    'focus-ring': { dark: ['#EEBD68', '#D7B46D', '#D0B170', '#CBBB8E'], light: ['#8E6011', '#806020', '#795D24', '#675B37'] },
};
// accent, accent-text, accent-fill and selected-edge are one row in the table.
const ACCENT_ROLES = ['accent', 'accent-text', 'accent-fill', 'selected-edge'] as const;


describe('design tokens (spec §4)', () => {
    it('tokens.css is exactly what tools/design/gen_tokens.mjs makes of tokens.ts', () => {
        // If this fails: node tools/design/gen_tokens.mjs, then commit both files.
        const onDisk = readFileSync(resolve(__dirname, '../../src/design/tokens.css'), 'utf8');
        expect(onDisk).toBe(tokensCss());
    });

    it('defines the same roles in both themes', () => {
        expect(Object.keys(TOKENS.light).sort()).toEqual(Object.keys(TOKENS.dark).sort());
    });

    it('names every custom property --ql-<group>-<role>', () => {
        const names = [...tokensCss().matchAll(/^\s*(--[\w-]+):/gm)].map(m => m[1]);
        expect(names.length).toBeGreaterThan(80);
        for (const name of names) expect(name).toMatch(/^--ql-(color|shadow|size|radius|space|type|font|motion)-[a-z0-9-]+$/);
        expect(cssVar('color', 'text-1')).toBe('var(--ql-color-text-1)');
    });

    // Brass Instrument Task 1: the mode blocks are scoped (not `:root`-only) so a nested element -- the 3D viewport's
    // overlay layer, Task 3 -- can set its own data-theme and override the root's.
    it('themes the first paint: dark is the default, light overrides it, and a nested data-theme overrides both', () => {
        const css = tokensCss();
        expect(css).toContain(':root, [data-theme="dark"] {');
        expect(css).toContain('[data-theme="light"] {');
        expect(css.indexOf('\n[data-theme="light"] {')).toBeGreaterThan(css.indexOf(':root, [data-theme="dark"] {'));
        expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*--ql-motion-hover: 0ms/);
    });

    describe('the level tempers (Brass Instrument)', () => {
        const blockOf = (css: string, selector: string) => {
            const at = css.indexOf(`\n${selector} {`);
            if (at < 0) throw new Error(`no block for ${selector}`);
            return css.slice(at, css.indexOf('}', at));
        };

        it.each(THEME_MODES)('%s: every temper cell equals the plan table', mode => {
            TEMPER_LEVELS.forEach((level, i) => {
                const cell = TEMPERS[mode][level];
                for (const [role, row] of Object.entries(TABLE)) {
                    const expected = row[mode][i];
                    if (role === 'accent') for (const r of ACCENT_ROLES) expect([mode, level, r, cell[r]]).toEqual([mode, level, r, expected]);
                    else expect([mode, level, role, cell[role as keyof typeof cell]]).toEqual([mode, level, role, expected]);
                }
                // Derived: rail-active is the selected fill, the avatar is the accent, on-fill is the temper's own ink.
                expect(cell['rail-active']).toBe(cell['selected-fill']);
                expect(cell.avatar).toBe(cell.accent);
                expect(cell['on-fill']).toBe(cell['text-1']);
            });
        });

        it('makes Explore the base: TOKENS[mode] is the explore temper over the mode-wide roles', () => {
            for (const mode of THEME_MODES) {
                expect(TOKENS[mode]).toMatchObject(TEMPERS[mode].explore);
                expect(colorsAt(mode, 'explore')).toEqual(TOKENS[mode]);
                expect(colorsAt(mode, 'research')['bg-app']).toBe(TEMPERS[mode].research['bg-app']);
                // Mode-wide roles do not move with the level.
                expect(colorsAt(mode, 'basics').success).toBe(TOKENS[mode].success);
                expect(colorsAt(mode, 'basics')['on-accent']).toBe(TOKENS[mode]['on-accent']);
            }
        });

        it('carries the mode-wide roles and the viewing field from the plan', () => {
            expect(TOKENS.dark).toMatchObject({
                success: '#5CC98A', warning: '#F0B429', danger: '#F07167', 'error-bg': '#3A1D18', 'error-text': '#F8D3CC',
                'plot-grid': 'rgba(238,231,216,.10)', 'plot-axis': '#A39A87', 'swatch-ring': 'rgba(0,0,0,0)',
                'on-accent': '#000000',
                canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #1B1C19 0%, #10110F 55%, #0B0C0A 100%)', 'canvas-solid': '#10110F',
            });
            expect(TOKENS.light).toMatchObject({
                success: '#2F7A4A', warning: '#9A5B0B', danger: '#A8322A', 'error-bg': '#FBEAE6', 'error-text': '#5A1F17',
                'plot-grid': '#E6DECB', 'plot-axis': '#716855', 'swatch-ring': '#746B58',
                'on-accent': '#FFFFFF',
                canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #2A2A26 0%, #20201D 55%, #1A1A17 100%)', 'canvas-solid': '#20201D',
            });
            // The field is dark in both modes; the scrim is the field's solid colour at 72 %.
            expect(TOKENS.dark.scrim).toBe('rgba(16,17,15,0.72)');
            expect(TOKENS.light.scrim).toBe('rgba(32,32,29,0.72)');
        });

        it('shows the viewing field dark in both modes (VIEWPORT_MODE, used by Task 3)', () => {
            expect(VIEWPORT_MODE).toEqual({ dark: 'dark', light: 'dark' });
        });

        it('has no glow: a selected tile or halo is just its edge', () => {
            expect(SHADOWS.dark['selected-tile']).toBe('none');
            expect(SHADOWS.dark['selected-halo']).toBe('none');
            expect(SHADOWS.light['selected-tile']).toBe('none');
            expect(SHADOWS.light['selected-halo']).toBe('none');
            // `selected` is a 1 px ring in the temper's own selected-edge (so it follows the level), never a blur.
            for (const mode of THEME_MODES) expect(SHADOWS[mode].selected).toBe('0 0 0 1px var(--ql-color-selected-edge)');
            expect(SHADOWS.dark.panel).toBe('inset 0 1px 0 rgba(255,255,255,.03)');
            expect(SHADOWS.dark.popover).toBe('0 12px 32px rgba(0,0,0,.5)');
            expect(SHADOWS.light.panel).toBe('0 1px 2px rgba(41,39,32,.06), 0 1px 3px rgba(41,39,32,.08)');
            expect(SHADOWS.light.popover).toBe('0 12px 24px rgba(41,39,32,.12)');
        });

        it('emits one block per mode and level, with its :root twin, holding only the tempered roles', () => {
            const css = tokensCss();
            for (const mode of THEME_MODES) for (const level of TEMPER_LEVELS) {
                const block = blockOf(css, `:root[data-theme="${mode}"][data-level="${level}"], [data-theme="${mode}"][data-level="${level}"]`);
                const cell = TEMPERS[mode][level];
                for (const [role, value] of Object.entries(cell)) expect(block).toContain(`--ql-color-${role}: ${value};`);
                expect(block).not.toContain('--ql-color-success');
                expect(block).not.toContain('--ql-color-canvas');
                expect(block).not.toContain('--ql-shadow');
            }
        });

        // A nested [data-theme] inside a [data-level] root must resolve to (nested mode, root level): the descendant rule
        // [data-level] [data-theme] outranks the nested element's own mode block (0,1,0) at (0,2,0) and carries the level.
        it('also emits, per level and mode, a descendant block so a nested data-theme keeps the root level', () => {
            const css = tokensCss();
            for (const mode of THEME_MODES) for (const level of TEMPER_LEVELS) {
                const block = blockOf(css, `[data-level="${level}"] [data-theme="${mode}"]`);
                for (const [role, value] of Object.entries(TEMPERS[mode][level])) expect(block).toContain(`--ql-color-${role}: ${value};`);
            }
        });

        it('orders the blocks so the cascade resolves: base modes, then tempers', () => {
            const css = tokensCss();
            const light = css.indexOf('\n[data-theme="light"] {');
            for (const level of TEMPER_LEVELS) {
                expect(css.indexOf('\n:root[data-theme="dark"][data-level="' + level + '"]')).toBeGreaterThan(light);
                expect(css.indexOf('\n[data-level="' + level + '"] [data-theme="light"] {')).toBeGreaterThan(light);
            }
        });

        it('sets the Basics type and radius under [data-level="basics"] only: body 14/20, caption 13/18, radius md 10 and lg 14', () => {
            const css = tokensCss();
            const basics = blockOf(css, '[data-level="basics"]');
            for (const line of ['--ql-type-body-size: 14px;', '--ql-type-body-line: 20px;', '--ql-type-caption-size: 13px;', '--ql-type-caption-line: 18px;', '--ql-radius-md: 10px;', '--ql-radius-lg: 14px;']) {
                expect(basics).toContain(line);
            }
            expect(basics).not.toContain('--ql-color');
            // And nowhere else: the base sizes are unchanged.
            expect(css).toContain('--ql-type-body-size: 13px;');
            expect(css).toContain('--ql-type-caption-size: 12px;');
            expect(css).toContain('--ql-radius-md: 8px;');
            expect(css).toContain('--ql-radius-lg: 12px;');
            expect(css.split('--ql-radius-md: 10px;').length - 1).toBe(1);
        });
    });

    it('has the temper levels in the learning levels\' order', () => {
        const levels: TemperLevel[] = ['basics', 'explore', 'advanced', 'research'];
        expect([...TEMPER_LEVELS]).toEqual(levels);
    });

    // Ruling R23a (round 23): the rail is gone, so LAYOUT.rail no longer
    // exists -- the desktop grid's fixed-width budget is now just Explore,
    // inspector and the workspace's own 4 gutters (left pad, two internal
    // gaps, right pad); was 76 + 315 + 290 + 4 × 12 = 729 with the rail.
    it('sizes the desktop grid as §7 does, less the rail (ruling R23a): 315 + 290 + 4 × 12 = 653', () => {
        expect(LAYOUT.explore + LAYOUT.inspector + 4 * LAYOUT.gutter).toBe(653);
        // §8.6: PLOT_WIDTH becomes 258 (290 − 2 × 16).
        expect(LAYOUT.plotWidth).toBe(LAYOUT.inspector - 2 * LAYOUT.panelPadding);
    });

    // Brass Instrument Task 1: Deep Space / Light Clean's spec values became the Explore temper (the handoff palette).
    it('carries the spec values verbatim', () => {
        expect(TOKENS.dark['bg-app']).toBe('#141513');
        expect(TOKENS.dark['selected-edge']).toBe('#C4A15A');
        expect(TOKENS.light['text-3']).toBe('#716855');
        expect(TOKENS.light['selected-edge']).toBe('#806020');
    });
});
