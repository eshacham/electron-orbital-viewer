/**
 * The design system's single source (spec §3.4, §4): every colour, size and
 * shadow for both themes. tokens.css is generated from this file by
 * tools/design/gen_tokens.mjs and checked in, so the first paint is themed
 * before any script runs; the MUI theme (theme.ts), the renderer's appearance
 * and the contrast tests read the same objects.
 *
 * No imports: Node runs tools/design/*.mjs against this file directly.
 */
export type ThemeMode = 'dark' | 'light';
export const THEME_MODES: readonly ThemeMode[] = ['dark', 'light'];

export interface ColorTokens {
    'bg-app': string;
    'bg-bar': string;
    'surface-1': string;
    'surface-2': string;
    'surface-3': string;
    'border-subtle': string;
    'border-strong': string;
    'text-1': string;
    'text-2': string;
    'text-3': string;
    accent: string;
    'accent-text': string;
    'accent-fill': string;
    'selected-fill': string;
    'selected-edge': string;
    'rail-active': string;
    avatar: string;
    success: string;
    warning: string;
    danger: string;
    /** The 3D view's backdrop, painted behind the transparent canvas (§6.6). */
    canvas: string;
    /** The backdrop as one colour: PNG export composites onto it (§6.6). */
    'canvas-solid': string;
    'plot-grid': string;
    'plot-axis': string;
    /**
     * The 3D view's axes (Brass Instrument, the graticule): a warm neutral ink for the lines and arrowheads, drawn at
     * 0.85 opacity (design/axes.ts). Chrome, not science -- it says nothing about phase -- and the field is dark in
     * both modes, so both modes hold the same value.
     */
    'field-axis': string;
    /** Text and icons on accent and selected fills. */
    'on-fill': string;
    /**
     * Text and icons on `accent` itself (MUI's `primary.contrastText`),
     * which is a narrower surface than `on-fill`'s: `on-fill`'s fixed white
     * is only 3.6:1 against dark's `accent`, below AA. Each mode picks
     * whichever of pure black/white -- WCAG's own contrast extremes --
     * contrasts better against that mode's `accent` (ruling T2-onaccent).
     */
    'on-accent': string;
    'focus-ring': string;
    /** The title block's backing: canvas-solid at 84 % (§8.5; Brass Instrument Task 3 raised the plan's 72 %). */
    scrim: string;
    'error-bg': string;
    'error-text': string;
    /**
     * Ruling R20a-1: the ψ key swatch's outline. The phase hues are one pair
     * in both themes; where a hue is under 3:1 against the key's panel
     * (the light theme's orange), this ring carries the 3:1 instead -- the hue
     * is never darkened for it. The dark theme's hues pass on their own: none.
     */
    'swatch-ring': string;
}
export type ColorRole = keyof ColorTokens;

/**
 * The learning levels' temper of the chrome (Brass Instrument): Basics · Explore · Advanced · Research. A string
 * union declared here, not imported from src/levels: /admin.html imports only src/design/* (check:admin-split), and
 * LearningLevel is structurally the same four names, so the viewer passes its level straight in.
 */
export type TemperLevel = 'basics' | 'explore' | 'advanced' | 'research';
export const TEMPER_LEVELS: readonly TemperLevel[] = ['basics', 'explore', 'advanced', 'research'];
/** The level /admin.html (no level, no data-level) and a viewer on Explore wear: the base blocks equal it. */
export const DEFAULT_TEMPER: TemperLevel = 'explore';

/** The roles a level tempers: surfaces, ink, the brass accent and its selection. Every other role is mode-wide. */
export type TemperedRole =
    | 'bg-app' | 'bg-bar' | 'surface-1' | 'surface-2' | 'surface-3' | 'border-subtle' | 'border-strong'
    | 'text-1' | 'text-2' | 'text-3'
    | 'accent' | 'accent-text' | 'accent-fill' | 'selected-edge' | 'selected-fill' | 'rail-active' | 'avatar'
    | 'on-fill' | 'focus-ring';

/** One row of the plan's table: basics, explore, advanced, research. */
type Quad = readonly [basics: string, explore: string, advanced: string, research: string];
type TemperRow = Record<ThemeMode, Quad>;

/**
 * The tempers (Brass Instrument plan, "The tempers"; finish ruling F1). Explore is the handoff palette; the other
 * columns are tempers of it in warmth and brass brightness only, never hue -- Basics warmer and more golden, Advanced
 * and Research quieter and more neutral, still on the brass's own hue (the first Research drifted blue). The roles the table
 * does not list are derived from it: `accent-text`, `accent-fill` and `selected-edge` are the accent; `rail-active`
 * is the selected fill; `avatar` the accent; `on-fill` the temper's own text-1, since the selected fill is a tint.
 * (The `learn-accent-*` roles went in Task 4: no longer violet, and nothing drew with them.)
 */
const TEMPER_TABLE: Record<'bg-app' | 'bg-bar' | 'surface-1' | 'surface-2' | 'surface-3' | 'border-subtle' | 'border-strong'
    | 'text-1' | 'text-2' | 'text-3' | 'accent' | 'selected-fill' | 'focus-ring', TemperRow> = {
    'bg-app': { dark: ['#18140E', '#141513', '#151512', '#151513'], light: ['#F8EFE0', '#F4F0E6', '#F2F0E9', '#F1F0EB'] },
    'bg-bar': { dark: ['#18140E', '#141513', '#151512', '#151513'], light: ['#FFF9EA', '#FEFAF1', '#FCFAF3', '#FBFAF5'] },
    'surface-1': { dark: ['#26221C', '#22231F', '#232320', '#232321'], light: ['#FFFBEC', '#FFFCF5', '#FEFCF5', '#FDFCF7'] },
    'surface-2': { dark: ['#2E2923', '#2A2A28', '#2B2A28', '#2A2A28'], light: ['#FDF3E4', '#F8F4EC', '#F6F4ED', '#F5F5EF'] },
    'surface-3': { dark: ['#37322C', '#323330', '#333330', '#333331'], light: ['#F2E8DA', '#EDE9E1', '#EBEAE2', '#EAEAE4'] },
    'border-subtle': { dark: ['#3B342A', '#353632', '#363532', '#363533'], light: ['#EADCC6', '#E3DED1', '#E1DED3', '#DFDED6'] },
    'border-strong': { dark: ['#635337', '#625238', '#5F543E', '#5C5543'], light: ['#D5C1A7', '#D4C6A8', '#CFC2AC', '#CDC3AF'] },
    'text-1': { dark: ['#EEE7D7', '#EEE7D8', '#ECE7DC', '#EBE7DF'], light: ['#2A261E', '#292720', '#292721', '#292722'] },
    'text-2': { dark: ['#BBAF95', '#B9AF99', '#B7AF9E', '#B5AFA2'], light: ['#675C43', '#655C49', '#645C4D', '#625C50'] },
    // Explore's text-3 (#A39A87 / #716855) is the plan's #9A917E / #746B58 moved by the escape rule -- under 4.5:1 on
    // surface-3, so text-3 alone stepped in OKLCH L by 0.01 until it passed: three steps lighter in dark, one darker in
    // light. The other columns are ruling F1's, which clear 4.5:1 on every surface as given.
    'text-3': { dark: ['#A59A84', '#A39A87', '#A29B8B', '#A09B8F'], light: ['#726851', '#716855', '#6F6859', '#6E685D'] },
    accent: { dark: ['#DAAA54', '#C4A15A', '#BD9D5C', '#B7A16E'], light: ['#8E6011', '#806020', '#7A5C20', '#705826'] },
    'selected-fill': { dark: ['#443212', '#403319', '#3F341C', '#3D3422'], light: ['#F8E1C3', '#F3E2C7', '#F2E3C8', '#EFE3CC'] },
    'focus-ring': { dark: ['#EEBD67', '#D7B46D', '#D1B06F', '#CAB381'], light: ['#8E6011', '#806020', '#7A5C20', '#705826'] },
};

function temper(mode: ThemeMode, index: number): Record<TemperedRole, string> {
    const at = (role: keyof typeof TEMPER_TABLE) => TEMPER_TABLE[role][mode][index];
    const accent = at('accent');
    return {
        'bg-app': at('bg-app'), 'bg-bar': at('bg-bar'),
        'surface-1': at('surface-1'), 'surface-2': at('surface-2'), 'surface-3': at('surface-3'),
        'border-subtle': at('border-subtle'), 'border-strong': at('border-strong'),
        'text-1': at('text-1'), 'text-2': at('text-2'), 'text-3': at('text-3'),
        accent, 'accent-text': accent, 'accent-fill': accent, 'selected-edge': accent,
        'selected-fill': at('selected-fill'), 'rail-active': at('selected-fill'),
        avatar: accent,
        'on-fill': at('text-1'),
        'focus-ring': at('focus-ring'),
    };
}

/** Every mode x level: the roles a level tempers (Partial<ColorTokens>: the mode-wide roles are not here). */
export const TEMPERS: Record<ThemeMode, Record<TemperLevel, Partial<ColorTokens>>> = {
    dark: Object.fromEntries(TEMPER_LEVELS.map((level, i) => [level, temper('dark', i)])) as Record<TemperLevel, Partial<ColorTokens>>,
    light: Object.fromEntries(TEMPER_LEVELS.map((level, i) => [level, temper('light', i)])) as Record<TemperLevel, Partial<ColorTokens>>,
};

/** The roles that do not move with the level: status, errors, plots, the viewing field and what sits on the accent. */
const MODE_WIDE: Record<ThemeMode, Omit<ColorTokens, TemperedRole>> = {
    dark: {
        success: '#5CC98A',
        warning: '#F0B429',
        danger: '#F07167',
        // The viewing field (both modes dark). `scrim` is canvas-solid at 84 %: the plan's 72 % left the title block's
        // subtitle (text-2) at 3.70:1 (dark) / 3.12:1 (light's field) over a fully lit lobe; 84 % is the least whole
        // percent at which it clears 4.5:1 there in every temper, through either mode's scrim (Task 3).
        canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #1B1C19 0%, #10110F 55%, #0B0C0A 100%)',
        'canvas-solid': '#10110F',
        'plot-grid': 'rgba(238,231,216,.10)',
        'plot-axis': '#A39A87', // text-3 of Explore
        'field-axis': '#8F8676',
        'on-accent': '#000000',
        scrim: 'rgba(16,17,15,0.84)',
        'error-bg': '#3A1D18',
        'error-text': '#F8D3CC',
        'swatch-ring': 'rgba(0,0,0,0)',
    },
    light: {
        success: '#2F7A4A',
        warning: '#9A5B0B',
        danger: '#A8322A',
        canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #2A2A26 0%, #20201D 55%, #1A1A17 100%)',
        'canvas-solid': '#20201D',
        'plot-grid': '#E6DECB',
        'plot-axis': '#716855', // text-3 of Explore
        'field-axis': '#8F8676', // the field is dark in light mode too
        'on-accent': '#FFFFFF',
        scrim: 'rgba(32,32,29,0.84)',
        'error-bg': '#FBEAE6',
        'error-text': '#5A1F17',
        'swatch-ring': '#746B58',
    },
};

/** The colours of a mode on Explore, the base: what /admin.html and a viewer on Explore wear. */
export const TOKENS: Record<ThemeMode, ColorTokens> = {
    dark: { ...MODE_WIDE.dark, ...TEMPERS.dark.explore } as ColorTokens,
    light: { ...MODE_WIDE.light, ...TEMPERS.light.explore } as ColorTokens,
};

/** A mode's colours as one learning level tempers them (the MUI theme and the contrast tests read this). */
export function colorsAt(mode: ThemeMode, level: TemperLevel): ColorTokens {
    return { ...TOKENS[mode], ...TEMPERS[mode][level] };
}

/**
 * Which mode the 3D viewing field wears (Brass Instrument, spec B4): the field is dark in both modes, so a light page
 * still frames its model on a dark bench. The viewport cell carries `data-theme` = this (and a nested MUI theme), so
 * its overlays read this mode's tokens; the renderer, the thumbnails, the canvas keys and a PNG's marks take this
 * mode's science variants. The backdrop itself stays the page mode's own `canvas` (light's is a charcoal field).
 * One switch: `light: 'light'` gives a light page its light field back.
 */
export const VIEWPORT_MODE: Record<ThemeMode, ThemeMode> = { dark: 'dark', light: 'dark' };

/**
 * No glow anywhere (Brass Instrument): a selection is a brass edge, never a halo. `selected` is the 1 px ring in the
 * temper's own selected-edge -- through the variable, so it follows the level -- and `selected-tile` / `selected-halo`
 * (ruling R20d: the strip tile's and the pressed (i)'s selection marks, drawn as 2 px / 1 px edges in their own CSS)
 * stay as roles, set to none.
 */
export const SHADOWS: Record<ThemeMode, { panel: string; popover: string; selected: string; 'selected-tile': string; 'selected-halo': string }> = {
    dark: {
        panel: 'inset 0 1px 0 rgba(255,255,255,.03)',
        popover: '0 12px 32px rgba(0,0,0,.5)',
        selected: '0 0 0 1px var(--ql-color-selected-edge)',
        'selected-tile': 'none',
        'selected-halo': 'none',
    },
    light: {
        panel: '0 1px 2px rgba(41,39,32,.06), 0 1px 3px rgba(41,39,32,.08)',
        popover: '0 12px 24px rgba(41,39,32,.12)',
        selected: '0 0 0 1px var(--ql-color-selected-edge)',
        'selected-tile': 'none',
        'selected-halo': 'none',
    },
};

/** The canvas's darkest and lightest points and a lit lobe (§13: text over the canvas is checked against these). The field is dark in both modes. */
export const CANVAS_BACKDROPS: Record<ThemeMode, string[]> = {
    dark: ['#0B0C0A', '#1B1C19', '#FFF1E6'],
    light: ['#1A1A17', '#2A2A26', '#FFF1E6'],
};

/** Sizes in px (§4.4, §7, §8). */
// Final review B, M2 (and A, M9): labelGap, input, thumbPhone, keyBar, iconRail and
// iconButton were emitted into tokens.css and used nowhere (grep over src/**/*.{css,tsx,ts}) --
// leftovers from the pre-R23a rail and earlier layout passes. Removed so the generated
// sheet stays honest; re-add a role here (not just in CSS) if it is needed again. `chip` was
// one of them too; Phase 6G-2 Task 6 re-adds it, now genuinely used (BasicExplore's n /
// subshell / orbital rows, spec §4.4).
export const LAYOUT = {
    topBar: 56,
    phoneTopBar: 52,
    explore: 315,
    exploreMedium: 300,
    inspector: 290,
    inspectorWide: 320,
    inspectorBar: 44,
    gutter: 12,
    panelPadding: 16,
    sectionGap: 16,
    controlRow: 28,
    search: 36,
    touch: 44,
    chip: 32,
    elementTileWidth: 88,
    elementTileHeight: 96,
    /** Ruling R23d: the periodic-table miniature beside the element tile, 140-170 px wide. */
    periodicMiniWidth: 152,
    thumb: 72,
    thumbLabel: 16,
    stripHandle: 28,
    toolbarButton: 36,
    plotWidth: 258,
} as const;

export const RADIUS = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;
export const SPACE = [4, 8, 12, 16, 20, 24, 32] as const;

/** §4.3: size / line in px, weight. */
export const TYPE = {
    wordmark: { size: 24, line: 28, weight: 600 },
    // The wordmark's two steps down (fix-topbar): the serif name is 150 px wide at 24, so the bar steps it to 20/24 below
    // 1160 px (and on a phone) and to 18/22 where the row is tightest (761-860 px, a phone under 370 px). Same weight.
    wordmarkCompact: { size: 20, line: 24, weight: 600 },
    wordmarkTight: { size: 18, line: 22, weight: 600 },
    title: { size: 20, line: 28, weight: 600 },
    kpi: { size: 28, line: 34, weight: 600 },
    // Brass Instrument, the serif signature (FONT_SERIF): the specimen title over the 3D view and Info's title.
    // Ruling P2: 26 px breaks the old "no size over 20 px" rule on purpose.
    specimen: { size: 26, line: 32, weight: 500 },
    infoTitle: { size: 17, line: 24, weight: 600 },
    section: { size: 14, line: 20, weight: 600 },
    nav: { size: 14, line: 20, weight: 500 },
    body: { size: 13, line: 20, weight: 400 },
    subtitle: { size: 13, line: 18, weight: 400 },
    caption: { size: 12, line: 16, weight: 400 },
    tick: { size: 11, line: 14, weight: 400 },
} as const;

/** §4.3: on a phone body is 14; captions stay TYPE.caption's 12. */
export const PHONE_TYPE = { body: 14 } as const;

/**
 * Basics reads a little larger and rounder (Brass Instrument, "Basics type and shape"): body 14/20, caption 13/18,
 * radius md 10 and lg 14. Size tokens only -- nothing in the layout moves. Under `[data-level="basics"]` in
 * tokens.css, and in the MUI theme for that level; the other levels read TYPE and RADIUS as they are.
 */
export const BASICS_SIZES = {
    type: { body: { size: 14, line: 20, weight: 400 }, caption: { size: 13, line: 18, weight: 400 } },
    radius: { md: 10, lg: 14 },
} as const;

/** TYPE as one level reads it. */
export function typeAt(level: TemperLevel): { readonly [K in keyof typeof TYPE]: { readonly size: number; readonly line: number; readonly weight: number } } {
    return level === 'basics' ? { ...TYPE, ...BASICS_SIZES.type } : TYPE;
}

/** RADIUS as one level reads it. */
export function radiusAt(level: TemperLevel): { readonly [K in keyof typeof RADIUS]: number } {
    return level === 'basics' ? { ...RADIUS, ...BASICS_SIZES.radius } : RADIUS;
}

export const FONT_SANS = '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif';
/** The serif signature (Brass Instrument): the wordmark, the specimen title and Info's title; everything else is Inter. */
export const FONT_SERIF = '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif';

/** §4.7, in ms; zero under prefers-reduced-motion (tokens.css). */
export const MOTION = { hover: 120, panel: 180 } as const;

const kebab = (key: string) => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

export function cssVar(group: string, role: string): string {
    return `var(--ql-${group}-${role})`;
}

function themeBlock(mode: ThemeMode): string[] {
    const lines = [`  color-scheme: ${mode};`];
    for (const [role, value] of Object.entries(TOKENS[mode])) lines.push(`  --ql-color-${role}: ${value};`);
    for (const [role, value] of Object.entries(SHADOWS[mode])) lines.push(`  --ql-shadow-${role}: ${value};`);
    return lines;
}

function temperBlock(mode: ThemeMode, level: TemperLevel): string[] {
    return Object.entries(TEMPERS[mode][level]).map(([role, value]) => `  --ql-color-${role}: ${value};`);
}

/**
 * The stylesheet tools/design/gen_tokens.mjs writes to src/design/tokens.css.
 *
 * The cascade (Brass Instrument), all selectors at or under specificity (0,3,0), later wins on a tie:
 *  1. The mode blocks `:root, [data-theme="dark"]` and `[data-theme="light"]` (0,1,0) set every role on Explore, so
 *     /admin.html (no data-level) and a page whose script did not run are themed. They match any element, not only
 *     `:root`, so a nested `data-theme` re-resolves every role for its subtree -- Task 3's dark overlay layer inside a
 *     light page. Light comes second so `<html data-theme="light">`, which also matches `:root`, ends light.
 *  2. The temper blocks hold only the roles a level tempers, one rule per mode x level with a three-selector list (so
 *     the declarations are emitted once). The first two selectors, `:root[data-theme="m"][data-level="l"]` and
 *     `[data-theme="m"][data-level="l"]` (0,3,0 / 0,2,0), beat the mode blocks: this is the element that carries both
 *     attributes.
 *  3. A nested `data-theme` resets every role on its own element (rule 1), which would drop the level the root
 *     carries; so the third selector, `[data-level="l"] [data-theme="m"]` (0,2,0), beats rule 1 on the nested
 *     element and restores the temper. A dark layer inside a light Research page therefore resolves to
 *     (dark, research): the nested mode, the root's level.
 *  4. The viewing field does not change with the level (finish ruling F2): the field cell and a window of it (a strip
 *     tile's picture) carry `data-field` beside their `data-theme`, and `[data-level] [data-theme="m"][data-field]`
 *     (0,3,0, after the tempers) gives them Explore of their mode -- colours and Basics' sizes back at the base -- at
 *     every level. Their contents inherit it. Page chrome nested back inside (PageScope) carries its own `data-theme`
 *     and no `data-field`, so rule 3 matches it directly and it keeps (page mode, root level); Basics' sizes come
 *     back on it through `[data-level="basics"] [data-theme]:not([data-field])`.
 *  `--ql-shadow-selected` reads `var(--ql-color-selected-edge)`, so the ring follows whichever temper resolved on the
 *  element that uses it. Basics' sizes sit under `[data-level="basics"]`.
 */
export function tokensCss(): string {
    const common: string[] = [`  --ql-font-sans: ${FONT_SANS};`, `  --ql-font-serif: ${FONT_SERIF};`];
    for (const [key, value] of Object.entries(LAYOUT)) common.push(`  --ql-size-${kebab(key)}: ${value}px;`);
    for (const [key, value] of Object.entries(RADIUS)) common.push(`  --ql-radius-${key}: ${value}px;`);
    for (const value of SPACE) common.push(`  --ql-space-${value}: ${value}px;`);
    for (const [style, spec] of Object.entries(TYPE)) {
        const name = kebab(style);
        common.push(`  --ql-type-${name}-size: ${spec.size}px;`, `  --ql-type-${name}-line: ${spec.line}px;`, `  --ql-type-${name}-weight: ${spec.weight};`);
    }
    for (const [key, value] of Object.entries(MOTION)) common.push(`  --ql-motion-${key}: ${value}ms;`);
    const basics: string[] = [];
    for (const [style, spec] of Object.entries(BASICS_SIZES.type)) {
        const name = kebab(style);
        basics.push(`  --ql-type-${name}-size: ${spec.size}px;`, `  --ql-type-${name}-line: ${spec.line}px;`);
    }
    for (const [key, value] of Object.entries(BASICS_SIZES.radius)) basics.push(`  --ql-radius-${key}: ${value}px;`);
    // The base values of the sizes Basics overrides: the field puts them back (rule 4).
    const baseSizes: string[] = [];
    for (const style of Object.keys(BASICS_SIZES.type) as (keyof typeof BASICS_SIZES.type)[]) {
        const name = kebab(style);
        baseSizes.push(`  --ql-type-${name}-size: ${TYPE[style].size}px;`, `  --ql-type-${name}-line: ${TYPE[style].line}px;`);
    }
    for (const key of Object.keys(BASICS_SIZES.radius) as (keyof typeof BASICS_SIZES.radius)[]) baseSizes.push(`  --ql-radius-${key}: ${RADIUS[key]}px;`);
    const tempers: string[] = [];
    for (const mode of THEME_MODES) for (const level of TEMPER_LEVELS) {
        tempers.push(
            `:root[data-theme="${mode}"][data-level="${level}"], [data-theme="${mode}"][data-level="${level}"], [data-level="${level}"] [data-theme="${mode}"] {`,
            ...temperBlock(mode, level),
            '}',
        );
    }
    const field: string[] = [];
    for (const mode of THEME_MODES) field.push(`[data-level] [data-theme="${mode}"][data-field] {`, ...temperBlock(mode, DEFAULT_TEMPER), ...baseSizes, '}');
    return [
        '/* GENERATED by tools/design/gen_tokens.mjs from src/design/tokens.ts -- do not edit by hand. */',
        ':root {',
        ...common,
        '}',
        '[data-level="basics"], [data-level="basics"] [data-theme]:not([data-field]) {',
        ...basics,
        '}',
        // Dark is the default too, so a page whose script did not run is still themed.
        ':root, [data-theme="dark"] {',
        ...themeBlock('dark'),
        '}',
        '[data-theme="light"] {',
        ...themeBlock('light'),
        '}',
        ...tempers,
        ...field,
        '@media (prefers-reduced-motion: reduce) {',
        '  :root { --ql-motion-hover: 0ms; --ql-motion-panel: 0ms; }',
        '}',
        '',
    ].join('\n');
}
