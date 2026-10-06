import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { refreshComputed, selectIsOwner } from '../store/jobsSlice';
import { selectMolecule } from '../store/moleculeSlice';
import { RESULT_NOT_FINISHED } from '../molecules/loader';
import { isActive, JobStatus } from './api_types';
import { useJobPolling } from './useJobPolling';

/**
 * How long to wait before reading a just-finished job's result once more.
 * CloudFront caches an error answer for 10 s, so a look at done.json taken
 * in the seconds before the job finished (a share link opened in another
 * tab) can still answer 403 when DONE arrives (final review m3). Past that
 * window, a second look sees the real file.
 */
export const FOLLOW_REOPEN_DELAY_MS = 11000;

/**
 * Follows the followed job for as long as the page is open, and opens it in
 * the viewer when it finishes (spec §9.3). It lives in App, not in the
 * status panel, because a phone unmounts the panel whenever its sheet folds
 * or another tab opens -- and a job that finished meanwhile would never have
 * opened (final review I2). The panel only shows what this keeps fresh.
 */
export function useFollowedJob(): void {
    const dispatch = useAppDispatch();
    const isOwner = useAppSelector(selectIsOwner);
    const followedKey = useAppSelector(state => state.jobs.followedKey);
    const key = isOwner ? followedKey : null;
    const { view } = useJobPolling(key);
    const status = view?.status ?? null;

    // Only a change seen while following counts: a job already DONE when first seen is not "just finished".
    const previous = useRef<{ key: string | null; status: JobStatus | null }>({ key: null, status: null });
    const reopen = useRef<{ key: string; spent: boolean } | null>(null);
    useEffect(() => {
        const before = previous.current;
        previous.current = { key, status };
        if (key && status === 'DONE' && before.key === key && before.status !== null && isActive(before.status)) {
            reopen.current = { key, spent: false };
            dispatch(selectMolecule({ id: key }));
            dispatch(refreshComputed());
        }
    }, [key, status, dispatch]);

    const selectedId = useAppSelector(state => state.molecule.selectedId);
    const error = useAppSelector(state => state.molecule.error);
    useEffect(() => {
        const pending = reopen.current;
        if (!pending || pending.spent || pending.key !== selectedId || !error?.includes(RESULT_NOT_FINISHED)) return undefined;
        pending.spent = true;
        // Once only: a result that is still not there after this is reported as it stands.
        const timer = window.setTimeout(() => dispatch(selectMolecule({ id: pending.key })), FOLLOW_REOPEN_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [selectedId, error, dispatch]);
}
