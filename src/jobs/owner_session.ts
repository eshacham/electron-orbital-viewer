import type { UnknownAction } from '@reduxjs/toolkit';
import { BUILD_ENV } from './build_env';
import { makeUserManager, OwnerAuth, OwnerPage } from './auth';
import { sessionChanged, sessionExpired, sessionFailed } from '../store/jobsSlice';

let current: OwnerAuth | null = null;

/** The page's sign-in, or null when this build has no Cognito settings. */
export function ownerAuth(): OwnerAuth | null {
    return current;
}

export function setOwnerAuthForTests(auth: OwnerAuth | null): void {
    current = auth;
}

/**
 * Once per page, before anything asks for a token: completes a redirect back
 * from Cognito or restores this tab's session, and mirrors the session into
 * the store. Resolves to the path to go back to after a redirect -- its hash
 * is the view the owner left -- or null.
 */
export async function startOwnerSession(dispatch: (action: UnknownAction) => unknown, page: OwnerPage): Promise<string | null> {
    const settings = BUILD_ENV.cognito;
    if (!settings) return null;
    const auth = new OwnerAuth(settings, page, {
        userManager: makeUserManager(settings, window.location.origin, page),
        session: window.sessionStorage,
        location: window.location,
        replaceUrl: url => window.history.replaceState(null, '', url),
    });
    current = auth;
    auth.onChange(({ identity, reason }) => {
        dispatch(reason === 'expired' ? sessionExpired() : sessionChanged({ signedIn: identity !== null, email: identity?.email ?? null }));
    });
    try {
        return await auth.start();
    } catch (error) {
        dispatch(sessionFailed(error instanceof Error ? error.message : String(error)));
        return null;
    }
}
