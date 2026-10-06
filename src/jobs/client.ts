import type { UnknownAction } from '@reduxjs/toolkit';
import { createJobsApi, JobsApi, JobsApiError } from './api';
import { BUILD_ENV } from './build_env';
import { ownerAuth } from './owner_session';
import { JobPoller } from './poller';
import type { JobView } from './api_types';
import {
    sessionExpired, setTarget, JobsState, JobsTarget, TARGET_STORAGE_KEY, jobFetchFailed, jobUpdated,
} from '../store/jobsSlice';

export interface JobsStoreLike {
    getState(): { jobs: JobsState };
    dispatch(action: UnknownAction): unknown;
}

let bound: JobsStoreLike | null = null;
let poller: Pick<JobPoller, 'watch' | 'restart'> | null = null;

/** main.tsx and admin/main.tsx bind their store once; from then on the API follows its target and session. */
export function bindJobsClient(store: JobsStoreLike | null): void {
    bound = store;
    poller = null;
}

function requireStore(): JobsStoreLike {
    if (!bound) throw new Error('jobs client: call bindJobsClient(store) first');
    return bound;
}

export function jobsApi(): JobsApi {
    const store = requireStore();
    return createJobsApi(store.getState().jobs.target, BUILD_ENV, {
        fetch: (input, init) => fetch(input, init),
        token: async () => (await ownerAuth()?.accessToken()) ?? null,
        refresh: async () => (await ownerAuth()?.refresh()) ?? false,
        onSessionExpired: () => { store.dispatch(sessionExpired()); },
    });
}

/** The page's one poller, so every panel following a job shares its requests. */
export function jobsPoller(): Pick<JobPoller, 'watch' | 'restart'> {
    if (poller) return poller;
    const store = requireStore();
    // Where each answer was asked for: one that lands after a switch of target belongs to the other backend (final review I1).
    const askedUnder = new WeakMap<JobView, JobsTarget>();
    poller = new JobPoller({
        fetchJob: async (key, signal) => {
            const target = store.getState().jobs.target;
            const view = await jobsApi().get(key, signal);
            askedUnder.set(view, target);
            return view;
        },
        onUpdate: view => { store.dispatch(jobUpdated(view, askedUnder.get(view) ?? null)); },
        onError: (key, error) => { store.dispatch(jobFetchFailed({ key, message: error instanceof Error ? error.message : String(error) })); },
        isFatal: error => error instanceof JobsApiError
            && (error.status === 401 || error.status === 404 || error.code === 'not-configured' || error.code === 'aws-not-configured'),
        now: () => Date.now(),
        setTimer: (callback, ms) => window.setTimeout(callback, ms),
        clearTimer: handle => window.clearTimeout(handle as number),
        hidden: () => document.visibilityState === 'hidden',
        onVisibilityChange: listener => {
            document.addEventListener('visibilitychange', listener);
            return () => document.removeEventListener('visibilitychange', listener);
        },
    });
    return poller;
}

export function setJobsPollerForTests(next: Pick<JobPoller, 'watch' | 'restart'> | null): void {
    poller = next;
}

/** The dev server's "where jobs run" choice, remembered so / and /admin.html agree. */
export function chooseTarget(target: JobsTarget): void {
    try {
        window.localStorage.setItem(TARGET_STORAGE_KEY, target);
    } catch {
        // Storage refused (a private window): the choice lasts this page.
    }
    requireStore().dispatch(setTarget(target));
}
