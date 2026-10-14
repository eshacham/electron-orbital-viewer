import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { jobFetchFailed, jobUpdated, selectIsOwner } from '../store/jobsSlice';
import { tierOf } from '../molecules/types';
import { isJobKey } from '../molecules/job_paths';
import { jobsApi } from '../jobs/client';
import ProvenancePanel from './ProvenancePanel';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * "How this was computed", for everyone -- lifted out of MoleculeJobsSection
 * (ruling R23f-2) so a desktop/medium layout can pin it to the Explore
 * panel's bottom edge (`pinned`, App.tsx's `.molecule-explore`) while the
 * owner's own tools (MoleculeJobsSection: Request a molecule, the followed
 * job's status) keep scrolling in the panel's normal flow above it. A
 * phone's Explore tab renders this unpinned, in its old place ahead of
 * those tools -- same component, same `.molecule-jobs` card styling.
 */
const MoleculeProvenanceFooter: React.FC<{ pinned?: boolean }> = ({ pinned = false }) => {
    const dispatch = useAppDispatch();
    const meta = useAppSelector(state => state.molecule.meta);
    const isOwner = useAppSelector(selectIsOwner);
    const jobs = useAppSelector(state => state.jobs);
    const computedKey = meta && tierOf(meta) === 'computed' && isJobKey(meta.id) ? meta.id : null;
    const ownerJob = computedKey && isOwner ? jobs.records[computedKey] ?? null : null;
    const ownerJobError = computedKey && isOwner ? jobs.recordErrors[computedKey] ?? null : null;

    // The owner's time and cost for the computed molecule on screen: one read, no polling -- it has finished.
    useEffect(() => {
        if (!computedKey || !isOwner || ownerJob || ownerJobError) return undefined;
        let cancelled = false;
        const target = jobs.target;
        jobsApi().get(computedKey).then(
            view => { if (!cancelled) dispatch(jobUpdated(view, target)); },
            error => { if (!cancelled) dispatch(jobFetchFailed({ key: computedKey, message: message(error) })); },
        );
        return () => { cancelled = true; };
    }, [computedKey, isOwner, ownerJob, ownerJobError, jobs.target, dispatch]);

    // Ruling R23f-2: pinned, the explanation is an overlay over the Explore
    // panel's scrolling content (style.css's `.molecule-provenance-footer
    // .provenance-body`), so it closes on Esc too, not just the same link --
    // the same pattern Inspector.tsx's drawer uses (onDrawerKey): find the
    // expanded trigger and click it, rather than needing ProvenancePanel's
    // own (uncontrolled) Accordion state lifted out here. Unpinned (a
    // phone's Explore tab), it is an ordinary in-flow accordion, like
    // "Request a molecule" beside it, which has no Esc affordance either.
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        const trigger = event.currentTarget.querySelector<HTMLButtonElement>('.provenance-trigger[aria-expanded="true"]');
        if (!trigger) return;
        event.preventDefault();
        trigger.click();
        trigger.focus();
    };

    if (!meta) return null;
    return (
        <div className={pinned ? 'molecule-jobs molecule-provenance-footer' : 'molecule-jobs'}
            onKeyDown={pinned ? onKeyDown : undefined}>
            <ProvenancePanel meta={meta} ownerJob={ownerJob} ownerJobError={ownerJobError} />
        </div>
    );
};

export default MoleculeProvenanceFooter;
