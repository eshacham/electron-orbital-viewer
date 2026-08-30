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
