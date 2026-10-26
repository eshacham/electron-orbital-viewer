import React from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import { bindJobsClient, setJobsPollerForTests } from '../../src/jobs/client';
import JobsPage from '../../src/admin/JobsPage';
import type { CostsResponse, JobView } from '../../src/jobs/api_types';
import { costsFixture, jobFixture } from '../jobs/api_fixtures';

const done = jobFixture('get_done');          // Water, This Mac, 70 s of 16.3 s predicted
const failed = jobFixture('get_failed');      // H2O
const running: JobView = { ...jobFixture('get_running'), key: 'b'.repeat(64), name: 'Ethanol', formula: 'C2H6O', submittedAt: '2026-10-10T12:05:00Z' };
const JOBS = [done, failed, running];
const NOW = Date.parse('2026-10-10T12:00:15Z');
const SPENT: CostsResponse = {
    ...costsFixture(), spentUsd: 0.325, reservedUsd: 1.44, remainingUsd: 7.035, projectionUsd: 0.81,
    daily: [{ date: '2026-10-06', usd: 0.105 }, { date: '2026-10-09', usd: 0.22 }],
};

const poller = { watch: jest.fn(() => () => undefined), restart: jest.fn() };
function renderPage(jobs: JobView[] = JOBS, costs: CostsResponse | null = SPENT, extra: Partial<React.ComponentProps<typeof JobsPage>> = {}) {
    const store = configureStore({ reducer: { jobs: jobsReducer } });
    bindJobsClient(store);
    setJobsPollerForTests(poller);
    return render(<Provider store={store}><JobsPage month="2026-10" jobs={jobs} costs={costs} now={NOW} {...extra} /></Provider>);
}
const table = () => screen.getByRole('table', { name: 'jobs' });
const dataRows = () => within(table()).getAllByRole('row').filter(row => row.classList.contains('admin-row'));
const legendItems = (root: HTMLElement) => [...root.querySelectorAll('.admin-legend-item')].map(item => item.textContent);
const rowOf = (name: string) => dataRows().find(row => row.querySelector('.admin-molecule-name')?.textContent === name)!;
afterEach(() => { jest.clearAllMocks(); setJobsPollerForTests(null); bindJobsClient(null); });

describe('the budget strip', () => {
    it('says what is available of the cap, charged, held and projected, each labelled', () => {
        renderPage();
        const strip = screen.getByRole('region', { name: 'Budget, October 2026' });
        for (const text of ['Available $7.04 of $8.80', 'Charged $0.33', 'Held $1.44', 'Projected $0.81 by 31 Oct']) {
            expect(strip).toHaveTextContent(text);
        }
        expect(within(strip).getByRole('img', { name: 'Charged $0.33 and held $1.44 of the $8.80 cap' })).toBeInTheDocument();
    });
    it('says AWS’s billed figure is not in yet, until the billing job has run', () => {
        renderPage();
        expect(screen.getByRole('region', { name: 'Budget, October 2026' })).toHaveTextContent('AWS billed: not yet reported');
    });
    it('sets AWS billed against the meter with the gap, and explains it only as far as the app knows', () => {
        renderPage(JOBS, { ...SPENT, billing: { usd: 0.62, through: '2026-10-18' } });
        const strip = screen.getByRole('region', { name: 'Budget, October 2026' });
        expect(strip).toHaveTextContent('AWS billed $0.62 to 18 Oct');
        expect(strip).toHaveTextContent('meter $0.33');
        expect(strip).toHaveTextContent('$0.29 more than the meter');
        const why = within(strip).getByRole('button', { name: 'Why they differ' });
        expect(why).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(why);
        expect(why).toHaveAttribute('aria-expanded', 'true');
        const note = screen.getByRole('region', { name: 'Why AWS billed and the meter differ' });
        expect(note).toHaveTextContent(/a day behind/);
        expect(note).toHaveTextContent(/storage and delivery/);
        expect(note).toHaveTextContent(/fixed costs/);
        expect(note).toHaveTextContent(/does not split the gap further/);
        expect(note).toHaveTextContent('Prices retrieved 2026-10-04 (Fargate, us-east-1, Linux/ARM)');
    });
    it('says plainly when the costs could not be read, names the recovery, and keeps the jobs', () => {
        const onReload = jest.fn();
        renderPage(JOBS, null, { costsError: 'The job server on this Mac is not answering.', onReload });
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Costs could not be read: The job server on this Mac is not answering. Reload to try again.');
        fireEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
        expect(onReload).toHaveBeenCalledTimes(1);
        expect(dataRows()).toHaveLength(3);
    });
    it('folds charged, held, projected and billed behind one control on a phone', () => {
        renderPage();
        const more = screen.getByRole('button', { name: 'Charged, held, projected, AWS billed' });
        // Its own line under the figure and its bar, never read as part of the figure.
        expect(more.closest('.admin-strip-line')).toBeNull();
        expect(more.previousElementSibling).toHaveClass('admin-cap-bar');
        expect(more).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(more);
        expect(more).toHaveAttribute('aria-expanded', 'true');
    });
});

describe('the month band', () => {
    it('sums the month up for a screen reader, and puts a mark per job on its day', () => {
        renderPage();
        expect(screen.getByRole('img', { name: /^October 2026: 3 jobs \(1 done, 1 failed, 1 running\); charged \$0\.33 of the \$8\.80 cap/ }))
            .toBeInTheDocument();
        const marks = within(screen.getByRole('group', { name: 'Jobs by day' })).getAllByRole('button');
        expect(marks).toHaveLength(3);
        expect(marks[0]).toHaveAccessibleName(/^Water, 10 Oct: Done, over prediction/);
    });
    it('names only the running and failed marks on the band, side by side without overlapping', () => {
        const { container } = renderPage();
        const names = [...container.querySelectorAll('.admin-band-name')];
        expect(names.map(n => n.textContent)).toEqual(['H2O', 'Ethanol']);
        const [a, b] = names.map(n => Number(n.getAttribute('x')));
        expect(b - a).toBeGreaterThanOrEqual('H2O'.length * 6);
    });
    it('says the cap is above the scale in words, with no cap line, when the month is far below it', () => {
        const { container } = renderPage();
        expect(screen.getByText('cap $8.80 is above this scale')).toBeInTheDocument();
        expect(container.querySelector('.admin-band-cap')).toBeNull();
        expect(container.querySelector('.admin-band-break')).toBeNull();
        expect(legendItems(container)).not.toContain('cap');
        expect(container.querySelector('.admin-band-top')).toHaveTextContent('$1.00');
    });
    it('draws the dashed cap line, and keys it, once the month comes near the cap', () => {
        const { container } = renderPage(JOBS, { ...SPENT, spentUsd: 6, projectionUsd: 7.5, daily: [{ date: '2026-10-06', usd: 6 }] });
        expect(container.querySelector('.admin-band-cap')).not.toBeNull();
        expect(screen.queryByText(/is above this scale/)).toBeNull();
        expect(legendItems(container)).toContain('cap');
    });
    it('links a mark and its row both ways, on hover and on focus', () => {
        renderPage();
        const mark = screen.getByRole('button', { name: /^Ethanol, 10 Oct/ });
        fireEvent.mouseEnter(mark);
        expect(dataRows()[0]).toHaveClass('is-linked');
        fireEvent.mouseLeave(mark);
        expect(dataRows()[0]).not.toHaveClass('is-linked');
        act(() => { within(rowOf('H2O')).getByRole('button', { name: /^H2O/ }).focus(); });
        expect(screen.getByRole('button', { name: /^H2O, 10 Oct/ })).toHaveClass('is-linked');
    });
    it('opens a job’s row when its mark is chosen', () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /^Water, 10 Oct/ }));
        expect(within(rowOf('Water')).getByRole('button', { name: /^Water/ })).toHaveAttribute('aria-expanded', 'true');
    });
    it('says a month with no jobs has none', () => {
        renderPage([], costsFixture());
        expect(screen.getByRole('img', { name: /^October 2026: no jobs/ })).toBeInTheDocument();
    });
});

describe('the job list', () => {
    it('shows one row per job, newest first', () => {
        renderPage();
        expect(dataRows()).toHaveLength(3);
        expect(dataRows()[0]).toHaveTextContent('Ethanol');
    });
    it('filters by chip, each with its count, and says why a failed job failed', () => {
        renderPage();
        const chips = screen.getByRole('group', { name: 'Show' });
        expect(within(chips).getAllByRole('button').map(chip => chip.textContent))
            .toEqual(['All3', 'Running1', 'Failed1', 'Done1', 'Over prediction1']);
        fireEvent.click(within(chips).getByRole('button', { name: /^Failed/ }));
        expect(within(chips).getByRole('button', { name: /^Failed/ })).toHaveAttribute('aria-pressed', 'true');
        expect(dataRows()).toHaveLength(1);
        // The row holds a short reason read from the error code; the full message is in the details.
        expect(dataRows()[0]).toHaveTextContent('SCF not converged');
        expect(dataRows()[0]).not.toHaveTextContent('DIIS');
    });
    it('says what its Over prediction chip counts', () => {
        renderPage();
        expect(screen.getByRole('button', { name: /^Over prediction/ })).toHaveAccessibleDescription(
            'Run time or peak memory past its prediction');
    });
    it('searches by name or formula, and offers a way back when nothing matches', () => {
        renderPage();
        const search = screen.getByRole('searchbox', { name: 'Search molecules' });
        fireEvent.change(search, { target: { value: 'c2h6' } });
        expect(dataRows().map(row => row.textContent)).toEqual([expect.stringContaining('Ethanol')]);
        fireEvent.change(search, { target: { value: 'benzene' } });
        expect(screen.getByText('No jobs match “benzene”.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show all jobs' }));
        expect(dataRows()).toHaveLength(3);
    });
    it('sorts by the chosen order', () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'time' } });
        expect(dataRows()[0]).toHaveTextContent('Water');
        expect(dataRows()[0]).toHaveTextContent('1m 10s');
    });
    it('teaches what an empty month will hold', () => {
        renderPage([], costsFixture());
        expect(screen.getByText(/No jobs in October 2026\./)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open the viewer' })).toHaveAttribute('href', '/');
    });
    it('sets run time and memory against the prediction, amber past it however little', () => {
        renderPage([done]);
        const row = dataRows()[0];
        expect(row).toHaveTextContent('1m 10s of 16s');
        expect(row.querySelector('.admin-gauge.is-over .admin-gauge-over')).not.toBeNull();
        expect(row).toHaveTextContent('0.52 of 0.47 GB');
        expect(row.querySelector('.admin-memory.is-over')).not.toBeNull();
    });
    it('colours a running job amber once its time so far passes the prediction', () => {
        renderPage([running], SPENT, { now: Date.parse('2026-10-10T12:00:22Z') });
        const row = dataRows()[0];
        expect(row).toHaveTextContent('17s so far of 16s');
        expect(row.querySelector('.admin-gauge.is-over')).not.toBeNull();
        expect(row.querySelector('.admin-cell-time .admin-over')).toHaveTextContent('17s');
    });
    it('shows a failed job’s run against its prediction beside its short reason', () => {
        const failedAfterRunning: JobView = { ...failed, actual: { wallSeconds: 600, peakMemoryGB: 0.3, threads: 2 } };
        renderPage([failedAfterRunning]);
        expect(dataRows()[0].querySelector('.admin-cell-time')).toHaveTextContent('SCF not converged · 10m 00s of 1m 17s');
    });
});

describe('a row’s one action', () => {
    it('opens a finished job’s result', () => {
        renderPage([done]);
        expect(screen.getByRole('link', { name: 'Open result for Water' })).toHaveAttribute('href', `/#mode=molecule&job=${done.key}`);
    });
    it('opens a failed job’s details, error and files', () => {
        renderPage([failed]);
        const details = screen.getByRole('button', { name: 'Details for H2O' });
        expect(details).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(details);
        expect(details).toHaveAttribute('aria-expanded', 'true');
        const region = screen.getByRole('region', { name: 'H2O details' });
        expect(region).toHaveTextContent('SCF did not converge (DIIS, level shift 0.3 Ha, second-order)');
        expect(region).toHaveTextContent('scf-not-converged');
        expect(within(region).getByRole('link', { name: 'attempt 1 input.py' })).toHaveAttribute('href', `/molecules/jobs/${failed.key}/attempts/1/input.py`);
        fireEvent.click(details);
        expect(screen.queryByRole('region', { name: 'H2O details' })).toBeNull();
    });
    it('follows a running job live, with its stage, time so far and latest energy', () => {
        renderPage([running]);
        const follow = screen.getByRole('button', { name: 'Follow Ethanol' });
        fireEvent.click(follow);
        expect(follow).toHaveAttribute('aria-expanded', 'true');
        expect(poller.watch).toHaveBeenCalledWith(running.key);
        const region = screen.getByRole('region', { name: 'Ethanol details' });
        expect(region).toHaveTextContent('SCF (DIIS)');
        expect(region).toHaveTextContent('Latest energy');
        expect(region).toHaveTextContent('cycle= 8 E= -76.4612007');
    });
});

describe('a row’s details keep everything the old table showed', () => {
    const open = (job: JobView) => {
        renderPage([job]);
        fireEvent.click(within(dataRows()[0]).getAllByRole('button')[0]);
        return screen.getByRole('region', { name: `${job.name} details` });
    };
    it('the quote, its lines against what was charged, the sizing, the times, the files and the key', () => {
        const job = jobFixture('get_done_aws');
        const region = open(job);
        expect(region).toHaveTextContent('Spot, 3 attempts, time limit 10 min 00 s');
        // Each line's maximum and charge share one precision, so a charge never looks bigger than its maximum.
        expect(within(region).getByRole('list', { name: 'Water price, line by line' })).toHaveTextContent(
            'Compute (AWS Fargate): up to $0.0178800, charged $0.0004970');
        expect(region).toHaveTextContent('B3LYP-D3(BJ)/def2-TZVPD');
        expect(region).toHaveTextContent('Fargate estimate, sizing v');
        expect(region).toHaveTextContent('Queued');
        expect(within(region).getByRole('link', { name: 'output.log' })).toBeInTheDocument();
        expect(region).toHaveTextContent(job.key);
        // The total is the meter's own figure, to the micro-dollar, not a rounded one called exact.
        expect(region).toHaveTextContent('Total charged: $0.002214');
        expect(within(region).getByRole('button', { name: 'Copy job key' })).toBeInTheDocument();
    });
    it('flags what AWS billed past the approved maximum, which the app absorbed', () => {
        expect(open(jobFixture('get_absorbed_aws')).querySelector('.admin-absorbed'))
            .toHaveTextContent('billed $0.02 by AWS: absorbed $0.002500 by the app');
    });
    it('lists one line per settled attempt, each against its own approval (review I2)', () => {
        const region = open(jobFixture('get_retried_aws'));
        expect(region).toHaveTextContent('Total charged: $0.004834, across 2 attempts');
        expect(region).not.toHaveTextContent('Exact');
        const ledger = within(region).getByRole('list', { name: 'H3N attempts' });
        expect(within(ledger).getAllByRole('listitem').map(item => item.textContent)).toEqual([
            expect.stringMatching(/^Attempt 1 · Spot: charged \$0\.001508 of up to \$0\.021301/),
            expect.stringMatching(/^Attempt 2 · On-demand: charged \$0\.003326 of up to \$0\.022069/),
        ]);
    });
    it('says a record from before quotes is legacy, by its reservation and actual cost', () => {
        const legacy = jobFixture('get_legacy_aws');
        renderPage([legacy]);
        expect(dataRows()[0]).toHaveTextContent('legacy');
        expect(dataRows()[0]).toHaveTextContent('under $0.01 of $0.02 reserved');
    });
    it('shows a This Mac job as free', () => {
        renderPage([done]);
        expect(dataRows()[0]).toHaveTextContent('This Mac, free');
    });
});
