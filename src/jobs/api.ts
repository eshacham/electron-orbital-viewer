import type { BuildEnv } from './build_env';
import type { CostsResponse, JobListResponse, JobRequest, JobStatus, JobView, PreviewResponse } from './api_types';
import type { JobsTarget } from '../store/jobsSlice';

export class JobsApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
        super(message);
        this.name = 'JobsApiError';
    }
}

export const LOCAL_SERVER_HINT =
    'The job server on this Mac is not answering. Start it from tools/: ../tools/molecules/.venv/bin/python -m jobs.local_server';
export const SESSION_ENDED = 'Your owner session has ended. Sign in again to continue.';
export const SIGN_IN_REQUIRED = 'Sign in as the owner to use the jobs API.';
export const AWS_NOT_CONFIGURED =
    'AWS jobs are not configured on this dev server: set JOBS_AWS_API_URL (Phase 6B-3 prints it) and restart Vite.';
export const API_NOT_CONFIGURED = 'The jobs API is not configured in this build (VITE_JOBS_API_URL is unset).';

/** Where /v1/... is served: the dev proxy (This Mac or AWS, 6B-1 Task 10), or the deployed execute-api URL. null: nowhere. */
export function apiBase(target: JobsTarget, env: BuildEnv): string | null {
    if (env.dev) return target === 'local' ? '/api' : '/api/aws';
    return env.jobsApiUrl ? `${env.jobsApiUrl}/api` : null;
}

export interface JobsApiDeps {
    fetch(input: string, init?: RequestInit): Promise<Response>;
    /** The current access token, or null when signed out. */
    token(): Promise<string | null>;
    /** One silent refresh; true when a new access token exists. */
    refresh(): Promise<boolean>;
    onSessionExpired(): void;
}

export interface JobsApi {
    preview(body: JobRequest, signal?: AbortSignal): Promise<PreviewResponse>;
    submit(body: JobRequest): Promise<{ status: number; job: JobView }>;
    get(key: string, signal?: AbortSignal): Promise<JobView>;
    list(month: string, status?: JobStatus): Promise<JobListResponse>;
    costs(month: string): Promise<CostsResponse>;
}

/**
 * The job API (spec §4) over fetch. Every failure becomes a JobsApiError
 * whose message the panels show as it stands, so each one says what
 * happened and, where the owner can act, what to do -- a server that is
 * not running, AWS not configured, a session that has ended -- rather than
 * "Failed to fetch".
 */
export function createJobsApi(target: JobsTarget, env: BuildEnv, deps: JobsApiDeps): JobsApi {
    const base = apiBase(target, env);
    const isLocal = env.dev && target === 'local';

    /** The token and its renewal can fail to reach Cognito (S2): a passing failure that says so, not a raw rejection. */
    async function fromSignIn<T>(work: Promise<T>): Promise<T> {
        try {
            return await work;
        } catch (error) {
            if (error instanceof JobsApiError) throw error;
            throw new JobsApiError(0, 'unreachable', error instanceof Error ? error.message : String(error));
        }
    }

    async function send(method: 'GET' | 'POST', path: string, body: unknown, signal: AbortSignal | undefined, retried: boolean): Promise<{ status: number; data: unknown }> {
        if (base === null) throw new JobsApiError(0, 'not-configured', API_NOT_CONFIGURED);
        const token = await fromSignIn(deps.token());
        const headers: Record<string, string> = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        let response: Response;
        try {
            response = await deps.fetch(`${base}${path}`, {
                method, headers, signal, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (error) {
            if (signal?.aborted) throw error;            // the caller cancelled: nothing to report
            throw new JobsApiError(0, 'unreachable', isLocal ? LOCAL_SERVER_HINT
                : `The jobs API could not be reached: ${error instanceof Error ? error.message : String(error)}`);
        }
        const text = await response.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }
        if (response.status === 401) {
            // API Gateway's JWT authoriser: a missing, expired or revoked token.
            // One silent refresh, then say so -- never a loop, never silence.
            if (!token) throw new JobsApiError(401, 'sign-in-required', SIGN_IN_REQUIRED);
            if (!retried && (await fromSignIn(deps.refresh()))) return send(method, path, body, signal, true);
            deps.onSessionExpired();
            throw new JobsApiError(401, 'session-expired', SESSION_ENDED);
        }
        if (response.ok) return { status: response.status, data };
        const error = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
        if (error && typeof error.code === 'string' && typeof error.message === 'string') {
            // With JOBS_AWS_API_URL unset, 6B-1's proxy sends /api/aws on to the local server, which has no such route.
            if (env.dev && target === 'aws' && response.status === 404 && error.message.startsWith('no route')) {
                throw new JobsApiError(404, 'aws-not-configured', AWS_NOT_CONFIGURED);
            }
            throw new JobsApiError(response.status, error.code, error.message);
        }
        if (isLocal && response.status >= 500) throw new JobsApiError(response.status, 'unreachable', LOCAL_SERVER_HINT);
        if (env.dev && target === 'aws' && response.status >= 500) {
            throw new JobsApiError(response.status, 'aws-not-configured', `The dev proxy answered HTTP ${response.status}. ${AWS_NOT_CONFIGURED}`);
        }
        throw new JobsApiError(response.status, 'bad-response', `The jobs API answered HTTP ${response.status} without a readable error.`);
    }

    const month = (value: string) => `month=${encodeURIComponent(value)}`;
    return {
        preview: async (body, signal) => (await send('POST', '/v1/jobs/preview', body, signal, false)).data as PreviewResponse,
        submit: async body => {
            const { status, data } = await send('POST', '/v1/jobs', body, undefined, false);
            return { status, job: data as JobView };
        },
        get: async (key, signal) => (await send('GET', `/v1/jobs/${encodeURIComponent(key)}`, undefined, signal, false)).data as JobView,
        list: async (value, status) =>
            (await send('GET', `/v1/jobs?${month(value)}${status ? `&status=${status}` : ''}`, undefined, undefined, false)).data as JobListResponse,
        costs: async value => (await send('GET', `/v1/costs?${month(value)}`, undefined, undefined, false)).data as CostsResponse,
    };
}
