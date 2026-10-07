import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import JobsTable from '../../src/admin/JobsTable';
import { filterJobs, sortJobs, jobLinks, recentMonths, methodSummary, NO_FILTERS } from '../../src/admin/jobs_table';
import type { JobView } from '../../src/jobs/api_types';
import { jobFixture } from '../jobs/api_fixtures';

const done = jobFixture('get_done');
const failed = jobFixture('get_failed');
const running: JobView = { ...jobFixture('get_running'), key: 'b'.repeat(64), name: 'Ethanol', formula: 'C2H6O', submittedAt: '2026-10-10T12:05:00Z' };
const JOBS = [done, failed, running];

describe('jobs table logic', () => {
    it('filters by status, recipe and size', () => {
        expect(filterJobs(JOBS, { ...NO_FILTERS, status: 'FAILED' })).toEqual([failed]);
        expect(filterJobs(JOBS, { ...NO_FILTERS, recipe: 'optimise' })).toEqual([failed]);
        expect(filterJobs(JOBS, { ...NO_FILTERS, size: 'XL' })).toEqual([]);
        expect(filterJobs(JOBS, NO_FILTERS)).toHaveLength(3);
    });
    it('sorts either way, with missing actuals last in both', () => {
        expect(sortJobs(JOBS, 'time', 'asc')[0]).toBe(done);
        expect(sortJobs(JOBS, 'time', 'desc')[0]).toBe(done);
        expect(sortJobs(JOBS, 'molecule', 'asc').map(j => j.name)).toEqual(['Ethanol', 'H2O', 'Water']);
        expect(sortJobs(JOBS, 'submittedAt', 'desc')[0]).toBe(running);
    });
    it('links a finished job to its result and its files, and a failed one to its attempt', () => {
        expect(jobLinks(done)[0]).toEqual({ label: 'open', href: `/#mode=molecule&job=${done.key}` });
        expect(jobLinks(done).map(link => link.label)).toEqual(['open', 'input.py', 'output.log', 'geometry.xyz', 'job.json', 'timings.json']);
        expect(jobLinks(failed)).toEqual([
            { label: 'attempt 1 input.py', href: `/molecules/jobs/${failed.key}/attempts/1/input.py` },
            { label: 'attempt 1 output.log', href: `/molecules/jobs/${failed.key}/attempts/1/output.log` },
        ]);
        expect(jobLinks(running)).toEqual([]);
        for (const code of ['submit-failed', 'submit-lost', 'no-capacity']) {
            expect(jobLinks({ ...failed, error: { code, message: 'no worker ran' } })).toEqual([]);
        }
    });
    it('names the method, and lists the last months', () => {
        expect(methodSummary(failed)).toBe('B3LYP/def2-SVP → B3LYP/def2-TZVPD');
        expect(methodSummary(done)).toBe('B3LYP/def2-TZVPD');
        expect(recentMonths(new Date('2026-01-15T00:00:00Z'), 3)).toEqual(['2026-01', '2025-12', '2025-11']);
    });
});

describe('<JobsTable>', () => {
    const dataRows = () => within(screen.getByRole('table', { name: 'jobs' })).getAllByRole('row').slice(1);
    it('shows every job, newest first, in a table that scrolls sideways on its own', () => {
        const { container } = render(<JobsTable jobs={JOBS} />);
        expect(dataRows()).toHaveLength(3);
        expect(dataRows()[0]).toHaveTextContent('Ethanol');
        expect(container.querySelector('.admin-table-scroll table')).not.toBeNull();
    });
    it('sorts by a column when its header is clicked', () => {
        render(<JobsTable jobs={JOBS} />);
        fireEvent.click(screen.getByRole('button', { name: 'Time: predicted / actual' }));
        expect(dataRows()[0]).toHaveTextContent('Water');
        expect(dataRows()[0]).toHaveTextContent('1 min 10 s');
    });
    it('keeps each method whole, so the cell can break only at the arrow', () => {
        render(<JobsTable jobs={[failed]} />);
        const cell = within(dataRows()[0]).getAllByRole('cell')[2];
        expect(cell).toHaveTextContent('B3LYP/def2-SVP → B3LYP/def2-TZVPD');
        expect([...cell.querySelectorAll('.admin-nowrap')].map(span => span.textContent)).toEqual(['B3LYP/def2-SVP →', 'B3LYP/def2-TZVPD']);
    });
    it('filters by status, and says why a job failed', () => {
        render(<JobsTable jobs={JOBS} />);
        fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'FAILED' } });
        expect(dataRows()).toHaveLength(1);
        expect(dataRows()[0]).toHaveTextContent('SCF did not converge');
        expect(screen.getByText('1 of 3 jobs')).toBeInTheDocument();
    });
    // M7: an empty month and an over-narrow filter are different things to be told.
    it('says a month with no jobs has none, and a filter that leaves none matches none', () => {
        const { rerender } = render(<JobsTable jobs={[]} />);
        expect(screen.getByText('No jobs this month.')).toBeInTheDocument();
        rerender(<JobsTable jobs={JOBS} />);
        fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'XL' } });
        expect(screen.getByText('No jobs match.')).toBeInTheDocument();
    });
});
