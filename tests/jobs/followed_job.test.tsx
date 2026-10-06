import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../../src/store';
import { followJob, jobUpdated } from '../../src/store/jobsSlice';
import { metaFailed } from '../../src/store/moleculeSlice';
import { setJobsPollerForTests } from '../../src/jobs/client';
import { FOLLOW_REOPEN_DELAY_MS, useFollowedJob } from '../../src/jobs/useFollowedJob';
import { RESULT_NOT_FINISHED } from '../../src/molecules/loader';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from './build_env_stub';
import { jobFixture } from './api_fixtures';

const KEY = jobFixture('get_running').key;
const Follower: React.FC = () => { useFollowedJob(); return null; };

function setup() {
    BUILD_ENV.dev = true;                               // the owner: the dev server running jobs on this Mac
    const store = createAppStore();
    const release = jest.fn();
    const watch = jest.fn(() => release);
    setJobsPollerForTests({ watch, restart: jest.fn() });
    const utils = render(<Provider store={store}><Follower /></Provider>);
    return { store, watch, release, ...utils };
}

afterEach(() => { setJobsPollerForTests(null); resetBuildEnv(); jest.useRealTimers(); });

describe('following the followed job, from App (final review I2)', () => {
    it('watches the followed job, and opens it in the viewer when it finishes', () => {
        const { store, watch, release } = setup();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_running'))); store.dispatch(followJob(KEY)); });
        expect(watch).toHaveBeenCalledWith(KEY);
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        expect(store.getState().molecule.selectedId).toBe(KEY);
        act(() => { store.dispatch(followJob(null)); });
        expect(release).toHaveBeenCalled();
    });
    it('does not jump to a job that had already finished when it was first seen', () => {
        const { store } = setup();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); store.dispatch(followJob(KEY)); });
        expect(store.getState().molecule.selectedId).toBeNull();
    });
    // Final review m3: CloudFront may still hold a 403 for done.json from a look taken just before the job finished.
    it('asks once more, a little later, when a job that just finished reads as not finished', () => {
        jest.useFakeTimers();
        const { store } = setup();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_running'))); store.dispatch(followJob(KEY)); });
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        const nonce = store.getState().molecule.loadNonce;
        act(() => { store.dispatch(metaFailed({ id: KEY, message: RESULT_NOT_FINISHED })); });
        act(() => { jest.advanceTimersByTime(FOLLOW_REOPEN_DELAY_MS); });
        expect(store.getState().molecule.loadNonce).toBe(nonce + 1);
        act(() => { store.dispatch(metaFailed({ id: KEY, message: RESULT_NOT_FINISHED })); });
        act(() => { jest.advanceTimersByTime(10 * FOLLOW_REOPEN_DELAY_MS); });
        expect(store.getState().molecule.loadNonce).toBe(nonce + 1);
    });
    it('a visitor follows nothing', () => {
        const { store, watch } = setup();
        BUILD_ENV.dev = false;
        act(() => { store.dispatch(followJob(KEY)); });
        expect(watch).not.toHaveBeenCalled();
    });
});
