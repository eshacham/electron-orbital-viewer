import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { JobView } from '../jobs/api_types';
import type { RequestForm } from '../jobs/request_form';
import { BUILD_ENV } from '../jobs/build_env';

export type JobsTarget = 'local' | 'aws';
export const TARGET_STORAGE_KEY = 'eov.jobs.target';

export interface OwnerSession {
    /** All three VITE_COGNITO_* settings exist in this build. */
    configured: boolean;
    signedIn: boolean;
    email: string | null;
    /** The session ended under the owner (a refresh was refused): said on screen, never a silent failure. */
    expired: boolean;
    /** A sign-in that came back with an error (cancelled, MFA failed). */
    error: string | null;
}

export interface ComputedList { month: string | null; jobs: JobView[] | null; error: string | null; nonce: number }

/**
 * The owner's request as typed, and whether its panel is open. Kept here,
 * not in the panel (final review I2): the phone sheet unmounts a tab's
 * content when it folds or another tab opens, and a pasted XYZ must not go
 * with it. A preview is not kept -- it is asked for again.
 */
export interface RequestDraft { form: RequestForm; open: boolean }
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
        session: { configured: BUILD_ENV.cognito !== null, signedIn: false, email: null, expired: false, error: null },
        records: {},
        recordErrors: {},
        followedKey: null,
        computed: { month: null, jobs: null, error: null, nonce: 0 },
        request: { form: { ...EMPTY_DRAFT }, open: false },
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
        },
        sessionChanged: (state, action: PayloadAction<{ signedIn: boolean; email: string | null }>) => {
            state.session.signedIn = action.payload.signedIn;
            state.session.email = action.payload.email;
            if (action.payload.signedIn) {
                state.session.expired = false;
                state.session.error = null;
            }
            state.computed.nonce += 1;
        },
        sessionExpired: state => {
            state.session.signedIn = false;
            state.session.email = null;
            state.session.expired = true;
        },
        sessionFailed: (state, action: PayloadAction<string>) => {
            state.session.error = action.payload;
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
        },
        requestOpened: (state, action: PayloadAction<boolean>) => {
            state.request.open = action.payload;
        },
    },
});

/** Spec §9's owner rule, verbatim: a signed-in session, or the dev server running jobs on this Mac (no auth there, $0). */
export const selectIsOwner = (state: { jobs: JobsState }): boolean =>
    state.jobs.session.signedIn || (BUILD_ENV.dev && state.jobs.target === 'local');

export const {
    setTarget, sessionChanged, sessionExpired, sessionFailed, sessionErrorDismissed, jobUpdated, jobFetchFailed, followJob,
    computedLoaded, computedFailed, refreshComputed, requestDraftChanged, requestOpened,
} = jobsSlice.actions;
export default jobsSlice.reducer;
