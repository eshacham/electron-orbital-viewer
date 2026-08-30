/**
 * Shell composition (Addendum 2): every occupied subshell of a shell,
 * expanded to its individual mₗ orbitals with how full each one actually is.
 *
 * "i was expecting to be able to see how the (sub) shells are constructed
 * (composite) the orbitals" / "i expect the orbital lobes to show in the
 * shell - not just the label." This module is the physics behind that view:
 * which real orbitals belong to a shell, and how occupied each one is. The
 * three.js side (`shell_composition_view.ts`) only turns this into meshes.
 *
 * Under the spherically-averaged central-field model (spec §2) an open
 * subshell spreads its electrons equally across every mₗ state -- there is
 * no physical basis for picking a subset to draw, so every mₗ of an occupied
 * subshell is emitted here, never a subset. Picking two lobes out of three
 * to render would assert an occupancy the model does not have.
 */

export interface ShellCompositionSubshell {
    n: number;
    l: number;
    /** Electrons actually occupying this subshell (0 < electrons <= 2*(2l+1)). */
    electrons: number;
}

export interface OrbitalComponent {
    n: number;
    l: number;
    ml: number;
    /**
     * How full this one real orbital is, out of its own two-electron
     * capacity (spin up + spin down) -- 1 when a full pair sits in it.
     *
     * A closed subshell (2p⁶) gives every mₗ state occupancyFraction 1. An
     * open one spreads the subshell's electrons equally across its mₗ
     * states first (Unsöld): carbon's 2p² puts 2/3 of an electron in each
     * of three orbitals, which is occupancyFraction (2/3)/2 = 1/3 of that
     * orbital's own pair.
     */
    occupancyFraction: number;
    /**
     * This subshell's position within the shell's own subshell list
     * (ascending l) -- an index into the same palette
     * (`curve_colors.ts`'s CURVE_COLORS) the radial plot colours that
     * subshell's curve with, so a lobe and its curve always agree (see
     * App.tsx's atomCurves, which colours a shell's subshells by this exact
     * same positional index).
     */
    colorIndex: number;
}

/**
 * Lower resolution than a single level-3 orbital's default (64): the
 * composite view is about relative arrangement, not fine surface detail,
 * and a d or f shell renders up to 9 or 16 of these meshes at once. Measured
 * against Fe's 3d and U's 4f (richest occupied shells in this app's range):
 * 32 keeps every shell's total worker time under half a second even for 16
 * orbitals (see the task report for the full before/after table) while
 * still resolving cloverleaf/multi-lobe shapes clearly.
 */
export const COMPOSITE_ORBITAL_RESOLUTION = 32;

/**
 * Every mₗ orbital of every occupied subshell in one shell, in the same
 * order the subshells were given -- which must already be ascending l, the
 * same order `atomProfile.subshells` (filtered to one shell) is in, and the
 * same order the radial plot colours by (see App.tsx's atomCurves).
 */
export function shellComposition(subshells: ShellCompositionSubshell[]): OrbitalComponent[] {
    const components: OrbitalComponent[] = [];
    subshells.forEach((subshell, colorIndex) => {
        const { n, l, electrons } = subshell;
        const statesInSubshell = 2 * l + 1;
        const electronsPerOrbital = electrons / statesInSubshell;
        const occupancyFraction = electronsPerOrbital / 2;
        for (let ml = -l; ml <= l; ml++) {
            components.push({ n, l, ml, occupancyFraction, colorIndex });
        }
    });
    return components;
}

/**
 * The subset of a shell's orbital components belonging to one subshell --
 * the composition view's isolation mode (Addendum 2's readability
 * follow-up).
 *
 * Iron's five 3d orbitals overlapping read as one gold blob rather than five
 * distinguishable cloverleaves. The overlap is physically honest and stays
 * the default -- it is *why* the sum comes out spherical (spec §2) -- so
 * isolation is a filter applied on top of the full composition, never a
 * different composition: `colorIndex` is carried through unchanged from the
 * full shell, so an isolated 3d keeps exactly the colour it had while
 * overlapping, and matches its own curve in the radial plot.
 *
 * `l` of null means no isolation, i.e. the full shell.
 */
export function isolateSubshell(components: OrbitalComponent[], l: number | null): OrbitalComponent[] {
    if (l === null) return components;
    return components.filter(component => component.l === l);
}
