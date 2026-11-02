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
    const { rMin, dx, size, shells } = profile;
    if (shells.length === 0 || !(r > 0) || size <= 0) return null;

    // The grid's own index for this radius: r_j = rMin * e^(j*dx), so
    // j = ln(r/rMin)/dx. Rounded, not floored -- this is a nearest-point
    // lookup into a categorical array, not an interpolation (the same
    // reason shell_view.ts samples the ring-colour texture with
    // NearestFilter).
    const j = Math.round(Math.log(r / rMin) / dx);
    const clamped = Math.max(0, Math.min(size - 1, j));
    return shellNumberAtPoint(profile, clamped);
}

/** The shell number the ring colouring gives grid point `j` (the one lookup shared by picking and `shellBandRadius`). */
function shellNumberAtPoint({ shellIndexAtR, shells }: ShellPickProfile, j: number): number {
    return shells[Math.max(0, Math.min(shells.length - 1, Math.round(shellIndexAtR[j])))].n;
}

/**
 * A radius that is plainly inside shell `n`'s ring -- the other direction of `shellAtRadius`, for pointing at a ring from
 * its shell chip (panel fixes P3). The geometric mean of the end radii of the longest contiguous run of grid points that
 * `shellAtRadius` maps to `n`: the middle of the band on the log grid, and a radius `shellAtRadius` maps back to `n`
 * (a run's middle point is a run member, so rounding cannot step out of it). When a shell owns two separate stretches
 * -- a merged tail -- the longer one is the ring the eye sees; a tie takes the inner. Null when no grid point is `n`'s.
 */
export function shellBandRadius(profile: ShellPickProfile, n: number): number | null {
    const { rMin, dx, size, shells } = profile;
    if (shells.length === 0 || size <= 0) return null;

    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;
    for (let j = 0; j <= size; j++) {
        const inRun = j < size && shellNumberAtPoint(profile, j) === n;
        if (inRun && runStart < 0) runStart = j;
        if (!inRun && runStart >= 0) {
            if (j - runStart > bestLength) { bestStart = runStart; bestLength = j - runStart; }
            runStart = -1;
        }
    }
    if (bestStart < 0) return null;
    // sqrt(r_a * r_b) = rMin * e^(dx * (a + b) / 2) on the log grid.
    return rMin * Math.exp(dx * (2 * bestStart + bestLength - 1) / 2);
}
