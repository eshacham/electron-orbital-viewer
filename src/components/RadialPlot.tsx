import React, { useMemo } from 'react';
import { radialProfile } from '../radial_distribution';

/**
 * One curve to draw in multi-curve mode: a shell's or subshell's D(r),
 * already resolved to (r, value) pairs by the caller. The plot itself does
 * not know about the shared log grid the atom solver uses (ruling — this
 * component stays presentational, driven entirely by props) or about which
 * shell is "selected"; it just draws whatever curves it is handed.
 */
export interface RadialCurve {
    label: string;
    color: string;
    points: Array<{ r: number; value: number }>;
}

interface RadialPlotProps {
    n: number;
    l: number;
    Z: number;
    /** Half-width of the sampling box, which sets the horizontal range. */
    rMax: number;
    /** Smaller layout for phone-width screens. */
    compact?: boolean;
    /**
     * Multiple curves (e.g. one per shell) to overlay instead of the single
     * hydrogenic curve derived from n/l/Z below. Omit entirely to keep the
     * original single-curve behaviour unchanged.
     */
    curves?: RadialCurve[];
    /**
     * Radii of the whole atom's resolved D(r) maxima, marked as decoration.
     * Ruling R26: these are a display annotation only, never a source of
     * navigation, and there is no assumption here that they line up
     * positionally with `curves`.
     */
    peaks?: number[];
    /** Radius the pointer (or the linked 3D cut face) is currently over. */
    hoverRadius?: number | null;
    /** Reports the radius under the pointer, or null when it leaves the plot. */
    onHoverRadius?: (r: number | null) => void;
}

const PADDING = { left: 6, right: 6, top: 8, bottom: 16 };

/** The curve, among `curves`, whose value is largest at r — used only to label the hover readout with a shell name. */
function dominantCurveLabelAt(curves: RadialCurve[], r: number): string | null {
    let bestLabel: string | null = null;
    let bestValue = -Infinity;
    for (const curve of curves) {
        if (curve.points.length === 0) continue;
        // Nearest sample by r; the curves passed in are dense enough (the
        // same grids the atom solver already samples on) that this is
        // indistinguishable from interpolating for the purpose of a label.
        let nearest = curve.points[0];
        let nearestDistance = Math.abs(nearest.r - r);
        for (const point of curve.points) {
            const distance = Math.abs(point.r - r);
            if (distance < nearestDistance) {
                nearest = point;
                nearestDistance = distance;
            }
        }
        if (nearest.value > bestValue) {
            bestValue = nearest.value;
            bestLabel = curve.label;
        }
    }
    return bestLabel;
}

/**
 * The radial distribution plot.
 *
 * In its original, single-curve form this shows P(r) = r²R(r)² for one
 * hydrogen-like orbital: its peaks are the shells and its zeros are the
 * radial nodes. In multi-curve mode (multi-electron atoms) it overlays one
 * D(r) = 4πr²ρ(r) curve per shell or subshell instead, with hover linked to
 * the 3D cut face via `hoverRadius`/`onHoverRadius` (both views read the
 * same radius from Redux; see atomSlice.setHoverRadius) — a point on the cut
 * face maps to one r, but conversely r maps to a whole circle on that face,
 * so this component's only job is to report which r is hovered, not to draw
 * the circle itself.
 */
const RadialPlot: React.FC<RadialPlotProps> = ({
    n, l, Z, rMax, compact = false,
    curves, peaks, hoverRadius = null, onHoverRadius,
}) => {
    const WIDTH = compact ? 150 : 260;
    const HEIGHT = compact ? 62 : 96;
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const baseline = PADDING.top + plotHeight;

    const isMultiCurve = Boolean(curves && curves.length > 0);

    const path = useMemo(() => {
        if (isMultiCurve) return null;

        const profile = radialProfile(n, l, Z, rMax, 240);
        const peak = profile.reduce((max, p) => Math.max(max, p.probability), 0);
        if (!(peak > 0)) return null;

        const points = profile.map(point => {
            const x = PADDING.left + (point.r / rMax) * plotWidth;
            const y = PADDING.top + plotHeight * (1 - point.probability / peak);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });

        return {
            line: `M ${points.join(' L ')}`,
            fill: `M ${PADDING.left},${baseline} L ${points.join(' L ')} L ${(WIDTH - PADDING.right).toFixed(2)},${baseline} Z`,
        };
    }, [isMultiCurve, n, l, Z, rMax, WIDTH, plotWidth, plotHeight, baseline]);

    // Multi-curve mode shares one vertical scale across every curve, rather
    // than each curve topping out at the plot's own height — shells differ
    // in D(r) height by orders of magnitude, and flattening that away here
    // would hide exactly the structure the plot exists to show.
    const multiCurvePaths = useMemo(() => {
        if (!isMultiCurve || !curves) return [];

        let globalMax = 0;
        for (const curve of curves) {
            for (const point of curve.points) {
                if (point.value > globalMax) globalMax = point.value;
            }
        }
        if (!(globalMax > 0)) return [];

        return curves.map(curve => {
            const points = curve.points.map(point => {
                const x = PADDING.left + (point.r / rMax) * plotWidth;
                const y = PADDING.top + plotHeight * (1 - point.value / globalMax);
                return `${x.toFixed(2)},${y.toFixed(2)}`;
            });
            return { label: curve.label, color: curve.color, line: `M ${points.join(' L ')}` };
        });
    }, [isMultiCurve, curves, rMax, plotWidth, plotHeight]);

    const xForRadius = (r: number) => PADDING.left + (r / rMax) * plotWidth;

    const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!onHoverRadius) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const scale = rect.width > 0 ? WIDTH / rect.width : 1;
        const xSvg = (event.clientX - rect.left) * scale;
        const r = ((xSvg - PADDING.left) / plotWidth) * rMax;
        onHoverRadius(Math.min(rMax, Math.max(0, r)));
    };

    const handlePointerLeave = () => {
        onHoverRadius?.(null);
    };

    const showHover = isMultiCurve && curves && hoverRadius !== null && hoverRadius !== undefined
        && hoverRadius >= 0 && hoverRadius <= rMax;
    const hoverShellLabel = showHover ? dominantCurveLabelAt(curves!, hoverRadius as number) : null;

    if (!isMultiCurve && !path) return null;

    return (
        <div
            className={`radial-plot${compact ? ' compact' : ''}${isMultiCurve ? ' interactive' : ''}`}
            aria-label="radial distribution"
        >
            <div className="radial-plot-title">
                {isMultiCurve ? 'Radial distribution D(r) = 4πr²ρ(r)' : 'Radial distribution — r²R(r)²'}
            </div>
            <svg
                width={WIDTH}
                height={HEIGHT}
                role="img"
                aria-label="probability against radius"
                onPointerMove={isMultiCurve ? handlePointerMove : undefined}
                onPointerLeave={isMultiCurve ? handlePointerLeave : undefined}
            >
                {!isMultiCurve && path && (
                    <>
                        <path d={path.fill} className="radial-plot-fill" />
                        <path d={path.line} className="radial-plot-line" />
                    </>
                )}
                {isMultiCurve && multiCurvePaths.map(curve => (
                    <path
                        key={curve.label}
                        d={curve.line}
                        className="radial-plot-line"
                        stroke={curve.color}
                        fill="none"
                    />
                ))}
                {isMultiCurve && (peaks ?? []).map((r, index) => (
                    <line
                        key={`${r}-${index}`}
                        className="radial-plot-peak"
                        x1={xForRadius(r)}
                        x2={xForRadius(r)}
                        y1={baseline}
                        y2={baseline - 6}
                    />
                ))}
                {showHover && (
                    <line
                        className="radial-plot-hover-rule"
                        x1={xForRadius(hoverRadius as number)}
                        x2={xForRadius(hoverRadius as number)}
                        y1={PADDING.top}
                        y2={baseline}
                    />
                )}
                <line
                    x1={PADDING.left}
                    y1={baseline}
                    x2={WIDTH - PADDING.right}
                    y2={baseline}
                    className="radial-plot-axis"
                />
            </svg>
            {isMultiCurve && (
                <div className="radial-plot-legend">
                    {curves!.map(curve => (
                        <span key={curve.label} className="radial-plot-legend-item">
                            <span className="radial-plot-legend-swatch" style={{ background: curve.color }} />
                            {curve.label}
                        </span>
                    ))}
                </div>
            )}
            {showHover && (
                <div className="radial-plot-hover-readout">
                    {`r = ${(hoverRadius as number).toFixed(2)} a₀`}
                    {hoverShellLabel ? ` — ${hoverShellLabel}` : ''}
                </div>
            )}
            <div className="radial-plot-scale">
                <span>0</span>
                <span>{Math.round(rMax)} a₀</span>
            </div>
        </div>
    );
};

export default RadialPlot;
