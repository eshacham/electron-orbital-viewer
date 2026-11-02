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

/**
 * The parts of a solved profile this needs: the shared log grid, the per-point shell index, the shells it indexes into,
 * and the radius the whole atom is drawn at (the cut face's edge, `AtomProfile.displayRadius`).
 */
export interface ShellPickProfile {
    rMin: number;
    dx: number;
    size: number;
    shellIndexAtR: ArrayLike<number>;
    shells: ReadonlyArray<{ n: number }>;
    displayRadius: number;
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
 * its shell chip (panel fixes P3). The middle in r of the widest contiguous run of grid points that `shellAtRadius` maps
 * to `n`, among the points the cut face draws (r ≤ displayRadius).
 *
 * Final review I1: both limits matter on a real atom. The solver's grid runs out to 9-183 a₀ while the atom is drawn at
 * a few, so a whole-grid scan gave the outermost shell its tail past the cut face (and past the plot's range): its chip
 * lit nothing. And the cut face and the plot are linear in r, so the run is measured and halved in r, not in log-grid
 * points -- the log-grid middle of the K run, which starts at rMin ≈ 1e-6/Z, was a dot on the nucleus.
 *
 * The middle of a run lies between its end radii, so its nearest grid point is a run member and `shellAtRadius` maps it
 * back to `n`. When a shell owns two separate stretches -- a merged tail -- the wider one is the ring the eye sees; a tie
 * takes the inner. Null when no drawn grid point is `n`'s.
 */
export function shellBandRadius(profile: ShellPickProfile, n: number): number | null {
    const { rMin, dx, size, shells, displayRadius } = profile;
    if (shells.length === 0 || size <= 0) return null;
    const rAt = (j: number) => rMin * Math.exp(dx * j);

    let best: { inner: number; outer: number } | null = null;
    let runStart = -1;
    for (let j = 0; j <= size; j++) {
        const inRun = j < size && rAt(j) <= displayRadius && shellNumberAtPoint(profile, j) === n;
        if (inRun && runStart < 0) runStart = j;
        if (!inRun && runStart >= 0) {
            const inner = rAt(runStart);
            const outer = rAt(j - 1);
            if (!best || outer - inner > best.outer - best.inner) best = { inner, outer };
            runStart = -1;
        }
    }
    return best ? (best.inner + best.outer) / 2 : null;
}

/**
 * The profile whose rings are pickable, or null: only in Atoms, at the whole-atom level, with a bound species and a solved
 * profile. The one condition for clicking a ring (OrbitalViewer's onPickRadius) and for the shell chips linking to the
 * rings (LevelNav's `ringProfile`, panel fixes P3), so the two never disagree.
 */
export function pickableRingProfile<P>(state: { mode: string; level: string; unbound: unknown; profile: P | null }): P | null {
    return state.mode === 'atom' && state.level === 'atom' && !state.unbound ? state.profile : null;
}
