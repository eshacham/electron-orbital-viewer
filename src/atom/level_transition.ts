/**
 * Hand-rolled maths for the level-transition animation (spec addendum to
 * 2026-08-29-multi-electron-atoms.md). No animation library: the whole thing
 * is a linear blend of two arrays and a cubic ease, both a few lines, kept
 * here -- rather than inline in orbital_visualizer.ts -- so they can be
 * tested against exact values without touching Three.js, WebGL or a fake
 * clock at all.
 */

/** Plain linear interpolation between two numbers. */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Clamps to [0, 1] -- every progress fraction below is built from this. */
export function clamp01(t: number): number {
    return Math.min(1, Math.max(0, t));
}

/**
 * Eases in and out of [0, 1]: a fade or a zoom driven by this decelerates
 * into its resting value instead of stopping dead the way a plain linear
 * ramp would. Clamps its own input, so a caller computing progress as
 * `elapsed / duration` (which can run past 1 for a frame or two near the end,
 * or start negative before a delayed phase begins) never has to clamp first.
 */
export function easeInOutCubic(t: number): number {
    const c = clamp01(t);
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Blends two radial curves sampled on the same log grid -- this *is* the
 * atom<->shell "fade" the spec addendum describes: interpolating between the
 * whole atom's D(r) and one shell's own D_n(r) is what makes the other
 * shells' contribution visually disappear from the cut face without moving
 * the camera at all (see `shell_view.ts`'s `setShellViewCurve`, which is
 * what actually uploads the result each frame).
 *
 * `t` is expected already eased by the caller (`easeInOutCubic` above) --
 * this function itself is a plain per-sample blend, kept separate so it can
 * be tested against exact values at t=0/0.5/1 without an easing curve
 * folded in. If the two curves are different lengths (they never are in
 * practice -- both come from the same solved profile's shared grid, spec
 * §3), only the shorter's length is produced, rather than reading or writing
 * out of bounds.
 */
export function interpolateCurves(from: Float32Array, to: Float32Array, t: number): Float32Array {
    const length = Math.min(from.length, to.length);
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = lerp(from[i], to[i], t);
    }
    return result;
}
