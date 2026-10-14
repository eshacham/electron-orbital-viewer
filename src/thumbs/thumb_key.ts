import type { Appearance } from '../design/appearance';

/**
 * What a strip thumbnail's picture depends on besides its content (ruling
 * R20a-4 and its fix round): one key, built here, used both by the strip
 * (ThumbnailStrip's themeKey, which re-requests a tile when it changes) and
 * by the service's cache (attachThumbnails' host), so the two always agree.
 * No three.js here: App imports it.
 */

/** The largest strip tile, in CSS px (ThumbnailStrip's overlay variant; the phone's sheet tiles are 56). */
export const THUMB_TILE_PX = 72;

/**
 * Ruling R20d: how much of a tile its object fills -- an orbital mesh's
 * bounding sphere (render_thumbnail.ts) and a ring glyph's rMax
 * (ring_glyph.ts) alike, so every tile in a strip is framed the same way.
 */
export const THUMB_FILL = 0.8;

/** Ruling R20d: the picture is drawn at no less than this many times the tile's CSS size. */
const MIN_CSS_SUPERSAMPLE = 3;

function ratioOf(devicePixelRatio: number): number {
    return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

/**
 * The tile's side in device pixels: the size of the bitmap a tile is
 * handed, and of its canvas (ThumbnailStrip's tileBacking), so the bitmap
 * is drawn 1:1 and shown unscaled.
 */
export function thumbTileDevicePx(devicePixelRatio: number): number {
    return Math.round(THUMB_TILE_PX * ratioOf(devicePixelRatio));
}

/**
 * Render-target pixels per tile device pixel, a whole number so the
 * downsample is a plain box filter: at least 2 (ruling R20a-4: tile × dpr ×
 * 2), and enough for 3× the tile's CSS size (ruling R20d) -- 3 on a 1×
 * screen, 2 from 1.5× up.
 */
export function thumbSupersample(devicePixelRatio: number): number {
    return Math.max(2, Math.ceil(MIN_CSS_SUPERSAMPLE / ratioOf(devicePixelRatio)));
}

/**
 * The render target's side in pixels: the tile's device size times
 * thumbSupersample -- 216 on a 1× screen, 288 on a 2×, 432 on a 3× phone --
 * drawn with 4× MSAA on top.
 */
export function thumbnailSize(devicePixelRatio: number): number {
    return thumbTileDevicePx(devicePixelRatio) * thumbSupersample(devicePixelRatio);
}

/** The opacity a thumbnail is drawn and filed at: two decimals, as a link writes it. */
export function thumbOpacityOf(opacity: number): number {
    return Math.round(opacity * 100) / 100 + 0;
}

export interface ThumbLook {
    appearance: Pick<Appearance, 'theme' | 'finish' | 'lowPower'>;
    /** The main view's committed opacity (orbitalSlice's thumbOpacity). */
    opacity: number;
    /**
     * thumbTileDevicePx() for the screen: the bitmap's side (fix round 1 of
     * Task 20d). Not thumbnailSize(): two ratios can share a render target
     * (216 at 1× and at 1.5×) but not a bitmap (72 vs 108).
     */
    size: number;
}

/** theme|finish|power|size|opacity. */
export function thumbLookKey({ appearance: a, opacity, size }: ThumbLook): string {
    return `${a.theme}|${a.finish}|${a.lowPower ? 'low' : 'full'}|${size}|${thumbOpacityOf(opacity)}`;
}
