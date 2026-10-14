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
    'learn-accent-text': string;
    'learn-accent-fill': string;
    /** The 3D view's backdrop, painted behind the transparent canvas (§6.6). */
    canvas: string;
    /** The backdrop as one colour: PNG export composites onto it (§6.6). */
    'canvas-solid': string;
    'plot-grid': string;
    'plot-axis': string;
    /** Text and icons on accent, selected and learn fills. */
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
    /** The title block's backing: canvas-solid at 72 % (§8.5). */
    scrim: string;
    'error-bg': string;
    'error-text': string;
    /**
     * Ruling R20a-1: the ψ key swatch's outline. The phase hues are one pair
     * in both themes; where a hue is under 3:1 against the key's panel
     * (Light Clean's orange), this ring carries the 3:1 instead -- the hue
     * is never darkened for it. Deep Space's hues pass on their own: none.
     */
    'swatch-ring': string;
}
export type ColorRole = keyof ColorTokens;

export const TOKENS: Record<ThemeMode, ColorTokens> = {
    // Deep Space, sampled from concept A / Molecule Builder (spec §4.1).
    dark: {
        'bg-app': '#020F1D',
        'bg-bar': '#010B17',
        'surface-1': '#071828',
        'surface-2': '#0B1C2D',
        'surface-3': '#13263B',
        'border-subtle': 'rgba(110,160,220,.16)',
        'border-strong': '#2B4A6B',
        'text-1': '#F2F6FA',
        'text-2': '#C3CFDB',
        'text-3': '#93A6BA',
        accent: '#2A85F8',
        'accent-text': '#4C9BFF',
        'accent-fill': '#1E5BD8',
        'selected-fill': '#0E3A99',
        'selected-edge': '#1FB6F5',
        'rail-active': 'linear-gradient(180deg,#123E9C,#0A2A6B)',
        avatar: '#1E5BD8',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#F87171',
        'learn-accent-text': '#A78BFA',
        'learn-accent-fill': '#5B3FD9',
        canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #0A1F3A 0%, #04142A 45%, #020C19 100%)',
        'canvas-solid': '#04142A',
        'plot-grid': 'rgba(150,180,220,.12)',
        'plot-axis': '#93A6BA',
        'on-fill': '#FFFFFF',
        'on-accent': '#000000',
        'focus-ring': '#1FB6F5',
        scrim: 'rgba(4,20,42,0.72)',
        'error-bg': '#3B1219',
        'error-text': '#FECACA',
        'swatch-ring': 'rgba(0,0,0,0)',
    },
    // Light Clean, sampled from concept B / Admin (spec §4.1).
    light: {
        'bg-app': '#F4F7FB',
        'bg-bar': '#FFFFFF',
        'surface-1': '#FFFFFF',
        'surface-2': '#F1F5FA',
        'surface-3': '#E3EEFE',
        'border-subtle': '#E3E9F2',
        'border-strong': '#B8C4D6',
        'text-1': '#0B1220',
        'text-2': '#475467',
        'text-3': '#5B6880',
        accent: '#1662E0',
        'accent-text': '#1559D6',
        'accent-fill': '#1662E0',
        'selected-fill': '#1662E0',
        'selected-edge': '#1662E0',
        // §4.1: the mode menu's active item is surface-3 in Light Clean.
        'rail-active': '#E3EEFE',
        avatar: '#1662E0',
        success: '#15803D',
        warning: '#B45309',
        danger: '#B42318',
        'learn-accent-text': '#6D28D9',
        'learn-accent-fill': '#6D28D9',
        canvas: 'radial-gradient(ellipse 70% 60% at 50% 45%, #FFFFFF 0%, #F6F9FD 60%, #EEF3F9 100%)',
        'canvas-solid': '#F7F9FC',
        'plot-grid': '#E6ECF4',
        'plot-axis': '#5B6880',
        'on-fill': '#FFFFFF',
        'on-accent': '#FFFFFF',
        'focus-ring': '#1662E0',
        scrim: 'rgba(247,249,252,0.72)',
        'error-bg': '#FDEDED',
        'error-text': '#5F2120',
        'swatch-ring': '#5B6880',
    },
};

/**
 * §4.6: panels have no drop shadow in Deep Space; the selected glow is the concept's cyan halo. Light Clean has no glow.
 * `selected-tile` (ruling R20d): the glow around the selected strip tile, whose 2 px `selected-edge` ring is drawn
 * inside the tile (strip.css) -- the concept's selected 2p_z tile, a little stronger than `selected`'s; none in Light Clean.
 */
export const SHADOWS: Record<ThemeMode, { panel: string; popover: string; selected: string; 'selected-tile': string }> = {
    dark: {
        panel: 'inset 0 1px 0 rgba(255,255,255,.03)',
        popover: '0 12px 32px rgba(0,0,0,.45)',
        selected: '0 0 0 1px #1FB6F5, 0 0 12px rgba(31,182,245,.35)',
        'selected-tile': '0 0 12px 1px rgba(31,182,245,.5)',
    },
    light: {
        panel: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)',
        popover: '0 12px 24px rgba(16,24,40,.12)',
        selected: '0 0 0 1px #1662E0',
        'selected-tile': 'none',
    },
};

/** The canvas's darkest and lightest points and a lit lobe (§13: text over the canvas is checked against these). */
export const CANVAS_BACKDROPS: Record<ThemeMode, string[]> = {
    dark: ['#020C19', '#0A1F3A', '#FFF1E6'],
    light: ['#EEF3F9', '#FFFFFF', '#FFF1E6'],
};

/** Sizes in px (§4.4, §7, §8). */
// Final review B, M2 (and A, M9): labelGap, chip, input, thumbPhone, keyBar, iconRail and
// iconButton were emitted into tokens.css and used nowhere (grep over src/**/*.{css,tsx,ts}) --
// leftovers from the pre-R23a rail and earlier layout passes. Removed so the generated
// sheet stays honest; re-add a role here (not just in CSS) if it is needed again.
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
    wordmark: { size: 20, line: 24, weight: 600 },
    title: { size: 20, line: 28, weight: 600 },
    kpi: { size: 28, line: 34, weight: 600 },
    section: { size: 14, line: 20, weight: 600 },
    nav: { size: 14, line: 20, weight: 500 },
    body: { size: 13, line: 20, weight: 400 },
    subtitle: { size: 13, line: 18, weight: 400 },
    caption: { size: 12, line: 16, weight: 400 },
    tick: { size: 11, line: 14, weight: 400 },
} as const;

/** §4.3: on a phone body is 14; captions stay TYPE.caption's 12. */
export const PHONE_TYPE = { body: 14 } as const;

export const FONT_SANS = '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

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

/** The stylesheet tools/design/gen_tokens.mjs writes to src/design/tokens.css. */
export function tokensCss(): string {
    const common: string[] = [`  --ql-font-sans: ${FONT_SANS};`];
    for (const [key, value] of Object.entries(LAYOUT)) common.push(`  --ql-size-${kebab(key)}: ${value}px;`);
    for (const [key, value] of Object.entries(RADIUS)) common.push(`  --ql-radius-${key}: ${value}px;`);
    for (const value of SPACE) common.push(`  --ql-space-${value}: ${value}px;`);
    for (const [style, spec] of Object.entries(TYPE)) {
        common.push(`  --ql-type-${style}-size: ${spec.size}px;`, `  --ql-type-${style}-line: ${spec.line}px;`, `  --ql-type-${style}-weight: ${spec.weight};`);
    }
    for (const [key, value] of Object.entries(MOTION)) common.push(`  --ql-motion-${key}: ${value}ms;`);
    return [
        '/* GENERATED by tools/design/gen_tokens.mjs from src/design/tokens.ts -- do not edit by hand. */',
        ':root {',
        ...common,
        '}',
        // Dark is the default too, so a page whose script did not run is still themed.
        ':root, :root[data-theme="dark"] {',
        ...themeBlock('dark'),
        '}',
        ':root[data-theme="light"] {',
        ...themeBlock('light'),
        '}',
        '@media (prefers-reduced-motion: reduce) {',
        '  :root { --ql-motion-hover: 0ms; --ql-motion-panel: 0ms; }',
        '}',
        '',
    ].join('\n');
}
