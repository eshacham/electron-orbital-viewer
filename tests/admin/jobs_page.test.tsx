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
    it('says plainly when the costs could not be read, and keeps the jobs', () => {
        renderPage(JOBS, null, { costsError: 'The job server on this Mac is not answering.' });
        expect(screen.getByRole('alert')).toHaveTextContent('Costs could not be read: The job server on this Mac is not answering.');
        expect(dataRows()).toHaveLength(3);
    });
});

describe('the month band', () => {
    it('sums the month up for a screen reader, and puts a mark per job on its day', () => {
        renderPage();
        expect(screen.getByRole('img', { name: /^October 2026: 3 jobs \(1 done, 1 failed, 1 running\); charged \$0\.33 of the \$8\.80 cap/ }))
            .toBeInTheDocument();
        const marks = within(screen.getByRole('group', { name: 'Jobs by day' })).getAllByRole('button');
        expect(marks).toHaveLength(3);
        expect(marks[0]).toHaveAccessibleName(/^Water, 10 Oct: Done, off prediction/);
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
            .toEqual(['All3', 'Running1', 'Failed1', 'Done1', 'Off prediction1']);
        fireEvent.click(within(chips).getByRole('button', { name: /^Failed/ }));
        expect(within(chips).getByRole('button', { name: /^Failed/ })).toHaveAttribute('aria-pressed', 'true');
        expect(dataRows()).toHaveLength(1);
        expect(dataRows()[0]).toHaveTextContent('SCF did not converge');
    });
    it('names the off-prediction threshold on its chip', () => {
        renderPage();
        expect(screen.getByRole('button', { name: /^Off prediction/ })).toHaveAccessibleDescription(
            'Run time or peak memory more than 25 % over its prediction');
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
    it('sets run time and memory against the prediction, flagging what is more than 25 % over', () => {
        renderPage([done]);
        const row = dataRows()[0];
        expect(row).toHaveTextContent('1m 10s of 16s');
        expect(row.querySelector('.admin-gauge.is-over')).not.toBeNull();
        expect(row).toHaveTextContent('0.52 of 0.47 GB');
        expect(row.querySelector('.admin-memory.is-over')).toBeNull();
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
        expect(within(region).getByRole('list', { name: 'Water price, line by line' })).toHaveTextContent(
            'Compute (AWS Fargate): up to $0.02, charged $0.0004970');
        expect(region).toHaveTextContent('B3LYP-D3(BJ)/def2-TZVPD');
        expect(region).toHaveTextContent('Fargate estimate, sizing v');
        expect(region).toHaveTextContent('Queued');
        expect(within(region).getByRole('link', { name: 'output.log' })).toBeInTheDocument();
        expect(region).toHaveTextContent(job.key);
        expect(within(region).getByRole('button', { name: 'Copy job key' })).toBeInTheDocument();
    });
    it('flags what AWS billed past the approved maximum, which the app absorbed', () => {
        expect(open(jobFixture('get_absorbed_aws')).querySelector('.admin-absorbed'))
            .toHaveTextContent('billed $0.02 by AWS: absorbed $0.002500 by the app');
    });
    it('lists one line per settled attempt, each against its own approval (review I2)', () => {
        const region = open(jobFixture('get_retried_aws'));
        const ledger = within(region).getByRole('list', { name: 'H3N attempts' });
        expect(within(ledger).getAllByRole('listitem').map(item => item.textContent)).toEqual([
            expect.stringMatching(/^Attempt 1 · Spot: charged \$0\.001508 of up to \$0\.02/),
            expect.stringMatching(/^Attempt 2 · On-demand: charged \$0\.003326 of up to \$0\.02/),
        ]);
    });
    it('says a record from before quotes is legacy, by its reservation and actual cost', () => {
        const legacy = jobFixture('get_legacy_aws');
        renderPage([legacy]);
        expect(dataRows()[0]).toHaveTextContent('legacy');
        expect(dataRows()[0]).toHaveTextContent('$0.0004970 of $0.02 reserved');
    });
    it('shows a This Mac job as free', () => {
        renderPage([done]);
        expect(dataRows()[0]).toHaveTextContent('This Mac, free');
    });
});
