/**
 * Which shell a radius belongs to — the physics behind clicking a ring on
 * the 3D cut face (Addendum 2: "what does clicking the k shell vs the l
 * shell does to the view? is there a way to unselect one?" — the rings were
 * already the obvious thing to click, and were not clickable).
 *
 * The mapping is `shellIndexAtR`, the same per-grid-point "which shell
 * dominates the total D(r) here" array that already colours the rings
 * (`dominantShellIndex` in atom_profile.ts). Using it here rather than a
 * separate nearest-peak search is what makes the click land on the shell the
 * user actually sees: they are aiming at a coloured ring, and the colour is
 * this array. A nearest-`shellPeaks` search would disagree with the picture
 * for every element from about Z = 26, where neighbouring shells' peaks
 * merge (ruling R26: peaks are a display annotation and do not line up 1:1
 * with occupied shells — iron has 4 shells and 3 peaks).
 */

/** The parts of a solved profile this needs: the shared log grid, the per-point shell index, and the shells it indexes into. */
export interface ShellPickProfile {
    rMin: number;
    dx: number;
    size: number;
    shellIndexAtR: ArrayLike<number>;
    shells: ReadonlyArray<{ n: number }>;
}

/**
 * The principal quantum number of the shell dominating the density at
 * radius `r`, or null when there is nothing there to pick — no shells, or a
 * radius at or below zero.
 *
 * Radii beyond the grid's outer edge clamp to the last point rather than
 * returning null: the outermost shell's tail is what is out there, and a
 * click a pixel past the last grid point is plainly aimed at it. Radii
 * below the grid's first point clamp to the first, for the same reason at
 * the other end (the grid starts at rMin ≈ 1e-6 a₀, well inside the K
 * shell).
 */
export function shellAtRadius(profile: ShellPickProfile, r: number): number | null {
    const { rMin, dx, size, shellIndexAtR, shells } = profile;
    if (shells.length === 0 || !(r > 0) || size <= 0) return null;

    // The grid's own index for this radius: r_j = rMin * e^(j*dx), so
    // j = ln(r/rMin)/dx. Rounded, not floored -- this is a nearest-point
    // lookup into a categorical array, not an interpolation (the same
    // reason shell_view.ts samples the ring-colour texture with
    // NearestFilter).
    const j = Math.round(Math.log(r / rMin) / dx);
    const clamped = Math.max(0, Math.min(size - 1, j));
    const index = shellIndexAtR[clamped];
    return shells[Math.max(0, Math.min(shells.length - 1, Math.round(index)))].n;
}
