import React, { useState } from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSelector } from 'react-redux';
import { formatFormula } from '../molecules/catalogue';
import {
    capacityLabel, elapsedSeconds, formatDuration, formatEnergy, formatGB, formatUsd, methodOf, money, optionLabel, predictionNote,
} from '../jobs/format';
import { isActive } from '../jobs/api_types';
import type { JobView } from '../jobs/api_types';
import type { JobsState } from '../store/jobsSlice';
import { useJobPolling } from '../jobs/useJobPolling';
import { jobLinks, methodSummary } from './jobs_table';
import { chargedTotal, groupOf, markTone, peakMemory, predictionCheck, runSeconds } from './jobs_month';
import { compactDuration, exactUsd, localDay, localTime, rowCharge, shortReason, STATUS_SHORT } from './job_text';

export const COLUMN_COUNT = 6;

const pct = (value: number) => `${Math.max(0, Math.min(100, value * 100)).toFixed(1)}%`;

/**
 * Run time against prediction: a small bar of the larger of the two with the
 * prediction's notch on it, amber past the notch however little (owner
 * ruling). A failed job leads with a short reason; its message is in the details.
 */
function TimeCell({ job, now }: { job: JobView; now: number }) {
    const predicted = job.sizing.predictedSeconds;
    const seconds = runSeconds(job, now);
    const reason = job.status === 'FAILED' && job.error
        ? <span className="admin-row-error" title={job.error.message}>{shortReason(job.error)}</span>
        : null;
    if (seconds === null) return reason ?? <span className="admin-muted">not started · {compactDuration(predicted)} predicted</span>;
    const over = predictionCheck(job, now).timeOver;
    const scale = Math.max(seconds, predicted);
    return (
        <span className="admin-time">
            {reason ? <>{reason}<span className="admin-muted"> · </span></> : (
                <span className={`admin-gauge${over ? ' is-over' : ''}`} aria-hidden="true">
                    <span className="admin-gauge-fill" style={{ width: pct(Math.min(seconds, predicted) / scale) }} />
                    {over && <span className="admin-gauge-over" style={{ left: pct(predicted / scale), width: pct((seconds - predicted) / scale) }} />}
                    <span className="admin-gauge-notch" style={{ left: pct(predicted / scale) }} />
                </span>
            )}
            <span className="admin-figure"><span className={over ? 'admin-over' : undefined}>{compactDuration(seconds)}</span>
                <span className="admin-muted">{job.actual ? '' : ' so far'}</span></span>{' '}
            <span className="admin-figure admin-muted">of {compactDuration(predicted)}</span>
        </span>
    );
}

function MemoryCell({ job, now }: { job: JobView; now: number }) {
    const peak = peakMemory(job);
    const over = predictionCheck(job, now).memoryOver;
    const predicted = job.sizing.predictedMemoryGB.toFixed(2);
    return (
        <span className={`admin-memory${over ? ' is-over' : ''}`}>
            {peak === null ? <span className="admin-muted">— of {predicted} GB</span> : (
                <>{peak.toFixed(2)}<span className="admin-muted">{job.actual ? '' : ' so far'} of {predicted} GB</span></>
            )}
        </span>
    );
}

/** What it was charged of what was approved; a legacy record by its actual cost of its reservation; This Mac is free. */
function CostCell({ job }: { job: JobView }) {
    if (job.backend === 'local') return <span className="admin-muted">This Mac, free</span>;
    const total = chargedTotal(job);
    if (!job.approvedQuote) {
        return (
            <>
                <span className="admin-figure">{total === null ? <span className="admin-muted">not settled</span> : rowCharge(total)}</span>{' '}
                <span className="admin-figure admin-muted">of {formatUsd(job.reservedUsd)} reserved</span>
            </>
        );
    }
    if (total === null) return <><span className="admin-muted">held</span> {formatUsd(job.reservedUsd || job.approvedQuote.maximumUsd)}</>;
    const absorbed = (job.ledger ?? []).reduce((sum, entry) => sum + (entry.absorbedUsd ?? 0), 0);
    return (
        <>
            <span className={absorbed > 0 ? 'admin-over' : undefined} title={absorbed > 0 ? `${money('absorbed', absorbed)} by the app` : undefined}>
                {rowCharge(total)}
            </span>{' '}
            <span className="admin-figure admin-muted">of {formatUsd(job.approvedQuote.maximumUsd)}</span>
        </>
    );
}

function Section({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
    return (
        <div className={`admin-detail${wide ? ' is-wide' : ''}`}>
            <h3 className="admin-detail-title">{title}</h3>
            {children}
        </div>
    );
}

/** A running job, kept fresh by the page's one poller while its row is open. */
function Live({ job, now }: { job: JobView; now: number }) {
    const { error } = useJobPolling(job.key);
    const waiting = !job.startedAt;
    return (
        <Section title="Live">
            <dl className="admin-facts">
                <dt>Stage</dt><dd aria-live="polite">{job.stage ?? STATUS_SHORT[job.status]}</dd>
                <dt>{waiting ? 'Waiting' : 'Elapsed'}</dt><dd>{formatDuration(elapsedSeconds(job, now))}</dd>
                {job.latestEnergyHartree !== null && (
                    <><dt>Latest energy</dt><dd>{formatEnergy(job.latestEnergyHartree, methodOf(job.job, job.stage))}</dd></>
                )}
            </dl>
            {job.logTail.length > 0 && <pre className="admin-log">{job.logTail.slice(-3).join('\n')}</pre>}
            <p className="admin-note">{error ? `Last check failed: ${error}` : 'Checked every 5 s while this row is open.'}</p>
        </Section>
    );
}

function CopyKey({ jobKey }: { jobKey: string }) {
    const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
    const copy = () => {
        const done = navigator.clipboard?.writeText(jobKey);
        if (!done) { setCopied('no'); return; }
        done.then(() => setCopied('yes'), () => setCopied('no'));
    };
    return (
        <span className="admin-jobkey">
            <code className="admin-job-key">{jobKey}</code>
            <Tooltip title="Copy job key">
                <IconButton size="small" aria-label="Copy job key" onClick={copy}><ContentCopyIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <span className="admin-note" aria-live="polite">{copied === 'yes' ? 'Copied' : copied === 'no' ? 'Copy failed: select the key instead' : ''}</span>
        </span>
    );
}

function Details({ job, now, id }: { job: JobView; now: number; id: string }) {
    const quote = job.approvedQuote;
    const charged = job.charged;
    const settled = new Map((charged?.lines ?? []).map(line => [line.item, line]));
    const files = jobLinks(job).filter(link => link.label !== 'open');
    const { sizing, actual } = job;
    return (
        <div className="admin-details" id={id} role="region" aria-label={`${job.name} details`}>
            {isActive(job.status) && <Live job={job} now={now} />}
            {job.error && (
                <Section title="Error">
                    <p className="admin-error">{job.error.message}</p>
                    <p className="admin-note">Code: {job.error.code}</p>
                </Section>
            )}
            <Section title="Quote">
                {quote ? (
                    <>
                        <p>{optionLabel(quote.option)}, {quote.attempts} attempt{quote.attempts === 1 ? '' : 's'}, time limit {formatDuration(quote.timeoutSeconds)}</p>
                        <p className="admin-note">Approved {localTime(quote.approvedAt)} · {money('estimated', quote.estimateUsd)}, {money('up to', quote.maximumUsd)} · sizing v{quote.sizingVersion}, prices v{quote.pricesVersion}</p>
                    </>
                ) : (
                    <p>Legacy: no approved quote (recorded before quotes). {money('reserved', job.reservedUsd)}; {job.actualUsd === null ? 'not settled' : money('spent', job.actualUsd)}.</p>
                )}
            </Section>
            {quote && (
                <Section title="Charged">
                    <ul className="admin-lines" aria-label={`${job.name} price, line by line`}>
                        {quote.lines.map(line => {
                            const got = settled.get(line.item);
                            if (!got) return <li key={line.item}>{line.label}: {money('up to', line.maximumUsd)}</li>;
                            // To the micro-dollar, like the total under them: the lines add up to it exactly,
                            // and a charge never prints above its maximum.
                            return <li key={line.item}>{line.label}: up to {exactUsd(line.maximumUsd)}, charged {exactUsd(got.chargedUsd)}</li>;
                        })}
                    </ul>
                    {charged && job.ledger.length > 1 && <p className="admin-note">Latest attempt: {exactUsd(charged.chargedUsd)}</p>}
                    {chargedTotal(job) !== null && (
                        <p className="admin-note">Total charged: {exactUsd(chargedTotal(job)!)}{job.ledger.length > 1 ? `, across ${job.ledger.length} attempts` : ''}</p>
                    )}
                    {charged && charged.absorbedUsd > 0 && (
                        <p className="admin-absorbed">{money('billed', charged.costUsd)} by AWS: {money('absorbed', charged.absorbedUsd)} by the app</p>
                    )}
                </Section>
            )}
            <Section title="Attempts">
                {job.ledger.length === 0 ? <p className="admin-note">None settled yet.</p> : (
                    <ul className="admin-lines" aria-label={`${job.name} attempts`}>
                        {job.ledger.map((entry, i) => (
                            <li key={`${entry.quoteId ?? 'legacy'}-${i}`}>
                                {entry.option !== null && entry.quoteId !== null
                                    ? `Attempt ${i + 1} · ${optionLabel(entry.option)}: charged ${exactUsd(entry.chargedUsd ?? 0)} of up to ${exactUsd(entry.approvedMaximumUsd ?? 0)}`
                                    : `Attempt ${i + 1}: cost ${formatUsd(entry.costUsd)} (before quotes)`}
                                {(entry.absorbedUsd ?? 0) > 0 && <span className="admin-absorbed"> ({money('absorbed', entry.absorbedUsd ?? 0)} by the app)</span>}
                                {entry.at && <span className="admin-note"> · {localTime(entry.at)}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
            <Section title="Sizing">
                <p>v{sizing.version} · {sizing.size} · {sizing.vcpu} vCPU · {sizing.memoryGB} GB · {capacityLabel(sizing.capacity)}{job.attempt > 1 ? ` · attempt ${job.attempt}` : ''}</p>
                <p>{job.basisFunctions} basis functions · {methodSummary(job)}</p>
                <p>Time {actual ? formatDuration(actual.wallSeconds) : '—'} of {formatDuration(sizing.predictedSeconds)} · memory {actual ? formatGB(actual.peakMemoryGB) : '—'} of {formatGB(sizing.predictedMemoryGB)}</p>
                {/* The sizing rule always predicts the Fargate worker, even for a local run. */}
                <p className="admin-note">Fargate estimate, {predictionNote(sizing.version)}</p>
            </Section>
            <Section title="Times (local)">
                <dl className="admin-facts">
                    <dt>Queued</dt><dd>{localTime(job.submittedAt)}</dd>
                    <dt>Started</dt><dd>{localTime(job.startedAt)}</dd>
                    <dt>Ended</dt><dd>{localTime(job.endedAt)}</dd>
                </dl>
            </Section>
            <Section title="Files">
                {files.length === 0 ? (
                    <p className="admin-note">{isActive(job.status) ? 'Its files appear when it finishes.' : 'None: no worker ran far enough to leave any.'}</p>
                ) : (
                    <ul className="admin-files">
                        {files.map(link => <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}
                    </ul>
                )}
            </Section>
            <Section title="Job key" wide><CopyKey jobKey={job.key} /></Section>
        </div>
    );
}

export interface JobRowProps {
    job: JobView;
    now: number;
    open: boolean;
    linked: boolean;
    onToggle(key: string): void;
    onLink(key: string | null): void;
}

/**
 * One job on one line: molecule, status, run time and memory against the
 * prediction, charged of approved, and one action. The molecule is the
 * disclosure that opens everything else in place under it.
 */
const JobRow: React.FC<JobRowProps> = ({ job: listed, now, open, linked, onToggle, onLink }) => {
    // A followed job's newer view (from the poller) wins over the month's list.
    const polled = useSelector((state: { jobs: JobsState }) => state.jobs.records[listed.key] ?? null);
    const job = polled && polled.key === listed.key ? polled : listed;
    const detailsId = `job-${job.key.slice(0, 16)}-details`;
    const group = groupOf(job);
    const meta = [formatFormula(job.formula), job.recipe, localDay(job.submittedAt)];
    if (job.attempt > 1) meta.push(`${job.attempt} attempts`);
    if (!job.approvedQuote) meta.push('legacy');
    const toggle = () => onToggle(job.key);
    return (
        <tbody className="admin-job" role="rowgroup">
            <tr role="row" className={`admin-row${linked ? ' is-linked' : ''}${open ? ' is-open' : ''}`}
                onMouseEnter={() => onLink(job.key)} onMouseLeave={() => onLink(null)}
                onFocus={() => onLink(job.key)} onBlur={() => onLink(null)}>
                <td role="cell" className="admin-cell-molecule">
                    <button type="button" className="admin-disclosure" aria-expanded={open} aria-controls={detailsId} onClick={toggle}>
                        <ChevronRightIcon className="admin-chevron" fontSize="small" aria-hidden="true" />
                        <span className="admin-molecule-name">{job.name}</span>
                        <span className="admin-molecule-meta" title={meta.join(' · ')}>{meta.join(' · ')}</span>
                    </button>
                </td>
                <td role="cell" className="admin-cell-status">
                    <span className={`admin-status tone-${markTone(job, now)}`}><span className="admin-status-dot" aria-hidden="true" />{STATUS_SHORT[job.status]}</span>
                </td>
                <td role="cell" className="admin-cell-time"><TimeCell job={job} now={now} /></td>
                <td role="cell" className="admin-cell-memory"><MemoryCell job={job} now={now} /></td>
                <td role="cell" className="admin-cell-cost"><CostCell job={job} /></td>
                <td role="cell" className="admin-cell-action">
                    {group === 'done' ? (
                        <Button size="small" variant="outlined" component="a" href={`/#mode=molecule&job=${job.key}`} target="_blank" rel="noopener noreferrer"
                            aria-label={`Open result for ${job.name}`}>Open<span className="admin-action-rest">&nbsp;result</span></Button>
                    ) : (
                        <Button size="small" variant="outlined" aria-expanded={open} aria-controls={detailsId} onClick={toggle}
                            aria-label={`${group === 'running' ? 'Follow' : 'Details for'} ${job.name}`}>
                            {group === 'running' ? 'Follow' : 'Details'}
                        </Button>
                    )}
                </td>
            </tr>
            {open && (
                <tr className="admin-detail-row" role="row">
                    <td colSpan={COLUMN_COUNT} role="cell"><Details job={job} now={now} id={detailsId} /></td>
                </tr>
            )}
        </tbody>
    );
};

export default JobRow;
