import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import JobStatusPanel, { JobStatusView } from '../../src/components/JobStatusPanel';
import jobsReducer, { jobUpdated } from '../../src/store/jobsSlice';
import { setJobsPollerForTests } from '../../src/jobs/client';
import type { JobView } from '../../src/jobs/api_types';
import { jobFixture } from './api_fixtures';

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
    it('on AWS, shows what is reserved until the job settles', () => {
        render(<JobStatusView view={{ ...jobFixture('get_running'), backend: 'aws', reservedUsd: 0.0894 }} error={null} nowMs={NOW} onOpen={noop} onRetry={noop} onClose={noop} />);
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Costreserved $0.09');
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
    it('opens a finished job, and keeps the last view when a refresh fails', () => {
        const onOpen = jest.fn();
        render(<JobStatusView view={jobFixture('get_done')} error="offline" nowMs={NOW} onOpen={onOpen} onRetry={noop} onClose={noop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open in the viewer' }));
        expect(onOpen).toHaveBeenCalledWith(KEY);
        expect(screen.getByText('The status could not be refreshed: offline')).toBeInTheDocument();
    });
});

describe('JobStatusPanel', () => {
    function renderPanel(onRetry: (view: JobView) => Promise<void> = jest.fn(async () => undefined)) {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        const watch = jest.fn(() => () => undefined);
        setJobsPollerForTests({ watch, restart: jest.fn() });
        const utils = render(
            <Provider store={store}>
                <JobStatusPanel jobKey={KEY} onOpen={jest.fn()} onRetry={onRetry} onClose={jest.fn()} />
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
    // m6: a refused retry is the retry's failure, not a polling one.
    it('says a refused retry as a refused retry', async () => {
        const { store } = renderPanel(jest.fn(async () => { throw new Error('Monthly budget reached'); }));
        act(() => { store.dispatch(jobUpdated({ ...jobFixture('get_failed'), key: KEY })); });
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByText('Retry was refused: Monthly budget reached')).toBeInTheDocument();
        expect(screen.queryByText(/could not be refreshed/)).toBeNull();
    });
});
