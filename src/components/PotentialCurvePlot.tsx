import React, { useId } from 'react';
import { BOHR_TO_ANGSTROM, HARTREE_TO_EV } from '../bonds/systems';

/**
 * Energy against internuclear distance, with the geometry on screen marked.
 * Presentational: the caller chooses what E means (absolute Ha for H₂⁺,
 * E − E_min in eV for a scan) and says so in `unit` and `caption` -- this
 * component never guesses a method, a bond, or a scale of its own.
 */
export interface CurveSeries {
    key: string;
    label: string;
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
    /** Scan geometries, ticked on the axis: the slider snaps to these. */
    snapRs?: number[];
    referenceR?: { R: number; label: string } | null;
    caption: string;
    width: number;
    onSelectR?: (R: number) => void;
}

const HEIGHT = 130;
const PAD = { left: 34, right: 8, top: 8, bottom: 18 };

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
    if (unit === 'Ha') return `${E.toFixed(4)} Ha (${(E * HARTREE_TO_EV).toFixed(2)} eV)`;
    if (unit === 'eV') return `${E.toFixed(2)} eV (${(E / HARTREE_TO_EV).toFixed(4)} Ha)`;
    return `${E} ${unit}`;
}

/** The slider's step: the scan's own spacing where one is given (so a drag lands only on shipped points), else H₂⁺'s 0.01 a₀ (ruling C14). */
function sliderStep(snapRs: number[]): number {
    if (snapRs.length < 2) return 0.01;
    const sorted = [...snapRs].sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < sorted.length; i++) min = Math.min(min, sorted[i] - sorted[i - 1]);
    return min > 0 ? min : 0.01;
}

const PotentialCurvePlot: React.FC<PotentialCurvePlotProps> = ({
    title, unit, series, xRange, yRange, markerR, snapRs = [], referenceR = null, caption, width, onSelectR,
}) => {
    const clipId = useId();
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const x = (R: number) => PAD.left + ((R - xRange[0]) / (xRange[1] - xRange[0])) * plotWidth;
    const y = (E: number) => PAD.top + (1 - (E - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight;

    const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
        if (!onSelectR) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const svgX = (event.clientX - rect.left) * (rect.width > 0 ? width / rect.width : 1);
        const R = xRange[0] + ((svgX - PAD.left) / plotWidth) * (xRange[1] - xRange[0]);
        onSelectR(Math.min(xRange[1], Math.max(xRange[0], R)));
    };

    // In range only: a series without a value at markerR (an orbital that
    // does not exist there) or one whose value falls outside yRange is
    // reported as absent rather than drawn off-scale or clamped into a false
    // position (D14 -- the brief's own sample test expected a dot for both
    // series here, but series u's value at R = 2 sits outside yRange; that
    // dot is correctly missing, not a bug to paper over).
    const markerEnergies = markerR === null ? [] : series.map(s => ({ s, E: interpolateEnergy(s.points, markerR) }));
    const inRangeMarkers = markerEnergies.filter(
        (m): m is { s: CurveSeries; E: number } => m.E !== null && m.E >= yRange[0] && m.E <= yRange[1],
    );

    return (
        <div
            className={`radial-plot potential-curve${onSelectR ? ' interactive' : ''}`}
            aria-label="potential energy curve"
            style={{ maxWidth: width + 22 }}
        >
            <div className="radial-plot-title">{title} ({unit})</div>
            <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label={`${title} against R`}
                onClick={handleClick}
                style={{ cursor: onSelectR ? 'pointer' : undefined }}
            >
                <defs>
                    <clipPath id={clipId}><rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} /></clipPath>
                </defs>
                <g clipPath={`url(#${clipId})`}>
                    {series.map(s => (
                        <path key={s.key} className="radial-plot-line" fill="none" style={{ stroke: s.color }}
                            d={`M ${s.points.map(p => `${x(p.R).toFixed(2)},${y(p.E).toFixed(2)}`).join(' L ')}`} />
                    ))}
                </g>
                <line className="radial-plot-axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} />
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
                <text x={2} y={PAD.top + 8} className="potential-axis-label">{yRange[1].toPrecision(3)}</text>
                <text x={2} y={PAD.top + plotHeight} className="potential-axis-label">{yRange[0].toPrecision(3)}</text>
            </svg>
            {/*
                A native range input, visually hidden, gives Tab + arrow-key
                (and Home/End/Page) operation of the same R choice the svg's
                onClick offers only to a mouse -- rather than reimplementing
                key handling on a role="img" element, which would make that
                role a lie. This is the keyboard path; the svg click is a
                mouse-only shortcut over the same callback.
            */}
            {onSelectR && (
                <input
                    type="range"
                    className="visually-hidden"
                    aria-label={`${title}: choose R`}
                    min={xRange[0]}
                    max={xRange[1]}
                    step={sliderStep(snapRs)}
                    value={markerR ?? xRange[0]}
                    onChange={event => onSelectR(Number(event.target.value))}
                />
            )}
            <div className="radial-plot-legend">
                {series.map(s => (
                    <span key={s.key} className="radial-plot-legend-item">
                        <span className="radial-plot-legend-swatch" style={{ background: s.color }} />{s.label}
                    </span>
                ))}
            </div>
            <div className="radial-plot-scale" style={{ width }}>
                <span>{xRange[0]}</span>
                <span>R ({xRange[1]} a₀ · {(xRange[1] * BOHR_TO_ANGSTROM).toFixed(2)} Å)</span>
            </div>
            <div className="radial-plot-note">{caption}</div>
            {/* The validity stop / R_e / D_e reference a caller passes is
                drawn as a rule above; its label is plain text here rather
                than an SVG <title> (a pointing-device-only tooltip), so it
                reads for everyone, not just a mouse hovering the rule. */}
            {referenceR && <div className="radial-plot-note potential-reference-note">{referenceR.label}</div>}
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
