import { DiagramLevel } from './mo_diagram';
import { evTickText, HARTREE_IN_EV } from '../format/energy';

/**
 * Science corrections S1 (critique P1): the MO diagram is drawn to one true eV scale. Every system shares this many px
 * per eV, so He₂'s 4 mHa split (0.5 px) looks like nothing and H₂'s 490 mHa split (67 px) like a gap; before, each
 * system's valence levels were stretched to fill the panel and pushed 20 px apart, and the two looked alike.
 */
export const MO_PX_PER_EV = 5;
/** The diagram's height cap: a system taller than this at MO_PX_PER_EV is the one exception, shrunk to fit and said so. */
export const MO_MAX_HEIGHT = 320;
/** A level box (.mo-box in style.css): 22 × 18 px, standing on its level line -- the box's bottom edge is the energy. */
export const MO_BOX_WIDTH = 22;
export const MO_BOX_HEIGHT = 18;
/** The diagram's width in BondsPanel's left column. */
export const MO_DIAGRAM_WIDTH = 260;
/** The axis gutter on the left (tick labels, ticks, the axis line at MO_AXIS_X); the levels start just past it. */
export const MO_AXIS_WIDTH = 34;
export const MO_AXIS_X = 31;
export const MO_LEVEL_LEFT = MO_AXIS_WIDTH + 4;
/** The room right of the axis that every level, offset or not, stays inside. */
export const MO_LEVEL_AREA_WIDTH = MO_DIAGRAM_WIDTH - MO_LEVEL_LEFT;

/** The highest energy the axis shows sits this far down: under the "eV" unit's 11 px line, half a 14 px tick label. */
const TOP = 18;
/** Half a 14 px tick label, which hangs below the lowest tick. */
const HALF_TICK = 7;
/** Under the lowest valence line, clear of a tick label there, the break's top. */
const BREAK_GAP = 9;
/** The "≈ core" break: one 13 px line between the valence levels and the core row, whose boxes stand right under it. */
export const MO_BREAK_LINE = 13;
/** Core levels (1σg, 1σu*: millihartree apart) share the band's one row, side by side. */
const CORE_COLUMN = 110;
/** .mo-level's flex gap between boxes and before the label, and .mo-label's left margin. */
const BOX_GAP = 4;
const LABEL_MARGIN = 6;
/** A 12 px label's width per character, on the generous side ("1πg*" estimates 30 px; it draws about 21 px live). */
const LABEL_CHAR_WIDTH = 7.5;
/** .mo-label's line (12 px type). */
const LABEL_LINE = 14;
/** Between two levels drawn side by side. */
const SIDE_GAP = 8;

/** One per level, in `levels`' order (lowest first); `y` is the level line its boxes stand on, `xOffset` from the levels' left edge. */
export interface MoLayoutRow { levelIndex: number; y: number; xOffset: number }
export interface MoLayoutTick { y: number; label: string }
export interface MoLayout {
    rows: MoLayoutRow[];
    /** `top` and `bottom`: where the axis line runs, the valence range (widened to two ticks when it holds fewer). */
    axis: { ticks: MoLayoutTick[]; pxPerEv: number; shrunk: boolean; top: number; bottom: number };
    height: number;
    /** The top of the "≈ core" line, between the lowest valence row and the core row; null without a core band. */
    breakY: number | null;
}

/** How wide a level is drawn: its boxes side by side, then its label. */
export function levelFootprint(level: DiagramLevel): number {
    const boxes = level.boxes.length * MO_BOX_WIDTH + (level.boxes.length - 1) * BOX_GAP;
    return boxes + BOX_GAP + LABEL_MARGIN + level.label.length * LABEL_CHAR_WIDTH;
}

interface Rect { left: number; right: number; top: number; bottom: number }

/** Where a level's boxes and label are drawn with its boxes starting at `x` and standing on its line at `y`. */
function levelRects(level: DiagramLevel, x: number, y: number): Rect[] {
    const boxesRight = x + level.boxes.length * MO_BOX_WIDTH + (level.boxes.length - 1) * BOX_GAP;
    return [
        { left: x, right: boxesRight, top: y - MO_BOX_HEIGHT, bottom: y },
        // The label is centred on the boxes beside it.
        { left: boxesRight + BOX_GAP + LABEL_MARGIN, right: x + levelFootprint(level), top: y - (MO_BOX_HEIGHT + LABEL_LINE) / 2, bottom: y - (MO_BOX_HEIGHT - LABEL_LINE) / 2 },
    ];
}

/** Two marks overlap, or stand closer side by side than SIDE_GAP. */
function overlaps(a: Rect, b: Rect): boolean {
    return a.left < b.right + SIDE_GAP && b.left < a.right + SIDE_GAP && a.top < b.bottom && b.top < a.bottom;
}

/** Ticks every 5 eV under a 20 eV span, else every 10 eV. */
function tickStep(spanEv: number): number {
    return spanEv < 20 ? 5 : 10;
}

/**
 * The diagram's geometry, top to bottom in px. `levels` is buildMoDiagram's, sorted ascending. Valence levels sit at
 * their true energies on one linear scale (MO_PX_PER_EV, unless the system would pass `maxHeight`; then the whole
 * scale shrinks and `axis.shrunk` says so). A level is never moved up or down for a neighbour: one whose box would
 * touch a level already placed (closer than a box height) is drawn beside it instead, so the upper of a close pair is
 * the one offset. The core
 * band keeps one row under a break, not to scale.
 */
export function layoutMoDiagram(levels: DiagramLevel[], opts: { pxPerEv?: number; maxHeight?: number } = {}): MoLayout {
    const maxHeight = opts.maxHeight ?? MO_MAX_HEIGHT;
    const valence = levels.flatMap((level, index) => (level.core ? [] : [{ level, index, ev: level.energyHartree * HARTREE_IN_EV }]));
    const core = levels.flatMap((level, index) => (level.core ? [{ level, index }] : []));
    if (valence.length === 0) {
        return { rows: [], axis: { ticks: [], pxPerEv: opts.pxPerEv ?? MO_PX_PER_EV, shrunk: false, top: TOP, bottom: TOP }, height: TOP + HALF_TICK, breakY: null };
    }

    const lo = Math.min(...valence.map(v => v.ev));
    const hi = Math.max(...valence.map(v => v.ev));
    const step = tickStep(hi - lo);
    const EPS = 1e-9;
    // An axis always carries two labelled ticks, so its scale can be read: a span holding fewer (He₂'s 0.1 eV, Li₂'s
    // 2.3 eV) widens to the tick values round it.
    let axisLo = lo;
    let axisHi = hi;
    if (Math.floor(hi / step + EPS) - Math.ceil(lo / step - EPS) < 1) {
        axisLo = Math.min(lo, Math.floor(lo / step + EPS) * step);
        axisHi = Math.max(hi, Math.ceil(hi / step - EPS) * step);
        if (axisHi - axisLo < step) axisHi = axisLo + step;
    }

    const bottomBand = core.length > 0 ? BREAK_GAP + MO_BREAK_LINE + MO_BOX_HEIGHT : HALF_TICK;
    const room = maxHeight - TOP - bottomBand;
    let pxPerEv = opts.pxPerEv ?? MO_PX_PER_EV;
    let shrunk = false;
    if ((axisHi - axisLo) * pxPerEv > room) {
        pxPerEv = room / (axisHi - axisLo);
        shrunk = true;
    }
    const yOf = (ev: number) => TOP + (axisHi - ev) * pxPerEv;
    const valenceBottom = yOf(axisLo);

    const ticks: MoLayoutTick[] = [];
    for (let k = Math.floor(axisHi / step + EPS); k * step >= axisLo - EPS; k--) {
        ticks.push({ y: yOf(k * step), label: evTickText(k * step) });
    }

    // A level is two marks: its boxes (18 px tall) and, past them, its label (one 14 px line). Each goes at the
    // leftmost place -- the start, or just past a level already drawn -- where neither mark touches one drawn before.
    const placed: Rect[] = [];
    const ends: number[] = [0];
    const rows: MoLayoutRow[] = valence.map(({ level, index, ev }) => {
        const y = yOf(ev);
        const x = [...ends].sort((a, b) => a - b).find(at => !levelRects(level, at, y).some(rect => placed.some(other => overlaps(rect, other))))!;
        placed.push(...levelRects(level, x, y));
        ends.push(x + levelFootprint(level) + SIDE_GAP);
        return { levelIndex: index, y, xOffset: x };
    });

    if (core.length === 0) {
        return { rows, axis: { ticks, pxPerEv, shrunk, top: TOP, bottom: valenceBottom }, height: valenceBottom + HALF_TICK, breakY: null };
    }
    const breakY = valenceBottom + BREAK_GAP;
    const coreY = breakY + MO_BREAK_LINE + MO_BOX_HEIGHT;
    const coreRows = core.map(({ index }, i) => ({ levelIndex: index, y: coreY, xOffset: i * CORE_COLUMN }));
    return { rows: [...coreRows, ...rows], axis: { ticks, pxPerEv, shrunk, top: TOP, bottom: valenceBottom }, height: coreY, breakY };
}
