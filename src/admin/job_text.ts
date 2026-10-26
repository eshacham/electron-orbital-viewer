import type { JobStatus } from '../jobs/api_types';

/** A status as a chip says it: one word, so a row stays on one line. */
export const STATUS_SHORT: Record<JobStatus, string> = {
    QUEUED: 'Queued', STARTING: 'Starting', RUNNING: 'Running', DONE: 'Done', FAILED: 'Failed',
};

/** "16 Oct" on the meter's UTC calendar, where the band places each job. */
export const utcDay = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "16 Oct" in the reader's own time zone. */
export const localDay = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "16 Oct, 09:00:40" in the reader's own time zone. */
export const localTime = (iso: string | null): string => (iso
    ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—');

/** A row's short duration: "16s", "8m 02s", "1h 05m". */
export function compactDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/** A row's charge: under a cent says so rather than printing micro-dollars; the exact figure is in the details. */
export function rowCharge(usd: number): string {
    if (usd > 0 && usd < 0.01) return 'under $0.01';
    return `$${usd.toFixed(2)}`;
}

/** Decimals that show four significant figures of `usd` (two from a cent up). */
const decimalsFor = (usd: number): number => (usd >= 0.01 || usd <= 0 ? 2 : 3 - Math.floor(Math.log10(usd)));

/**
 * A maximum and what was charged against it, at one shared precision -- the
 * one the smaller non-zero figure needs -- so rounding can never make a
 * charge look larger than the maximum it was held to.
 */
export function usdPair(maximum: number, charged: number): [string, string] {
    const nonZero = [maximum, charged].filter(v => v > 0);
    const decimals = nonZero.length ? Math.max(...nonZero.map(decimalsFor)) : 2;
    return [`$${maximum.toFixed(decimals)}`, `$${charged.toFixed(decimals)}`];
}

const INITIALISMS = new Set(['scf', 'aws', 'oom', 'mp2', 'dft', 'api', 'gpu', 'cpu', 'xyz']);

/**
 * A failure in a few words for its row: the error code read as words
 * ("scf-not-converged" is "SCF not converged"), or, with no code, the
 * message's first clause. Nothing is reworded; the full message is in the details.
 */
export function shortReason(error: { code: string; message: string }): string {
    const words = error.code.split(/[-_\s]+/).filter(Boolean);
    if (words.length > 0) {
        const text = words.map(w => (INITIALISMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase())).join(' ');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
    return error.message.split(/[.;:(]/)[0].replace(/,$/, '').trim();
}

/** The meter's own figure, to the micro-dollar it keeps -- no rounding, so it can be called the total. */
export const exactUsd = (usd: number): string => `$${(Math.round(usd * 1e6) / 1e6).toFixed(6)}`;
