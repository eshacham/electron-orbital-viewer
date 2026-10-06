import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { JobsState } from '../store/jobsSlice';
import type { JobView } from './api_types';
import { jobsPoller } from './client';

/** A job's latest view and last error, kept fresh by the page's one poller while this is mounted. */
export function useJobPolling(key: string | null): { view: JobView | null; error: string | null } {
    useEffect(() => (key ? jobsPoller().watch(key) : undefined), [key]);
    const view = useSelector((state: { jobs: JobsState }) => (key ? state.jobs.records[key] ?? null : null));
    const error = useSelector((state: { jobs: JobsState }) => (key ? state.jobs.recordErrors[key] ?? null : null));
    return { view, error };
}
