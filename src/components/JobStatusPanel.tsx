import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Typography } from '@mui/material';
import { useSelector } from 'react-redux';
import { formatFormula } from '../molecules/catalogue';
import { elapsedSeconds, formatDuration, formatEnergy, methodOf, money, predictionNote } from '../jobs/format';
import { isActive, JobStatus, JobView } from '../jobs/api_types';
import type { JobsState } from '../store/jobsSlice';
import { useNow } from '../jobs/useNow';

export const STATUS_TEXT: Record<JobStatus, string> = {
    QUEUED: 'Queued', STARTING: 'Starting a worker', RUNNING: 'Running', DONE: 'Done', FAILED: 'Failed',
};
const STATUS_COLOUR: Record<JobStatus, 'default' | 'info' | 'success' | 'error'> = {
    QUEUED: 'default', STARTING: 'info', RUNNING: 'info', DONE: 'success', FAILED: 'error',
};

export interface JobStatusViewProps {
    view: JobView | null;
    error: string | null;
    nowMs: number;
    onOpen(key: string): void;
    onRetry(view: JobView): void;
    onClose(): void;
    busy?: boolean;
    /** A retry the API refused: said as a retry's failure, not as a status that could not be refreshed (m6). */
    retryError?: string | null;
}

function costText(view: JobView): string {
    if (view.backend === 'local') return `This Mac — ${money('spent', view.actualUsd ?? 0)}`;
    if (view.actualUsd === null) return money('reserved', view.reservedUsd);
    return `${money('spent', view.actualUsd)} (${money('reserved', view.reservedUsd)} released)`;
}

/** Spec §9.3: state, stage, latest energy, log tail, elapsed time and cost, for one job. */
export const JobStatusView: React.FC<JobStatusViewProps> = ({ view, error, nowMs, onOpen, onRetry, onClose, busy = false, retryError = null }) => {
    const logRef = useRef<HTMLPreElement>(null);
    const tail = view?.logTail.join('\n') ?? '';
    // The newest line is the one that matters: keep the tail scrolled to the bottom as it grows.
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [tail]);
    if (!view) {
        return (
            <section className="job-status" aria-label="job status">
                {error ? <Alert severity="error" role="alert">{error}</Alert> : <Typography variant="body2">Reading the job’s status…</Typography>}
                <Button size="small" onClick={onClose}>Stop following</Button>
            </section>
        );
    }
    const waiting = view.startedAt === null && isActive(view.status);
    return (
        <section className="job-status" aria-label="job status">
            {/* m9: the state is what a screen-reader user waits on, so its changes are announced (role status is polite). */}
            <div className="job-status-head" role="status">
                <Typography variant="subtitle1">{view.name} · {formatFormula(view.formula)}</Typography>
                <Chip size="small" label={STATUS_TEXT[view.status]} color={STATUS_COLOUR[view.status]} />
            </div>
            <dl className="preview-facts">
                {view.stage && <><dt>Stage</dt><dd aria-live="polite">{view.stage}</dd></>}
                {view.latestEnergyHartree !== null && (
                    <><dt>Latest energy</dt><dd>{formatEnergy(view.latestEnergyHartree, methodOf(view.job, view.stage))}</dd></>
                )}
                <dt>{waiting ? 'Waiting' : 'Elapsed'}</dt>
                <dd>{formatDuration(elapsedSeconds(view, nowMs))}</dd>
                {/* M6: the estimate is of the run, not of the wait for a worker -- its own row, shown from submission on. */}
                <dt>Fargate estimate</dt>
                <dd>{formatDuration(view.sizing.predictedSeconds)} ({predictionNote(view.sizing.version)})</dd>
                <dt>Cost</dt><dd>{costText(view)}</dd>
            </dl>
            {/* role log announces every line as it arrives -- every 5 s while running -- so it is read on request only. */}
            {view.logTail.length > 0 && <pre ref={logRef} className="job-log-tail" role="log" aria-live="off" aria-label="log tail">{tail}</pre>}
            {view.status === 'FAILED' && (
                <>
                    <Alert severity="error" role="alert">{view.error?.message ?? 'The job failed without a recorded reason.'}</Alert>
                    <Button variant="contained" disabled={busy} onClick={() => onRetry(view)}>Retry</Button>
                </>
            )}
            {retryError && <Alert severity="error" role="alert">Retry was refused: {retryError}</Alert>}
            {view.status === 'DONE' && <Button variant="contained" onClick={() => onOpen(view.key)}>Open in the viewer</Button>}
            {error && <Alert severity="warning">The status could not be refreshed: {error}</Alert>}
            <Button size="small" onClick={onClose}>Stop following</Button>
        </section>
    );
};

interface JobStatusPanelProps {
    jobKey: string;
    onOpen(key: string): void;
    onRetry(view: JobView): Promise<void>;
    onClose(): void;
}

/**
 * The followed job, as App's useFollowedJob keeps it fresh. This panel does
 * not poll and does not open the result itself: on a phone it unmounts
 * whenever the sheet folds or another tab opens (final review I2).
 */
const JobStatusPanel: React.FC<JobStatusPanelProps> = ({ jobKey, onOpen, onRetry, onClose }) => {
    const view = useSelector((state: { jobs: JobsState }) => state.jobs.records[jobKey] ?? null);
    const error = useSelector((state: { jobs: JobsState }) => state.jobs.recordErrors[jobKey] ?? null);
    const nowMs = useNow(view !== null && isActive(view.status));
    const [busy, setBusy] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);
    const retry = async (target: JobView) => {
        setBusy(true);
        setRetryError(null);
        try {
            await onRetry(target);
        } catch (failure) {
            setRetryError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy(false);
        }
    };
    return (
        <JobStatusView view={view} error={error} nowMs={nowMs} onOpen={onOpen} onRetry={target => { void retry(target); }}
            onClose={onClose} busy={busy} retryError={retryError} />
    );
};

export default JobStatusPanel;
