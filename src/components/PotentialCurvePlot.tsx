import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { BOHR_TO_ANGSTROM, HARTREE_TO_EV } from '../bonds/systems';
import { withSubscripts } from '../format/subscripts';
import { minus } from '../format/sci';

/**
 * Energy against internuclear distance, with the geometry on screen marked.
 * Presentational: the caller chooses what E means (E − E(separated atoms)
 * in eV, say) and says so in `title` and `unit` -- this component never
 * guesses a method, a bond, or a scale of its own. Task 7a: it keeps its
 * axis labels and the reference rule's label; the method and the zero are
 * said in Info (bondsInfo), not under the plot.
 */
export interface CurveSeries {
    key: string;
    label: string;
    /** Task 5b (finish fix 6): the caller's plain words for this curve, for Basics' legend ("bonding"). Without, `label`. */
    plainLabel?: string;
    color: string;
    points: Array<{ R: number; E: number }>;
}

interface PotentialCurvePlotProps {
    title: string;
    unit: string;
    series: CurveSeries[];
    xRange: [number, number];
    yRange: [number, number];
    markerR: number | null;
    /** Scan geometries, ticked on the axis: the keyboard slider steps over these, one point per press. */
    snapRs?: number[];
    /**
     * A line across the plot at one R (Bonds: the fitted Rₑ), with its label, and the caller's plain words for it -- what
     * the line means is the caller's to say, at either level. Without a plainLabel, plain mode keeps `label`.
     */
    referenceR?: { R: number; label: string; plainLabel?: string } | null;
    width: number;
    /** A tap, or the release of a drag, chooses R (clamped to xRange); the caller snaps it. */
    onSelectR?: (R: number) => void;
    /**
     * Task 3 (picture control): each R a drag passes, before its release commits through onSelectR -- so the caller can
     * move its marker, slider and readout with the pointer while the heavier redraw waits, as a slider drag does. null
     * when the browser takes the gesture over (a scroll on a touch screen): the drag chose nothing.
     */
    onDragR?: (R: number | null) => void;
    /**
     * Whether the plot offers its own keyboard control for R (a visually hidden range input). Default true. Task 3: off
     * under Bonds' R slider, which is the keyboard path there -- two controls for one value would put two R stops in
     * the Tab order, the hidden one invisible.
     */
    keyboardControl?: boolean;
    /**
     * Task 4 (picture control): plain words, for Basics -- the energy axis reads "Energy (<unit>)", the distance axis
     * "Distance between nuclei (Å)" between its ends in Å, and the reference line takes the caller's `plainLabel`.
     * Labels only: the curves, the marker, the ticks and the text alternative are the same either way.
     */
    plain?: boolean;
    /**
     * Task 5b (picture control, finish fix 3): told the margins the plot draws with -- its left one widens to fit the
     * energy labels -- whenever they change, and null when the plot goes; so a control above it (Bonds' R slider) can
     * inset its track to the plotted x range and stand its thumb over the marker.
     */
    onInset?: (inset: PlotInset | null) => void;
    /**
     * Task 5b fix round 1 (review I1): the key of the series the marker's handle rides -- Bonds: the drawn state's curve.
     * Absent, or naming no series, the first.
     */
    handleKey?: string;
}

/** The plot area's distance from the svg's left and right edges, px. */
export interface PlotInset { left: number; right: number }

const HEIGHT = 130;
/**
 * The plot area's padding, px; `left` is the least left margin (it widens to fit the energy labels). Exported with
 * plotX, the plot's x scale, so a control aligned with the plot (finish fix 3) uses these numbers, not copies.
 */
export const PLOT_PAD = { left: 34, right: 8, top: 8, bottom: 18 } as const;
const PAD = PLOT_PAD;
/** The handle's hit area on the curve (finish fix 4): the touch size, 44 px across. */
const HANDLE_HIT_RADIUS = 22;

/** Where R stands across an svg `width` wide whose plot area starts `left` px in and ends PLOT_PAD.right px short. */
export function plotX(R: number, xRange: [number, number], width: number, left: number): number {
    return left + ((R - xRange[0]) / (xRange[1] - xRange[0])) * (width - left - PAD.right);
}
/** The energy labels' x, and the least room between their right end and the axis, px. */
const LABEL_X = 2;
const LABEL_GAP = 4;

export function interpolateEnergy(points: Array<{ R: number; E: number }>, R: number): number | null {
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (R >= a.R && R <= b.R) return a.E + ((R - a.R) / (b.R - a.R)) * (b.E - a.E);
    }
    return null;
}

/** R in a₀ with Å beside it (global constraint: atomic units in code, Å only at display, always beside the a₀ value). */
function formatR(R: number): string {
    return `${R.toFixed(2)} a₀ (${(R * BOHR_TO_ANGSTROM).toFixed(2)} Å)`;
}

/** E in whichever unit the caller states, with the other beside it -- same constraint, for energy. Unrecognised units are shown bare rather than guessed at. */
function formatEnergy(E: number, unit: string): string {
    // Task 7a fix round 1 (M9): a true minus (U+2212), not a hyphen.
    if (unit === 'Ha') return minus(`${E.toFixed(4)} Ha (${(E * HARTREE_TO_EV).toFixed(2)} eV)`);
    if (unit === 'eV') return minus(`${E.toFixed(2)} eV (${(E / HARTREE_TO_EV).toFixed(4)} Ha)`);
    return `${E} ${unit}`;
}

/** H₂⁺'s continuous R step, a₀ (ruling C14); a scan steps over its points instead. */
const CONTINUOUS_STEP = 0.01;

/** The scan point nearest R, by index into the sorted list. */
function nearestIndex(sorted: number[], R: number): number {
    let best = 0;
    sorted.forEach((value, i) => { if (Math.abs(value - R) < Math.abs(sorted[best] - R)) best = i; });
    return best;
}

/**
 * An axis end, a₀, with its unit: two decimals, as R is printed everywhere else, a whole number bare -- "0.50 a₀" …
 * "10 a₀" (Task 5b, finish fix 5: both ends alike, each with its unit).
 */
const axisR = (R: number) => {
    const fixed = R.toFixed(2);
    return `${Number.isInteger(Number(fixed)) ? String(Number(fixed)) : fixed} a₀`;
};
/** An R in Å, two decimals, for the axis ends. */
const angstrom = (R: number) => (R * BOHR_TO_ANGSTROM).toFixed(2);
/** Task 5b (finish fix 6): an energy end at Basics, to 2 significant figures, with a true minus: "8.2", "−9.9". */
const roundedEnergy = (E: number) => minus(String(Number(E.toPrecision(2))));
/**
 * The least distance between the 0 label's centre and an end label's before the end gives way, px (11 px type on a
 * 14 px line, plus room). Fix round 1 (verdict pass 1): 12 px let He₂'s 0 crowd "−0.26" at 12.6 px apart.
 */
const LABEL_CLEARANCE = 16;

const PotentialCurvePlot: React.FC<PotentialCurvePlotProps> = ({
    title, unit, series, xRange, yRange, markerR, snapRs = [], referenceR = null, width, onSelectR, onDragR, keyboardControl = true,
    plain = false, onInset, handleKey,
}) => {
    const clipId = useId();

    // Task 4 (picture control): the energy labels sit left of the axis, and the margin is at least as wide as they are
    // -- He₂'s "−0.0664" outgrew the fixed 34 px and ran over the axis and the first scan tick. Measured before paint;
    // where text cannot be measured (jsdom) the margin stays PAD.left.
    // Task 5b (finish fix 6): at Basics the ends are rounded to 2 significant figures.
    const yLabels = plain
        ? [roundedEnergy(yRange[1]), roundedEnergy(yRange[0])]
        : [minus(yRange[1].toPrecision(3)), minus(yRange[0].toPrecision(3))];
    const [topLabel, bottomLabel] = yLabels;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const y = (E: number) => PAD.top + (1 - (E - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight;

    // Task 5b (finish fix 6): at Basics, 0 is labelled where the separated-atoms line runs, and an end label that would
    // sit on it gives way (N₂'s top end, 0.47, is just above zero). Label centres: the top's at PAD.top + 4, the
    // bottom's 4 px above the axis, the 0's on its line.
    const zeroY = plain && yRange[0] < 0 && yRange[1] > 0 ? y(0) : null;
    const clearOfZero = (centre: number) => zeroY === null || Math.abs(zeroY - centre) >= LABEL_CLEARANCE;
    const showTop = clearOfZero(PAD.top + 4);
    const showBottom = clearOfZero(PAD.top + plotHeight - 4);
    const labelRefs = useRef<Array<SVGTextElement | null>>([]);
    const [labelWidth, setLabelWidth] = useState(0);
    useLayoutEffect(() => {
        // Only the labels drawn: one that gives way to the 0 (finish fix 6) leaves a hole or a null here.
        const widths = labelRefs.current.filter(Boolean).map(text => (typeof text!.getComputedTextLength === 'function' ? text!.getComputedTextLength() : 0));
        setLabelWidth(Math.ceil(Math.max(0, ...widths)));
    }, [topLabel, bottomLabel, showTop, showBottom]);
    const left = Math.max(PAD.left, LABEL_X + labelWidth + LABEL_GAP);

    // Finish fix 3: the margins drawn with, said to the caller -- again whenever the left one moves, and null on unmount.
    const insetRef = useRef(onInset);
    insetRef.current = onInset;
    useLayoutEffect(() => { insetRef.current?.({ left, right: PAD.right }); }, [left]);
    useLayoutEffect(() => () => insetRef.current?.(null), []);

    const plotWidth = width - left - PAD.right;
    const x = (R: number) => plotX(R, xRange, width, left);

    /** The pointer's x in the svg's own px. */
    const svgXOf = (event: React.MouseEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return (event.clientX - rect.left) * (rect.width > 0 ? width / rect.width : 1);
    };
    // Fix round 1 (review M2): a drag that starts on the handle's 44 px hit area, off its centre, keeps that offset --
    // R follows the pointer's travel, so grabbing the handle never jumps R by up to half the hit area.
    const grabOffset = useRef(0);
    /** The R under the pointer (less a grab's offset), clamped to the plotted range: a tap beside the plot area takes the nearer end. */
    const pointerR = (event: React.MouseEvent<SVGSVGElement>, offset = 0) => {
        const R = xRange[0] + ((svgXOf(event) - offset - left) / plotWidth) * (xRange[1] - xRange[0]);
        return Math.min(xRange[1], Math.max(xRange[0], R));
    };

    // Task 3 (picture control): a drag. The pointer is captured, so a release beside the plot still ends it here; the
    // release commits, and the click the browser sends after it is not a second commit. Task 4 (T3 M1): it belongs to
    // the pointer that started it -- another pointer's events are ignored -- and it never sticks: a lost capture
    // (a context menu, a window blur, with no release) cancels it as pointercancel does, dropping the draft.
    const dragging = useRef(false);
    const dragPointer = useRef<number | undefined>(undefined);
    const committedOnRelease = useRef(false);
    const draggable = Boolean(onSelectR && onDragR);
    const isDragPointer = (event: React.PointerEvent<SVGSVGElement>) => dragging.current && event.pointerId === dragPointer.current;
    const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
        if (dragging.current) return;
        committedOnRelease.current = false;
        if (!draggable || event.button !== 0) return;
        dragging.current = true;
        dragPointer.current = event.pointerId;
        const onHandle = handle !== null && (event.target as Element).classList?.contains('potential-handle-hit');
        grabOffset.current = onHandle ? svgXOf(event) - handle!.cx : 0;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onDragR!(pointerR(event, grabOffset.current));
    };
    const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!isDragPointer(event)) return;
        // Fix round 1 (M1): a mouse moving with no button held has been released where we never heard it (a macOS
        // ctrl-click menu, an app switch, with no lost capture either) -- a cancel, not a commit.
        if (event.pointerType === 'mouse' && event.buttons === 0) {
            handlePointerCancel(event);
            return;
        }
        onDragR!(pointerR(event, grabOffset.current));
    };
    const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!isDragPointer(event)) return;
        dragging.current = false;
        committedOnRelease.current = true;
        onSelectR!(pointerR(event, grabOffset.current));
    };
    const handlePointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!isDragPointer(event)) return;
        dragging.current = false;
        onDragR!(null);
    };
    const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
        // A second pointer's tap during a drag is not a choice; the drag's release is.
        if (!onSelectR || dragging.current) return;
        if (committedOnRelease.current) {
            committedOnRelease.current = false;
            return;
        }
        onSelectR(pointerR(event));
    };

    // In range only: a series without a value at markerR (an orbital that
    // does not exist there) or one whose value falls outside yRange is
    // reported as absent rather than drawn off-scale or clamped into a false
    // position (D14 -- the brief's own sample test expected a dot for both
    // series here, but series u's value at R = 2 sits outside yRange; that
    // dot is correctly missing, not a bug to paper over).
    const stops = [...snapRs].sort((a, b) => a - b);
    const stopIndex = nearestIndex(stops, markerR ?? xRange[0]);

    const markerEnergies = markerR === null ? [] : series.map(s => ({ s, E: interpolateEnergy(s.points, markerR) }));
    const inRangeMarkers = markerEnergies.filter(
        (m): m is { s: CurveSeries; E: number } => m.E !== null && m.E >= yRange[0] && m.E <= yRange[1],
    );
    // Task 5b (finish fix 4): where R can be set here, the marker carries a handle on the first curve, so the thing to
    // drag is seen. Where that curve has left the plot (or has no value at R), the handle keeps to the plot area on the
    // marker line: at the edge the curve left through, or on the axis.
    // Fix round 1 (review I1, I2): it rides the caller's `handleKey` series (the drawn state's curve), else the first.
    // Where that curve is off the plot at R, or has no value there, it is drawn hollow -- the ring only, no fill -- so
    // it never reads as a point at a false energy (D14 above), and stays grabbable on the marker line at the edge.
    const handle = (() => {
        if (markerR === null || !onSelectR || series.length === 0) return null;
        const index = Math.max(0, series.findIndex(s => s.key === handleKey));
        const E = markerEnergies[index].E;
        const top = PAD.top;
        const bottom = PAD.top + plotHeight;
        const offScale = E === null || E < yRange[0] || E > yRange[1];
        const cy = E === null ? bottom : Math.min(bottom, Math.max(top, y(E)));
        return { cx: x(markerR), cy, color: series[index].color, offScale };
    })();

    return (
        <div
            className={`radial-plot potential-curve${onSelectR ? ' interactive' : ''}`}
            role="figure"
            aria-label="potential energy curve"
            style={{ maxWidth: width + 22 }}
        >
            <div className="radial-plot-title">{plain ? `Energy (${unit})` : `${title} (${unit})`}</div>
            {/* The svg and, over it, the marker's handle (finish fix 4): an HTML dot, so it can wear the selected halo's
                box-shadow token, which no SVG filter takes. It lets every tap through to the svg below. */}
            <div className="potential-plot-area" style={{ width, height: HEIGHT }}>
                <svg
                    width={width}
                    height={HEIGHT}
                    role="img"
                    aria-label={plain ? 'Energy against the distance between nuclei' : `${title} against R`}
                    onClick={handleClick}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onLostPointerCapture={handlePointerCancel}
                    // A sideways drag is the plot's; an up-or-down one still scrolls the panel (and cancels the drag).
                    style={{ cursor: onSelectR ? 'pointer' : undefined, touchAction: draggable ? 'pan-y' : undefined }}
                >
                    <defs>
                        <clipPath id={clipId}><rect x={left} y={PAD.top} width={plotWidth} height={plotHeight} /></clipPath>
                    </defs>
                    <g clipPath={`url(#${clipId})`}>
                        {series.map(s => (
                            <path key={s.key} className="radial-plot-line" fill="none" style={{ stroke: s.color }}
                                d={`M ${s.points.map(p => `${x(p.R).toFixed(2)},${y(p.E).toFixed(2)}`).join(' L ')}`} />
                        ))}
                    </g>
                    <line className="radial-plot-axis" x1={left} x2={width - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} />
                    {snapRs.map(R => (
                        <line key={R} className="radial-plot-peak" x1={x(R)} x2={x(R)} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight - 4} />
                    ))}
                    {/* Labelled visibly below, as plain text (not an SVG <title>,
                        which only a pointing device's hover ever surfaces) --
                        see .potential-reference-note. */}
                    {referenceR && (
                        <line className="potential-reference" x1={x(referenceR.R)} x2={x(referenceR.R)} y1={PAD.top} y2={PAD.top + plotHeight} />
                    )}
                    {markerR !== null && (
                        <>
                            <line className="potential-marker" x1={x(markerR)} x2={x(markerR)} y1={PAD.top} y2={PAD.top + plotHeight} />
                            {inRangeMarkers.map(({ s, E }) => (
                                <circle key={s.key} className="potential-marker-dot" cx={x(markerR)} cy={y(E)} r={3} style={{ fill: s.color }} />
                            ))}
                        </>
                    )}
                    {/* The handle's hit area, the touch size across: a finger on it drags R whichever way it wanders. */}
                    {handle && (
                        <circle className="potential-handle-hit" cx={handle.cx} cy={handle.cy} r={HANDLE_HIT_RADIUS} fill="transparent"
                            style={{ cursor: 'ew-resize', touchAction: 'none' }} />
                    )}
                    {showTop && (
                        <text ref={node => { labelRefs.current[0] = node; }} x={LABEL_X} y={PAD.top + 8} className="potential-axis-label">{topLabel}</text>
                    )}
                    {showBottom && (
                        <text ref={node => { labelRefs.current[1] = node; }} x={LABEL_X} y={PAD.top + plotHeight} className="potential-axis-label">{bottomLabel}</text>
                    )}
                    {zeroY !== null && <text x={LABEL_X} y={zeroY + 4} className="potential-axis-label">0</text>}
                </svg>
                {handle && (
                    <span className={`potential-handle${handle.offScale ? ' off-scale' : ''}`} aria-hidden="true"
                        style={{ left: handle.cx, top: handle.cy, backgroundColor: handle.offScale ? undefined : handle.color }} />
                )}
            </div>
            {/*
                For a caller with no keyboard control of its own for R: a
                native range input, visually hidden, gives Tab + arrow-key
                (and Home/End/Page) operation of the same R choice the svg's
                onClick offers only to a pointer -- rather than reimplementing
                key handling on a role="img" element, which would make that
                role a lie. Task 4 (T3 M3): no caller uses it today. Bonds,
                the one caller, turns it off (keyboardControl={false}) because
                its R slider is the keyboard path there.
            */}
            {onSelectR && keyboardControl && (stops.length >= 2 ? (
                // A scan exists only at its points, which thin out away from
                // R_e: stepping R by the smallest spacing from a sparse point
                // landed between it and the next, and the caller's snap sent
                // it straight back (final review M5). The slider steps over
                // point indices instead, so each arrow press reaches the
                // next shipped geometry; aria-valuetext reads R, not the index.
                <input
                    type="range"
                    className="visually-hidden"
                    aria-label={`${title}: choose R`}
                    min={0}
                    max={stops.length - 1}
                    step={1}
                    value={stopIndex}
                    aria-valuetext={`R = ${formatR(stops[stopIndex])}`}
                    onChange={event => onSelectR(stops[Number(event.target.value)])}
                />
            ) : (
                <input
                    type="range"
                    className="visually-hidden"
                    aria-label={`${title}: choose R`}
                    min={xRange[0]}
                    max={xRange[1]}
                    step={CONTINUOUS_STEP}
                    value={markerR ?? xRange[0]}
                    onChange={event => onSelectR(Number(event.target.value))}
                />
            ))}
            <div className="radial-plot-legend">
                {series.map(s => (
                    <span key={s.key} className="radial-plot-legend-item">
                        <span className="radial-plot-legend-swatch" style={{ background: s.color }} />
                        {plain && s.plainLabel ? s.plainLabel : withSubscripts(s.label) /* Task 8: 1σ<sub>g</sub>; Task 5b: plain words at Basics */}
                    </span>
                ))}
            </div>
            {/* Fix round 1 (M4): padded to the plot area, so the end values stand under the axis ends. */}
            <div className="radial-plot-scale" style={{ width, boxSizing: 'border-box', paddingLeft: left, paddingRight: PAD.right }}>
                {plain ? (
                    // Task 4: the ends in Å, and the axis named in words between them.
                    <>
                        <span>{angstrom(xRange[0])}</span>
                        <span>Distance between nuclei (Å)</span>
                        <span>{angstrom(xRange[1])}</span>
                    </>
                ) : (
                    // A scan's ends are arbitrary floats; R is shown to 0.01 a₀ everywhere else. Task 5b (finish fix 5):
                    // both ends alike, each with its unit, and the axis named between them -- the maximum is never fused
                    // into the name, where "R (10 a₀ · 5.29 Å)" read as "R in units of 10 a₀".
                    <>
                        <span>{axisR(xRange[0])}</span>
                        <span>R</span>
                        <span>{axisR(xRange[1])}</span>
                    </>
                )}
            </div>
            {/* The reference a caller passes (Bonds: R_e, with D_e in its
                label) is drawn as a rule above; its label is plain text here rather
                than an SVG <title> (a pointing-device-only tooltip), so it
                reads for everyone, not just a mouse hovering the rule.
                Task 7a: R_e and D_e with a real subscript, never "_".
                Task 4: in plain words, the caller's plainLabel for it. */}
            {referenceR && (
                <div className="radial-plot-note potential-reference-note">
                    {withSubscripts(plain ? referenceR.plainLabel ?? referenceR.label : referenceR.label)}
                </div>
            )}
            {/* The text alternative to the pixels: the current geometry and
                each curve's value there (series without a value, or whose
                value falls outside the plotted range, are read as "no value
                here" rather than silently omitted -- spec §3.5, failures are
                shown). Always present (not just on hover), since a screen
                reader has no hover. */}
            <div className="potential-text-alt visually-hidden">
                {markerR !== null && (
                    <>
                        At R = {formatR(markerR)}: {series.map(s => {
                            const m = markerEnergies.find(e => e.s === s)!;
                            const inRange = inRangeMarkers.some(e => e.s === s);
                            return `${s.label} = ${inRange ? formatEnergy(m.E as number, unit) : 'no value here'}`;
                        }).join('; ')}.
                    </>
                )}
            </div>
        </div>
    );
};

export default PotentialCurvePlot;
