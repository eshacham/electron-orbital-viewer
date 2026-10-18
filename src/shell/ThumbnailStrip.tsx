import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import type { NavigationTarget } from '../components/LevelNav';
import { thumbnailService, type ThumbRequest } from '../thumbs/ThumbnailService';
import { drawRingGlyph } from '../thumbs/ring_glyph';
import type { StripItem } from '../thumbs/strip_items';
import { useRovingFocus } from './useRovingFocus';
import './strip.css';

/**
 * Generic over what a tile dispatches (StripItem<T>): `NavigationTarget` by
 * default (the Atom strip), or a plain `BasicSelection` for Basic Orbitals'
 * strip (Task 8) -- the component itself never reads the target, only
 * forwards it to `onSelect`.
 */
interface ThumbnailStripProps<T = NavigationTarget> {
    items: StripItem<T>[];
    label: string;
    rGrid: number[];
    /** theme|finish|power: a change re-requests every visible tile. */
    themeKey: string;
    onSelect(target: T): void;
    /** 'sheet' is the phone's first row of the Explore tab: 56 px tiles, in the flow (spec §9.8). */
    variant?: 'overlay' | 'sheet';
    collapsed?: boolean;
    onCollapsedChange?(collapsed: boolean): void;
}

/**
 * A tile canvas's backing store: its CSS size in device pixels, exactly
 * (rulings R20a-4, R20d). An overlay tile's bitmap is made at that size by
 * render_thumbnail.ts (thumbTileDevicePx), so it is drawn 1:1 and the
 * browser shows the canvas unscaled; a larger backing would only be shrunk
 * again by CSS, which is what made the tiles soft.
 */
export function tileBacking(px: number, devicePixelRatio: number): number {
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return Math.round(px * dpr);
}

interface TileProps<T> { item: StripItem<T>; px: number; rGrid: number[]; themeKey: string; onSelect(target: T): void }

// A plain generic function, not React.FC<...> (which cannot carry a type
// parameter): T follows whatever StripItem<T> the enclosing strip was given.
function Tile<T>({ item, px, rGrid, themeKey, onSelect }: TileProps<T>) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const backing = tileBacking(px, typeof window === 'undefined' ? 1 : window.devicePixelRatio);
    const { thumb } = item;
    // Ruling DC12: re-rendered when the renderer is lent, lost or taken back,
    // so a tile still waiting for its image shows its glyph on a context loss.
    const status = useSyncExternalStore(thumbnailService.subscribeStatus, thumbnailService.status);
    const request: ThumbRequest | null = thumb.kind === 'orbital' ? thumb.request : null;
    const requestRef = useRef(request);
    requestRef.current = request;
    const contentKey = request?.contentKey ?? null;
    // Which picture the canvas holds, so a loss leaves an image already drawn in place.
    const wanted = `${themeKey}|${contentKey}`;
    const [drawn, setDrawn] = useState<string | null>(null);
    // Ruling T16-failtile: a picture that will not come falls back as on a lost context.
    const [failed, setFailed] = useState<string | null>(null);
    // Ruling T10-I1: a pending tile (its data still loading) is its glyph and label, and asks for nothing.
    const pending = thumb.kind === 'pending';
    const showGlyph = pending || (thumb.kind === 'orbital' && drawn !== wanted && (status !== 'ready' || failed === wanted));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || thumb.kind !== 'rings') return;
        const context = canvas.getContext('2d');
        if (context) drawRingGlyph(context, canvas.width, thumb.rings, rGrid, thumb.rMax);
    }, [thumb, rGrid]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const current = requestRef.current;
        if (!canvas || !current || status !== 'ready') return undefined;
        const context = canvas.getContext('2d');
        let unsubscribe = () => {};
        const start = () => {
            unsubscribe = thumbnailService.request(current, image => {
                if (context) {
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    // 1:1 when the bitmap is the canvas's size (an overlay tile); a phone's smaller sheet tile scales it down smoothly.
                    if (image.width === canvas.width && image.height === canvas.height) context.drawImage(image as unknown as CanvasImageSource, 0, 0);
                    else {
                        context.imageSmoothingEnabled = true;
                        context.imageSmoothingQuality = 'high';
                        context.drawImage(image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
                    }
                }
                setDrawn(wanted);
            }, () => setFailed(wanted));
        };
        // Only tiles in view are requested (§12).
        const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer?.disconnect();
                start();
            }
        });
        if (observer) observer.observe(canvas);
        else start();
        return () => { observer?.disconnect(); unsubscribe(); };
    }, [contentKey, wanted, status]);

    return (
        <div
            role="option"
            aria-selected={item.selected}
            aria-label={item.spoken}
            className={`strip-tile${item.selected ? ' selected' : ''}`}
            onClick={() => onSelect(item.target)}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(item.target);
                }
            }}
        >
            <span className="strip-tile-image" style={{ width: px, height: px }}>
                {thumb.kind === 'back' ? <ArrowBack aria-hidden /> : (
                    // D15: shoot.mjs has no live hook into the thumbnail service, so it
                    // counts this attribute instead -- the picture (not the glyph) is
                    // showing. True for a ring glyph tile at once (drawn synchronously
                    // on mount); for an orbital tile, only once its image has arrived
                    // (Task 10: was `!showGlyph`, which also counted a tile still waiting).
                    <canvas ref={canvasRef} className="thumb-canvas" width={backing} height={backing} aria-hidden="true"
                        data-drawn={!pending && (thumb.kind !== 'orbital' || drawn === wanted) ? 'true' : 'false'}
                        style={showGlyph ? { visibility: 'hidden' } : undefined} />
                )}
                {showGlyph && <span className="strip-tile-glyph" aria-hidden="true">{item.label}</span>}
            </span>
            <span className="strip-tile-label" aria-hidden="true">{item.label}</span>
        </div>
    );
}

/**
 * The thumbnail strip (spec §8.5 bottom zone, §9.1 "Strip", §13): a
 * listbox of labelled options, grouped by subshell, arrow keys inside and
 * Tab out, collapsible to a 28 px handle.
 */
// A plain generic function (not React.FC<...>, which cannot carry a type
// parameter): T is whatever StripItem<T> the caller's items are in -- the
// Atom strip's NavigationTarget (the default) or Basic Orbitals' BasicSelection.
function ThumbnailStrip<T = NavigationTarget>({ items, label, rGrid, themeKey, onSelect, variant = 'overlay', collapsed = false, onCollapsedChange }: ThumbnailStripProps<T>) {
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    // Ruling DX2: the listbox mounts only while expanded, so `collapsed` re-attaches the roving focus to it.
    useRovingFocus(listRef, { selector: '[role="option"]', orientation: 'horizontal' }, collapsed);
    const px = variant === 'sheet' ? 56 : 72;

    // Bring the shown orbital into view (instant under reduced motion: §4.7)
    // by scrolling the list itself. Not scrollIntoView: Chrome moves its
    // sequential focus starting point to the element scrolled to, so the
    // next Tab skipped the top bar, rail and Explore (§13 order; Task 18).
    useEffect(() => {
        const list = listRef.current;
        const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!list || !selected) return;
        const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const listRect = list.getBoundingClientRect();
        const tileRect = selected.getBoundingClientRect();
        const left = Math.max(0, list.scrollLeft + (tileRect.left - listRect.left) - (list.clientWidth - tileRect.width) / 2);
        if (typeof list.scrollTo === 'function') list.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
        else list.scrollLeft = left;
    }, [items, collapsed]);

    const groups: Array<{ label: string | null; spoken: string | null; items: StripItem<T>[] }> = [];
    for (const item of items) {
        const last = groups[groups.length - 1];
        if (last && last.label === item.group) last.items.push(item);
        else groups.push({ label: item.group, spoken: item.groupSpoken, items: [item] });
    }
    const tile = (item: StripItem<T>) => <Tile key={item.key} item={item} px={px} rGrid={rGrid} themeKey={themeKey} onSelect={onSelect} />;

    return (
        <div className={`thumbnail-strip ${variant}${collapsed ? ' collapsed' : ''}`}>
            {onCollapsedChange && (
                // Ruling R23b-3: the handle names what it opens -- "Orbitals" plus the
                // action. The chevron stays aria-hidden (a bare glyph reads poorly), so
                // the accessible name is exactly the visible label, with no aria-label.
                <button type="button" className="strip-handle" aria-expanded={!collapsed} aria-controls={collapsed ? undefined : listId}
                    onClick={() => onCollapsedChange(!collapsed)}>
                    <span className="strip-handle-label">{collapsed ? 'Show orbitals' : 'Hide orbitals'}</span>
                    <span aria-hidden="true">{collapsed ? '▴' : '▾'}</span>
                </button>
            )}
            {!collapsed && (
                <div id={listId} ref={listRef} className="strip-list" role="listbox" aria-label={label} aria-orientation="horizontal">
                    {groups.map((group, index) => (group.label ? (
                        <div key={`${group.label}-${index}`} role="group" aria-label={group.spoken ?? group.label} className="strip-group">
                            <span className="strip-group-label" aria-hidden="true">{group.label}</span>
                            <div className="strip-group-tiles">{group.items.map(tile)}</div>
                        </div>
                    ) : group.items.map(tile)))}
                </div>
            )}
        </div>
    );
}

export default ThumbnailStrip;
