import { THUMB_FILL } from './thumb_key';

/**
 * Ruling R5: a whole-atom or shell tile drawn from the profile's own D(r)
 * -- the data the cut face shows -- as concentric rings, brighter where
 * D(r) is larger, coloured like the plot and the 3D view. Canvas 2D, so no
 * WebGL; a radius maps linearly from the centre (0) to rMax at THUMB_FILL
 * of the half-side -- the fill an orbital tile's bounding sphere has
 * (ruling R20d), so a strip's tiles are framed alike.
 *
 * Ruling R20d: each layer is one radial gradient with a stop per pixel of
 * radius, not a stroked ring per pixel -- neighbouring anti-aliased rings
 * overlapped unevenly round the circle and drew faint spokes (moiré).
 */
export interface RingLayer { curve: ArrayLike<number>; colour: string }

type RingContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'arc' | 'fill'> & {
    fillStyle: string | CanvasGradient | CanvasPattern;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Pick<CanvasGradient, 'addColorStop'>;
};

/** Below this fraction of a layer's peak, D(r) draws nothing. */
const FLOOR = 0.03;

function valueAt(rGrid: ArrayLike<number>, curve: ArrayLike<number>, r: number): number {
    // rGrid ascends; linear interpolation between the bracketing samples.
    let hi = 1;
    while (hi < rGrid.length - 1 && rGrid[hi] < r) hi++;
    const lo = hi - 1;
    const span = rGrid[hi] - rGrid[lo];
    const t = span > 0 ? Math.min(1, Math.max(0, (r - rGrid[lo]) / span)) : 0;
    return curve[lo] + t * (curve[hi] - curve[lo]);
}

/** "#rrggbb" at `alpha`, for a gradient stop. */
function rgba(hex: string, alpha: number): string {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 0xff},${(value >> 8) & 0xff},${value & 0xff},${Number(alpha.toFixed(4))})`;
}

/** The ring's opacity where D(r) is `value` of its peak: nothing under the floor, opaque at the peak. */
export function ringAlpha(value: number): number {
    return value < FLOOR ? 0 : Math.min(1, value);
}

export function drawRingGlyph(ctx: RingContext, size: number, rings: RingLayer[], rGrid: ArrayLike<number>, rMax: number): void {
    ctx.clearRect(0, 0, size, size);
    if (rGrid.length < 2 || !(rMax > 0)) return;
    const centre = size / 2;
    const outer = (size / 2) * THUMB_FILL;
    const steps = Math.max(2, Math.ceil(outer));
    for (const layer of rings) {
        let peak = 0;
        for (let j = 0; j < layer.curve.length; j++) peak = Math.max(peak, layer.curve[j]);
        if (!(peak > 0)) continue;
        const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, outer);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            gradient.addColorStop(t, rgba(layer.colour, ringAlpha(valueAt(rGrid, layer.curve, t * rMax) / peak)));
        }
        ctx.fillStyle = gradient as CanvasGradient;
        ctx.beginPath();
        ctx.arc(centre, centre, outer, 0, 2 * Math.PI);
        ctx.fill();
    }
}
