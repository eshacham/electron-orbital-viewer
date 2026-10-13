import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import type { NavigationTarget } from '../components/LevelNav';
import { thumbnailService, type ThumbRequest } from '../thumbs/ThumbnailService';
import { drawRingGlyph } from '../thumbs/ring_glyph';
import type { StripItem } from '../thumbs/strip_items';
import { useRovingFocus } from './useRovingFocus';
import './strip.css';

interface ThumbnailStripProps {
    items: StripItem[];
    label: string;
    rGrid: number[];
    /** theme|scheme|finish|power: a change re-requests every visible tile. */
    themeKey: string;
    onSelect(target: NavigationTarget): void;
    /** 'sheet' is the phone's first row of the Explore tab: 56 px tiles, in the flow (spec §9.8). */
    variant?: 'overlay' | 'sheet';
    collapsed?: boolean;
    onCollapsedChange?(collapsed: boolean): void;
}

/**
 * A tile canvas's backing store: its CSS size in device pixels (ruling
 * R20a-4), so the picture -- drawn at twice that by render_thumbnail.ts --
 * is downsampled once, smoothly, and never stretched. At least 2× the CSS
 * size, as before, so a 1× screen keeps its sharper glyph rings.
 */
export function tileBacking(px: number, devicePixelRatio: number): number {
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return Math.round(px * Math.max(2, dpr));
}

const Tile: React.FC<{ item: StripItem; px: number; rGrid: number[]; themeKey: string; onSelect(target: NavigationTarget): void }> = ({ item, px, rGrid, themeKey, onSelect }) => {
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
    const showGlyph = thumb.kind === 'orbital' && drawn !== wanted && (status !== 'ready' || failed === wanted);

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
                if (context) context.imageSmoothingQuality = 'high';
                context?.clearRect(0, 0, canvas.width, canvas.height);
                context?.drawImage(image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
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
                    <canvas ref={canvasRef} className="thumb-canvas" width={backing} height={backing} aria-hidden="true"
                        style={showGlyph ? { visibility: 'hidden' } : undefined} />
                )}
                {showGlyph && <span className="strip-tile-glyph" aria-hidden="true">{item.label}</span>}
            </span>
            <span className="strip-tile-label" aria-hidden="true">{item.label}</span>
        </div>
    );
};

/**
 * The thumbnail strip (spec §8.5 bottom zone, §9.1 "Strip", §13): a
 * listbox of labelled options, grouped by subshell, arrow keys inside and
 * Tab out, collapsible to a 28 px handle.
 */
const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({ items, label, rGrid, themeKey, onSelect, variant = 'overlay', collapsed = false, onCollapsedChange }) => {
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

    const groups: Array<{ label: string | null; spoken: string | null; items: StripItem[] }> = [];
    for (const item of items) {
        const last = groups[groups.length - 1];
        if (last && last.label === item.group) last.items.push(item);
        else groups.push({ label: item.group, spoken: item.groupSpoken, items: [item] });
    }
    const tile = (item: StripItem) => <Tile key={item.key} item={item} px={px} rGrid={rGrid} themeKey={themeKey} onSelect={onSelect} />;

    return (
        <div className={`thumbnail-strip ${variant}${collapsed ? ' collapsed' : ''}`}>
            {onCollapsedChange && (
                <button type="button" className="strip-handle" aria-expanded={!collapsed} aria-controls={collapsed ? undefined : listId}
                    aria-label={collapsed ? 'Show the orbital strip' : 'Hide the orbital strip'} onClick={() => onCollapsedChange(!collapsed)}>
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
};

export default ThumbnailStrip;
