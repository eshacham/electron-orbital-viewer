import React, { useMemo } from 'react';
import { radialProfile } from '../radial_distribution';

interface RadialPlotProps {
    n: number;
    l: number;
    Z: number;
    /** Half-width of the sampling box, which sets the horizontal range. */
    rMax: number;
}

const WIDTH = 260;
const HEIGHT = 96;
const PADDING = { left: 6, right: 6, top: 8, bottom: 16 };

/**
 * The radial distribution, P(r) = r² R(r)².
 *
 * The 3D surface shows one contour of the orbital; this shows where the electron
 * actually is as a function of distance. Its peaks are the shells and its zeros
 * are the radial nodes, so it explains the concentric structure you see when you
 * cut a high-n orbital open — and it is the one view where "n − l shells" is
 * something you can count rather than take on faith.
 */
const RadialPlot: React.FC<RadialPlotProps> = ({ n, l, Z, rMax }) => {
    const path = useMemo(() => {
        const profile = radialProfile(n, l, Z, rMax, 240);
        const peak = profile.reduce((max, p) => Math.max(max, p.probability), 0);
        if (!(peak > 0)) return null;

        const plotWidth = WIDTH - PADDING.left - PADDING.right;
        const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

        const points = profile.map(point => {
            const x = PADDING.left + (point.r / rMax) * plotWidth;
            const y = PADDING.top + plotHeight * (1 - point.probability / peak);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });

        const baseline = PADDING.top + plotHeight;
        return {
            line: `M ${points.join(' L ')}`,
            fill: `M ${PADDING.left},${baseline} L ${points.join(' L ')} L ${(WIDTH - PADDING.right).toFixed(2)},${baseline} Z`,
            baseline,
        };
    }, [n, l, Z, rMax]);

    if (!path) return null;

    return (
        <div className="radial-plot" aria-label="radial distribution">
            <div className="radial-plot-title">
                Radial distribution — r²R(r)²
            </div>
            <svg width={WIDTH} height={HEIGHT} role="img" aria-label="probability against radius">
                <path d={path.fill} className="radial-plot-fill" />
                <path d={path.line} className="radial-plot-line" />
                <line
                    x1={PADDING.left}
                    y1={path.baseline}
                    x2={WIDTH - PADDING.right}
                    y2={path.baseline}
                    className="radial-plot-axis"
                />
            </svg>
            <div className="radial-plot-scale">
                <span>0</span>
                <span>{Math.round(rMax)} a₀</span>
            </div>
        </div>
    );
};

export default RadialPlot;
