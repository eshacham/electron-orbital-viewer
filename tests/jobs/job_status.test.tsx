import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import JobStatusPanel, { JobStatusView } from '../../src/components/JobStatusPanel';
import jobsReducer, { jobUpdated } from '../../src/store/jobsSlice';
import { setJobsPollerForTests } from '../../src/jobs/client';
import type { AvailableQuoteOption, JobView, Quote } from '../../src/jobs/api_types';
import { jobFixture, previewFixture } from './api_fixtures';

const awsQuote = (): Quote => {
    const decision = previewFixture('preview_aws').decision;
    if (!decision.ok) throw new Error('preview_aws has no quote');
    return decision.quote;
};

const NOW = Date.parse('2026-10-10T12:01:05Z');
const KEY = jobFixture('get_running').key;
const noop = () => undefined;

afterEach(() => setJobsPollerForTests(null));

describe('JobStatusView', () => {
    it('shows the stage, the latest energy with its method, the time, the cost and the log tail', () => {
        render(<JobStatusView view={jobFixture('get_running')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        const panel = screen.getByRole('region', { name: 'job status' });
        expect(panel).toHaveTextContent('Running');
        expect(panel).toHaveTextContent('StageSCF (DIIS)');
        expect(panel).toHaveTextContent('Latest energy−76.461200 Ha (B3LYP/def2-TZVPD)');
        expect(panel).toHaveTextContent('Elapsed1 min 00 s');
        expect(panel).toHaveTextContent(/Fargate estimate\d.+\(sizing v\d+ prediction\)/);
        expect(panel).toHaveTextContent('CostThis Mac — spent $0.00');
        expect(screen.getByRole('log', { name: 'log tail' })).toHaveTextContent('cycle= 8 E= -76.4612007');
    });
    it('on AWS, shows a record from before quotes by what is reserved until it settles', () => {
        render(<JobStatusView view={{ ...jobFixture('get_running'), backend: 'aws', reservedUsd: 0.0894, approvedQuote: null }} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Costreserved $0.09');
        render(<JobStatusView view={jobFixture('get_legacy_aws')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getAllByRole('region', { name: 'job status' })[1]).toHaveTextContent('Costspent $0.0004970 (reserved $0.02 released)');
    });
    // Phase 6C: the approved maximum, then what was charged against it, line by line.
    it('shows the approved maximum, and once settled what was charged, with each line in the details', () => {
        const { unmount } = render(<JobStatusView view={jobFixture('submit_aws')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Costup to $0.02 approved (Spot)');
        unmount();
        render(<JobStatusView view={jobFixture('get_done_aws')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        const panel = screen.getByRole('region', { name: 'job status' });
        expect(panel).toHaveTextContent(/Costcharged \$0\.00\d+ of up to \$0\.02 approved \(Spot\)/);
        const lines = screen.getByText('Price, line by line').closest('details') as HTMLElement;
        expect(lines).toHaveTextContent('Compute (AWS Fargate): estimated $0.0006300, up to $0.02; charged $0.0004970');
        expect(lines).toHaveTextContent('Platform fee: estimated $0.00, up to $0.00; charged $0.00');
    });
    it('says when AWS billed past the approved maximum and the app absorbed the rest', () => {
        render(<JobStatusView view={jobFixture('get_absorbed_aws')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent(
            'charged $0.02 of up to $0.02 approved (On-demand); billed $0.02 by AWS, absorbed $0.002500 by the app');
        expect(screen.getByText('Price, line by line').closest('details')).toHaveTextContent('charged $0.02 (billed $0.02 by AWS)');
    });
    it('counts from submission while the job waits for a worker', () => {
        const queued = { ...jobFixture('get_running'), status: 'QUEUED' as const, startedAt: null, stage: null, latestEnergyHartree: null, logTail: [] };
        render(<JobStatusView view={queued} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        const panel = screen.getByRole('region', { name: 'job status' });
        expect(panel).toHaveTextContent('Waiting1 min 05 s');
        // M6: the estimate is the run's, not the wait's -- its own row, there from the start.
        expect(panel).toHaveTextContent(/Fargate estimate\d.+\(sizing v\d+ prediction\)/);
        expect(screen.queryByRole('log')).toBeNull();
    });
    it('says it is reading the status before the first answer, or why it could not (M6)', () => {
        const { rerender } = render(<JobStatusView view={null} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Reading the job’s status…');
        rerender(<JobStatusView view={null} error="offline" nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('alert')).toHaveTextContent('offline');
        expect(screen.getByRole('button', { name: 'Stop following' })).toBeInTheDocument();
    });
    // m9: a change of state is announced; the log tail, which changes every 5 s, is not.
    it('announces the status and stage as they change, and not every new log line', () => {
        render(<JobStatusView view={jobFixture('get_running')} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('status')).toHaveTextContent('Running');
        expect(screen.getByText('SCF (DIIS)')).toHaveAttribute('aria-live', 'polite');
        expect(screen.getByRole('log', { name: 'log tail' })).toHaveAttribute('aria-live', 'off');
    });
    it('says why a job failed, and offers a retry', () => {
        const onRetry = jest.fn();
        render(<JobStatusView view={jobFixture('get_failed')} error={null} nowMs={NOW} onOpen={noop} onRetry={onRetry} onClose={noop} />);
        expect(screen.getByRole('alert')).toHaveTextContent('SCF did not converge');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledWith(jobFixture('get_failed'));
    });
    // Phase 6C: a retry is a new run: it is priced afresh, and only an approval of that price runs it.
    it('shows the fresh quote for a retry, and retries only on its approval', () => {
        const onApproveRetry = jest.fn();
        const failed = { ...jobFixture('get_failed'), backend: 'aws' as const };
        render(<JobStatusView view={failed} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop}
            retryQuote={awsQuote()} onApproveRetry={onApproveRetry} />);
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
        expect(screen.getByRole('radiogroup', { name: 'price options' }).closest('[aria-live="polite"]')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Approve up to $0.02 and retry' }));
        expect(onApproveRetry).toHaveBeenCalledWith(failed, expect.objectContaining({ option: 'spot' }));
    });
    it('opens a finished job, and keeps the last view when a refresh fails', () => {
        const onOpen = jest.fn();
        render(<JobStatusView view={jobFixture('get_done')} error="offline" nowMs={NOW} onOpen={onOpen} onRetry={noop} onClose={noop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open in the viewer' }));
        expect(onOpen).toHaveBeenCalledWith(KEY);
        expect(screen.getByText('The status could not be refreshed: offline')).toBeInTheDocument();
    });
});

describe('JobStatusPanel', () => {
    function renderPanel(onRetry: (view: JobView, option: AvailableQuoteOption) => Promise<void> = jest.fn(async () => undefined),
        onQuote: (view: JobView) => Promise<Quote> = jest.fn(async () => awsQuote())) {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        const watch = jest.fn(() => () => undefined);
        setJobsPollerForTests({ watch, restart: jest.fn() });
        const utils = render(
            <Provider store={store}>
                <JobStatusPanel jobKey={KEY} onOpen={jest.fn()} onQuote={onQuote} onRetry={onRetry} onClose={jest.fn()} />
            </Provider>,
        );
        return { store, watch, ...utils };
    }
    // Final review I2: App's useFollowedJob follows the job; the panel, which a phone unmounts freely, only shows it.
    it('shows the followed job as App keeps it, and does not poll itself', () => {
        const { store, watch } = renderPanel();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_running'))); });
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Running');
        expect(watch).not.toHaveBeenCalled();
    });
    it('asks for a fresh quote, then retries with the option approved', async () => {
        const onRetry = jest.fn(async () => undefined);
        const onQuote = jest.fn(async () => awsQuote());
        const { store } = renderPanel(onRetry, onQuote);
        const failed = { ...jobFixture('get_failed'), key: KEY };
        act(() => { store.dispatch(jobUpdated(failed)); });
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await act(async () => { await Promise.resolve(); });
        expect(onQuote).toHaveBeenCalledWith(failed);
        expect(onRetry).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('radio', { name: /^On-demand/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Approve up to $0.02 and retry' }));
        await act(async () => { await Promise.resolve(); });
        expect(onRetry).toHaveBeenCalledWith(failed, expect.objectContaining({ option: 'on-demand' }));
    });
    // m6: a refused retry is the retry's failure, not a polling one.
    it('says a refused retry as a refused retry', async () => {
        const { store } = renderPanel(jest.fn(async () => { throw new Error('Monthly budget reached'); }));
        act(() => { store.dispatch(jobUpdated({ ...jobFixture('get_failed'), key: KEY })); });
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await act(async () => { await Promise.resolve(); });
        fireEvent.click(screen.getByRole('button', { name: 'Approve up to $0.02 and retry' }));
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByText('Retry was refused: Monthly budget reached')).toBeInTheDocument();
        expect(screen.queryByText(/could not be refreshed/)).toBeNull();
    });
});
