import { radiusContaining } from './radial_distribution';

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
