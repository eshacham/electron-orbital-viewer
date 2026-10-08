import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Typography } from '@mui/material';
import { useSelector } from 'react-redux';
import { formatFormula } from '../molecules/catalogue';
import QuoteChooser from './QuoteChooser';
import { elapsedSeconds, formatDuration, formatEnergy, formatUsd, methodOf, money, optionLabel, predictionNote, quotedCost } from '../jobs/format';

const utc = (iso: string) => iso.replace('T', ' ').replace('Z', ' UTC');
import { AvailableQuoteOption, isActive, JobStatus, JobView, Quote } from '../jobs/api_types';
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
    /** Retry asks for a fresh quote first (Phase 6C): a retry is a new run, approved like one. */
    onRetry(view: JobView): void;
    onClose(): void;
    busy?: boolean;
    /** A retry the API refused: said as a retry's failure, not as a status that could not be refreshed (m6). */
    retryError?: string | null;
    /** The fresh quote for a retry, once it has come; approving one of its options retries the job. */
    retryQuote?: Quote | null;
    onApproveRetry?(view: JobView, option: AvailableQuoteOption): void;
}

/**
 * What the job costs. A quoted job (Phase 6C) shows its approved maximum
 * and, once settled, what it was charged; a record from before quotes shows
 * its reservation and actual cost, as it always did.
 */
function costText(view: JobView): string {
    if (view.backend === 'local') return `This Mac — ${money('spent', view.actualUsd ?? 0)}`;
    const quoted = quotedCost(view);
    if (quoted) return quoted;
    if (view.actualUsd === null) return money('reserved', view.reservedUsd);
    return `${money('spent', view.actualUsd)} (${money('reserved', view.reservedUsd)} released)`;
}

/** The approved quote's lines, and once settled what each was charged. */
function CostLines({ view }: { view: JobView }) {
    const quote = view.approvedQuote;
    if (!quote || view.backend === 'local') return null;
    const charged = new Map((view.charged?.lines ?? []).map(line => [line.item, line]));
    const approvals = (view.ledger ?? []).filter(entry => entry.quoteId !== null && entry.option !== null);
    return (
        <details className="quote-details">
            <summary>Price, line by line</summary>
            <ul className="job-cost-lines">
                {quote.lines.map(line => {
                    const settled = charged.get(line.item);
                    return (
                        <li key={line.item}>
                            {line.label}: {money('estimated', line.estimateUsd)}, {money('up to', line.maximumUsd)}
                            {settled ? `; ${money('charged', settled.chargedUsd)}${settled.costUsd > settled.chargedUsd ? ` (${money('billed', settled.costUsd)} by AWS)` : ''}` : ''}
                        </li>
                    );
                })}
            </ul>
            <span className="quote-option-note">Approved {utc(quote.approvedAt)}; time limit {formatDuration(quote.timeoutSeconds)}{quote.attempts > 1 ? `, up to ${quote.attempts} attempts` : ''}; total {formatUsd(quote.estimateUsd)} estimated.</span>
            {/* Review I2: every approval keeps its own charge; a retry never overwrites an earlier one. */}
            {approvals.length > 0 && (
                <ul className="job-cost-lines" aria-label="charges by approval">
                    {approvals.map((entry, i) => (
                        <li key={`${entry.quoteId}-${i}`}>
                            {optionLabel(entry.option!)}, settled {entry.at ? utc(entry.at) : 'undated'}: {money('charged', entry.chargedUsd ?? 0)} of {money('up to', entry.approvedMaximumUsd ?? 0)}
                            {(entry.absorbedUsd ?? 0) > 0 ? ` (${money('absorbed', entry.absorbedUsd ?? 0)} by the app)` : ''}
                        </li>
                    ))}
                </ul>
            )}
        </details>
    );
}

/** Spec §9.3: state, stage, latest energy, log tail, elapsed time and cost, for one job. */
export const JobStatusView: React.FC<JobStatusViewProps> = ({
    view, error, nowMs, onOpen, onRetry, onClose, busy = false, retryError = null, retryQuote = null, onApproveRetry,
}) => {
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
            <CostLines view={view} />
            {/* role log announces every line as it arrives -- every 5 s while running -- so it is read on request only. */}
            {view.logTail.length > 0 && <pre ref={logRef} className="job-log-tail" role="log" aria-live="off" aria-label="log tail">{tail}</pre>}
            {view.status === 'FAILED' && (
                <>
                    <Alert severity="error" role="alert">{view.error?.message ?? 'The job failed without a recorded reason.'}</Alert>
                    {!retryQuote && <Button variant="contained" disabled={busy} onClick={() => onRetry(view)}>Retry</Button>}
                    {/* Phase 6C: a retry is a new run, so it is priced afresh and approved; the quote is announced as it lands. */}
                    <div aria-live="polite">
                        {retryQuote && (
                            <>
                                <Typography variant="body2">A retry is a new run: approve one of these to run it again.</Typography>
                                <QuoteChooser quote={retryQuote} verb="retry" disabled={busy}
                                    onApprove={option => onApproveRetry?.(view, option)} />
                            </>
                        )}
                    </div>
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
    /** A fresh quote for retrying a failed job (Phase 6C: a retry needs its own approval). */
    onQuote(view: JobView): Promise<Quote>;
    onRetry(view: JobView, option: AvailableQuoteOption): Promise<void>;
    onClose(): void;
}

/**
 * The followed job, as App's useFollowedJob keeps it fresh. This panel does
 * not poll and does not open the result itself: on a phone it unmounts
 * whenever the sheet folds or another tab opens (final review I2).
 */
const JobStatusPanel: React.FC<JobStatusPanelProps> = ({ jobKey, onOpen, onQuote, onRetry, onClose }) => {
    const view = useSelector((state: { jobs: JobsState }) => state.jobs.records[jobKey] ?? null);
    const error = useSelector((state: { jobs: JobsState }) => state.jobs.recordErrors[jobKey] ?? null);
    const nowMs = useNow(view !== null && isActive(view.status));
    const [busy, setBusy] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);
    const [retryQuote, setRetryQuote] = useState<{ key: string; attempt: number; quote: Quote } | null>(null);
    const attempt = async (work: () => Promise<void>) => {
        setBusy(true);
        setRetryError(null);
        try {
            await work();
        } catch (failure) {
            setRetryError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy(false);
        }
    };
    const quote = (target: JobView) => attempt(async () => {
        setRetryQuote({ key: target.key, attempt: target.attempt, quote: await onQuote(target) });
    });
    // Review I1: approved or refused, the quote is spent. A refusal (409 quote-changed, option-unavailable,
    // the cap) drops it, so the panel offers Retry -- a fresh quote -- instead of the stale one again.
    const approve = (target: JobView, option: AvailableQuoteOption) => attempt(async () => {
        try {
            await onRetry(target, option);
        } finally {
            setRetryQuote(null);
        }
    });
    // A quote belongs to the failed attempt it was asked for: once the job has moved on, it is dropped.
    const current = retryQuote && view && retryQuote.key === view.key && retryQuote.attempt === view.attempt && view.status === 'FAILED'
        ? retryQuote.quote : null;
    return (
        <JobStatusView view={view} error={error} nowMs={nowMs} onOpen={onOpen} onRetry={target => { void quote(target); }}
            onClose={onClose} busy={busy} retryError={retryError} retryQuote={current}
            onApproveRetry={(target, option) => { void approve(target, option); }} />
    );
};

export default JobStatusPanel;
