import { User } from 'oidc-client-ts';
import {
    OwnerAuth, SESSION_KEY, safeReturnTo, logoutUrl, UserManagerLike, SessionEvent, SIGN_IN_FAILED, SignInFailed, makeUserManager,
} from '../../src/jobs/auth';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import { ownerAuth, setOwnerAuthForTests, startOwnerSession } from '../../src/jobs/owner_session';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from './build_env_stub';

const SETTINGS = {
    authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc',
    clientId: 'client123',
    domain: 'https://eov.auth.us-east-1.amazoncognito.com',
};
const PROFILE = { sub: 'owner-sub', iss: 'issuer', aud: 'client123', exp: 0, iat: 0, email: 'owner@example.com' };
const user = (over: Partial<ConstructorParameters<typeof User>[0]> = {}) => new User({
    access_token: 'access-1', id_token: 'id-1', refresh_token: 'refresh-1', token_type: 'Bearer', scope: 'openid email',
    profile: PROFILE as never, expires_at: Math.floor(Date.now() / 1000) + 3600, userState: { returnTo: '/#mode=molecule&id=h2o' },
    ...over,
});

function setup(href: string, overrides: Partial<UserManagerLike> = {}) {
    let stored: User | null = null;
    const userManager: UserManagerLike = {
        getUser: jest.fn(async () => stored),
        storeUser: jest.fn(async (next: User | null) => { stored = next; }),
        removeUser: jest.fn(async () => { stored = null; }),
        signinRedirect: jest.fn(async () => undefined),
        signinRedirectCallback: jest.fn(async () => { stored = user(); return stored; }),
        signinSilent: jest.fn(async () => { stored = user({ access_token: 'access-2' }); return stored; }),
        events: { addUserLoaded: jest.fn(), addSilentRenewError: jest.fn() },
        ...overrides,
    };
    const location = { href, origin: 'http://localhost:5391', assign: jest.fn() };
    const replaceUrl = jest.fn();
    const auth = new OwnerAuth(SETTINGS, '/', { userManager, session: window.sessionStorage, location, replaceUrl });
    const events: SessionEvent[] = [];
    auth.onChange(event => events.push(event));
    return { auth, userManager, location, replaceUrl, events, put: (next: User) => { stored = next; } };
}

beforeEach(() => window.sessionStorage.clear());

const ORIGIN = 'http://localhost:5391';
/** What oidc-client-ts throws for an OAuth error answer: its `state` is the one this tab stored, read back by state id. */
function errorResponse(error: string, state?: unknown): Error {
    return Object.assign(new Error(`${error} from the URL`), { name: 'ErrorResponse', error, state });
}

describe('signing in', () => {
    it('completes the redirect from Cognito and goes back to the view the owner left', async () => {
        const { auth, replaceUrl, events, userManager } = setup('http://localhost:5391/?code=abc&state=xyz');
        await expect(auth.start()).resolves.toBe('/#mode=molecule&id=h2o');
        expect(userManager.signinRedirectCallback).toHaveBeenCalledWith('http://localhost:5391/?code=abc&state=xyz');
        expect(replaceUrl).toHaveBeenCalledWith('/#mode=molecule&id=h2o');
        expect(events.at(-1)).toEqual({ identity: { email: 'owner@example.com' }, reason: 'signed-in' });
    });
    it('keeps the refresh token for the tab, never the access or ID token', async () => {
        const { auth } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        const raw = window.sessionStorage.getItem(SESSION_KEY)!;
        expect(JSON.parse(raw)).toEqual({ refresh_token: 'refresh-1', scope: 'openid email', profile: PROFILE });
        expect(raw).not.toContain('access-1');
        expect(raw).not.toContain('id-1');
    });
    it('asks Cognito to come back to the same view', async () => {
        const { auth, userManager } = setup('http://localhost:5391/#mode=molecule&id=h2o');
        await auth.signIn('/#mode=molecule&id=h2o');
        expect(userManager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/#mode=molecule&id=h2o' } });
    });
    // S1 / final review I3: an error answer carrying state is checked against
    // this tab's stored state like a success, and its stored return path
    // brings the owner back to the view they left; the words shown are fixed,
    // never the URL's own text.
    it('reports a cancelled or failed sign-in in fixed words, and goes back to the view the owner left', async () => {
        const href = 'http://localhost:5391/?error=access_denied&error_description=%3Cb%3Ehello%3C%2Fb%3E&state=xyz';
        const { auth, replaceUrl, userManager } = setup(href, {
            signinRedirectCallback: jest.fn(async () => { throw errorResponse('access_denied', { returnTo: '/#mode=molecule&id=h2o' }); }),
        });
        const failure = await auth.start().then(() => null, (error: unknown) => error);
        expect(userManager.signinRedirectCallback).toHaveBeenCalledWith(href);
        expect(failure).toBeInstanceOf(SignInFailed);
        expect((failure as SignInFailed).message).toBe(SIGN_IN_FAILED);
        expect((failure as SignInFailed).returnTo).toBe('/#mode=molecule&id=h2o');
        expect(replaceUrl).toHaveBeenNthCalledWith(1, '/');
        expect(replaceUrl).toHaveBeenLastCalledWith('/#mode=molecule&id=h2o');
    });
    it('without state, says the same fixed words and never repeats the URL', async () => {
        const { auth, replaceUrl, userManager } = setup('http://localhost:5391/?error=access_denied&error_description=Visit+evil.example');
        const failure = await auth.start().then(() => null, (error: unknown) => error) as SignInFailed;
        expect(failure.message).toBe(SIGN_IN_FAILED);
        expect(failure.message).not.toContain('evil');
        expect(failure.returnTo).toBeNull();
        expect(userManager.signinRedirectCallback).not.toHaveBeenCalled();
        expect(replaceUrl).toHaveBeenCalledWith('/');
    });
    it('a code exchange that fails is reported in the same fixed words', async () => {
        const { auth } = setup('http://localhost:5391/?code=abc&state=xyz', {
            signinRedirectCallback: jest.fn(async () => { throw new Error('No matching state found in storage'); }),
        });
        await expect(auth.start()).rejects.toThrow(SIGN_IN_FAILED);
    });
    it('goes back only to a path on this site', () => {
        expect(safeReturnTo({ returnTo: '//evil.example' }, '/', ORIGIN)).toBe('/');
        expect(safeReturnTo({ returnTo: 'https://evil.example/' }, '/', ORIGIN)).toBe('/');
        // S4: a browser reads a backslash as a slash, so "/\\host" is another site.
        expect(safeReturnTo({ returnTo: '/\\evil.example' }, '/', ORIGIN)).toBe('/');
        expect(safeReturnTo({ returnTo: '/\t/evil.example' }, '/', ORIGIN)).toBe('/');
        expect(safeReturnTo(null, '/admin.html', ORIGIN)).toBe('/admin.html');
        expect(safeReturnTo({ returnTo: '/admin.html' }, '/', ORIGIN)).toBe('/admin.html');
        expect(safeReturnTo({ returnTo: '/#mode=molecule&id=h2o' }, '/admin.html', ORIGIN)).toBe('/#mode=molecule&id=h2o');
    });
    // S3: a sign-in service that does not answer must not leave the page waiting for ever.
    it('gives the sign-in service 15 s to answer', () => {
        const manager = makeUserManager({ authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' }, ORIGIN, '/');
        expect((manager as unknown as { settings: { requestTimeoutInSeconds?: number } }).settings.requestTimeoutInSeconds).toBe(15);
    });
});

describe('a reload, a renewal, and the end of a session', () => {
    it('restores the session after a reload from the refresh token alone', async () => {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token: 'refresh-1', scope: 'openid email', profile: PROFILE }));
        const { auth, userManager } = setup('http://localhost:5391/#mode=molecule');
        await expect(auth.start()).resolves.toBeNull();
        const seeded = (userManager.storeUser as jest.Mock).mock.calls[0][0] as User;
        expect([seeded.access_token, seeded.refresh_token]).toEqual(['', 'refresh-1']);
        expect(userManager.signinSilent).toHaveBeenCalled();
        await expect(auth.accessToken()).resolves.toBe('access-2');
    });
    it('signs out quietly when the saved refresh token no longer works', async () => {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token: 'stale', profile: PROFILE }));
        const { auth, events } = setup('http://localhost:5391/', { signinSilent: jest.fn(async () => { throw errorResponse('invalid_grant'); }) });
        await expect(auth.start()).resolves.toBeNull();
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(events.at(-1)).toEqual({ identity: null, reason: 'signed-out' });
    });
    it('refreshes an expired access token before handing it out', async () => {
        const { auth, put } = setup('http://localhost:5391/');
        put(user({ expires_at: Math.floor(Date.now() / 1000) - 10 }));
        await expect(auth.accessToken()).resolves.toBe('access-2');
    });
    it('calls a refresh refused mid-session an expiry, and forgets the token', async () => {
        const { auth, events } = setup('http://localhost:5391/?code=abc&state=xyz', { signinSilent: jest.fn(async () => { throw errorResponse('invalid_grant'); }) });
        await auth.start();
        await expect(auth.refresh()).resolves.toBe(false);
        expect(events.at(-1)).toEqual({ identity: null, reason: 'expired' });
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
    // S2: a network blip is not a refusal -- the refresh token still works once the network is back.
    it('keeps the session through a renewal that could not reach the sign-in service', async () => {
        const { auth, events } = setup('http://localhost:5391/?code=abc&state=xyz', { signinSilent: jest.fn(async () => { throw new TypeError('Failed to fetch'); }) });
        await auth.start();
        await expect(auth.refresh()).rejects.toThrow('could not be reached');
        expect(events.map(event => event.reason)).not.toContain('expired');
        expect(window.sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    });
    it('keeps the saved session for the next load when a reload cannot reach the sign-in service', async () => {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token: 'refresh-1', profile: PROFILE }));
        const { auth, events } = setup('http://localhost:5391/', { signinSilent: jest.fn(async () => { throw new TypeError('Failed to fetch'); }) });
        await expect(auth.start()).resolves.toBeNull();
        expect(events.at(-1)).toEqual({ identity: null, reason: 'signed-out' });
        expect(window.sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
        await expect(auth.accessToken()).resolves.toBeNull();
    });
    it("oidc-client-ts's own renewal ends the session only on a refusal", async () => {
        const { auth, events, userManager } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        const onRenewError = (userManager.events.addSilentRenewError as jest.Mock).mock.calls[0][0] as (error: Error) => void;
        onRenewError(new TypeError('Failed to fetch'));
        await Promise.resolve();
        expect(events.map(event => event.reason)).not.toContain('expired');
        onRenewError(errorResponse('invalid_grant'));
        await new Promise(r => setTimeout(r, 0));
        expect(events.at(-1)?.reason).toBe('expired');
    });
    // m8: a request still refused after a successful renewal ends the session here too, not only in the store.
    it('expire() forgets the session and says it expired', async () => {
        const { auth, events } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await auth.expire();
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(events.at(-1)).toEqual({ identity: null, reason: 'expired' });
        await expect(auth.accessToken()).resolves.toBeNull();
    });
    it("signs out through Cognito's logout endpoint", async () => {
        const { auth, location } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await auth.signOut();
        expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(location.assign).toHaveBeenCalledWith(logoutUrl(SETTINGS, 'http://localhost:5391', '/'));
        expect(logoutUrl(SETTINGS, 'http://localhost:5391', '/'))
            .toBe('https://eov.auth.us-east-1.amazoncognito.com/logout?client_id=client123&logout_uri=http%3A%2F%2Flocalhost%3A5391%2F');
    });
});

describe('what never leaks, and what never races', () => {
    it('takes code and state out of the address bar before the exchange, so a share link made meanwhile carries neither', async () => {
        let finish: (value: User) => void = () => undefined;
        const { auth, replaceUrl } = setup('http://localhost:5391/?code=abc&state=xyz', {
            signinRedirectCallback: jest.fn(() => new Promise<User>(resolve => { finish = resolve; })),
        });
        const started = auth.start();
        await Promise.resolve();
        expect(replaceUrl).toHaveBeenCalledWith('/');
        finish(user());
        await expect(started).resolves.toBe('/#mode=molecule&id=h2o');
    });
    it('a token asked for while a reload restores the session waits for it, rather than going out unsigned', async () => {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token: 'refresh-1', profile: PROFILE }));
        const { auth } = setup('http://localhost:5391/');
        const started = auth.start();
        await expect(auth.accessToken()).resolves.toBe('access-2');
        await started;
    });
    it('several 401s at once share one renewal', async () => {
        const { auth, userManager } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await expect(Promise.all([auth.refresh(), auth.refresh(), auth.refresh()])).resolves.toEqual([true, true, true]);
        expect(userManager.signinSilent).toHaveBeenCalledTimes(1);
    });
    // S5
    it('hands out no token after sign-out', async () => {
        const { auth } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await expect(auth.accessToken()).resolves.toBe('access-1');
        await auth.signOut();
        await expect(auth.accessToken()).resolves.toBeNull();
    });
    it('a renewal never puts the new access or ID token in storage', async () => {
        const { auth } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await auth.refresh();
        const raw = window.sessionStorage.getItem(SESSION_KEY)!;
        expect(raw).not.toContain('access-2');
        expect(raw).not.toContain('id-1');
        expect(JSON.parse(raw)).toEqual({ refresh_token: 'refresh-1', scope: 'openid email', profile: PROFILE });
    });
    it('announces a sign-in once, not again on every renewal', async () => {
        const { auth, events } = setup('http://localhost:5391/?code=abc&state=xyz');
        await auth.start();
        await auth.refresh();
        expect(events.filter(event => event.reason === 'signed-in')).toHaveLength(1);
    });
});

describe('the page session', () => {
    afterEach(() => { resetBuildEnv(); setOwnerAuthForTests(null); window.history.replaceState(null, '', '/'); });

    it('stays out of the way when this build has no Cognito settings', async () => {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        await expect(startOwnerSession(store.dispatch, '/')).resolves.toBeNull();
        expect(ownerAuth()).toBeNull();
        expect(store.getState().jobs.session.configured).toBe(false);
    });
    it('says a refused sign-in in the store, and leaves no error parameters in the address bar', async () => {
        BUILD_ENV.cognito = SETTINGS;
        window.history.replaceState(null, '', '/?error=access_denied&error_description=MFA+failed');
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        await expect(startOwnerSession(store.dispatch, '/')).resolves.toBeNull();
        expect(ownerAuth()).not.toBeNull();
        expect(store.getState().jobs.session.error).toBe(SIGN_IN_FAILED);
        expect(window.location.search).toBe('');
    });
    it('a fresh tab is signed out, with no token to hand out', async () => {
        BUILD_ENV.cognito = SETTINGS;
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        await expect(startOwnerSession(store.dispatch, '/')).resolves.toBeNull();
        expect(store.getState().jobs.session.signedIn).toBe(false);
        await expect(ownerAuth()!.accessToken()).resolves.toBeNull();
    });
});
