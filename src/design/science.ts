import { CURVE_COLORS } from '../curve_colors';
import { hexToRgb255, srgbToLinear } from './colour_math';
import { TOKENS, type ThemeMode } from './tokens';

/**
 * The science colours (spec §4.2): what a hue on the 3D view, a plot or a
 * key MEANS, kept apart from the UI tokens. Every consumer -- the keys, the
 * PNG legend, the plot curves, the renderer's vertex colours, caps, shell
 * palette and axes -- asks this module, so a key cannot disagree with what
 * it labels. Ruling R22a (owner): one look per theme -- there is no colour
 * scheme to choose (the Classic and Density schemes are gone).
 */

/** Ruling R12: a hydrogen ball in Light Clean -- CPK white would vanish on the page. */
export const LIGHT_HYDROGEN = '#F2F2F2';

/**
 * Ruling R20a-1 (owner): ONE phase pair in both themes -- Light Clean's ψ > 0
 * and ψ < 0 are Deep Space's hues, so a lobe is the same colour whichever
 * theme it is shown in. Only the rims differ: added light in Deep Space,
 * a darker "ink" of the same phase on white (§11.2). A key swatch that is
 * under 3:1 against its panel gets the `swatch-ring` token's outline
 * (tokens.ts) -- the hue itself is never darkened for it.
 */
export const PHASE_HUES = { positive: '#FF7A2F', negative: '#2F6BFF' } as const;

/** A phase surface's colours in one theme: the lobes (and their cut faces and keys) and Glow's rims. */
export interface PhaseColours {
    positive: string;
    negative: string;
    rimPositive: string;
    rimNegative: string;
}

export const PHASE_COLOURS: Record<ThemeMode, PhaseColours> = {
    dark: { ...PHASE_HUES, rimPositive: '#FFC59A', rimNegative: '#9CC2FF' },
    light: { ...PHASE_HUES, rimPositive: '#9A3412', rimNegative: '#1E3A8A' },
};

export const DENSITY_SURFACE: Record<ThemeMode, string> = { dark: '#C9D6E8', light: '#7A8AA0' };

/** CURVE_COLORS' light-theme twins: same order and hue family, each ≥ 3:1 on white. */
export const CURVE_COLORS_LIGHT: readonly string[] = ['#1D6FE0', '#D93A3A', '#B7791F', '#0F9D76', '#8B46D6', '#D9661F', '#C2328F', '#5B6880'];

export function phaseColours(theme: ThemeMode): PhaseColours {
    return PHASE_COLOURS[theme];
}

export function curvePalette(theme: ThemeMode): readonly string[] {
    return theme === 'dark' ? CURVE_COLORS : CURVE_COLORS_LIGHT;
}

/** The same curve, in this palette: index identity (3d is 3d in the plot and on the view, in both themes). */
export function themeCurveColour(hex: string, palette: readonly string[]): string {
    const index = CURVE_COLORS.findIndex(colour => colour.toLowerCase() === hex.toLowerCase());
    return index < 0 ? hex : palette[index];
}

/** A density surface's one colour (a density has no phase, ruling T7-a): the Bonds density and a molecule's. */
export function densitySurfaceHex(theme: ThemeMode): string {
    return DENSITY_SURFACE[theme];
}

export interface AxesStyle {
    line: string;
    lineOpacity: number;
    labels: { x: string; y: string; z: string };
}

/**
 * §11.1 "Axes": one hue with 6 % arrowheads and labels in text-1 -- the
 * orange x label would have read as ψ > 0.
 */
export function axesStyle(theme: ThemeMode): AxesStyle {
    const label = TOKENS[theme]['text-1'];
    return theme === 'dark'
        ? { line: '#4F86FF', lineOpacity: 0.7, labels: { x: label, y: label, z: label } }
        : { line: '#8090A8', lineOpacity: 1, labels: { x: label, y: label, z: label } };
}

/** The solid colour a PNG export composites onto (§6.6). */
export function canvasSolid(theme: ThemeMode): string {
    return TOKENS[theme]['canvas-solid'];
}

/**
 * Task 16d: the ink a PNG export paints straight onto that canvas -- the scale bar, its label and the legend
 * row's labels -- the theme's text-1, as the on-screen scale bar. (White on Light Clean's canvas was invisible.)
 */
export function overlayInk(theme: ThemeMode): string {
    return TOKENS[theme]['text-1'];
}

/** sRGB hex → linear-light components: what three.js vertex colours are read in. */
export function linearRgb(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb255(hex);
    return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** sRGB hex → display-space 0–1 components: the cap shader ramps in display space (clip_caps.ts). */
export function displayRgb(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb255(hex);
    return [r / 255, g / 255, b / 255];
}
