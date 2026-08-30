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
    /**
     * Right edge of the plotted domain. For the single-curve hydrogenic
     * form this is also the sampling half-width handed to `radialProfile`
     * below. For multi-curve (atom) mode this is **not** the sampling
     * grid's rMax -- the caller (App.tsx) passes a range sized to the
     * curves actually being shown (a little beyond their contour radius),
     * since the grid extent is typically 3-100x larger than anything worth
     * plotting and would crush every peak into the first few percent of
     * the axis (spec bugfix).
     */
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
     * Horizontal axis mapping. 'sqrt' compresses the outer part of the
     * range and expands the region near the origin -- used for the
     * whole-atom level, where a heavy atom's inner-shell peaks can sit
     * within a couple of percent of the range while the valence shell
     * peak sits near the far edge (e.g. gold: 0.014 to 0.385 a0, a 27x
     * span). Defaults to 'linear', which keeps the single-curve hydrogenic
     * plot's behaviour unchanged.
     */
    scale?: 'linear' | 'sqrt';
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
    curves, peaks, hoverRadius = null, onHoverRadius, scale = 'linear',
}) => {
    const WIDTH = compact ? 150 : 260;
    const HEIGHT = compact ? 62 : 96;
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const baseline = PADDING.top + plotHeight;

    const isMultiCurve = Boolean(curves && curves.length > 0);

    // 'sqrt' expands the region near the origin relative to the tail, so
    // peaks that would otherwise sit within a couple of percent of a
    // linear axis (a heavy atom's inner shells) spread out into legible
    // separation. Identity when scale is 'linear', so every caller that
    // does not pass `scale` (the hydrogenic single-curve plot included)
    // behaves exactly as before.
    const toAxis = (r: number) => (scale === 'sqrt' ? Math.sqrt(Math.max(0, r)) : r);
    const axisMax = toAxis(rMax) || 1;
    const xForRadius = (r: number) => PADDING.left + (toAxis(r) / axisMax) * plotWidth;

    const path = useMemo(() => {
        if (isMultiCurve) return null;

        const profile = radialProfile(n, l, Z, rMax, 240);
        const peak = profile.reduce((max, p) => Math.max(max, p.probability), 0);
        if (!(peak > 0)) return null;

        const points = profile.map(point => {
            const x = xForRadius(point.r);
            const y = PADDING.top + plotHeight * (1 - point.probability / peak);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });

        return {
            line: `M ${points.join(' L ')}`,
            fill: `M ${PADDING.left},${baseline} L ${points.join(' L ')} L ${(WIDTH - PADDING.right).toFixed(2)},${baseline} Z`,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMultiCurve, n, l, Z, rMax, scale, WIDTH, plotWidth, plotHeight, baseline]);

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
                const x = xForRadius(point.r);
                const y = PADDING.top + plotHeight * (1 - point.value / globalMax);
                return `${x.toFixed(2)},${y.toFixed(2)}`;
            });
            return { label: curve.label, color: curve.color, line: `M ${points.join(' L ')}` };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMultiCurve, curves, rMax, scale, plotWidth, plotHeight]);

    const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
        if (!onHoverRadius) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const pixelScale = rect.width > 0 ? WIDTH / rect.width : 1;
        const xSvg = (event.clientX - rect.left) * pixelScale;
        const axisValue = ((xSvg - PADDING.left) / plotWidth) * axisMax;
        const r = scale === 'sqrt' ? Math.max(0, axisValue) ** 2 : axisValue;
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
                {isMultiCurve
                    // The 3D cut face this plot is linked to (hoverRadius/
                    // onHoverRadius, see the module doc) colours the *same*
                    // D(r) but scaled to local structure so shells stay
                    // visible across the atom's full range, not this plot's
                    // own curves -- called out here so that scaling is never
                    // mistaken for the honest, unscaled D(r) plotted below.
                    ? 'Radial distribution D(r) = 4πr²ρ(r) (cut face scaled to local shell structure)'
                    : 'Radial distribution — r²R(r)²'}
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
            {/* Always rendered (rather than only while hovering), reserving
                its line's height at all times -- otherwise the legend above
                it, and the scale readout below the whole panel, reflow by
                that height on every hover in and out (bug fix, task 22 bug
                1). A non-breaking space keeps the empty state's line box the
                same height as the real readout's rather than collapsing to
                nothing. */}
            {isMultiCurve && (
                <div className="radial-plot-hover-readout">
                    {showHover
                        ? `r = ${(hoverRadius as number).toFixed(2)} a₀${hoverShellLabel ? ` — ${hoverShellLabel}` : ''}`
                        : ' '}
                </div>
            )}
            <div className="radial-plot-scale">
                <span>0</span>
                {/* rMax is now a range fitted to the curves shown (spec
                    bugfix), not the sampling grid's rMax, so it is often
                    well under 10 a0 -- Math.round would otherwise collapse
                    e.g. gold's 1.68 down to a misleading "2". The scale
                    mode is called out explicitly since a non-linear axis
                    is otherwise silently misleading. */}
                <span>{rMax < 10 ? rMax.toFixed(2) : Math.round(rMax)} a₀{scale === 'sqrt' ? ' (√ scale)' : ''}</span>
            </div>
        </div>
    );
};

export default RadialPlot;
