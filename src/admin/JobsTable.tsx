import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography } from '@mui/material';
import { filterJobs, jobLinks, JobFilters, methodSummary, NO_FILTERS, SortColumn, SortDirection, sortJobs } from './jobs_table';
import { STATUS_TEXT } from '../components/JobStatusPanel';
import { formatFormula } from '../molecules/catalogue';
import { capacityLabel, formatDuration, formatGB, money, optionLabel, predictionNote, shortKey } from '../jobs/format';
import type { JobView } from '../jobs/api_types';

/** Spec §9.4's columns, in its order. */
const COLUMNS: Array<{ id: string; label: string; sort?: SortColumn }> = [
    { id: 'molecule', label: 'Molecule', sort: 'molecule' },
    { id: 'recipe', label: 'Recipe', sort: 'recipe' },
    { id: 'method', label: 'Method' },
    { id: 'size', label: 'Size', sort: 'size' },
    { id: 'capacity', label: 'Capacity', sort: 'capacity' },
    { id: 'status', label: 'Status · stage', sort: 'status' },
    { id: 'times', label: 'Queued / started / ended (UTC)', sort: 'submittedAt' },
    { id: 'time', label: 'Time: predicted / actual', sort: 'time' },
    { id: 'memory', label: 'Memory: predicted / actual', sort: 'memory' },
    { id: 'cost', label: 'Cost: approved / charged', sort: 'cost' },
    { id: 'files', label: 'Result and files' },
];

const when = (iso: string | null) => (iso ? iso.replace('T', ' ').replace('Z', '') : '—');

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange(value: string): void }) {
    return (
        <TextField select size="small" label={label} value={value} onChange={event => onChange(event.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
            {options.map(option => <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>)}
        </TextField>
    );
}

/**
 * Phase 6C: a quoted job's approved maximum against what it was charged,
 * flagged when AWS billed past the maximum (the app absorbs that), with the
 * per-line split behind a disclosure. A record from before quotes keeps its
 * reservation against its actual cost, and says it is legacy.
 */
function CostCell({ job }: { job: JobView }) {
    const quote = job.approvedQuote;
    if (job.backend === 'local') return <>This Mac (free)<br />{job.actualUsd === null ? 'not settled' : money('spent', job.actualUsd)}</>;
    if (!quote) {
        return (
            <>
                {money('reserved', job.reservedUsd)}<br />{job.actualUsd === null ? 'not settled' : money('spent', job.actualUsd)}
                <br /><span className="admin-note">legacy: no approved quote</span>
            </>
        );
    }
    const charged = job.charged;
    const lines = new Map((charged?.lines ?? []).map(line => [line.item, line]));
    return (
        <>
            {money('up to', quote.maximumUsd)} ({optionLabel(quote.option)})<br />
            {charged ? money('charged', charged.chargedUsd) : 'not settled'}
            {charged && charged.absorbedUsd > 0 && (
                <><br /><span className="admin-absorbed">{money('billed', charged.costUsd)} by AWS: {money('absorbed', charged.absorbedUsd)} by the app</span></>
            )}
            <details className="admin-lines">
                <summary>lines</summary>
                <ul aria-label={`${job.name} price, line by line`}>
                    {quote.lines.map(line => {
                        const settled = lines.get(line.item);
                        return <li key={line.item}>{line.label}: {money('up to', line.maximumUsd)}{settled ? `, ${money('charged', settled.chargedUsd)}` : ''}</li>;
                    })}
                </ul>
            </details>
        </>
    );
}

function JobRow({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    const links = jobLinks(job);
    return (
        <TableRow hover>
            <TableCell>{job.name} · {formatFormula(job.formula)}<br /><code>{shortKey(job.key)}</code></TableCell>
            <TableCell>{job.recipe}</TableCell>
            {/* Each method stays whole and the cell breaks only at the arrow: an
                optimisation's two methods side by side would otherwise widen the
                table past a laptop's screen. */}
            <TableCell className="admin-method">
                {methodSummary(job).split(' → ').map((part, i, parts) => (
                    <React.Fragment key={i}>{i > 0 && ' '}<span className="admin-nowrap">{part}{i < parts.length - 1 ? ' →' : ''}</span></React.Fragment>
                ))}
            </TableCell>
            <TableCell>{sizing.size} · {sizing.vcpu} vCPU · {sizing.memoryGB} GB</TableCell>
            <TableCell>{capacityLabel(sizing.capacity)}{job.attempt > 1 ? ` · attempt ${job.attempt}` : ''}</TableCell>
            <TableCell>
                {STATUS_TEXT[job.status]}{job.stage ? ` · ${job.stage}` : ''}
                {job.error && <><br /><span className="admin-error">{job.error.message}</span></>}
            </TableCell>
            <TableCell>{when(job.submittedAt)}<br />{when(job.startedAt)}<br />{when(job.endedAt)}</TableCell>
            <TableCell>
                {formatDuration(sizing.predictedSeconds)} / {actual ? formatDuration(actual.wallSeconds) : '—'}
                {/* D7's spirit: the sizing rule always predicts the Fargate worker, even for a
                    local run, so the figure says what it really is rather than just "predicted". */}
                <br /><span className="admin-note">Fargate estimate, {predictionNote(sizing.version)}</span>
            </TableCell>
            <TableCell>{formatGB(sizing.predictedMemoryGB)} / {actual ? formatGB(actual.peakMemoryGB) : '—'}</TableCell>
            <TableCell><CostCell job={job} /></TableCell>
            <TableCell>
                {links.length === 0 ? '—' : links.map(link => (
                    <div key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></div>
                ))}
            </TableCell>
        </TableRow>
    );
}

/**
 * Every job of the month (spec §9.4), sortable and filterable, as a plain
 * MUI Table: a few dozen rows a month need no data grid. Desktop-first; on a
 * phone the table scrolls sideways inside its own box, not the page.
 */
const JobsTable: React.FC<{ jobs: JobView[] }> = ({ jobs }) => {
    const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
    const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({ column: 'submittedAt', direction: 'desc' });
    const rows = useMemo(() => sortJobs(filterJobs(jobs, filters), sort.column, sort.direction), [jobs, filters, sort]);
    const choose = (column: SortColumn) => setSort(s => ({ column, direction: s.column === column && s.direction === 'asc' ? 'desc' : 'asc' }));
    return (
        <section className="admin-jobs" aria-label="job list">
            <div className="admin-filters">
                <FilterSelect label="Status" value={filters.status} options={['all', 'QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED']}
                    onChange={status => setFilters(f => ({ ...f, status: status as JobFilters['status'] }))} />
                <FilterSelect label="Recipe" value={filters.recipe} options={['all', 'single', 'optimise']}
                    onChange={recipe => setFilters(f => ({ ...f, recipe: recipe as JobFilters['recipe'] }))} />
                <FilterSelect label="Size" value={filters.size} options={['all', 'S', 'M', 'L', 'XL']}
                    onChange={size => setFilters(f => ({ ...f, size: size as JobFilters['size'] }))} />
                <Typography variant="body2">{rows.length} of {jobs.length} jobs</Typography>
            </div>
            <TableContainer className="admin-table-scroll">
                <Table size="small" stickyHeader aria-label="jobs">
                    <TableHead>
                        <TableRow>
                            {COLUMNS.map(column => (
                                <TableCell key={column.id} sortDirection={column.sort && sort.column === column.sort ? sort.direction : false}>
                                    {column.sort ? (
                                        <TableSortLabel active={sort.column === column.sort} direction={sort.column === column.sort ? sort.direction : 'asc'}
                                            onClick={() => choose(column.sort!)}>
                                            {column.label}
                                        </TableSortLabel>
                                    ) : column.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map(job => <JobRow key={job.key} job={job} />)}
                        {rows.length === 0 && (
                            <TableRow><TableCell colSpan={COLUMNS.length}>{jobs.length === 0 ? 'No jobs this month.' : 'No jobs match.'}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </section>
    );
};

export default JobsTable;
