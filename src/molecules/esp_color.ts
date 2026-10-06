import * as THREE from 'three';
import { hexToRgb01 } from '../curve_colors';
import { sampleTrilinear, ScalarGrid } from './esp';

/**
 * One fixed, symmetric scale for every molecule, so maps are comparable
 * (plan Task 9). An auto-ranged scale would stretch each map to its own
 * extremes, so benzene's weak ±0.02 Ha/e would look as polar as formamide's
 * ±0.08 -- but polarity is taught by comparing molecules on one scale. At
 * ±0.05 Ha/e (±31 kcal/mol, the range of common textbook maps) a nonpolar
 * molecule stays near white, which is itself the lesson.
 */
export const ESP_LIMIT_HARTREE = 0.05;
/**
 * Bader's molecular surface, the convention ESP maps are drawn on, e/a₀³.
 *
 * Ruling D4: drawn EXACTLY at this density, never converted to an enclosed
 * fraction. Phase 5's T7-a ruling ("a molecular density is drawn at a fixed
 * ρ, not an enclosed fraction, because a coarse grid cannot integrate the
 * cusp") applies here unchanged -- there is no separate "ESP enclosed
 * fraction" to search for. `generateGridIsoValueMesh` (orbital_mesh.ts)
 * meshes the grid at this ρ directly.
 */
export const ESP_SURFACE_DENSITY = 0.001;
export const HARTREE_TO_KCAL_PER_MOL = 627.509;

/** ColorBrewer RdBu, in display space: red where the potential is negative (electron-rich). */
export const ESP_STOPS: ReadonlyArray<{ t: number; hex: string }> = [
    { t: -1, hex: '#b2182b' },
    { t: -0.5, hex: '#ef8a62' },
    { t: 0, hex: '#f7f7f7' },
    { t: 0.5, hex: '#67a9cf' },
    { t: 1, hex: '#2166ac' },
];
const STOP_RGB = ESP_STOPS.map(stop => hexToRgb01(stop.hex));

/** Interpolated in display space, like the legend's CSS gradient, so the two agree. */
export function espColorSrgb(value: number, limit: number): [number, number, number] {
    const t = Math.max(-1, Math.min(1, value / limit));
    let i = 0;
    while (i < ESP_STOPS.length - 2 && t > ESP_STOPS[i + 1].t) i++;
    const f = (t - ESP_STOPS[i].t) / (ESP_STOPS[i + 1].t - ESP_STOPS[i].t);
    const [a, b] = [STOP_RGB[i], STOP_RGB[i + 1]];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Per-vertex ESP colours in three's linear working space, plus the range actually drawn. */
export function espVertexColors(
    positions: number[][],
    grid: ScalarGrid,
    limit: number,
): { colors: Float32Array; min: number; max: number } {
    const colors = new Float32Array(positions.length * 3);
    const color = new THREE.Color();
    let min = Infinity;
    let max = -Infinity;
    positions.forEach(([x, y, z], i) => {
        const v = sampleTrilinear(grid, x, y, z);
        if (v < min) min = v;
        if (v > max) max = v;
        const [r, g, b] = espColorSrgb(v, limit);
        color.setRGB(r, g, b, THREE.SRGBColorSpace);
        colors[3 * i] = color.r;
        colors[3 * i + 1] = color.g;
        colors[3 * i + 2] = color.b;
    });
    return { colors, min, max };
}

export function espLegendGradient(): string {
    return `linear-gradient(to right, ${ESP_STOPS.map(s => `${s.hex} ${Math.round((s.t + 1) * 50)}%`).join(', ')})`;
}

export function formatEsp(v: number): string {
    return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(3)}`;
}

/**
 * The key's notes, worded once for both the on-screen key (EspLegend) and the
 * PNG export (Task 16b), so a photographed map says exactly what the screen
 * said: the colour meaning and scale, the fixed surface and the method, and
 * -- once a surface has landed -- this molecule's own range.
 */
export const ESP_SIGN_NOTE = `red: negative, electron-rich · blue: positive, electron-poor · ±${Math.round(ESP_LIMIT_HARTREE * HARTREE_TO_KCAL_PER_MOL)} kcal/mol`;
export const espSurfaceNote = (method: string) => `fixed at ρ = ${ESP_SURFACE_DENSITY} e/a₀³ (not an enclosed fraction) · ${method}`;
export function espRangeNote(range: [number, number]): string {
    const saturated = range[0] < -ESP_LIMIT_HARTREE || range[1] > ESP_LIMIT_HARTREE;
    return `this molecule: ${formatEsp(range[0])} to ${formatEsp(range[1])} Ha/e${saturated ? ', saturated beyond the scale' : ''}`;
}
export const ESP_TICKS: [string, string, string] = [`−${ESP_LIMIT_HARTREE}`, '0', `+${ESP_LIMIT_HARTREE} Ha/e`];

/**
 * The bar as `segments` flat CSS colours, left (−limit) to right (+limit),
 * each sampled at its segment's centre: the PNG draws it as rectangles, which
 * any 2D painter can do, rather than a canvas gradient it would have to build.
 */
export function espColourBar(segments = 64): string[] {
    return Array.from({ length: segments }, (_, i) => {
        const [r, g, b] = espColorSrgb((-1 + (2 * (i + 0.5)) / segments) * ESP_LIMIT_HARTREE, ESP_LIMIT_HARTREE);
        return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    });
}
