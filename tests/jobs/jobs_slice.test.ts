import reducer, {
    setTarget, sessionChanged, sessionExpired, sessionFailed, jobUpdated, jobFetchFailed, followJob, computedLoaded,
    refreshComputed, selectIsOwner, initialJobsState, JobsState, requestDraftChanged, requestOpened, sessionErrorDismissed,
    previewResolved, previewCleared,
} from '../../src/store/jobsSlice';
import { setMode } from '../../src/store/atomSlice';
import type { CanonicalAtom } from '../../src/jobs/api_types';
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
        // The owners group claim: a sign-in with no claim at all (the common case before this feature) must not be the owner.
        expect(owner(reducer(reducer(s, setTarget('aws')), sessionChanged({ signedIn: true, email: 'owner@example.com', groups: ['owners'] })))).toBe(true);
    });
    it('in production a signed-in session with the owners group claim is the owner, and the target cannot move', () => {
        const s = initialJobsState();
        expect(s.target).toBe('aws');
        expect(owner(s)).toBe(false);
        expect(reducer(s, setTarget('local')).target).toBe('aws');
        const signedIn = reducer(s, sessionChanged({ signedIn: true, email: 'owner@example.com', groups: ['owners'] }));
        expect(owner(signedIn)).toBe(true);
        const expired = reducer(signedIn, sessionExpired());
        expect(owner(expired)).toBe(false);
        expect(expired.session).toEqual(expect.objectContaining({ expired: true, signedIn: false, email: null, groups: [] }));
        expect(reducer(expired, sessionChanged({ signedIn: true, email: 'o', groups: ['owners'] })).session.expired).toBe(false);
    });
    // The brief, 2026-10-15: the server (tools/jobs/lambdas.py) refuses any
    // token without the `owners` group, so a signed-in visitor with no
    // group, or some other group, must not see owner plumbing either.
    it('a signed-in session with no owners group claim, in production or on the dev server pointed at AWS, is not the owner', () => {
        const prod = reducer(initialJobsState(), sessionChanged({ signedIn: true, email: 'visitor@example.com', groups: [] }));
        expect(owner(prod)).toBe(false);
        const otherGroup = reducer(initialJobsState(), sessionChanged({ signedIn: true, email: 'visitor@example.com', groups: ['admin'] }));
        expect(owner(otherGroup)).toBe(false);
        BUILD_ENV.dev = true;
        const devOnAws = reducer(reducer(initialJobsState(), setTarget('aws')),
            sessionChanged({ signedIn: true, email: 'visitor@example.com', groups: [] }));
        expect(owner(devOnAws)).toBe(false);
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
        // Task 16 (ruling P12): the draft now also carries the preview's atoms drawn on the canvas -- none here.
        expect(s.request).toEqual({ form: { kind: 'name', text: 'water', recipe: 'single', charge: '-1', multiplicity: '' }, open: true, previewAtoms: null, previewFormula: null });
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

// Task 16 (ruling P12, Review Focus 4's store half): the preview's atoms are drawn on the one canvas while
// they are set, so everything that makes the preview stale, or takes the workspace away, clears them.
describe('the request preview drawn on the canvas', () => {
    const WATER: CanonicalAtom[] = [[1, 0, -0.75545, -0.47116], [1, 0, 0.75545, -0.47116], [8, 0, 0, 0.11779]];
    const withPreview = () => reducer(reducer(initialJobsState(), requestOpened(true)), previewResolved({ atoms: WATER, formula: 'H2O' }));

    // Fix round 1 (T16-M4): the response's own formula travels with the atoms, for the title.
    it('previewResolved sets the atoms and the formula, and previewCleared takes both away', () => {
        expect(initialJobsState().request.previewAtoms).toBeNull();
        expect(initialJobsState().request.previewFormula).toBeNull();
        expect([withPreview().request.previewAtoms, withPreview().request.previewFormula]).toEqual([WATER, 'H2O']);
        const cleared = reducer(withPreview(), previewCleared()).request;
        expect([cleared.previewAtoms, cleared.previewFormula]).toEqual([null, null]);
        expect(reducer(withPreview(), requestOpened(false)).request.previewFormula).toBeNull();
    });
    it('an edit to the request, closing it or a target switch clears them', () => {
        BUILD_ENV.dev = true;
        expect(reducer(withPreview(), requestDraftChanged({ text: 'ethanol' })).request.previewAtoms).toBeNull();
        const closed = reducer(withPreview(), requestOpened(false));
        expect([closed.request.open, closed.request.previewAtoms]).toEqual([false, null]);
        expect(reducer(withPreview(), requestOpened(true)).request.previewAtoms).toEqual(WATER);
        expect(reducer(withPreview(), setTarget('aws')).request.previewAtoms).toBeNull();
    });
    it('the session ending or failing clears them; signing out also closes the workspace', () => {
        expect(reducer(withPreview(), sessionFailed('Sign-in did not complete.')).request.previewAtoms).toBeNull();
        const expired = reducer(withPreview(), sessionExpired());
        // The session-ended alert path keeps the form, and the workspace that shows it (today's R4 behaviour).
        expect([expired.request.open, expired.request.previewAtoms]).toEqual([true, null]);
        const signedOut = reducer(withPreview(), sessionChanged({ signedIn: false, email: null, groups: [] }));
        expect([signedOut.request.open, signedOut.request.previewAtoms]).toEqual([false, null]);
        // A sign-in (or a refreshed identity) is not a sign-out: nothing is taken away.
        const signedIn = reducer(withPreview(), sessionChanged({ signedIn: true, email: 'o', groups: ['owners'] }));
        expect([signedIn.request.open, signedIn.request.previewAtoms]).toEqual([true, WATER]);
    });
    it('leaving Molecules closes the workspace and clears them; entering it again changes nothing', () => {
        for (const mode of ['atom', 'bonds', 'hydrogenic'] as const) {
            const left = reducer(withPreview(), setMode(mode));
            expect([left.request.open, left.request.previewAtoms]).toEqual([false, null]);
        }
        const stayed = reducer(withPreview(), setMode('molecule'));
        expect([stayed.request.open, stayed.request.previewAtoms]).toEqual([true, WATER]);
        // The form itself outlives all of it (final review I2).
        expect(reducer(reducer(withPreview(), requestDraftChanged({ text: 'water' })), setMode('atom')).request.form.text).toBe('water');
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
