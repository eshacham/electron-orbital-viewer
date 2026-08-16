/**
 * Scale readout for the viewport.
 *
 * The camera is framed to whatever orbital is on screen, so every orbital fills
 * the view and nothing on screen says how big it actually is — a 3d of carbon
 * looks exactly like a 3d of hydrogen even though it is six times smaller. A bar
 * of known length in Bohr radii puts the absolute scale back.
 *
 * Under perspective the scale varies with depth, so the bar is exact at the
 * plane through the orbit target, which is the origin the orbital is centred on.
 */
export interface ScaleBar {
    /** Length of the bar in Bohr radii, always a 1, 2 or 5 times a power of ten. */
    lengthBohr: number;
    /** How long to draw it, in CSS pixels. */
    pixels: number;
}

/** Bohr radii per pixel at the depth of the orbit target. */
export function worldUnitsPerPixel(
    distanceToTarget: number,
    verticalFovDegrees: number,
    canvasHeightPx: number
): number {
    if (canvasHeightPx <= 0) return 0;
    const visibleHeight = 2 * distanceToTarget * Math.tan((verticalFovDegrees * Math.PI) / 180 / 2);
    return visibleHeight / canvasHeightPx;
}

/** Largest 1, 2 or 5 times a power of ten that does not exceed the limit. */
export function niceLength(limit: number): number {
    if (!(limit > 0) || !Number.isFinite(limit)) return 0;
    const magnitude = Math.pow(10, Math.floor(Math.log10(limit)));
    for (const step of [5, 2, 1]) {
        if (step * magnitude <= limit) return step * magnitude;
    }
    return magnitude;   // unreachable for finite positive input, but keeps it total
}

/**
 * Picks a round length that fits within `maxPixels`, so the bar keeps a usable
 * on-screen size while the number it reports changes with the zoom.
 */
export function computeScaleBar(worldPerPixel: number, maxPixels: number): ScaleBar | null {
    if (!(worldPerPixel > 0) || !(maxPixels > 0) || !Number.isFinite(worldPerPixel)) return null;

    const lengthBohr = niceLength(maxPixels * worldPerPixel);
    if (!(lengthBohr > 0)) return null;

    return { lengthBohr, pixels: lengthBohr / worldPerPixel };
}

/** e.g. "20 a₀", or "0.5 a₀" — trimmed so round numbers stay round. */
export function formatScaleLabel(lengthBohr: number): string {
    const text = lengthBohr >= 1
        ? String(Math.round(lengthBohr))
        : String(Number(lengthBohr.toPrecision(2)));
    return `${text} a₀`;
}
