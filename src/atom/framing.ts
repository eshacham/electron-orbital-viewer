/**
 * Where the camera starts on a whole-atom (or shell) view. Pure numbers, no
 * scene: the visualizer frames with it, and the atom worker uses it to tell
 * an ion how its neutral atom was framed (ruling C12) -- one definition, so
 * the two can never drift apart.
 */

/**
 * How far out the camera frames a shell view by default.
 *
 * `contourRadius` bounds the sphere itself and must keep doing so exactly --
 * this only chooses where the camera *starts*. Framing on the outermost
 * resolved shell peak instead, with a margin for the ring's own width and a
 * little breathing room beyond it, starts the camera close enough that the
 * shell structure is what the viewer actually sees rather than a sliver in
 * the middle of an empty disc. `Math.min` with `contourRadius` means this
 * can only pull the default view in, never push it out past what the
 * enclosed-fraction control already asked for -- scrolling back out still
 * reaches the full contour, the control is untouched.
 */
export const SHELL_VIEW_FRAMING_MARGIN = 2.5;

export function framingRadiusFor(contourRadius: number, outermostFeatureR: number | undefined): number {
    if (!(outermostFeatureR !== undefined && outermostFeatureR > 0)) return contourRadius;
    return Math.min(contourRadius, outermostFeatureR * SHELL_VIEW_FRAMING_MARGIN);
}

/**
 * Whichever is further out: the last resolved peak of the total, or the
 * valence shell's own peak. They differ for most of the periodic table --
 * the valence shell often does not resolve as a maximum of the total at all
 * (sodium's 3s is a shoulder on the 2p tail, not a bump), and framing on the
 * total's last peak alone left the valence ring outside the camera's
 * starting view as well as outside the sphere. Peaks are a display
 * annotation only (ruling R26).
 */
export function outermostFeatureRadius(shellPeaks: ArrayLike<number>, valencePeakRadius: number): number {
    return Math.max(shellPeaks.length > 0 ? shellPeaks[shellPeaks.length - 1] : 0, valencePeakRadius);
}

/** The radius a whole-atom view of this profile is framed on: its drawn sphere, pulled in to its shell structure. */
export function wholeAtomFramingRadius(profile: { displayRadius: number; shellPeaks: ArrayLike<number>; valencePeakRadius: number }): number {
    return framingRadiusFor(profile.displayRadius, outermostFeatureRadius(profile.shellPeaks, profile.valencePeakRadius));
}
