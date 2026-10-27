/**
 * The owner's own record of the computed molecule on screen -- its time against the prediction and its cost, which
 * "How this was computed" adds for the owner alone. Task 7b (ruling PF5): moved out of MoleculeProvenanceFooter, the
 * pinned footer that is gone; App selects the record (`ownerJobRecordOf`) for Info's builder and fetches it once
 * (`useOwnerJobRecord`), whether or not Info is on screen.
 */
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { jobFetchFailed, jobUpdated, selectIsOwner, type JobsState } from '../store/jobsSlice';
import type { MoleculeState } from '../store/moleculeSlice';
import { tierOf } from '../molecules/types';
import { isJobKey } from '../molecules/job_paths';
import { jobsApi } from './client';
import type { JobView } from './api_types';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The job key of the computed molecule on screen, or null (a library molecule, or none loaded). */
function computedKeyOf(meta: MoleculeState['meta']): string | null {
    return meta && tierOf(meta) === 'computed' && isJobKey(meta.id) ? meta.id : null;
}

/** What "How this was computed" adds for the owner: the job's record, or why it could not be read. */
export interface OwnerJobRecord { ownerJob: JobView | null; ownerJobError: string | null }

/** The owner's record of the computed molecule on screen, or why it could not be read; nulls for anyone else. */
export function ownerJobRecordOf(state: { molecule: Pick<MoleculeState, 'meta'>; jobs: JobsState }): OwnerJobRecord {
    const key = computedKeyOf(state.molecule.meta);
    if (!key || !selectIsOwner(state)) return { ownerJob: null, ownerJobError: null };
    return { ownerJob: state.jobs.records[key] ?? null, ownerJobError: state.jobs.recordErrors[key] ?? null };
}

/**
 * The owner's time and cost for the computed molecule on screen: one read, no polling -- it has finished. It reads only
 * what decides the read (never the whole jobs slice), so App re-renders for none of the jobs slice's other changes.
 */
export function useOwnerJobRecord(): void {
    const dispatch = useAppDispatch();
    const computedKey = useAppSelector(state => computedKeyOf(state.molecule.meta));
    const isOwner = useAppSelector(selectIsOwner);
    const target = useAppSelector(state => state.jobs.target);
    const held = useAppSelector(state => Boolean(computedKey && (state.jobs.records[computedKey] || state.jobs.recordErrors[computedKey])));
    useEffect(() => {
        if (!computedKey || !isOwner || held) return undefined;
        let cancelled = false;
        jobsApi().get(computedKey).then(
            view => { if (!cancelled) dispatch(jobUpdated(view, target)); },
            error => { if (!cancelled) dispatch(jobFetchFailed({ key: computedKey, message: message(error) })); },
        );
        return () => { cancelled = true; };
    }, [computedKey, isOwner, held, target, dispatch]);
}
