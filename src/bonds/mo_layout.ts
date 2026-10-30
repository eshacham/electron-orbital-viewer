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
/**
 * A level box (.mo-box in style.css): 22 × 18 px, border-box, its 2 px bottom border the level line. The line's centre
 * is the energy: a box spans [y − 17, y + 1] (.mo-level is the box's height, moved up by all of it less 1 px).
 */
export const MO_BOX_WIDTH = 22;
export const MO_BOX_HEIGHT = 18;
const LINE_HALF = 1;
/** The diagram's width in BondsPanel's left column, MoDiagram's default. */
export const MO_DIAGRAM_WIDTH = 260;
/** The axis gutter on the left (tick labels, ticks, the axis line at MO_AXIS_X); the levels start just past it. */
export const MO_AXIS_WIDTH = 34;
export const MO_AXIS_X = 31;
export const MO_LEVEL_LEFT = MO_AXIS_WIDTH + 4;
/** A break ("≈ core", "≈ higher empty levels"): one 13 px line of 11 px type. */
export const MO_BREAK_LINE = 13;

/** The "eV" unit's 11 px line at the top of the gutter, then half a 14 px tick label. */
const UNIT_LINE = 11;
const HALF_TICK = 7;
/** Under the lowest valence line, clear of a tick label there, the core break's top. */
const BREAK_GAP = 9;
/** Between a band's row and its break line. */
const BAND_GAP = 3;
/** Ticks never closer than this: a 14 px label and some air (fix round 1, I1). */
const MIN_TICK_GAP = 16;
/** Tick steps in eV, the finest first; a shrunk scale takes the first at least MIN_TICK_GAP apart. */
const TICK_STEPS = [5, 10, 20, 50, 100, 200, 500, 1000];
/** .mo-level's flex gap between boxes and before the label, and .mo-label's left margin: 6 px from boxes to label. */
const BOX_GAP = 4;
const LABEL_MARGIN = 2;
/** .mo-label's ink line (12 px type), centred on the boxes. */
const LABEL_LINE = 14;
/** Between two levels drawn side by side: wider than a level's own box-to-label gap, so a label reads as its own level's. */
const SIDE_GAP = 8;

/**
 * A label's width, per character, in the 12 px label type (fix round 1, I2: measured live at 1440 × 900, each rounded
 * up -- the widest Bonds labels draw 26.8 px for "3σu*" and 15.3 px for "4σ", estimated 27.5 and 15.3). A g or u is
 * a subscript; anything else is taken as a digit.
 */
const LABEL_GLYPH: Record<string, number> = { '1': 5.5, σ: 7.3, π: 7, g: 6.2, u: 6.2, '*': 6 };
const LABEL_DIGIT = 8;

export interface MoLayoutRow { levelIndex: number; y: number; xOffset: number }
export interface MoLayoutTick { y: number; label: string }
export interface MoLayout {
    /** One per level, in `levels`' order (lowest first); `y` is the centre of its level line, `xOffset` from the levels' left edge. */
    rows: MoLayoutRow[];
    /** `top` and `bottom`: where the axis line runs, the valence range (widened to two ticks when it holds fewer). */
    axis: { ticks: MoLayoutTick[]; pxPerEv: number; shrunk: boolean; top: number; bottom: number };
    height: number;
    /** The top of the "≈ core" line, between the lowest valence row and the core row; null without a core band. */
    breakY: number | null;
    /** The top of the "≈ higher empty levels" line, between the folded row and the highest valence row; null without one. */
    upperBreakY: number | null;
}

/** A level's label width, as drawn. */
function labelWidth(label: string): number {
    return [...label].reduce((sum, ch) => sum + (LABEL_GLYPH[ch] ?? LABEL_DIGIT), 0);
}

/** How wide a level is drawn: its boxes side by side, then its label. */
export function levelFootprint(level: DiagramLevel): number {
    const boxes = level.boxes.length * MO_BOX_WIDTH + (level.boxes.length - 1) * BOX_GAP;
    return boxes + BOX_GAP + LABEL_MARGIN + labelWidth(level.label);
}

interface Rect { left: number; right: number; top: number; bottom: number }

/** Where a level's boxes and label are drawn with its boxes starting at `x` and its line centred on `y`. */
function levelRects(level: DiagramLevel, x: number, y: number): Rect[] {
    const boxesRight = x + level.boxes.length * MO_BOX_WIDTH + (level.boxes.length - 1) * BOX_GAP;
    const boxTop = y + LINE_HALF - MO_BOX_HEIGHT;
    const middle = boxTop + MO_BOX_HEIGHT / 2;
    return [
        { left: x, right: boxesRight, top: boxTop, bottom: y + LINE_HALF },
        { left: boxesRight + BOX_GAP + LABEL_MARGIN, right: x + levelFootprint(level), top: middle - LABEL_LINE / 2, bottom: middle + LABEL_LINE / 2 },
    ];
}

/** Two marks overlap, or stand closer side by side than SIDE_GAP. */
function overlaps(a: Rect, b: Rect): boolean {
    return a.left < b.right + SIDE_GAP && b.left < a.right + SIDE_GAP && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The diagram's geometry, top to bottom in px. `levels` is buildMoDiagram's, sorted ascending.
 * - Valence levels -- every occupied level, and the LUMO -- sit at their true energies on one linear scale:
 *   MO_PX_PER_EV, unless the system would pass `maxHeight`; then the whole scale shrinks and `axis.shrunk` says so.
 * - Ticks every 5 eV under a 20 eV span, else every 10 eV; coarser (20, 50, …) when a shrunk scale would put them
 *   under 16 px apart. An axis holding fewer than two widens to the round values on either side.
 * - A level is never moved up or down. Levels are placed lowest first, each at the leftmost x -- the start, or just
 *   past a level already drawn -- where neither its boxes nor its label touch a level drawn before it. So of two
 *   levels closer than a box, the one placed later (the higher) moves right, unless the lower one already had.
 * - The core band (under a break) and the folded higher empty levels (over one) each keep one row, in energy order
 *   left to right, not to scale.
 */
export function layoutMoDiagram(levels: DiagramLevel[], opts: { pxPerEv?: number; maxHeight?: number; width?: number } = {}): MoLayout {
    const maxHeight = opts.maxHeight ?? MO_MAX_HEIGHT;
    const areaWidth = (opts.width ?? MO_DIAGRAM_WIDTH) - MO_LEVEL_LEFT;
    const valence = levels.flatMap((level, index) => (level.core || level.folded ? [] : [{ level, index, ev: level.energyHartree * HARTREE_IN_EV }]));
    const core = levels.flatMap((level, index) => (level.core ? [index] : []));
    const folded = levels.flatMap((level, index) => (level.folded ? [index] : []));

    // Top: the folded row and its break, if any; then the valence scale.
    const upperY = folded.length > 0 ? MO_BOX_HEIGHT - LINE_HALF : null;
    const upperBreakY = upperY === null ? null : upperY + LINE_HALF + BAND_GAP;
    // The "eV" unit heads the scale: at the top, or just under the upper break (MoDiagram draws it there).
    const top = (upperBreakY === null ? 0 : upperBreakY + MO_BREAK_LINE) + Math.max(UNIT_LINE + HALF_TICK, MO_BOX_HEIGHT - LINE_HALF);
    // The core and folded bands: one row each, in energy order left to right, in columns that split the level area.
    const bandRows = (indices: number[], y: number) =>
        indices.map((levelIndex, i) => ({ levelIndex, y, xOffset: i * (areaWidth / Math.max(2, indices.length)) }));
    const upperRows = upperY === null ? [] : bandRows(folded, upperY);
    if (valence.length === 0) {
        return { rows: upperRows, axis: { ticks: [], pxPerEv: opts.pxPerEv ?? MO_PX_PER_EV, shrunk: false, top, bottom: top }, height: top + HALF_TICK, breakY: null, upperBreakY };
    }

    const lo = Math.min(...valence.map(v => v.ev));
    const hi = Math.max(...valence.map(v => v.ev));
    const bottomBand = core.length > 0 ? BREAK_GAP + MO_BREAK_LINE + MO_BOX_HEIGHT : HALF_TICK;
    const room = maxHeight - top - bottomBand;
    const EPS = 1e-9;
    let stepIndex = hi - lo < 20 ? 0 : 1;
    let step: number, axisLo: number, axisHi: number, pxPerEv: number, shrunk: boolean;
    for (;;) {
        step = TICK_STEPS[stepIndex];
        // An axis always carries two labelled ticks, so its scale can be read: a span holding fewer (He₂'s 0.1 eV, Li₂'s
        // 2.3 eV) widens to the tick values round it.
        axisLo = lo;
        axisHi = hi;
        if (Math.floor(hi / step + EPS) - Math.ceil(lo / step - EPS) < 1) {
            axisLo = Math.min(lo, Math.floor(lo / step + EPS) * step);
            axisHi = Math.max(hi, Math.ceil(hi / step - EPS) * step);
            if (axisHi - axisLo < step) axisHi = axisLo + step;
        }
        pxPerEv = opts.pxPerEv ?? MO_PX_PER_EV;
        shrunk = (axisHi - axisLo) * pxPerEv > room;
        if (shrunk) pxPerEv = room / (axisHi - axisLo);
        if (step * pxPerEv >= MIN_TICK_GAP || stepIndex === TICK_STEPS.length - 1) break;
        stepIndex++;
    }
    const yOf = (ev: number) => top + (axisHi - ev) * pxPerEv;
    const valenceBottom = yOf(axisLo);

    const ticks: MoLayoutTick[] = [];
    for (let k = Math.floor(axisHi / step + EPS); k * step >= axisLo - EPS; k--) {
        ticks.push({ y: yOf(k * step), label: evTickText(k * step) });
    }

    const placed: Rect[] = [];
    const ends: number[] = [0];
    const rows: MoLayoutRow[] = valence.map(({ level, index, ev }) => {
        const y = yOf(ev);
        const free = (at: number) => !levelRects(level, at, y).some(rect => placed.some(other => overlaps(rect, other)));
        const x = [...ends].sort((a, b) => a - b).find(free)!;
        placed.push(...levelRects(level, x, y));
        ends.push(x + levelFootprint(level) + SIDE_GAP);
        return { levelIndex: index, y, xOffset: x };
    });
    const axis = { ticks, pxPerEv, shrunk, top, bottom: valenceBottom };

    if (core.length === 0) {
        return { rows: [...rows, ...upperRows], axis, height: valenceBottom + HALF_TICK, breakY: null, upperBreakY };
    }
    const breakY = valenceBottom + BREAK_GAP;
    const coreY = breakY + MO_BREAK_LINE + MO_BOX_HEIGHT - LINE_HALF;
    return { rows: [...bandRows(core, coreY), ...rows, ...upperRows], axis, height: coreY + LINE_HALF, breakY, upperBreakY };
}

