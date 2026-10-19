import { createSlice, PayloadAction, UnknownAction } from '@reduxjs/toolkit';
import type { CanonicalAtom, JobView } from '../jobs/api_types';
import type { RequestForm } from '../jobs/request_form';
import { BUILD_ENV } from '../jobs/build_env';

export type JobsTarget = 'local' | 'aws';
export const TARGET_STORAGE_KEY = 'eov.jobs.target';

export interface OwnerSession {
    /** All three VITE_COGNITO_* settings exist in this build. */
    configured: boolean;
    signedIn: boolean;
    email: string | null;
    /** The ID token's own `cognito:groups` claim (owner_session.ts, from auth.ts's OwnerIdentity).
     * Signed in alone is not enough: the server-side check (tools/jobs/lambdas.py) requires the
     * `owners` group too, and the UI's own rule (selectIsOwner) must agree with it (the brief, 2026-10-15). */
    groups: string[];
    /** The session ended under the owner (a refresh was refused): said on screen, never a silent failure. */
    expired: boolean;
    /** A sign-in that came back with an error (cancelled, MFA failed). */
    error: string | null;
}

/** tools/jobs/lambdas.py's OWNER_GROUP default -- the one Cognito group the server trusts. */
export const OWNER_GROUP = 'owners';

export interface ComputedList { month: string | null; jobs: JobView[] | null; error: string | null; nonce: number }

/**
 * The owner's request as typed, and whether its panel is open. Kept here,
 * not in the panel (final review I2): the phone sheet unmounts a tab's
 * content when it folds or another tab opens, and a pasted XYZ must not go
 * with it. A preview is not kept -- it is asked for again -- but while the
 * request workspace shows one, its resolved atoms (Å, the API's own) and
 * the response's formula are here for the one canvas to draw and the title
 * to name (ruling P12, fix round 1 T16-M4); anything that makes the preview
 * stale or takes the workspace away clears both.
 */
export interface RequestDraft { form: RequestForm; open: boolean; previewAtoms: CanonicalAtom[] | null; previewFormula: string | null }
export interface ResolvedPreview { atoms: CanonicalAtom[]; formula: string }

function clearPreview(request: RequestDraft): void {
    request.previewAtoms = null;
    request.previewFormula = null;
}
// request_form.EMPTY_FORM, written out: importing it would pull the element table into /admin.html.
const EMPTY_DRAFT: RequestForm = { kind: 'name', text: '', recipe: 'single', charge: '', multiplicity: '' };

/**
 * The jobs interface's state: who is signed in, where jobs run, the latest
 * view of every job the page has seen, the one being followed, and the
 * owner's computed list. Shared by the viewer and /admin.html, which mount
 * it at the same key.
 */
export interface JobsState {
    target: JobsTarget;
    session: OwnerSession;
    records: Record<string, JobView>;
    recordErrors: Record<string, string>;
    followedKey: string | null;
    computed: ComputedList;
    request: RequestDraft;
}

/** Production has one API, the deployed one; only the dev server offers This Mac, remembered across its two pages. */
function savedTarget(): JobsTarget {
    if (!BUILD_ENV.dev) return 'aws';
    try {
        return window.localStorage.getItem(TARGET_STORAGE_KEY) === 'aws' ? 'aws' : 'local';
    } catch {
        return 'local';
    }
}

export function initialJobsState(): JobsState {
    return {
        target: savedTarget(),
        session: { configured: BUILD_ENV.cognito !== null, signedIn: false, email: null, groups: [], expired: false, error: null },
        records: {},
        recordErrors: {},
        followedKey: null,
        computed: { month: null, jobs: null, error: null, nonce: 0 },
        request: { form: { ...EMPTY_DRAFT }, open: false, previewAtoms: null, previewFormula: null },
    };
}

const jobsSlice = createSlice({
    name: 'jobs',
    initialState: initialJobsState,
    reducers: {
        setTarget: (state, action: PayloadAction<JobsTarget>) => {
            if (!BUILD_ENV.dev || state.target === action.payload) return;
            state.target = action.payload;
            // A key names the same molecule on both backends, but a job on this Mac is not a job on AWS.
            state.records = {};
            state.recordErrors = {};
            state.followedKey = null;
            state.computed = { month: null, jobs: null, error: null, nonce: state.computed.nonce + 1 };
            // A This Mac preview is not an AWS one (the panel drops it too).
            clearPreview(state.request);
        },
        sessionChanged: (state, action: PayloadAction<{ signedIn: boolean; email: string | null; groups: string[] }>) => {
            state.session.signedIn = action.payload.signedIn;
            state.session.email = action.payload.email;
            state.session.groups = action.payload.groups;
            if (action.payload.signedIn) {
                state.session.expired = false;
                state.session.error = null;
            } else {
                // Signed out (Review Focus 4): the owner's workspace goes, and its preview leaves the canvas.
                state.request.open = false;
                clearPreview(state.request);
            }
            state.computed.nonce += 1;
        },
        sessionExpired: state => {
            state.session.signedIn = false;
            state.session.email = null;
            state.session.groups = [];
            state.session.expired = true;
            // The form stays, disabled under the session-ended alert (R4); the preview leaves the canvas.
            clearPreview(state.request);
        },
        sessionFailed: (state, action: PayloadAction<string>) => {
            state.session.error = action.payload;
            clearPreview(state.request);
        },
        sessionErrorDismissed: state => {
            state.session.error = null;
        },
        /**
         * `target` is where the request that produced the view was sent. A
         * view asked for before a switch belongs to the other backend: a key
         * names the same molecule on both, but a job on this Mac is not a
         * job on AWS (final review I1).
         */
        jobUpdated: {
            reducer: (state, action: PayloadAction<JobView, string, { target: JobsTarget | null }>) => {
                if (action.meta.target !== null && action.meta.target !== state.target) return;
                state.records[action.payload.key] = action.payload;
                delete state.recordErrors[action.payload.key];
            },
            prepare: (view: JobView, target: JobsTarget | null = null) => ({ payload: view, meta: { target } }),
        },
        jobFetchFailed: (state, action: PayloadAction<{ key: string; message: string }>) => {
            state.recordErrors[action.payload.key] = action.payload.message;
        },
        followJob: (state, action: PayloadAction<string | null>) => {
            state.followedKey = action.payload;
        },
        computedLoaded: (state, action: PayloadAction<{ month: string; jobs: JobView[] }>) => {
            state.computed.month = action.payload.month;
            state.computed.jobs = action.payload.jobs;
            state.computed.error = null;
            for (const job of action.payload.jobs) state.records[job.key] = job;
        },
        computedFailed: (state, action: PayloadAction<string>) => {
            state.computed.error = action.payload;
        },
        refreshComputed: state => {
            state.computed.nonce += 1;
        },
        requestDraftChanged: (state, action: PayloadAction<Partial<RequestForm>>) => {
            Object.assign(state.request.form, action.payload);
            clearPreview(state.request);            // the preview belonged to what was typed before
        },
        requestOpened: (state, action: PayloadAction<boolean>) => {
            state.request.open = action.payload;
            if (!action.payload) clearPreview(state.request);
        },
        /** The request workspace's preview landed: its atoms are drawn on the canvas (ruling P12). */
        previewResolved: (state, action: PayloadAction<ResolvedPreview>) => {
            state.request.previewAtoms = action.payload.atoms;
            state.request.previewFormula = action.payload.formula;
        },
        previewCleared: state => {
            clearPreview(state.request);
        },
    },
    extraReducers: builder => {
        // Leaving Molecules closes the workspace (Review Focus 4). Matched by type, not by importing
        // atomSlice's action: this slice also serves /admin.html, which must not pull the atom code in
        // (tests/jobs/jobs_slice.test.ts dispatches the real setMode, so a renamed action fails there).
        builder.addMatcher(isLeavingMolecules, state => {
            state.request.open = false;
            clearPreview(state.request);
        });
    },
});

const SET_MODE = 'atom/setMode';
function isLeavingMolecules(action: UnknownAction): action is PayloadAction<string> {
    return action.type === SET_MODE && (action as PayloadAction<unknown>).payload !== 'molecule';
}

/**
 * Spec §9's owner rule, server-aligned (the brief, 2026-10-15): a signed-in
 * session whose ID token carries the `owners` group -- the same group
 * tools/jobs/lambdas.py requires, so a signed-in non-owner sees no owner
 * plumbing here either, not just a 403 from the API it never reaches -- or
 * the dev server running jobs on this Mac (no auth there, $0).
 */
export const selectIsOwner = (state: { jobs: JobsState }): boolean =>
    (state.jobs.session.signedIn && state.jobs.session.groups.includes(OWNER_GROUP))
    || (BUILD_ENV.dev && state.jobs.target === 'local');

export const {
    setTarget, sessionChanged, sessionExpired, sessionFailed, sessionErrorDismissed, jobUpdated, jobFetchFailed, followJob,
    computedLoaded, computedFailed, refreshComputed, requestDraftChanged, requestOpened, previewResolved, previewCleared,
} = jobsSlice.actions;
export default jobsSlice.reducer;
