/**
 * Ruling R5: a whole-atom or shell tile drawn from the profile's own D(r)
 * -- the data the cut face shows -- as concentric rings, brighter where
 * D(r) is larger, coloured like the plot and the 3D view. Canvas 2D, so no
 * WebGL; a radius maps linearly from the centre (0) to the tile's edge (rMax).
 */
export interface RingLayer { curve: ArrayLike<number>; colour: string }

type RingContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'arc' | 'stroke'> & {
    strokeStyle: string | CanvasGradient | CanvasPattern; globalAlpha: number; lineWidth: number;
};

function valueAt(rGrid: ArrayLike<number>, curve: ArrayLike<number>, r: number): number {
    // rGrid ascends; linear interpolation between the bracketing samples.
    let hi = 1;
    while (hi < rGrid.length - 1 && rGrid[hi] < r) hi++;
    const lo = hi - 1;
    const span = rGrid[hi] - rGrid[lo];
    const t = span > 0 ? Math.min(1, Math.max(0, (r - rGrid[lo]) / span)) : 0;
    return curve[lo] + t * (curve[hi] - curve[lo]);
}

export function drawRingGlyph(ctx: RingContext, size: number, rings: RingLayer[], rGrid: ArrayLike<number>, rMax: number): void {
    ctx.clearRect(0, 0, size, size);
    if (rGrid.length < 2 || !(rMax > 0)) return;
    const centre = size / 2;
    const outer = size / 2 - 2;
    ctx.lineWidth = 1.5;
    for (const layer of rings) {
        let peak = 0;
        for (let j = 0; j < layer.curve.length; j++) peak = Math.max(peak, layer.curve[j]);
        if (!(peak > 0)) continue;
        for (let p = 1; p <= outer; p++) {
            const value = valueAt(rGrid, layer.curve, (p / outer) * rMax) / peak;
            if (value < 0.03) continue;
            ctx.globalAlpha = Math.min(1, value);
            ctx.strokeStyle = layer.colour;
            ctx.beginPath();
            ctx.arc(centre, centre, p, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
}
