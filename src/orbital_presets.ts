import { radiusContaining } from './radial_distribution';
import { HydrogenicRecipe } from './field_source';

/**
 * The share of the electron the surface encloses by default.
 *
 * 90% is the conventional choice for a drawn orbital: enough of the tail to show
 * the shape, not so much that the surface balloons into a sphere.
 */
export const DEFAULT_ENCLOSED_FRACTION = 0.9;

/** The choices offered in the UI. */
export const ENCLOSED_FRACTIONS = [0.5, 0.75, 0.9, 0.95, 0.99];

/**
 * Beyond this the sampling box is not worth having: the voxel is 2 * rMax /
 * resolution, so at some point the box is so wide that nothing inside it is
 * resolved.
 */
/**
 * The nuclear charge Basic Orbitals mode always uses (Addendum 2's mode
 * rename). The mode is the idealised textbook reference -- pick n, l, mₗ,
 * see the shape -- and atom mode covers every real element now, so a second
 * element control here was redundant and confusing.
 *
 * Cost, recorded so it stays a choice rather than an oversight: He⁺, Li²⁺
 * and the other one-electron ions are no longer reachable, and with them
 * the direct demonstration that raising Z shrinks an orbital without
 * changing its shape. Nothing in the solver is restricted -- Z is still a
 * free parameter of `computeSamplingRadius` and of every quantum function
 * -- so restoring an ion picker later is a UI change only.
 */
/**
 * The marching-cubes grid every single-orbital render uses: 129³ samples.
 *
 * There is no longer a Resolution control. Low (33³) and Medium (65³) were
 * offered for speed on hardware that no longer needs the concession -- the
 * heaviest case measured, a 9s orbital, is under 0.6 s at this resolution,
 * off the main thread -- and both of them cost accuracy that showed: a
 * diffuse orbital's contour search is biased by the handful of samples
 * nearest the nucleus, where |ψ|² is largest, so a coarse grid draws the
 * surface too small (ruthenium's 5s came out at 3.6 a₀ against a true
 * 5.2 a₀ at 33³). Fixing the grid at its finest removes both the control
 * and the failure mode.
 *
 * The shell-composition view sizes its own, much smaller grids separately
 * -- it renders up to sixteen orbitals at once (see
 * `compositeResolutionFor` in atom/shell_composition.ts).
 */
export const ORBITAL_RESOLUTION = 128;

export const BASIC_ORBITALS_Z = 1;

/** A shell-2 hydrogenic recipe at Basic Orbitals' Z = 1: shared so hybrids and Stark states build identical terms. */
export function n2Recipe(l: number, ml: number): HydrogenicRecipe {
    return { type: 'hydrogenic', n: 2, l, ml, Z: BASIC_ORBITALS_Z };
}

/**
 * The axis levels 1-2 cut the atom along by default. The camera is z-up (the
 * chemistry convention: 2p_z, 3d_z² and 4f_z³ stand upright) and looks in
 * mostly along +x, so the x cut is the face turned most squarely towards it.
 * A z cut would be a horizontal face seen from 26 degrees above, squashed to
 * a thin ellipse.
 */
export const SHELL_VIEW_CUT_AXIS = 'x' as const;

export const MAX_SAMPLING_RADIUS = 400;

function roundUpToTwoFigures(value: number): number {
    if (!(value > 0)) return value;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)) - 1);
    return Math.ceil(value / magnitude) * magnitude;
}

/**
 * How wide the sampling box has to be to hold the whole orbital.
 *
 * Sized from the radial distribution rather than from a contour: the radius
 * holding all but a ten-thousandth of the electron bounds the orbital in every
 * direction, and needs no iso level. That ordering matters, because the iso
 * level is now derived from the samples taken inside this box — sizing the box
 * from the contour and the contour from the box would be circular.
 */
export function computeSamplingRadius(n: number, l: number, Z: number): number {
    const radius = radiusContaining(n, l, Z, 0.9999);
    if (!(radius > 0)) return MAX_SAMPLING_RADIUS;

    // A little clearance so the surface never touches the wall. The rounding is
    // relative rather than to a fixed multiple: a heavy nucleus pulls the 1s in
    // to a fraction of a Bohr radius, and rounding that up to the nearest 5
    // would put it in a box a hundred times too wide.
    return Math.min(roundUpToTwoFigures(radius * 1.08), MAX_SAMPLING_RADIUS);
}

/**
 * The box for a combination of shell n's orbitals: the widest of their own
 * boxes, so no member is truncated. 21 a₀ for n = 2 (the 2s sets it), 7.6 a₀
 * for n = 1. Derived from the same radial distributions as every other box,
 * never from a formula of its own (docs/HANDOFF.md).
 */
export function combinationSamplingRadius(n: number): number {
    let radius = 0;
    for (let l = 0; l < n; l++) radius = Math.max(radius, computeSamplingRadius(n, l, BASIC_ORBITALS_Z));
    return radius;
}
