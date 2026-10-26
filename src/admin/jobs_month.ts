import { isActive } from '../jobs/api_types';
import type { CostsResponse, JobView } from '../jobs/api_types';

/**
 * The jobs page's arithmetic, kept out of its components: which jobs missed
 * their prediction, what each filter chip counts, what a job was charged,
 * and the month band's cumulative line and scale.
 */

/** A job is off its prediction when its run time or peak memory is more than this many times what was predicted. */
export const OFF_PREDICTION_RATIO = 1.25;
export const OFF_PREDICTION_TEXT = 'Run time or peak memory more than 25 % over its prediction';

export type JobGroup = 'running' | 'failed' | 'done';

/** Queued and starting jobs are counted with the running ones: each holds money against the cap. */
export function groupOf(job: JobView): JobGroup {
    if (isActive(job.status)) return 'running';
    return job.status === 'FAILED' ? 'failed' : 'done';
}

/** The run time so far: the measured wall time once ended, the time since it started while it runs, else none. */
export function runSeconds(job: JobView, nowMs: number): number | null {
    if (job.actual) return job.actual.wallSeconds;
    if (isActive(job.status) && job.startedAt) return Math.max(0, (nowMs - Date.parse(job.startedAt)) / 1000);
    return null;
}

/** The measured peak once ended; while it runs, the last heartbeat's. */
export function peakMemory(job: JobView): number | null {
    if (job.actual) return job.actual.peakMemoryGB;
    return isActive(job.status) ? job.peakMemoryGB : null;
}

export interface PredictionCheck {
    /** Actual (or so far) over predicted; null when there is nothing to compare yet. */
    time: number | null;
    memory: number | null;
    timeOver: boolean;
    memoryOver: boolean;
    off: boolean;
}

const ratio = (actual: number | null, predicted: number) => (actual === null || predicted <= 0 ? null : actual / predicted);

export function predictionCheck(job: JobView, nowMs: number): PredictionCheck {
    const time = ratio(runSeconds(job, nowMs), job.sizing.predictedSeconds);
    const memory = ratio(peakMemory(job), job.sizing.predictedMemoryGB);
    const timeOver = time !== null && time > OFF_PREDICTION_RATIO;
    const memoryOver = memory !== null && memory > OFF_PREDICTION_RATIO;
    return { time, memory, timeOver, memoryOver, off: timeOver || memoryOver };
}

export type MarkTone = 'success' | 'warning' | 'danger' | 'accent';

export function markTone(job: JobView, nowMs: number): MarkTone {
    const group = groupOf(job);
    if (group === 'failed') return 'danger';
    if (group === 'running') return 'accent';
    return predictionCheck(job, nowMs).off || job.attempt > 1 ? 'warning' : 'success';
}

export type ChipId = 'all' | 'running' | 'failed' | 'done' | 'off';
export const CHIPS: ReadonlyArray<{ id: ChipId; label: string }> = [
    { id: 'all', label: 'All' }, { id: 'running', label: 'Running' }, { id: 'failed', label: 'Failed' },
    { id: 'done', label: 'Done' }, { id: 'off', label: 'Off prediction' },
];

export function matchesChip(job: JobView, chip: ChipId, nowMs: number): boolean {
    if (chip === 'all') return true;
    if (chip === 'off') return predictionCheck(job, nowMs).off;
    return groupOf(job) === chip;
}

export function chipCounts(jobs: JobView[], nowMs: number): Record<ChipId, number> {
    const counts: Record<ChipId, number> = { all: 0, running: 0, failed: 0, done: 0, off: 0 };
    for (const job of jobs) for (const { id } of CHIPS) if (matchesChip(job, id, nowMs)) counts[id] += 1;
    return counts;
}

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const fold = (text: string) => text.replace(/[₀-₉]/g, c => String(SUBSCRIPTS.indexOf(c))).replace(/\s+/g, '').toLowerCase();

/** By name or formula, case-blind, with or without subscript digits. */
export function matchesSearch(job: JobView, query: string): boolean {
    const q = fold(query);
    return q === '' || fold(job.name).includes(q) || fold(job.formula).includes(q);
}

/**
 * What the job was charged in all: every quoted approval's own charge added
 * up (a retried job has one per approval), or, for a record from before
 * quotes, its actual cost. null while nothing has settled.
 */
export function chargedTotal(job: JobView): number | null {
    if (!job.approvedQuote) return job.actualUsd;
    const quoted = (job.ledger ?? []).filter(entry => entry.quoteId !== null && entry.chargedUsd !== null);
    if (quoted.length > 0) return quoted.reduce((sum, entry) => sum + (entry.chargedUsd ?? 0), 0);
    return job.charged?.chargedUsd ?? null;
}

export function daysIn(month: string): number {
    const [year, mon] = month.split('-').map(Number);
    return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export function monthLabel(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    return new Date(Date.UTC(year, mon - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Where an instant falls on the month's axis, in days from the month's start (UTC, like the meter). */
export function dayPosition(iso: string, month: string): number {
    const [year, mon] = month.split('-').map(Number);
    return (Date.parse(iso) - Date.UTC(year, mon - 1, 1)) / 86_400_000;
}

export interface Point { x: number; y: number }

/** One point per day boundary, x = 0 … throughDay: the money settled by the end of day x. */
export function cumulativeSeries(daily: Array<{ date: string; usd: number }>, throughDay: number): Point[] {
    const byDay = new Map<number, number>();
    for (const entry of daily) {
        const day = Number(entry.date.slice(8, 10));
        byDay.set(day, (byDay.get(day) ?? 0) + entry.usd);
    }
    const points: Point[] = [{ x: 0, y: 0 }];
    for (let day = 1; day <= throughDay; day++) points.push({ x: day, y: points[day - 1].y + (byDay.get(day) ?? 0) });
    return points;
}

export interface Segment { p0: Point; c1: Point; c2: Point; p1: Point }

/**
 * Fritsch–Carlson monotone cubic interpolation as Bézier segments: the
 * curve passes through every point, and between two points never leaves
 * the range they span, so a cumulative figure never appears to fall or to
 * overshoot what was really charged.
 */
export function monotoneSegments(points: Point[]): Segment[] {
    const n = points.length;
    if (n < 2) return [];
    const delta = points.slice(0, -1).map((p, k) => (points[k + 1].y - p.y) / (points[k + 1].x - p.x));
    const m = points.map((_, k) => {
        if (k === 0) return delta[0];
        if (k === n - 1) return delta[n - 2];
        const [a, b] = [delta[k - 1], delta[k]];
        return a * b <= 0 ? 0 : (a + b) / 2;
    });
    for (let k = 0; k < n - 1; k++) {
        if (delta[k] === 0) { m[k] = 0; m[k + 1] = 0; continue; }
        const a = m[k] / delta[k], b = m[k + 1] / delta[k];
        const s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[k] = t * a * delta[k]; m[k + 1] = t * b * delta[k]; }
    }
    return points.slice(0, -1).map((p0, k) => {
        const p1 = points[k + 1];
        const h = (p1.x - p0.x) / 3;
        return { p0, c1: { x: p0.x + h, y: p0.y + m[k] * h }, c2: { x: p1.x - h, y: p1.y - m[k + 1] * h }, p1 };
    });
}

const num = (value: number) => String(Math.round(value * 100) / 100);

export function segmentsToPath(segments: Segment[], sx: (x: number) => number, sy: (y: number) => number): string {
    if (segments.length === 0) return '';
    const at = (p: Point) => `${num(sx(p.x))},${num(sy(p.y))}`;
    return `M${at(segments[0].p0)} ${segments.map(s => `C${at(s.c1)} ${at(s.c2)} ${at(s.p1)}`).join(' ')}`;
}

/** The next of 1, 2, 2.5 and 5 times a power of ten at or above `value`. */
export function niceCeil(value: number): number {
    if (value <= 0) return 0;
    const power = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value - 1e-12) return Number((step * power).toPrecision(6));
    return 10 * power;
}

/**
 * The band's money scale: the cap itself once the month's figures reach
 * half of it; below that, the month's own figures with headroom (never under
 * ten cents), and the cap drawn past a break in the axis above them.
 */
export function bandScale(capUsd: number, peakUsd: number): { top: number; capInside: boolean } {
    if (peakUsd >= capUsd * 0.5) return { top: capUsd, capInside: true };
    const top = Math.max(0.1, niceCeil(peakUsd * 1.2));
    return top >= capUsd ? { top: capUsd, capInside: true } : { top, capInside: false };
}

export interface BillingGap { billedUsd: number; meterUsd: number; gapUsd: number; through: string | null }

/** AWS's billed figure against the meter's, once the billing job has run; the gap is billed minus metered. */
export function billingGap(costs: CostsResponse): BillingGap | null {
    if (!costs.billing) return null;
    return {
        billedUsd: costs.billing.usd, meterUsd: costs.spentUsd, gapUsd: costs.billing.usd - costs.spentUsd,
        through: costs.billing.through ?? null,
    };
}
