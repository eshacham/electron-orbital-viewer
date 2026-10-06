import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography } from '@mui/material';
import { filterJobs, jobLinks, JobFilters, methodSummary, NO_FILTERS, SortColumn, SortDirection, sortJobs } from './jobs_table';
import { STATUS_TEXT } from '../components/JobStatusPanel';
import { formatFormula } from '../molecules/catalogue';
import { capacityLabel, formatDuration, formatGB, money, predictionNote, shortKey } from '../jobs/format';
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
    { id: 'cost', label: 'Cost: reserved / actual', sort: 'cost' },
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

function JobRow({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    const links = jobLinks(job);
    return (
        <TableRow hover>
            <TableCell>{job.name} · {formatFormula(job.formula)}<br /><code>{shortKey(job.key)}</code></TableCell>
            <TableCell>{job.recipe}</TableCell>
            <TableCell>{methodSummary(job)}</TableCell>
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
            <TableCell>{money('reserved', job.reservedUsd)}<br />{job.actualUsd === null ? 'not settled' : money('spent', job.actualUsd)}</TableCell>
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
                        {rows.length === 0 && <TableRow><TableCell colSpan={COLUMNS.length}>No jobs match.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </TableContainer>
        </section>
    );
};

export default JobsTable;
