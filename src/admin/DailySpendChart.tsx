import React from 'react';
import { Typography } from '@mui/material';
import { formatUsd, money } from '../jobs/format';

const HEIGHT = 120;
const PAD = { left: 56, right: 8, top: 10, bottom: 20 };

export function daysIn(month: string): number {
    const [year, mon] = month.split('-').map(Number);
    return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

interface DailySpendChartProps { month: string; daily: Array<{ date: string; usd: number }>; width: number }

/**
 * Spent per day of the month -- settled jobs only, the meter's own figures --
 * as a hand-drawn bar chart like the app's other plots (spec §9.4). Each bar
 * names its day and amount on hover.
 */
const DailySpendChart: React.FC<DailySpendChartProps> = ({ month, daily, width }) => {
    const days = daysIn(month);
    const byDay = new Map(daily.map(entry => [Number(entry.date.slice(8, 10)), entry.usd]));
    const max = Math.max(0, ...daily.map(entry => entry.usd));
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const slot = plotWidth / days;
    const base = PAD.top + plotHeight;
    const y = (usd: number) => PAD.top + plotHeight * (1 - (max > 0 ? usd / max : 0));
    return (
        <figure className="daily-spend">
            <figcaption className="daily-spend-title">Daily spend, {month} (settled jobs; spent)</figcaption>
            <svg width={width} height={HEIGHT} role="img" aria-label={`daily spend in ${month}`}>
                <line className="daily-spend-axis" x1={PAD.left} y1={base} x2={width - PAD.right} y2={base} />
                <text className="daily-spend-label" x={PAD.left - 4} y={PAD.top + 8} textAnchor="end">{formatUsd(max)}</text>
                <text className="daily-spend-label" x={PAD.left - 4} y={base} textAnchor="end">$0</text>
                {Array.from({ length: days }, (_, i) => i + 1).map(day => {
                    const usd = byDay.get(day) ?? 0;
                    if (usd <= 0) return null;
                    return (
                        <rect key={day} className="daily-spend-bar" x={PAD.left + (day - 1) * slot + slot * 0.15} width={slot * 0.7} y={y(usd)} height={base - y(usd)}>
                            <title>{`${month}-${String(day).padStart(2, '0')}: ${money('spent', usd)}`}</title>
                        </rect>
                    );
                })}
                <text className="daily-spend-label" x={PAD.left} y={HEIGHT - 4}>1</text>
                <text className="daily-spend-label" x={width - PAD.right} y={HEIGHT - 4} textAnchor="end">{days}</text>
            </svg>
            {max === 0 && <Typography variant="caption">No spend settled yet this month.</Typography>}
        </figure>
    );
};

export default DailySpendChart;
