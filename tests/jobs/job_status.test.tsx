import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import JobStatusPanel, { JobStatusView } from '../../src/components/JobStatusPanel';
import jobsReducer, { jobUpdated } from '../../src/store/jobsSlice';
import { setJobsPollerForTests } from '../../src/jobs/client';
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
        expect(panel).toHaveTextContent(/Elapsed1 min 00 s \(Fargate estimate .+, sizing v\d+ prediction\)/);
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
        expect(screen.getByRole('region', { name: 'job status' })).toHaveTextContent('Waiting1 min 05 s');
        expect(screen.queryByRole('log')).toBeNull();
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
    function renderPanel() {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        const release = jest.fn();
        const watch = jest.fn(() => release);
        setJobsPollerForTests({ watch, restart: jest.fn() });
        const onOpen = jest.fn();
        const utils = render(
            <Provider store={store}>
                <JobStatusPanel jobKey={KEY} onOpen={onOpen} onRetry={jest.fn(async () => undefined)} onClose={jest.fn()} />
            </Provider>,
        );
        return { store, watch, release, onOpen, ...utils };
    }
    it('follows the job while mounted, and opens it in the viewer when it finishes', () => {
        const { store, watch, release, onOpen, unmount } = renderPanel();
        expect(watch).toHaveBeenCalledWith(KEY);
        act(() => { store.dispatch(jobUpdated(jobFixture('get_running'))); });
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen).toHaveBeenCalledWith(KEY);
        unmount();
        expect(release).toHaveBeenCalled();
    });
    it('does not jump to a job that had already finished when it was first seen', () => {
        const { store, onOpen } = renderPanel();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        expect(onOpen).not.toHaveBeenCalled();
    });
});
