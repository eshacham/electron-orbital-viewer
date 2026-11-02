import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
    LAYOUT, SHADOWS, TEMPERS, TEMPER_LEVELS, THEME_MODES, TOKENS, VIEWPORT_MODE, colorsAt, cssVar, tokensCss, type TemperLevel,
} from '../../src/design/tokens';

/**
 * The Brass Instrument plan's temper table, copied verbatim (columns: basics, explore, advanced, research; Basics,
 * Advanced and Research from finish ruling F1 -- warmth and brass brightness, never hue) and
 * kept apart from tokens.ts so a typo there cannot hide itself. Rows are the roles the table names; the derived
 * roles (rail-active, avatar, on-fill) are pinned below.
 */
const TABLE: Record<string, { dark: string[]; light: string[] }> = {
    'bg-app': { dark: ['#18140E', '#141513', '#151512', '#151513'], light: ['#F8EFE0', '#F4F0E6', '#F2F0E9', '#F1F0EB'] },
    'bg-bar': { dark: ['#18140E', '#141513', '#151512', '#151513'], light: ['#FFF9EA', '#FEFAF1', '#FCFAF3', '#FBFAF5'] },
    'surface-1': { dark: ['#26221C', '#22231F', '#232320', '#232321'], light: ['#FFFBEC', '#FFFCF5', '#FEFCF5', '#FDFCF7'] },
    'surface-2': { dark: ['#2E2923', '#2A2A28', '#2B2A28', '#2A2A28'], light: ['#FDF3E4', '#F8F4EC', '#F6F4ED', '#F5F5EF'] },
    'surface-3': { dark: ['#37322C', '#323330', '#333330', '#333331'], light: ['#F2E8DA', '#EDE9E1', '#EBEAE2', '#EAEAE4'] },
    'border-subtle': { dark: ['#3B342A', '#353632', '#363532', '#363533'], light: ['#EADCC6', '#E3DED1', '#E1DED3', '#DFDED6'] },
    'border-strong': { dark: ['#635337', '#625238', '#5F543E', '#5C5543'], light: ['#D5C1A7', '#D4C6A8', '#CFC2AC', '#CDC3AF'] },
    'text-1': { dark: ['#EEE7D7', '#EEE7D8', '#ECE7DC', '#EBE7DF'], light: ['#2A261E', '#292720', '#292721', '#292722'] },
    'text-2': { dark: ['#BBAF95', '#B9AF99', '#B7AF9E', '#B5AFA2'], light: ['#675C43', '#655C49', '#645C4D', '#625C50'] },
    // Explore's text-3 is the plan's moved by OKLCH L steps of 0.01 (tokens.ts); the other columns are ruling F1's.
    'text-3': { dark: ['#A59A84', '#A39A87', '#A29B8B', '#A09B8F'], light: ['#726851', '#716855', '#6F6859', '#6E685D'] },
    accent: { dark: ['#DAAA54', '#C4A15A', '#BD9D5C', '#B7A16E'], light: ['#8E6011', '#806020', '#7A5C20', '#705826'] },
    'selected-fill': { dark: ['#443212', '#403319', '#3F341C', '#3D3422'], light: ['#F8E1C3', '#F3E2C7', '#F2E3C8', '#EFE3CC'] },
    'focus-ring': { dark: ['#EEBD67', '#D7B46D', '#D1B06F', '#CAB381'], light: ['#8E6011', '#806020', '#7A5C20', '#705826'] },
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
        // Task 4 (parked from Task 1): each temper is emitted once, under a selector list, so a block is found by the
        // selector it lists. Specificity is per selector in a list, so the cascade is the same (field_cascade.test.ts).
        const blocksOf = (css: string) => Array.from(css.matchAll(/(^|\n)([^{}\n][^{}]*) \{([^}]*)\}/g))
            .map(m => ({ selectors: m[2].split(',').map(part => part.trim()), body: m[3] }));
        const blockOf = (css: string, selector: string) => {
            const found = blocksOf(css).find(block => block.selectors.includes(selector));
            if (!found) throw new Error(`no block for ${selector}`);
            return found.body;
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

        // Finish ruling F1: a level tempers warmth and brass brightness only, never hue -- the first Research drifted blue
        // (#101618, #E1E9EC). Every tempered colour stays warm or neutral: its blue channel never exceeds its red.
        it.each(THEME_MODES)('%s: no temper drifts cool (blue never exceeds red in any tempered role)', mode => {
            for (const level of TEMPER_LEVELS) for (const [role, value] of Object.entries(TEMPERS[mode][level])) {
                const [r, , b] = [1, 3, 5].map(at => parseInt(value!.slice(at, at + 2), 16));
                expect([level, role, value, b <= r]).toEqual([level, role, value, true]);
            }
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

        // Final review I2: dark danger, light success and light warning moved one OKLCH L step to clear 4.5:1 on every surface.
        it('carries the mode-wide roles and the viewing field from the plan', () => {
            expect(TOKENS.dark).toMatchObject({
                success: '#5CC98A', warning: '#F0B429', danger: '#F4746A', 'error-bg': '#3A1D18', 'error-text': '#F8D3CC',
                'plot-grid': 'rgba(238,231,216,.10)', 'plot-axis': '#A39A87', 'field-axis': '#8F8676', 'swatch-ring': 'rgba(0,0,0,0)',
                'on-accent': '#000000',
                canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #1B1C19 0%, #10110F 55%, #0B0C0A 100%)', 'canvas-solid': '#10110F',
            });
            expect(TOKENS.light).toMatchObject({
                success: '#2C7747', warning: '#975804', danger: '#A8322A', 'error-bg': '#FBEAE6', 'error-text': '#5A1F17',
                'plot-grid': '#E6DECB', 'plot-axis': '#716855', 'field-axis': '#8F8676', 'swatch-ring': '#746B58',
                'on-accent': '#FFFFFF',
                canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #2A2A26 0%, #20201D 55%, #1A1A17 100%)', 'canvas-solid': '#20201D',
            });
            // The field is dark in both modes; the scrim is the field's solid colour at 84 % (Task 3 raised it from the
            // plan's 72 %, the least whole percent at which text-2 reads at AA over a fully lit lobe in every temper).
            expect(TOKENS.dark.scrim).toBe('rgba(16,17,15,0.84)');
            expect(TOKENS.light.scrim).toBe('rgba(32,32,29,0.84)');
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
                const block = blockOf(css, `:root[data-theme="${mode}"][data-level="${level}"]`);
                expect(blockOf(css, `[data-theme="${mode}"][data-level="${level}"]`)).toBe(block);
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

        // Parked from Task 1: the three selectors of a mode and level share one block, so the temper's declarations
        // are written once (tokens.css was ~220 lines longer with two identical blocks per cell).
        it('writes each temper once: one block per mode and level, listing its three selectors', () => {
            const css = tokensCss();
            const tempered = blocksOf(css).filter(block => block.selectors.some(selector => selector.includes('data-level')));
            const lists = tempered.map(block => block.selectors).filter(selectors => selectors.some(s => /^\[data-level="\w+"\] \[data-theme=/.test(s)));
            expect(lists).toHaveLength(THEME_MODES.length * TEMPER_LEVELS.length);
            for (const mode of THEME_MODES) for (const level of TEMPER_LEVELS) {
                expect(lists).toContainEqual([
                    `:root[data-theme="${mode}"][data-level="${level}"]`, `[data-theme="${mode}"][data-level="${level}"]`,
                    `[data-level="${level}"] [data-theme="${mode}"]`,
                ]);
            }
            // Each tempered role's value for a cell appears in exactly one block.
            expect(css.split(`--ql-color-bg-app: ${TEMPERS.dark.basics['bg-app']};`).length - 1).toBe(1);
        });

        // Finish ruling F2: the field (data-field) wears its mode's Explore at every level, sizes included.
        it('emits one field block per mode, after the tempers: the Explore temper and the base sizes', () => {
            const css = tokensCss();
            for (const mode of THEME_MODES) {
                const selector = `[data-level] [data-theme="${mode}"][data-field]`;
                const block = blockOf(css, selector);
                for (const [role, value] of Object.entries(TEMPERS[mode].explore)) expect(block).toContain(`--ql-color-${role}: ${value};`);
                for (const line of ['--ql-type-body-size: 13px;', '--ql-type-caption-size: 12px;', '--ql-radius-md: 8px;', '--ql-radius-lg: 12px;']) expect(block).toContain(line);
                expect(css.indexOf(selector)).toBeGreaterThan(css.indexOf(`[data-level="research"] [data-theme="light"] {`));
            }
        });

        it('orders the blocks so the cascade resolves: base modes, then tempers', () => {
            const css = tokensCss();
            const light = css.indexOf('\n[data-theme="light"] {');
            for (const level of TEMPER_LEVELS) {
                expect(css.indexOf('\n:root[data-theme="dark"][data-level="' + level + '"]')).toBeGreaterThan(light);
                expect(css.indexOf('[data-level="' + level + '"] [data-theme="light"] {')).toBeGreaterThan(light);
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
