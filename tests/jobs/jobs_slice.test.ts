import reducer, {
    setTarget, sessionChanged, sessionExpired, sessionFailed, jobUpdated, jobFetchFailed, followJob, computedLoaded,
    refreshComputed, selectIsOwner, initialJobsState, JobsState, requestDraftChanged, requestOpened, sessionErrorDismissed,
} from '../../src/store/jobsSlice';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from './build_env_stub';
import { computedEntries, withComputed } from '../../src/jobs/computed';
import { jobFixture, listFixture } from './api_fixtures';
import type { MoleculeIndexEntry } from '../../src/molecules/types';

const owner = (jobs: JobsState) => selectIsOwner({ jobs });
afterEach(() => { resetBuildEnv(); window.localStorage.clear(); });

describe('who is the owner', () => {
    it('on the dev server, running jobs on this Mac makes one the owner without signing in', () => {
        BUILD_ENV.dev = true;
        const s = initialJobsState();
        expect(s.target).toBe('local');
        expect(owner(s)).toBe(true);
        expect(owner(reducer(s, setTarget('aws')))).toBe(false);
        expect(owner(reducer(reducer(s, setTarget('aws')), sessionChanged({ signedIn: true, email: 'owner@example.com' })))).toBe(true);
    });
    it('in production only a signed-in session is the owner, and the target cannot move', () => {
        const s = initialJobsState();
        expect(s.target).toBe('aws');
        expect(owner(s)).toBe(false);
        expect(reducer(s, setTarget('local')).target).toBe('aws');
        const signedIn = reducer(s, sessionChanged({ signedIn: true, email: 'owner@example.com' }));
        expect(owner(signedIn)).toBe(true);
        const expired = reducer(signedIn, sessionExpired());
        expect(owner(expired)).toBe(false);
        expect(expired.session).toEqual(expect.objectContaining({ expired: true, signedIn: false, email: null }));
        expect(reducer(expired, sessionChanged({ signedIn: true, email: 'o' })).session.expired).toBe(false);
    });
    it('remembers the dev target the owner chose', () => {
        BUILD_ENV.dev = true;
        window.localStorage.setItem('eov.jobs.target', 'aws');
        expect(initialJobsState().target).toBe('aws');
    });
    it('says sign-in is not configured until all three Cognito settings exist', () => {
        expect(initialJobsState().session.configured).toBe(false);
        BUILD_ENV.cognito = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };
        expect(initialJobsState().session.configured).toBe(true);
        expect(reducer(initialJobsState(), sessionFailed('Sign-in did not complete: x')).session.error).toBe('Sign-in did not complete: x');
    });
});

describe('jobs state', () => {
    it('keeps the latest view of each job, and its last fetch error until the next view', () => {
        const running = jobFixture('get_running');
        let s = reducer(initialJobsState(), jobFetchFailed({ key: running.key, message: 'offline' }));
        expect(s.recordErrors[running.key]).toBe('offline');
        s = reducer(s, jobUpdated(running));
        expect(s.records[running.key].status).toBe('RUNNING');
        expect(s.recordErrors[running.key]).toBeUndefined();
        expect(reducer(s, followJob(running.key)).followedKey).toBe(running.key);
    });
    it("switching where jobs run forgets the other backend's jobs and asks for the list again", () => {
        BUILD_ENV.dev = true;
        let s = reducer(initialJobsState(), jobUpdated(jobFixture('get_running')));
        s = reducer(s, followJob(jobFixture('get_running').key));
        const nonce = s.computed.nonce;
        s = reducer(s, setTarget('aws'));
        expect([s.records, s.followedKey, s.computed.jobs]).toEqual([{}, null, null]);
        expect(s.computed.nonce).toBe(nonce + 1);
        expect(reducer(s, refreshComputed()).computed.nonce).toBe(nonce + 2);
    });
    // Final review I1: a poll in flight during a switch must not land its This Mac view among the AWS records.
    it('drops a view that was asked for under the other target', () => {
        BUILD_ENV.dev = true;
        const running = jobFixture('get_running');
        const s = reducer(initialJobsState(), setTarget('aws'));
        expect(reducer(s, jobUpdated(running, 'local')).records).toEqual({});
        expect(reducer(s, jobUpdated(running, 'aws')).records[running.key].status).toBe('RUNNING');
        expect(reducer(s, jobUpdated(running)).records[running.key].status).toBe('RUNNING');
    });
    // Final review I2: the form outlives the panel (a folded phone sheet, another tab).
    it("keeps the owner's request draft and whether its panel is open, across a target switch too", () => {
        BUILD_ENV.dev = true;
        let s = reducer(initialJobsState(), requestDraftChanged({ text: 'water', kind: 'name' }));
        s = reducer(s, requestDraftChanged({ charge: '-1' }));
        s = reducer(s, requestOpened(true));
        s = reducer(s, setTarget('aws'));
        expect(s.request).toEqual({ form: { kind: 'name', text: 'water', recipe: 'single', charge: '-1', multiplicity: '' }, open: true });
    });
    it('a failed sign-in can be dismissed', () => {
        const s = reducer(initialJobsState(), sessionFailed('Sign-in did not complete.'));
        expect(reducer(s, sessionErrorDismissed()).session.error).toBeNull();
    });
    it('keeps the listed jobs as records too, so opening one needs no second read', () => {
        const list = listFixture('list_done');
        const s = reducer(initialJobsState(), computedLoaded({ month: list.month, jobs: list.jobs }));
        expect(s.computed.jobs).toHaveLength(1);
        expect(s.records[list.jobs[0].key].status).toBe('DONE');
    });
});

describe('computed entries', () => {
    it("turns the month's finished jobs into picker entries, naming an optimised geometry, and marking every one as computed (D19: a library molecule can share its name)", () => {
        const done = jobFixture('get_done');
        expect(computedEntries(listFixture('list_all').jobs)).toEqual([
            { id: done.key, name: 'Water · computed', formula: 'H2O', category: 'computed', tags: ['computed', 'single'], tier: 'computed' },
        ]);
        expect(computedEntries([{ ...done, recipe: 'optimise' }])[0].name).toBe('Water (optimised) · computed');
    });
    it('adds them after the library, and leaves the library untouched when there are none', () => {
        const index: MoleculeIndexEntry[] = [{ id: 'h2o', name: 'Water', formula: 'H2O', category: 'first-examples', tags: [] }];
        expect(withComputed(null, [jobFixture('get_done')])).toBeNull();
        expect(withComputed(index, null)).toBe(index);
        expect(withComputed(index, [])).toBe(index);
        expect(withComputed(index, [jobFixture('get_done')])!.map(e => e.id)).toEqual(['h2o', jobFixture('get_done').key]);
    });
});
