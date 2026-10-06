import {
    createJobsApi, apiBase, JobsApiError, LOCAL_SERVER_HINT, SESSION_ENDED, SIGN_IN_REQUIRED, AWS_NOT_CONFIGURED, API_NOT_CONFIGURED,
} from '../../src/jobs/api';
import type { BuildEnv } from '../../src/jobs/build_env';
import { fixture, jsonResponse, textResponse } from './api_fixtures';

const DEV: BuildEnv = { dev: true, jobsApiUrl: null, cognito: null };
const PROD: BuildEnv = { dev: false, jobsApiUrl: 'https://abc.execute-api.us-east-1.amazonaws.com', cognito: null };
const WATER = { recipe: 'single' as const, molecule: { name: 'water' } };
const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';

function deps(responses: Response[], token: string | null = null, refreshes = false) {
    const fetch = jest.fn(async (_input: string, _init?: RequestInit) => {
        const next = responses.shift();
        if (!next) throw new Error('no more responses');
        return next;
    });
    return { fetch, token: jest.fn(async () => token), refresh: jest.fn(async () => refreshes), onSessionExpired: jest.fn() };
}

describe('where the API is', () => {
    it('dev: This Mac at /api, AWS through the proxy at /api/aws; production: the deployed URL', () => {
        expect(apiBase('local', DEV)).toBe('/api');
        expect(apiBase('aws', DEV)).toBe('/api/aws');
        expect(apiBase('aws', PROD)).toBe('https://abc.execute-api.us-east-1.amazonaws.com/api');
        expect(apiBase('aws', { ...PROD, jobsApiUrl: null })).toBeNull();
    });
});

describe('requests', () => {
    it('previews with the JSON body 6B-1 expects, past the HTTP cache', async () => {
        const d = deps([jsonResponse(200, fixture('preview_ok').body)]);
        const preview = await createJobsApi('local', DEV, d).preview(WATER);
        expect(preview.decision.ok).toBe(true);
        expect(d.fetch).toHaveBeenCalledWith('/api/v1/jobs/preview', expect.objectContaining({ method: 'POST', body: JSON.stringify(WATER), cache: 'no-store' }));
        expect(d.fetch.mock.calls[0][1]!.headers).toEqual({ 'Content-Type': 'application/json' });
    });
    it('sends the access token whenever there is one', async () => {
        const d = deps([jsonResponse(200, fixture('get_running').body)], 'token-1');
        await createJobsApi('aws', PROD, d).get(KEY);
        expect(d.fetch).toHaveBeenCalledWith(`https://abc.execute-api.us-east-1.amazonaws.com/api/v1/jobs/${KEY}`,
            expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer token-1' } }));
    });
    it('reports a new job (201) and a known one (200) alike', async () => {
        const d = deps([jsonResponse(201, fixture('submit_created').body), jsonResponse(200, fixture('submit_known').body)]);
        const api = createJobsApi('local', DEV, d);
        expect((await api.submit(WATER)).status).toBe(201);
        const known = await api.submit(WATER);
        expect([known.status, known.job.status]).toEqual([200, 'RUNNING']);
    });
    it("lists a month by status, and reads the month's costs", async () => {
        const d = deps([jsonResponse(200, fixture('list_done').body), jsonResponse(200, fixture('costs').body)]);
        const api = createJobsApi('local', DEV, d);
        expect((await api.list('2026-10', 'DONE')).jobs).toHaveLength(1);
        expect((await api.costs('2026-10')).capUsd).toBe(8.8);
        expect(d.fetch.mock.calls.map(call => call[0])).toEqual(['/api/v1/jobs?month=2026-10&status=DONE', '/api/v1/costs?month=2026-10']);
    });
});

describe('failures say what happened', () => {
    it("passes the server's own refusal through", async () => {
        const d = deps([jsonResponse(422, fixture('error_unknown_compound').body)]);
        const refusal = createJobsApi('local', DEV, d).preview(WATER);
        await expect(refusal).rejects.toBeInstanceOf(JobsApiError);
        await expect(refusal).rejects.toMatchObject({ status: 422, code: 'unknown-compound', message: 'PubChem does not know "unobtainium"' });
    });
    it('passes a server-side internal error through with its message, even from This Mac', async () => {
        const d = deps([jsonResponse(500, { error: { code: 'internal-error', message: 'KeyError: x' } })]);
        await expect(createJobsApi('local', DEV, d).preview(WATER)).rejects.toMatchObject({ status: 500, code: 'internal-error', message: 'KeyError: x' });
    });
    it('tells the owner how to start the local server when nothing answers', async () => {
        const d = deps([]);
        d.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(createJobsApi('local', DEV, d).preview(WATER)).rejects.toMatchObject({ code: 'unreachable', message: LOCAL_SERVER_HINT });
        const proxy = deps([textResponse(500, '')]);              // Vite's proxy, with the local server down
        await expect(createJobsApi('local', DEV, proxy).preview(WATER)).rejects.toMatchObject({ code: 'unreachable', message: LOCAL_SERVER_HINT });
    });
    it('turns an unreadable (non-JSON) error body into a plain message rather than throwing a parse error', async () => {
        const d = deps([textResponse(502, '<html>502 Bad Gateway</html>')]);
        await expect(createJobsApi('aws', PROD, d).preview(WATER)).rejects.toMatchObject({ status: 502, code: 'bad-response' });
    });
    it('says AWS is not configured when the proxy falls through to the local server', async () => {
        const d = deps([jsonResponse(404, { error: { code: 'not-found', message: 'no route POST /api/aws/v1/jobs/preview' } })]);
        await expect(createJobsApi('aws', DEV, d).preview(WATER)).rejects.toMatchObject({ code: 'aws-not-configured', message: AWS_NOT_CONFIGURED });
    });
    it('says the build has no API rather than calling nowhere', async () => {
        const d = deps([]);
        await expect(createJobsApi('aws', { ...PROD, jobsApiUrl: null }, d).list('2026-10')).rejects.toMatchObject({ code: 'not-configured', message: API_NOT_CONFIGURED });
        expect(d.fetch).not.toHaveBeenCalled();
    });
    it('cures a 401 with one silent refresh when it can', async () => {
        const d = deps([textResponse(401, '{"message":"Unauthorized"}'), jsonResponse(200, fixture('get_running').body)], 'old-token', true);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).resolves.toEqual(expect.objectContaining({ status: 'RUNNING' }));
        expect(d.refresh).toHaveBeenCalledTimes(1);
        expect(d.onSessionExpired).not.toHaveBeenCalled();
    });
    it('a 401 the refresh cannot cure ends the session and says so', async () => {
        const d = deps([textResponse(401, '{"message":"Unauthorized"}')], 'old-token', false);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).rejects.toMatchObject({ status: 401, code: 'session-expired', message: SESSION_ENDED });
        expect(d.onSessionExpired).toHaveBeenCalledTimes(1);
        expect(d.fetch).toHaveBeenCalledTimes(1);
    });
    it('does not refresh twice for one request', async () => {
        const d = deps([textResponse(401, ''), textResponse(401, '')], 'old-token', true);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).rejects.toMatchObject({ code: 'session-expired' });
        expect([d.fetch.mock.calls.length, d.refresh.mock.calls.length, d.onSessionExpired.mock.calls.length]).toEqual([2, 1, 1]);
    });
    it('a 401 with no token asks for sign-in, and does not end a session that never began', async () => {
        const d = deps([textResponse(401, '{"message":"Unauthorized"}')], null);
        await expect(createJobsApi('aws', PROD, d).get(KEY)).rejects.toMatchObject({ code: 'sign-in-required', message: SIGN_IN_REQUIRED });
        expect(d.onSessionExpired).not.toHaveBeenCalled();
    });
});
