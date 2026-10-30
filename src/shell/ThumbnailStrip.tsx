import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { NavigationTarget } from '../components/LevelNav';
import { thumbnailService, type ThumbRequest } from '../thumbs/ThumbnailService';
import { drawRingGlyph } from '../thumbs/ring_glyph';
import { drawStructureGlyph } from '../thumbs/structure_glyph';
import { lookTheme } from '../thumbs/thumb_key';
import { LIGHT_HYDROGEN } from '../design/science';
import { CPK_COLORS } from '../molecules/ball_and_stick';
import { TOKENS } from '../design/tokens';
import type { StripItem } from '../thumbs/strip_items';
import { useRovingFocus } from './useRovingFocus';
import { useMoreSideways } from './useMoreSideways';
import { contentBoxes, groupRest, measureShifts, useGroupPeek } from './useGroupPeek';
import { OrbitalLabel } from '../format/OrbitalLabel';
import { orbitalParts } from '../format/sci';
import { withSubscripts } from '../format/subscripts';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
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
    /**
     * Task 1 (picture control), opt-in: `false` makes the strip always expanded, with no collapse handle -- Orbitals
     * passes it, because the strip is its only picker and must never hide itself (Review Focus 1: `collapsed` is a
     * shared mode-wide preference, so Orbitals must not inherit a collapse set in Atoms, Bonds or Molecules). Default
     * `true` keeps every other strip's existing behaviour unchanged.
     */
    collapsible?: boolean;
    /** What the handle says it shows or hides (ruling R23b-3): "orbitals" (the default), or Molecules' "views". */
    handleNoun?: string;
    /** Labels that are words ("Electrostatic potential", Task 15) wrap to two centred lines, as the phone sheet's do. */
    wrapLabels?: boolean;
    /**
     * Task 2 (picture control), opt-in: the list scrolls one subshell group at a time -- `scroll-snap-type: x
     * proximity` on the list, `scroll-snap-align: start` on each group (strip.css) -- with a sideways tonal cue
     * (DESIGN.md "Tonal Scroll Cue Rule", turned sideways; useMoreSideways) on whichever edge has more off
     * screen. Orbitals passes it; default `false` leaves Atoms, Bonds and Molecules exactly as they were.
     */
    groupScroll?: boolean;
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

interface TileProps<T> {
    item: StripItem<T>; px: number; rGrid: number[]; themeKey: string; onSelect(target: T): void;
    /** Task 5b (finish fix 7, `groupScroll` only): a long name breaks before its "(", and nowhere inside either part. */
    splitLabel?: boolean;
}

/**
 * Task 5b (picture control, finish fix 7): past f an orbital is named by its mₗ -- "9g (mₗ = -2)" -- and a phone's
 * two-line tile label broke it mid-expression ("9g (mₗ =" / "-2)"). Its two parts each hold together, so the one
 * break left is the space before "(". Null for a name with nothing to split (a subscript name, a word label).
 */
function splitOrbitalLabel(orbital: StripItem<unknown>['orbital']): React.ReactNode {
    if (!orbital) return null;
    const { base, sub } = orbitalParts(orbital.n, orbital.l, orbital.ml);
    const at = base.indexOf(' (');
    if (sub !== null || at < 0) return null;
    return (
        <>
            <span className="strip-tile-label-part">{base.slice(0, at)}</span>{' '}
            <span className="strip-tile-label-part">{base.slice(at + 1)}</span>
        </>
    );
}

// A plain generic function, not React.FC<...> (which cannot carry a type
// parameter): T follows whatever StripItem<T> the enclosing strip was given.
function Tile<T>({ item, px, rGrid, themeKey, onSelect, splitLabel = false }: TileProps<T>) {
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

    // Task 15 (ruling P6): a molecule's structure, drawn here in Canvas 2D in the look's theme -- the text-3
    // outline, and hydrogen as the 3D view paints it (ruling R12) -- and redrawn when the theme changes.
    const theme = lookTheme(themeKey);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || thumb.kind !== 'structure') return;
        const context = canvas.getContext('2d');
        if (context) {
            drawStructureGlyph(context, canvas.width, thumb.atoms, thumb.representation,
                { outline: TOKENS[theme]['text-3'], hydrogen: theme === 'light' ? LIGHT_HYDROGEN : CPK_COLORS[1] });
        }
    }, [thumb, theme, backing]);

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

    // Task 5: an orbital's name with a real subscript ("3d" + sub "z²"), not the "3d_z²" string the label carries.
    // Task 8 (addendum 7, 9): an MO tile's label too -- 1π<sub>u</sub>, 1b<sub>1</sub>; words come back as they are.
    const labelText = (splitLabel && splitOrbitalLabel(item.orbital))
        || (item.orbital ? <OrbitalLabel {...item.orbital} /> : withSubscripts(item.label));
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
                {thumb.kind === 'back' ? <ArrowBack aria-hidden /> : thumb.kind === 'icon' ? (
                    // Molecules' "Orbital list" (Task 15; R25-A2): a fixed picture -- three orbital-like circles in the
                    // label's own colour, no science hue to key -- for a tile that opens a list.
                    <svg className="strip-tile-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="7" r="4" />
                        <circle cx="7" cy="16" r="4" />
                        <circle cx="17" cy="16" r="4" />
                    </svg>
                ) : (
                    // D15: shoot.mjs has no live hook into the thumbnail service, so it
                    // counts this attribute instead -- the picture (not the glyph) is
                    // showing. True for a ring or structure glyph tile at once (drawn
                    // on mount); for an orbital tile, only once its image has arrived
                    // (Task 10: was `!showGlyph`, which also counted a tile still waiting).
                    <canvas ref={canvasRef} className="thumb-canvas" width={backing} height={backing} aria-hidden="true"
                        data-drawn={!pending && (thumb.kind !== 'orbital' || drawn === wanted) ? 'true' : 'false'}
                        style={showGlyph ? { visibility: 'hidden' } : undefined} />
                )}
                {showGlyph && <span className="strip-tile-glyph" aria-hidden="true">{item.glyph ?? labelText}</span>}
            </span>
            <span className="strip-tile-label" aria-hidden="true">{labelText}</span>
        </div>
    );
}

/**
 * The thumbnail strip (spec §8.5 bottom zone, §9.1 "Strip", §13): a
 * listbox of labelled options, grouped by subshell, arrow keys inside and
 * Tab out, collapsible to a 28 px handle -- unless `collapsible={false}`
 * (Orbitals, Task 1), which shows no handle and is never collapsed. Task 2,
 * opt-in: `groupScroll` scrolls by subshell group with a sideways cue.
 */
// A plain generic function (not React.FC<...>, which cannot carry a type
// parameter): T is whatever StripItem<T> the caller's items are in -- the
// Atom strip's NavigationTarget (the default) or Basic Orbitals' BasicSelection.
function ThumbnailStrip<T = NavigationTarget>({
    items, label, rGrid, themeKey, onSelect, variant = 'overlay', collapsed = false, onCollapsedChange, collapsible = true,
    handleNoun = 'orbitals', wrapLabels = false, groupScroll = false,
}: ThumbnailStripProps<T>) {
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    // `collapsible={false}` (Task 1) ignores whatever `collapsed` carries over from another mode -- the strip is
    // always expanded, and offers no handle to hide it.
    const effectiveCollapsed = collapsible && collapsed;
    // Ruling DX2: the listbox mounts only while expanded, so `collapsed` re-attaches the roving focus to it.
    useRovingFocus(listRef, { selector: '[role="option"]', orientation: 'horizontal' }, effectiveCollapsed);
    // Task 2 review fix round 1 (I1): `enabled: groupScroll` -- every mode but Orbitals gets no observer and no
    // listener at all, not just gated classes. `resetKey` is the DX2 pattern above: the listbox remounts on
    // collapse/expand, and this re-attaches to the fresh node the same way useRovingFocus does.
    const { before, after } = useMoreSideways(listRef, { enabled: groupScroll, resetKey: effectiveCollapsed });
    // Task 5b (finish fix 8): a group whose snapped rest would end with nothing of the next group in view snaps a little
    // further on (a negative scroll-margin on its snap edge), so the next group's first tile and label show -- "more" is
    // seen, not only faded. Same opt-in and remount key as the cue.
    const peek = useGroupPeek(listRef, { enabled: groupScroll, resetKey: effectiveCollapsed });
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
        let left = Math.max(0, list.scrollLeft + (tileRect.left - listRect.left) - (list.clientWidth - tileRect.width) / 2);
        // Task 5b (finish fix 8): under groupScroll a pick rests where a snap would -- its group's rest, shifted so the
        // next group peeks -- whenever the picked tile stands clear of the fades there; otherwise it is centred.
        // Fix round 1 (review M3): the shifts are measured here, as the boxes lie now, rather than taken from the hook's
        // state -- so the strip scrolls once on load (not again when the hook has measured), and a resize alone, which
        // only changes the shifts, never scrolls the strip back to the selection; a new selection (or Shell n) does.
        if (groupScroll) {
            const { groups, elements, boxOf } = contentBoxes(list);
            const shifts = measureShifts(list);
            const index = elements.findIndex(element => element === selected.closest('.strip-group-snap'));
            const rest = groupRest(groups, elements.map((element, i) => shifts[element.dataset.groupKey ?? String(i)] ?? 0), index,
                boxOf(selected), list.clientWidth);
            if (rest !== null) left = rest;
        }
        if (typeof list.scrollTo === 'function') list.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
        else list.scrollLeft = left;
    }, [items, effectiveCollapsed, groupScroll]);

    const groups: Array<{ label: string | null; spoken: string | null; items: StripItem<T>[] }> = [];
    for (const item of items) {
        const last = groups[groups.length - 1];
        if (last && last.label === item.group) last.items.push(item);
        else groups.push({ label: item.group, spoken: item.groupSpoken, items: [item] });
    }
    const tile = (item: StripItem<T>) => (
        <Tile key={item.key} item={item} px={px} rGrid={rGrid} themeKey={themeKey} onSelect={onSelect} splitLabel={groupScroll} />
    );
    // Fix round 1 (review M6): a group's shift is found by its own key, not by the order the groups render in.
    const snapStyle = (key: string): React.CSSProperties | undefined => {
        const shift = groupScroll ? peek[key] ?? 0 : 0;
        return shift > 0 ? { scrollMarginLeft: -shift } : undefined;
    };

    return (
        <div className={`thumbnail-strip ${variant}${effectiveCollapsed ? ' collapsed' : ''}${wrapLabels ? ' wrap-labels' : ''}`}>
            {collapsible && onCollapsedChange && (
                // Ruling R23b-3: the handle names what it opens -- "Orbitals" plus the
                // action. The chevron stays aria-hidden (a bare glyph reads poorly), so
                // the accessible name is exactly the visible label, with no aria-label.
                <button type="button" className="strip-handle" aria-expanded={!effectiveCollapsed} aria-controls={effectiveCollapsed ? undefined : listId}
                    onClick={() => onCollapsedChange(!collapsed)}>
                    <span className="strip-handle-label">{effectiveCollapsed ? `Show ${handleNoun}` : `Hide ${handleNoun}`}</span>
                    {effectiveCollapsed ? <ExpandLess fontSize="small" aria-hidden="true" /> : <ExpandMore fontSize="small" aria-hidden="true" />}
                </button>
            )}
            {!effectiveCollapsed && (
                <div id={listId} ref={listRef} role="listbox" aria-label={label} aria-orientation="horizontal"
                    className={`strip-list${groupScroll ? ' group-scroll' : ''}${groupScroll && before ? ' has-more-before' : ''}${groupScroll && after ? ' has-more-after' : ''}`}>
                    {groups.map((group, index) => (group.label ? (
                        <div key={`${group.label}-${index}`} role="group" aria-label={group.spoken ?? group.label}
                            className={`strip-group${groupScroll ? ' strip-group-snap' : ''}`}
                            data-group-key={groupScroll ? `${group.label}-${index}` : undefined} style={snapStyle(`${group.label}-${index}`)}>
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
