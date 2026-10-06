import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import { bindJobsClient, jobsApi, chooseTarget } from '../../src/jobs/client';
import { setOwnerAuthForTests } from '../../src/jobs/owner_session';
import type { OwnerAuth } from '../../src/jobs/auth';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from './build_env_stub';
import { fixture, jsonResponse, textResponse } from './api_fixtures';

const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';
const makeStore = () => configureStore({ reducer: { jobs: jobsReducer } });

afterEach(() => { resetBuildEnv(); bindJobsClient(null); setOwnerAuthForTests(null); window.localStorage.clear(); });

describe('the bound jobs client', () => {
    it("sends the signed-in owner's token, and an uncurable 401 marks the session expired in the store", async () => {
        BUILD_ENV.dev = true;
        const store = makeStore();
        bindJobsClient(store);
        chooseTarget('aws');
        setOwnerAuthForTests({ accessToken: async () => 'token-1', refresh: async () => false, expire: async () => undefined } as unknown as OwnerAuth);
        const fetchMock = jest.fn(async (_input: string, _init?: RequestInit) => textResponse(401, '{"message":"Unauthorized"}'));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await expect(jobsApi().get(KEY)).rejects.toMatchObject({ code: 'session-expired' });
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/aws/v1/jobs/${KEY}`);
        expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
        expect(store.getState().jobs.session.expired).toBe(true);
        expect(window.localStorage.getItem('eov.jobs.target')).toBe('aws');
    });
    // m8: the refresh worked but the API still refuses -- the sign-in object forgets the session too, so it is not
    // left holding tokens under a page that says "ended", and a later renewal announces the session again.
    it('a request still refused after a renewal that worked ends the session in the sign-in object as well', async () => {
        const store = makeStore();
        bindJobsClient(store);
        const expire = jest.fn(async () => undefined);
        setOwnerAuthForTests({ accessToken: async () => 'token-1', refresh: async () => true, expire } as unknown as OwnerAuth);
        BUILD_ENV.jobsApiUrl = 'https://abc.execute-api.us-east-1.amazonaws.com';
        globalThis.fetch = jest.fn(async () => textResponse(401, '')) as unknown as typeof fetch;
        await expect(jobsApi().get(KEY)).rejects.toMatchObject({ code: 'session-expired' });
        expect(expire).toHaveBeenCalledTimes(1);
        expect(store.getState().jobs.session.expired).toBe(true);
    });
    it('needs no token for This Mac when sign-in is not configured', async () => {
        BUILD_ENV.dev = true;
        bindJobsClient(makeStore());
        const fetchMock = jest.fn(async (_input: string, _init?: RequestInit) => jsonResponse(200, fixture('get_running').body));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await jobsApi().get(KEY);
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/jobs/${KEY}`);
        expect(fetchMock.mock.calls[0][1]!.headers).toEqual({});
    });
    it('refuses to run unbound', () => {
        expect(() => jobsApi()).toThrow('bindJobsClient');
    });
});
