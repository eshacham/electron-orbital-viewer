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
/** The smallest picture drawn, whatever the screen: today's 160, so a 1× screen is never worse off. */
const MIN_SIZE = 160;

/**
 * The picture's side in device pixels -- the tile's CSS size ×
 * devicePixelRatio × 2, so the tile's own canvas (CSS size × dpr) is drawn
 * from twice its resolution (supersampled, on top of the target's MSAA):
 * 288 on a 2× screen, 432 on a 3× phone.
 */
export function thumbnailSize(devicePixelRatio: number): number {
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return Math.max(MIN_SIZE, Math.ceil(THUMB_TILE_PX * dpr * 2));
}

/** The opacity a thumbnail is drawn and filed at: two decimals, as a link writes it. */
export function thumbOpacityOf(opacity: number): number {
    return Math.round(opacity * 100) / 100 + 0;
}

export interface ThumbLook {
    appearance: Pick<Appearance, 'theme' | 'scheme' | 'finish' | 'lowPower'>;
    /** The main view's committed opacity (orbitalSlice's thumbOpacity). */
    opacity: number;
    /** thumbnailSize() for the screen. */
    size: number;
}

/** theme|scheme|finish|power|size|opacity. */
export function thumbLookKey({ appearance: a, opacity, size }: ThumbLook): string {
    return `${a.theme}|${a.scheme}|${a.finish}|${a.lowPower ? 'low' : 'full'}|${size}|${thumbOpacityOf(opacity)}`;
}
