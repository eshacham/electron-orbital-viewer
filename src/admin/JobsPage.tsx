import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Chip, InputAdornment, TextField, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { CostsResponse, JobView } from '../jobs/api_types';
import { isActive } from '../jobs/api_types';
import { useNow } from '../jobs/useNow';
import BudgetStrip from './BudgetStrip';
import MonthBand from './MonthBand';
import JobRow, { COLUMN_COUNT } from './JobRow';
import { SortColumn, SortDirection, sortJobs } from './jobs_table';
import { ChipId, CHIPS, chipCounts, matchesChip, matchesSearch, monthLabel, OVER_PREDICTION_TEXT } from './jobs_month';

const SORTS: Record<string, { label: string; column: SortColumn; direction: SortDirection }> = {
    newest: { label: 'Newest first', column: 'submittedAt', direction: 'desc' },
    oldest: { label: 'Oldest first', column: 'submittedAt', direction: 'asc' },
    molecule: { label: 'Molecule, A–Z', column: 'molecule', direction: 'asc' },
    status: { label: 'Status', column: 'status', direction: 'asc' },
    time: { label: 'Run time, longest first', column: 'time', direction: 'desc' },
    memory: { label: 'Peak memory, largest first', column: 'memory', direction: 'desc' },
    cost: { label: 'Charged, most first', column: 'cost', direction: 'desc' },
};

export interface JobsPageProps {
    month: string;
    jobs: JobView[];
    /** null when the costs could not be read: the jobs still show, under the reason. */
    costs: CostsResponse | null;
    costsError?: string | null;
    /** The clock, for a test; the page reads its own otherwise, ticking while a job runs. */
    now?: number;
    /** Reads the month again: the costs alert's recovery. */
    onReload?: () => void;
}

/** "… not answering." + " Reload to try again." without a doubled full stop. */
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/**
 * The owner's month: the budget strip, the month band, then every job on
 * one line, filtered by chip and search and sorted on request; each row
 * opens in place. The band and the list light each other's job on hover
 * and focus, and choosing a mark opens its row.
 */
const JobsPage: React.FC<JobsPageProps> = ({ month, jobs, costs, costsError = null, now: fixedNow, onReload }) => {
    const ticking = fixedNow === undefined && jobs.some(job => isActive(job.status));
    const clock = useNow(ticking, 5000);
    const now = fixedNow ?? clock;
    const [chip, setChip] = useState<ChipId>('all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('newest');
    const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
    const [linked, setLinked] = useState<string | null>(null);
    const focusAfterOpen = useRef<string | null>(null);

    const counts = useMemo(() => chipCounts(jobs, now), [jobs, now]);
    const rows = useMemo(() => {
        const { column, direction } = SORTS[sort];
        return sortJobs(jobs.filter(job => matchesChip(job, chip, now) && matchesSearch(job, query)), column, direction);
    }, [jobs, chip, query, sort, now]);
    const shown = useMemo(() => new Set(rows.map(job => job.key)), [rows]);

    const toggle = (key: string) => setOpen(previous => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    const pick = (key: string) => {
        if (!shown.has(key)) { setChip('all'); setQuery(''); }
        setOpen(previous => new Set(previous).add(key));
        focusAfterOpen.current = key;
    };
    useEffect(() => {
        const key = focusAfterOpen.current;
        if (!key) return;
        focusAfterOpen.current = null;
        const button = document.querySelector<HTMLButtonElement>(`[aria-controls="job-${key.slice(0, 16)}-details"].admin-disclosure`);
        button?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        button?.focus({ preventScroll: true });
    });
    const showAll = () => { setChip('all'); setQuery(''); };
    const name = monthLabel(month);

    return (
        <>
            {costs ? <BudgetStrip costs={costs} /> : costsError && (
                <Alert severity="error" role="alert" className="admin-costs-error"
                    action={onReload && <Button color="inherit" size="small" onClick={onReload}>Reload</Button>}>
                    Costs could not be read: {sentence(costsError)} Reload to try again.
                </Alert>
            )}
            <MonthBand month={month} jobs={jobs} costs={costs} now={now} linked={linked} onLink={setLinked} onPick={pick} shown={shown} />
            <section className="admin-jobs" aria-label="Jobs">
                <div className="admin-tools">
                    <div className="admin-chips" role="group" aria-label="Show">
                        {CHIPS.map(({ id, label }) => {
                            const chipElement = (
                                <Chip key={id} clickable size="small" variant="outlined"
                                    aria-pressed={chip === id} onClick={() => setChip(id)} className={`admin-chip${chip === id ? ' is-selected' : ''}`}
                                    label={<>{label}<span className="admin-chip-count">{counts[id]}</span></>} />
                            );
                            return id === 'off'
                                ? <Tooltip key={id} title={OVER_PREDICTION_TEXT} describeChild>{chipElement}</Tooltip>
                                : chipElement;
                        })}
                    </div>
                    <TextField size="small" type="search" placeholder="Name or formula" value={query} className="admin-search"
                        onChange={event => setQuery(event.target.value)}
                        slotProps={{
                            htmlInput: { 'aria-label': 'Search molecules' },
                            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
                        }} />
                    <TextField select size="small" label="Sort" value={sort} onChange={event => setSort(event.target.value)} className="admin-sort"
                        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                        {Object.entries(SORTS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                    </TextField>
                </div>
                <table className="admin-list ql-tabular" aria-label="jobs" role="table">
                    <thead role="rowgroup">
                        <tr role="row">
                            <th scope="col" role="columnheader" className="admin-col-molecule">Molecule</th>
                            <th scope="col" role="columnheader" className="admin-col-status">Status</th>
                            <th scope="col" role="columnheader" className="admin-col-time">Run time of prediction</th>
                            <th scope="col" role="columnheader" className="admin-col-memory">Peak memory of prediction</th>
                            <th scope="col" role="columnheader" className="admin-col-cost">Charged of approved</th>
                            <th scope="col" role="columnheader" className="admin-col-action"><span className="admin-visually-hidden">Action</span></th>
                        </tr>
                    </thead>
                    {rows.map(job => (
                        <JobRow key={job.key} job={job} now={now} open={open.has(job.key)} linked={linked === job.key}
                            onToggle={toggle} onLink={setLinked} />
                    ))}
                    {rows.length === 0 && (
                        <tbody role="rowgroup">
                            <tr className="admin-empty-row" role="row">
                                <td colSpan={COLUMN_COUNT} role="cell">
                                    {jobs.length === 0 ? (
                                        <p className="admin-empty">
                                            No jobs in {name}. A molecule requested from the viewer’s Molecules mode appears here with its
                                            quote, its run against the prediction and what it was charged.{' '}
                                            <a href="/">Open the viewer</a>
                                        </p>
                                    ) : (
                                        <p className="admin-empty">
                                            {query ? `No jobs match “${query}”.` : `No ${CHIPS.find(c => c.id === chip)?.label.toLowerCase()} jobs in ${name}.`}{' '}
                                            <Button size="small" onClick={showAll}>Show all jobs</Button>
                                        </p>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    )}
                </table>
            </section>
        </>
    );
};

export default JobsPage;
