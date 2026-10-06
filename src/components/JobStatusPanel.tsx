import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Typography } from '@mui/material';
import { formatFormula } from '../molecules/catalogue';
import { elapsedSeconds, formatDuration, formatEnergy, methodOf, money, predictionNote } from '../jobs/format';
import { isActive, JobStatus, JobView } from '../jobs/api_types';
import { useJobPolling } from '../jobs/useJobPolling';
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
}

function costText(view: JobView): string {
    if (view.backend === 'local') return `This Mac — ${money('spent', view.actualUsd ?? 0)}`;
    if (view.actualUsd === null) return money('reserved', view.reservedUsd);
    return `${money('spent', view.actualUsd)} (${money('reserved', view.reservedUsd)} released)`;
}

/** Spec §9.3: state, stage, latest energy, log tail, elapsed time and cost, for one job. */
export const JobStatusView: React.FC<JobStatusViewProps> = ({ view, error, nowMs, onOpen, onRetry, onClose, busy = false }) => {
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
            <div className="job-status-head">
                <Typography variant="subtitle1">{view.name} · {formatFormula(view.formula)}</Typography>
                <Chip size="small" label={STATUS_TEXT[view.status]} color={STATUS_COLOUR[view.status]} />
            </div>
            <dl className="preview-facts">
                {view.stage && <><dt>Stage</dt><dd>{view.stage}</dd></>}
                {view.latestEnergyHartree !== null && (
                    <><dt>Latest energy</dt><dd>{formatEnergy(view.latestEnergyHartree, methodOf(view.job, view.stage))}</dd></>
                )}
                <dt>{waiting ? 'Waiting' : 'Elapsed'}</dt>
                <dd>
                    {formatDuration(elapsedSeconds(view, nowMs))}
                    {!waiting && ` (Fargate estimate ${formatDuration(view.sizing.predictedSeconds)}, ${predictionNote(view.sizing.version)})`}
                </dd>
                <dt>Cost</dt><dd>{costText(view)}</dd>
            </dl>
            {view.logTail.length > 0 && <pre ref={logRef} className="job-log-tail" role="log" aria-label="log tail">{tail}</pre>}
            {view.status === 'FAILED' && (
                <>
                    <Alert severity="error" role="alert">{view.error?.message ?? 'The job failed without a recorded reason.'}</Alert>
                    <Button variant="contained" disabled={busy} onClick={() => onRetry(view)}>Retry</Button>
                </>
            )}
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

/** Follows one job; when it finishes while being watched, it opens in the viewer (spec §9.3). */
const JobStatusPanel: React.FC<JobStatusPanelProps> = ({ jobKey, onOpen, onRetry, onClose }) => {
    const { view, error } = useJobPolling(jobKey);
    const nowMs = useNow(view !== null && isActive(view.status));
    const [busy, setBusy] = useState(false);
    const previous = useRef<JobStatus | null>(null);
    useEffect(() => {
        const status = view?.status ?? null;
        if (status === 'DONE' && previous.current !== null && isActive(previous.current)) onOpen(jobKey);
        previous.current = status;
    }, [view?.status, jobKey, onOpen]);
    const retry = async (target: JobView) => {
        setBusy(true);
        try {
            await onRetry(target);
        } finally {
            setBusy(false);
        }
    };
    return <JobStatusView view={view} error={error} nowMs={nowMs} onOpen={onOpen} onRetry={target => { void retry(target); }} onClose={onClose} busy={busy} />;
};

export default JobStatusPanel;
