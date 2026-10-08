import React, { useCallback, useEffect } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectMolecule } from '../store/moleculeSlice';
import {
    followJob, jobFetchFailed, jobUpdated, refreshComputed, requestDraftChanged, requestOpened, selectIsOwner, sessionFailed,
} from '../store/jobsSlice';
import { tierOf } from '../molecules/types';
import { isJobKey } from '../molecules/job_paths';
import { jobsApi, jobsPoller } from '../jobs/client';
import { approvedBody, retryBody } from '../jobs/request_form';
import type { AvailableQuoteOption, JobRequest, JobView, Quote } from '../jobs/api_types';
import type { RequestForm } from '../jobs/request_form';
import { signInHere } from './OwnerBar';
import ProvenancePanel from './ProvenancePanel';
import RequestPanel from './RequestPanel';
import JobStatusPanel from './JobStatusPanel';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Molecules mode's job pieces, under the navigation card (the desktop side
 * panel and the phone's Explore tab, spec §9.7): how the molecule on screen
 * was computed, for everyone; for the owner, the request panel and the
 * followed job's status.
 */
const MoleculeJobsSection: React.FC = () => {
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

    const open = useCallback((key: string) => {
        dispatch(selectMolecule({ id: key }));
        dispatch(refreshComputed());
    }, [dispatch]);
    const follow = useCallback((job: JobView) => {
        dispatch(jobUpdated(job));
        dispatch(followJob(job.key));
        jobsPoller().restart(job.key);
    }, [dispatch]);
    // Phase 6C: a retry is priced afresh (a preview of the same molecule) and approved like any run.
    const quote = useCallback(async (view: JobView): Promise<Quote> => {
        const body = retryBody(view);
        delete body.retry;                               // a preview takes the molecule, not the retry
        const preview = await jobsApi().preview(body);
        if (!preview.decision.ok) throw new Error(preview.decision.error.message);
        return preview.decision.quote;
    }, []);
    // A refusal propagates to the status panel, which says it as a refused retry (m6).
    const retry = useCallback(async (view: JobView, option: AvailableQuoteOption) => {
        follow((await jobsApi().submit(approvedBody(retryBody(view), option))).job);
    }, [follow]);
    // This section lives on the viewer only (/admin.html has its own panels).
    const signIn = useCallback(() => signInHere('/', text => { dispatch(sessionFailed(text)); }), [dispatch]);
    const editForm = useCallback((change: Partial<RequestForm>) => { dispatch(requestDraftChanged(change)); }, [dispatch]);
    // jobsApi() reads the current target and session at call time, so these never go stale.
    const preview = useCallback((body: JobRequest, signal: AbortSignal) => jobsApi().preview(body, signal), []);
    const submit = useCallback((body: JobRequest) => jobsApi().submit(body), []);

    const expired = !isOwner && jobs.session.expired;
    return (
        <div className="molecule-jobs">
            {meta && <ProvenancePanel meta={meta} ownerJob={ownerJob} ownerJobError={ownerJobError} />}
            {isOwner && jobs.computed.error && (
                <Alert severity="warning">Could not list this month’s computed molecules: {jobs.computed.error}</Alert>
            )}
            {(isOwner || expired) && (
                <Accordion disableGutters className="request-accordion" expanded={jobs.request.open || expired}
                    onChange={(_event, value: boolean) => dispatch(requestOpened(value))}>
                    <AccordionSummary aria-controls="request-body" id="request-head">Request a molecule</AccordionSummary>
                    <AccordionDetails>
                        <RequestPanel target={jobs.target} form={jobs.request.form} onFormChange={editForm}
                            preview={preview} submit={submit} onOpen={open} onFollow={follow}
                            sessionExpired={expired} onSignIn={signIn} />
                    </AccordionDetails>
                </Accordion>
            )}
            {isOwner && jobs.followedKey && (
                <JobStatusPanel jobKey={jobs.followedKey} onOpen={open} onQuote={quote} onRetry={retry} onClose={() => dispatch(followJob(null))} />
            )}
        </div>
    );
};

export default MoleculeJobsSection;
