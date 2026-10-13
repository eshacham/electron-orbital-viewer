import { CURVE_COLORS } from '../curve_colors';
import { DENSITY_SURFACE_HEX } from '../bonds/systems';
import { hexToRgb255, srgbToLinear } from './colour_math';
import type { ColourScheme } from './presentation';
import { TOKENS, type ThemeMode } from './tokens';

/**
 * The science colours (spec §4.2): what a hue on the 3D view, a plot or a
 * key MEANS, kept apart from the UI tokens. Every consumer -- the keys, the
 * PNG legend, the plot curves, the renderer's vertex colours, caps, shell
 * palette and axes -- asks this module, so a key cannot disagree with what
 * it labels. `classic` is today's look, constant for constant (§11.3).
 *
 * Ruling DX8: `densitySurface` is `bonds/systems.ts`'s own `DENSITY_SURFACE_HEX`,
 * not a second literal copy of the same colour -- one source either way.
 */
export const CLASSIC = {
    positive: '#FF0000',
    negative: '#0000FF',
    legendPositive: '#e02020',
    legendNegative: '#2040ff',
    capPositive: '#D42020',
    capNegative: '#2030D4',
    densitySurface: DENSITY_SURFACE_HEX,
    axisLabels: { x: '#ff9f40', y: '#a0ff40', z: '#40a8ff' },
} as const;

/** Ruling R12: a hydrogen ball in Light Clean (non-Classic) -- CPK white would vanish on the page. */
export const LIGHT_HYDROGEN = '#F2F2F2';

export const PHASE_COLOURS: Record<ThemeMode, { positive: string; negative: string; rimPositive: string; rimNegative: string }> = {
    dark: { positive: '#FF7A2F', negative: '#2F6BFF', rimPositive: '#FFC59A', rimNegative: '#9CC2FF' },
    light: { positive: '#E8590C', negative: '#1F5FE0', rimPositive: '#9A3412', rimNegative: '#1E3A8A' },
};

export const DENSITY_SURFACE: Record<ThemeMode, string> = { dark: '#C9D6E8', light: '#7A8AA0' };

/** The "Density on the cut face" ramp, Low → High; L* rises strictly under normal vision and the three dichromacies. */
export const DENSITY_RAMP: readonly string[] = ['#16245E', '#3541B8', '#9C3FA8', '#E8644E', '#F9B97A', '#FBEBCF'];

/** CURVE_COLORS' light-theme twins: same order and hue family, each ≥ 3:1 on white. */
export const CURVE_COLORS_LIGHT: readonly string[] = ['#1D6FE0', '#D93A3A', '#B7791F', '#0F9D76', '#8B46D6', '#D9661F', '#C2328F', '#5B6880'];

export interface PhaseColours {
    positive: string;
    negative: string;
    legendPositive: string;
    legendNegative: string;
    capPositive: string;
    capNegative: string;
    rimPositive: string | null;
    rimNegative: string | null;
}

export function phaseColours(theme: ThemeMode, scheme: ColourScheme): PhaseColours {
    if (scheme === 'classic') {
        return {
            positive: CLASSIC.positive, negative: CLASSIC.negative,
            legendPositive: CLASSIC.legendPositive, legendNegative: CLASSIC.legendNegative,
            capPositive: CLASSIC.capPositive, capNegative: CLASSIC.capNegative,
            rimPositive: null, rimNegative: null,
        };
    }
    const p = PHASE_COLOURS[theme];
    return {
        positive: p.positive, negative: p.negative,
        legendPositive: p.positive, legendNegative: p.negative,
        capPositive: p.positive, capNegative: p.negative,
        rimPositive: p.rimPositive, rimNegative: p.rimNegative,
    };
}

export function curvePalette(theme: ThemeMode, scheme: ColourScheme): readonly string[] {
    return scheme === 'classic' || theme === 'dark' ? CURVE_COLORS : CURVE_COLORS_LIGHT;
}

/** The same curve, in this palette: index identity (3d is 3d in the plot and on the view, in both themes). */
export function themeCurveColour(hex: string, palette: readonly string[]): string {
    const index = CURVE_COLORS.findIndex(colour => colour.toLowerCase() === hex.toLowerCase());
    return index < 0 ? hex : palette[index];
}

export function densitySurfaceHex(theme: ThemeMode, scheme: ColourScheme): string {
    return scheme === 'classic' ? CLASSIC.densitySurface : DENSITY_SURFACE[theme];
}

export interface AxesStyle {
    /** Classic: AxesHelper's red/green/blue, one colour per axis. */
    perAxis: boolean;
    line: string;
    lineOpacity: number;
    labels: { x: string; y: string; z: string };
    arrowheads: boolean;
}

/**
 * §11.1 "Axes": one hue with 6 % arrowheads and labels in text-1 -- the
 * orange x label would have read as ψ > 0 -- or, in Classic, today's.
 */
export function axesStyle(theme: ThemeMode, scheme: ColourScheme): AxesStyle {
    if (scheme === 'classic') return { perAxis: true, line: '#ffffff', lineOpacity: 1, labels: { ...CLASSIC.axisLabels }, arrowheads: false };
    const label = TOKENS[theme]['text-1'];
    return theme === 'dark'
        ? { perAxis: false, line: '#4F86FF', lineOpacity: 0.7, labels: { x: label, y: label, z: label }, arrowheads: true }
        : { perAxis: false, line: '#8090A8', lineOpacity: 1, labels: { x: label, y: label, z: label }, arrowheads: true };
}

/** The solid colour a PNG export composites onto (§6.6). */
export function canvasSolid(theme: ThemeMode): string {
    return TOKENS[theme]['canvas-solid'];
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
