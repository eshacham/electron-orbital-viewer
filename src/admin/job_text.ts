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
