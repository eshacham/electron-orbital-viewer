/**
 * One colour per curve in the atom-mode radial plot (shells at level 1,
 * subshells at level 2), shared with the 3D view so the two agree (Addendum
 * 2: "the 2d graph has different colors f the n. why not incorporate these
 * colors somehow to the 3d view?"). Cycles rather than growing without bound
 * -- no element needs more than a handful of shells/subshells shown at once.
 *
 * Factored out of App.tsx so `shell_view.ts` (the atom-level ring colouring)
 * and `shell_composition_view.ts` (the shell-level orbital-lobe colouring)
 * can both draw from exactly the same array the plot itself uses, rather
 * than a second copy that could drift out of sync with it.
 */
export const CURVE_COLORS = ['#4da3ff', '#ff6b6b', '#ffd166', '#06d6a0', '#c77dff', '#f4a261', '#94d2bd', '#e76f51'];

/** Wraps `i` into a valid CURVE_COLORS index, whatever its sign or magnitude. */
export function colorIndexOf(i: number): number {
    return ((i % CURVE_COLORS.length) + CURVE_COLORS.length) % CURVE_COLORS.length;
}

/** The colour App.tsx's atomCurves would assign to curve index `i`. */
export function colorForIndex(i: number): string {
    return CURVE_COLORS[colorIndexOf(i)];
}

/** Parses a "#rrggbb" string into [r, g, b] each in [0, 1], for GPU/three.js consumption. */
export function hexToRgb01(hex: string): [number, number, number] {
    const value = parseInt(hex.slice(1), 16);
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/**
 * How far, in degrees of hue, the members of one isolated subshell are
 * spread apart, and by how much their lightness varies across that spread.
 *
 * Wide enough that five interpenetrating d cloverleaves read as five
 * objects rather than one gold mass (Addendum 2's readability follow-up),
 * narrow enough that they still read as members of one family and stay
 * recognisably the colour of their own curve in the radial plot.
 */
const ORBITAL_SHADE_HUE_SPAN = 96;
const ORBITAL_SHADE_LIGHTNESS_SPAN = 0.22;

function hexToHsl(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb01(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [((h * 60) % 360 + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] =
        hp < 1 ? [c, x, 0] :
        hp < 2 ? [x, c, 0] :
        hp < 3 ? [0, c, x] :
        hp < 4 ? [0, x, c] :
        hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = l - c / 2;
    const byte = (v: number) => Math.round(Math.max(0, Math.min(1, v + m)) * 255).toString(16).padStart(2, '0');
    return `#${byte(r1)}${byte(g1)}${byte(b1)}`;
}

/**
 * One member's colour within an isolated subshell (Addendum 2's readability
 * follow-up): a variation on that subshell's own curve colour, spread in hue
 * and lightness by the member's position.
 *
 * Isolating a subshell removes the *other* subshells from the composition
 * view, but iron's problem is the five 3d orbitals themselves overlapping --
 * five translucent cloverleaves in one colour sum to one blob however few
 * other things share the sphere with them. Giving each its own shade is what
 * actually makes them countable, and it stays honest: they really are five
 * distinct orbitals occupying the same space, which is the point (spec §2).
 * The mₗ buttons in SubshellPanel are drawn in the matching shades, so the
 * colours are a legend rather than decoration.
 *
 * A subshell of one (any s subshell) keeps its plain curve colour: there is
 * nothing to tell apart.
 */
export function orbitalShade(baseHex: string, index: number, count: number): string {
    if (count <= 1) return baseHex;
    const t = index / (count - 1) - 0.5;
    const [h, s, l] = hexToHsl(baseHex);
    const lightness = Math.max(0.28, Math.min(0.78, l + t * ORBITAL_SHADE_LIGHTNESS_SPAN));
    return hslToHex(h + t * ORBITAL_SHADE_HUE_SPAN, s, lightness);
}
