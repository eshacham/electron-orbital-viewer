import type { JobStatus, JobView, Recipe, WorkerSize } from '../jobs/api_types';
import { computedResultFiles, jobFileUrl } from '../molecules/job_paths';

export type SortColumn = 'molecule' | 'recipe' | 'size' | 'capacity' | 'status' | 'submittedAt' | 'time' | 'memory' | 'cost';
export type SortDirection = 'asc' | 'desc';
export interface JobFilters { status: JobStatus | 'all'; recipe: Recipe | 'all'; size: WorkerSize | 'all' }
export const NO_FILTERS: JobFilters = { status: 'all', recipe: 'all', size: 'all' };

const SIZE_ORDER: Record<WorkerSize, number> = { S: 0, M: 1, L: 2, XL: 3 };
const STATUS_ORDER: Record<JobStatus, number> = { QUEUED: 0, STARTING: 1, RUNNING: 2, DONE: 3, FAILED: 4 };

export function filterJobs(jobs: JobView[], filters: JobFilters): JobView[] {
    return jobs.filter(job => (filters.status === 'all' || job.status === filters.status)
        && (filters.recipe === 'all' || job.recipe === filters.recipe)
        && (filters.size === 'all' || job.sizing.size === filters.size));
}

/** Time, memory and cost sort by the actual figure: what the dashboard is for is setting it against the prediction beside it. */
export function sortValue(job: JobView, column: SortColumn): string | number | null {
    switch (column) {
        case 'molecule': return job.name.toLowerCase();
        case 'recipe': return job.recipe;
        case 'size': return SIZE_ORDER[job.sizing.size];
        case 'capacity': return job.sizing.capacity;
        case 'status': return STATUS_ORDER[job.status];
        case 'submittedAt': return job.submittedAt;
        case 'time': return job.actual?.wallSeconds ?? null;
        case 'memory': return job.actual?.peakMemoryGB ?? null;
        case 'cost': return job.actualUsd;
    }
}

/** A job still running has no actual time yet: missing values sort last in either direction, never first. */
export function sortJobs(jobs: JobView[], column: SortColumn, direction: SortDirection): JobView[] {
    const sign = direction === 'asc' ? 1 : -1;
    return [...jobs].sort((a, b) => {
        const [p, q] = [sortValue(a, column), sortValue(b, column)];
        if (p === null || q === null) return p === q ? 0 : p === null ? 1 : -1;
        return (p < q ? -1 : p > q ? 1 : 0) * sign;
    });
}

export interface FileLink { label: string; href: string }

/** A finished job's result and files (spec §5.3); a failed one leaves only its attempt's input and log. */
export function jobLinks(job: JobView): FileLink[] {
    if (job.status === 'DONE') {
        return [
            { label: 'open', href: `/#mode=molecule&job=${job.key}` },
            ...[...computedResultFiles(job.recipe), 'timings.json'].map(name => ({ label: name, href: jobFileUrl(job.key, name) })),
        ];
    }
    if (job.status === 'FAILED') {
        return ['input.py', 'output.log'].map(name => ({ label: `attempt ${job.attempt} ${name}`, href: jobFileUrl(job.key, `attempts/${job.attempt}/${name}`) }));
    }
    return [];
}

export function methodSummary(job: JobView): string {
    const { xc, basis, optimiseBasis } = job.job.method;
    return optimiseBasis ? `${xc}/${optimiseBasis} → ${xc}/${basis}` : `${xc}/${basis}`;
}

/** The month filter's choices, newest first, in UTC like the meter. */
export function recentMonths(now: Date, count = 12): string[] {
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
}
