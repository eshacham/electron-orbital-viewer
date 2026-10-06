import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { computedFailed, computedLoaded, selectIsOwner } from '../store/jobsSlice';
import { jobsApi } from './client';
import { currentMonth } from './format';

/**
 * The owner's Computed category (spec §9.1): this month's finished jobs,
 * read when Molecules mode opens and again whenever the list may have
 * changed (a job finished, the session or the backend changed). Nobody else
 * asks.
 */
export function useComputedList(active: boolean): void {
    const dispatch = useAppDispatch();
    const isOwner = useAppSelector(selectIsOwner);
    const nonce = useAppSelector(state => state.jobs.computed.nonce);
    const target = useAppSelector(state => state.jobs.target);
    useEffect(() => {
        if (!active || !isOwner) return undefined;
        let cancelled = false;
        const month = currentMonth();
        jobsApi().list(month, 'DONE').then(
            listing => { if (!cancelled) dispatch(computedLoaded({ month, jobs: listing.jobs })); },
            error => { if (!cancelled) dispatch(computedFailed(error instanceof Error ? error.message : String(error))); },
        );
        return () => { cancelled = true; };
    }, [active, isOwner, nonce, target, dispatch]);
}
