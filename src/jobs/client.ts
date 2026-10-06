import type { UnknownAction } from '@reduxjs/toolkit';
import { createJobsApi, JobsApi } from './api';
import { BUILD_ENV } from './build_env';
import { ownerAuth } from './owner_session';
import { sessionExpired, setTarget, JobsState, JobsTarget, TARGET_STORAGE_KEY } from '../store/jobsSlice';

export interface JobsStoreLike {
    getState(): { jobs: JobsState };
    dispatch(action: UnknownAction): unknown;
}

let bound: JobsStoreLike | null = null;

/** main.tsx and admin/main.tsx bind their store once; from then on the API follows its target and session. */
export function bindJobsClient(store: JobsStoreLike | null): void {
    bound = store;
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

/** The dev server's "where jobs run" choice, remembered so / and /admin.html agree. */
export function chooseTarget(target: JobsTarget): void {
    try {
        window.localStorage.setItem(TARGET_STORAGE_KEY, target);
    } catch {
        // Storage refused (a private window): the choice lasts this page.
    }
    requireStore().dispatch(setTarget(target));
}
