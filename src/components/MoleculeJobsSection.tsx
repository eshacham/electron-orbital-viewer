import React, { useCallback } from 'react';
import DisclosureChevron from './DisclosureChevron';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectMolecule } from '../store/moleculeSlice';
import {
    followJob, jobUpdated, refreshComputed, requestDraftChanged, requestOpened, selectIsOwner, sessionFailed,
} from '../store/jobsSlice';
import { jobsApi, jobsPoller } from '../jobs/client';
import { approvedBody, retryBody } from '../jobs/request_form';
import { isLocalServerDown, LOCAL_SERVER_COMMAND, LOCAL_SERVER_FROM, SESSION_ENDED } from '../jobs/api';
import type { AvailableQuoteOption, JobRequest, JobView, Quote } from '../jobs/api_types';
import type { RequestForm } from '../jobs/request_form';
import { signInHere } from './OwnerBar';
import RequestPanel, { RequestPanelProps } from './RequestPanel';
import JobStatusPanel from './JobStatusPanel';

/** The id the desktop entry's aria-controls names: the request workspace in the viewport cell (ruling P12). */
export const REQUEST_WORKSPACE_ID = 'request-workspace';

/**
 * Who may request, and the request panel's wiring to the jobs slice and the
 * page's jobs client -- shared by the phone's in-sheet panel (here) and the
 * desktop's request workspace (RequestWorkspace, ruling P12). An ended
 * session is the owner's, signed out under them: the form stays, disabled,
 * under its alert (spec §9.5, R4).
 */
export function useRequestPanel() {
    const dispatch = useAppDispatch();
    const isOwner = useAppSelector(selectIsOwner);
    const jobs = useAppSelector(state => state.jobs);
    const expired = !isOwner && jobs.session.expired;

    const open = useCallback((key: string) => {
        dispatch(selectMolecule({ id: key }));
        dispatch(refreshComputed());
    }, [dispatch]);
    const follow = useCallback((job: JobView) => {
        dispatch(jobUpdated(job));
        dispatch(followJob(job.key));
        jobsPoller().restart(job.key);
    }, [dispatch]);
    // This section lives on the viewer only (/admin.html has its own panels).
    const signIn = useCallback(() => signInHere('/', text => { dispatch(sessionFailed(text)); }), [dispatch]);
    const editForm = useCallback((change: Partial<RequestForm>) => { dispatch(requestDraftChanged(change)); }, [dispatch]);
    // jobsApi() reads the current target and session at call time, so these never go stale.
    const preview = useCallback((body: JobRequest, signal: AbortSignal) => jobsApi().preview(body, signal), []);
    const submit = useCallback((body: JobRequest) => jobsApi().submit(body), []);

    const panelProps: RequestPanelProps = {
        target: jobs.target, form: jobs.request.form, onFormChange: editForm, preview, submit, onOpen: open, onFollow: follow,
        sessionExpired: expired, onSignIn: signIn,
    };
    return { isOwner, expired, jobs, open, follow, signIn, panelProps };
}

/**
 * Owner R25-A1: on This Mac a job server that is not running is the usual state, not a fault -- one muted line,
 * with the command folded under "How to start it", rather than a warning-coloured alert.
 */
const LocalServerNote: React.FC = () => (
    <div className="local-server-note">
        <p className="local-server-line">Computed molecules: the local job server isn’t running.</p>
        <details className="local-server-how">
            <summary>How to start it<DisclosureChevron /></summary>
            <p className="local-server-from">From {LOCAL_SERVER_FROM}:</p>
            <code className="local-server-command">{LOCAL_SERVER_COMMAND}</code>
        </details>
    </div>
);

export interface MoleculeJobsSectionProps {
    /**
     * `entry` (a desktop or tablet's Explore panel, ruling P12): a "Request a new molecule" button that
     * opens the request workspace in the viewport cell. `accordion` (the phone's Explore tab): the
     * request panel itself, in the sheet, with its own drawing of the preview.
     */
    variant?: 'entry' | 'accordion';
    /** The entry button, where focus goes back when the workspace closes. */
    entryRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Molecules mode's job tools, under the navigation card (the desktop side
 * panel and the phone's Explore tab, spec §9.7): the way into the owner's
 * request and the followed job's status. "How this was computed" (everyone's
 * own provenance) moved out of it (ruling R23f-2) and, since Task 7b (ruling
 * PF5), is Info's; this component has nothing to show anyone else.
 */
const MoleculeJobsSection: React.FC<MoleculeJobsSectionProps> = ({ variant = 'accordion', entryRef }) => {
    const dispatch = useAppDispatch();
    const { isOwner, expired, jobs, open, follow, panelProps } = useRequestPanel();

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

    // Real or absent (§3.5): with provenance gone, there is nothing here for anyone else.
    if (!isOwner && !expired) return null;
    const requestOpen = jobs.request.open;
    return (
        <div className="molecule-jobs">
            {isOwner && jobs.computed.error && (isLocalServerDown(jobs.target, jobs.computed.error)
                ? <LocalServerNote />
                : <Alert severity="warning">Could not list this month’s computed molecules: {jobs.computed.error}</Alert>)}
            {variant === 'entry' ? (
                <>
                    <Button ref={entryRef} variant="outlined" className="request-entry" aria-expanded={requestOpen}
                        aria-controls={REQUEST_WORKSPACE_ID} onClick={() => dispatch(requestOpened(!requestOpen))}>
                        Request a new molecule
                    </Button>
                    {/* The workspace, when open, says an ended session itself (one alert, not two); closed, this does. */}
                    {expired && !requestOpen && (
                        <Alert severity="warning" role="alert"
                            action={<Button size="small" color="inherit" onClick={panelProps.onSignIn}>Sign in</Button>}>
                            {SESSION_ENDED}
                        </Alert>
                    )}
                </>
            ) : (
                <Accordion disableGutters className="request-accordion" expanded={requestOpen || expired}
                    onChange={(_event, value: boolean) => dispatch(requestOpened(value))}>
                    <AccordionSummary aria-controls="request-body" id="request-head">Request a molecule</AccordionSummary>
                    <AccordionDetails>
                        <RequestPanel {...panelProps} />
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
