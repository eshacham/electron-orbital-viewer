import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CostsResponse, JobView } from '../jobs/api_types';
import { currentMonth, formatUsd } from '../jobs/format';
import {
    bandScale, cumulativeSeries, dayPosition, daysIn, groupOf, markTone, monotoneSegments, monthLabel, predictionCheck,
    segmentsToPath,
} from './jobs_month';
import { STATUS_SHORT, utcDay } from './job_text';

/** The band's width follows its box; jsdom (no ResizeObserver) keeps the fallback. */
function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(fallback);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(entries => {
            const next = Math.round(entries[0].contentRect.width);
            if (next > 0) setWidth(next);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

export interface MonthBandProps {
    month: string;
    jobs: JobView[];
    costs: CostsResponse | null;
    now: number;
    /** The job whose mark and row are lit together, by hover or focus on either. */
    linked: string | null;
    onLink(key: string | null): void;
    onPick(key: string): void;
    /** Keys the list currently shows: the other marks are dimmed, never hidden. */
    shown: ReadonlySet<string>;
}

const TICKS = [1, 5, 10, 15, 20, 25];
const LEGEND = [['success', 'done'], ['warning', 'off prediction or retried'], ['danger', 'failed'], ['accent', 'running or queued']] as const;

/**
 * The month on one axis: a short bar per job on its day, coloured by what
 * happened to it, under the money settled so far drawn as a smooth monotone
 * line toward the cap, with the projection dashed. Compact by design; the
 * list under it carries every figure, so the drawing itself is one image
 * with a summary, and the marks are a small keyboard group (arrow keys)
 * that light and open their rows.
 */
const MonthBand: React.FC<MonthBandProps> = ({ month, jobs, costs, now, linked, onLink, onPick, shown }) => {
    const [boxRef, width] = useWidth(960);
    const phone = width < 560;
    const H = phone ? 92 : 120;
    const PAD_L = 62, PAD_R = 14;
    const plotW = Math.max(40, width - PAD_L - PAD_R);
    const days = daysIn(month);
    const x = (day: number) => PAD_L + (Math.min(Math.max(day, 0), days) / days) * plotW;

    const thisMonth = currentMonth(new Date(now)) === month;
    const nowPos = dayPosition(new Date(now).toISOString(), month);
    const future = !thisMonth && nowPos < 0;
    const through = future ? 0 : thisMonth ? Math.min(days, Math.floor(nowPos) + 1) : days;

    const money = useMemo(() => {
        if (!costs || future) return null;
        const series = cumulativeSeries(costs.daily, through);
        if (thisMonth && series.length > 1) {
            const last = series[series.length - 1];
            series[series.length - 1] = { x: Math.max(series[series.length - 2].x + 0.05, Math.min(nowPos, last.x)), y: last.y };
        }
        const settled = series[series.length - 1].y;
        const projection = thisMonth ? Math.max(costs.projectionUsd, settled) : null;
        const scale = bandScale(costs.capUsd, Math.max(settled, projection ?? 0));
        return { series, settled, projection, scale };
    }, [costs, future, through, thisMonth, nowPos]);

    const capY = 9;
    const lineTop = money && !money.scale.capInside ? 26 : capY;
    const lineBottom = phone ? 50 : 70;
    const y = (usd: number) => lineBottom - (money ? (usd / money.scale.top) * (lineBottom - lineTop) : 0);
    const laneTop = lineBottom + 7, laneBottom = H - 22;
    const axisY = laneBottom + 3;

    const marks = useMemo(() => {
        const sorted = [...jobs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
        const byDay = new Map<number, JobView[]>();
        for (const job of sorted) {
            const day = Math.min(days, Math.max(1, Math.floor(dayPosition(job.submittedAt, month)) + 1));
            byDay.set(day, [...(byDay.get(day) ?? []), job]);
        }
        const slot = plotW / days;
        return [...byDay.entries()].flatMap(([day, list]) => {
            const n = list.length;
            const barW = Math.max(3, Math.min(7, (slot * 0.8 - (n - 1) * 2) / n));
            const total = n * barW + (n - 1) * 2;
            const left = PAD_L + ((day - 0.5) / days) * plotW - total / 2;
            return list.map((job, i) => ({ job, day, x: left + i * (barW + 2), w: barW }));
        });
    }, [jobs, month, days, plotW]);

    const [active, setActive] = useState(0);
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const move = (event: React.KeyboardEvent, index: number) => {
        const last = marks.length - 1;
        const next = event.key === 'ArrowRight' ? Math.min(last, index + 1) : event.key === 'ArrowLeft' ? Math.max(0, index - 1)
            : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
        if (next === null) return;
        event.preventDefault();
        setActive(next);
        buttons.current[next]?.focus();
    };

    const counts = { done: 0, failed: 0, running: 0 };
    for (const job of jobs) counts[groupOf(job)] += 1;
    const name = monthLabel(month);
    const summary = [
        jobs.length === 0 ? `${name}: no jobs` : `${name}: ${jobs.length} job${jobs.length === 1 ? '' : 's'} (${counts.done} done, ${counts.failed} failed, ${counts.running} running)`,
        costs ? `; charged ${formatUsd(costs.spentUsd)} of the ${formatUsd(costs.capUsd)} cap` : '',
        money?.projection !== null && money?.projection !== undefined ? `, projected ${formatUsd(money.projection)} by month end` : '',
        jobs.length > 0 ? '. Each job is listed below.' : '.',
    ].join('');

    const linePath = money ? segmentsToPath(monotoneSegments(money.series), x, y) : '';
    const lastPoint = money?.series[money.series.length - 1];
    const tickDays = [...TICKS.filter(d => d < days - 2), days];

    return (
        <section className="admin-band" aria-label={`${name} at a glance`}>
            <div className="admin-band-plot" ref={boxRef} style={{ height: H }} onMouseLeave={() => onLink(null)}>
                <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={summary} className="ql-tabular">
                    {/* Day grid: a faint line at each week tick, so a mark reads against its date. */}
                    {tickDays.map(day => (
                        <line key={`g${day}`} className="admin-band-grid" x1={x(day - 0.5)} x2={x(day - 0.5)} y1={lineTop} y2={laneBottom} />
                    ))}
                    {money && (
                        <>
                            <line className="admin-band-cap" x1={PAD_L} x2={width - PAD_R} y1={capY} y2={capY} />
                            <text className="admin-band-label" x={PAD_L - 8} y={capY + 4} textAnchor="end">{formatUsd(costs!.capUsd)} cap</text>
                            {!money.scale.capInside && (
                                <>
                                    {/* The axis breaks between the month's own scale and the cap above it. */}
                                    <path className="admin-band-break" d={`M${PAD_L - 4},${capY + 9} l8,-3 M${PAD_L - 4},${capY + 13} l8,-3`} />
                                    <text className="admin-band-label" x={PAD_L - 8} y={lineTop + 4} textAnchor="end">{formatUsd(money.scale.top)}</text>
                                    <line className="admin-band-scale" x1={PAD_L} x2={width - PAD_R} y1={lineTop} y2={lineTop} />
                                </>
                            )}
                            <text className="admin-band-label" x={PAD_L - 8} y={lineBottom + 4} textAnchor="end">$0</text>
                            <path className="admin-band-line" d={linePath} />
                            {lastPoint && money.projection !== null && money.projection > lastPoint.y && (
                                <line className="admin-band-projection" x1={x(lastPoint.x)} y1={y(lastPoint.y)} x2={x(days)} y2={y(money.projection)} />
                            )}
                            {lastPoint && <circle className="admin-band-now" cx={x(lastPoint.x)} cy={y(lastPoint.y)} r={3} />}
                        </>
                    )}
                    <line className="admin-band-axis" x1={PAD_L} x2={width - PAD_R} y1={axisY} y2={axisY} />
                    {tickDays.map(day => (
                        <text key={`t${day}`} className="admin-band-label" x={x(day - 0.5)} y={H - 6} textAnchor="middle">
                            {day === days ? `${day} ${name.slice(0, 3)}` : day}
                        </text>
                    ))}
                    {marks.map(({ job, x: left, w }) => (
                        <rect key={job.key} className={`admin-band-mark tone-${markTone(job, now)}${linked === job.key ? ' is-linked' : ''}${shown.has(job.key) ? '' : ' is-dimmed'}`}
                            x={left} y={laneTop} width={w} height={laneBottom - laneTop} rx={1.5} />
                    ))}
                    {jobs.length === 0 && (
                        <text className="admin-band-label" x={PAD_L + plotW / 2} y={(laneTop + laneBottom) / 2 + 4} textAnchor="middle">No jobs this month</text>
                    )}
                </svg>
                {marks.length > 0 && (
                    <div className="admin-band-marks" role="group" aria-label="Jobs by day">
                        {marks.map(({ job, x: left, w }, index) => {
                            const check = predictionCheck(job, now);
                            const label = `${job.name}, ${utcDay(job.submittedAt)}: ${STATUS_SHORT[job.status]}`
                                + `${check.off ? ', off prediction' : ''}${job.attempt > 1 ? `, ${job.attempt} attempts` : ''}`;
                            return (
                                <button key={job.key} type="button" ref={node => { buttons.current[index] = node; }}
                                    className={`admin-band-hit${linked === job.key ? ' is-linked' : ''}`}
                                    style={{ left: left - 1, width: w + 2, top: laneTop - 4, height: laneBottom - laneTop + 8 }}
                                    tabIndex={index === Math.min(active, marks.length - 1) ? 0 : -1} aria-label={label} title={label}
                                    onMouseEnter={() => onLink(job.key)} onMouseLeave={() => onLink(null)}
                                    onFocus={() => { setActive(index); onLink(job.key); }} onBlur={() => onLink(null)}
                                    onKeyDown={event => move(event, index)} onClick={() => onPick(job.key)} />
                            );
                        })}
                    </div>
                )}
            </div>
            <p className="admin-band-legend">
                {costs && <span className="admin-legend-item"><span className="admin-key admin-key-line" aria-hidden="true" />charged so far</span>}
                {costs && thisMonth && <span className="admin-legend-item"><span className="admin-key admin-key-dash" aria-hidden="true" />projected</span>}
                {costs && <span className="admin-legend-item"><span className="admin-key admin-key-cap" aria-hidden="true" />cap</span>}
                {LEGEND.map(([tone, text]) => (
                    <span key={tone} className="admin-legend-item"><span className={`admin-key admin-key-mark tone-${tone}`} aria-hidden="true" />{text}</span>
                ))}
            </p>
        </section>
    );
};

export default MonthBand;
