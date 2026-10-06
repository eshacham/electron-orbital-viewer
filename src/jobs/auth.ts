import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { CognitoSettings } from './build_env';

export const SESSION_KEY = 'eov.owner.session';
export type OwnerPage = '/' | '/admin.html';
export interface OwnerIdentity { email: string | null }
export interface SessionEvent { identity: OwnerIdentity | null; reason: 'signed-in' | 'signed-out' | 'expired' }

/** The parts of oidc-client-ts's UserManager this module uses; tests pass a fake. */
export interface UserManagerLike {
    getUser(): Promise<User | null>;
    storeUser(user: User | null): Promise<void>;
    removeUser(): Promise<void>;
    signinRedirect(args?: { state?: unknown }): Promise<void>;
    signinRedirectCallback(url?: string): Promise<User>;
    signinSilent(): Promise<User | null>;
    events: {
        addUserLoaded(callback: (user: User) => void): unknown;
        addSilentRenewError(callback: (error: Error) => void): unknown;
    };
}

export interface OwnerAuthDeps {
    userManager: UserManagerLike;
    /** sessionStorage in the browser: it survives a reload and ends with the tab (spec §9.5). */
    session: Storage;
    location: { href: string; origin: string; assign(url: string): void };
    replaceUrl(url: string): void;
}

/** oidc-client-ts for Cognito's managed login: authorization code + PKCE; the user pool enforces TOTP. */
export function makeUserManager(settings: CognitoSettings, origin: string, page: OwnerPage): UserManagerLike {
    return new UserManager({
        authority: settings.authority,
        client_id: settings.clientId,
        redirect_uri: `${origin}${page}`,
        response_type: 'code',
        scope: 'openid email',
        // The access token lives in memory only; OwnerAuth copies the refresh token out.
        userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
        // The PKCE verifier and state must survive the round trip to Cognito -- in this tab only.
        stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
        automaticSilentRenew: true,
        loadUserInfo: false,
    });
}

interface SavedSession { refresh_token: string; scope?: string; profile: User['profile'] }

const identityOf = (user: User): OwnerIdentity => ({ email: typeof user.profile.email === 'string' ? user.profile.email : null });

/**
 * oidc-client-ts keeps the return path in this tab's sessionStorage (only a
 * random state id goes to Cognito), but anything on the page can write
 * there, so only a path on this site is trusted -- never another origin.
 */
export function safeReturnTo(state: unknown, fallback: string): string {
    const value = (state as { returnTo?: unknown } | null)?.returnTo;
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

/** Cognito publishes no end_session_endpoint, so sign-out is its own /logout, back to the same page. */
export function logoutUrl(settings: CognitoSettings, origin: string, page: OwnerPage): string {
    return `${settings.domain}/logout?client_id=${encodeURIComponent(settings.clientId)}&logout_uri=${encodeURIComponent(`${origin}${page}`)}`;
}

/**
 * The owner's Cognito session on one page. oidc-client-ts holds the tokens
 * in memory; after every sign-in or renewal the refresh token (with the
 * profile) is copied to sessionStorage, and on load an in-memory user
 * holding only that is seeded and renewed -- signinSilent takes the
 * refresh-token grant whenever the stored user has a refresh token -- so a
 * reload keeps the session while the access token never touches storage.
 */
export class OwnerAuth {
    private readonly listeners = new Set<(event: SessionEvent) => void>();
    /** Settles once start() has finished; a token asked for before then would go out unsigned. */
    private ready: Promise<unknown> = Promise.resolve();
    /** The one renewal in flight: several requests refused at once share it rather than each spending the refresh token. */
    private renewing: Promise<boolean> | null = null;
    /** The email of the session last announced, or undefined when none is: a renewal is not a new sign-in. */
    private announced: string | null | undefined = undefined;

    constructor(private readonly settings: CognitoSettings, private readonly page: OwnerPage, private readonly deps: OwnerAuthDeps) {
        // oidc-client-ts's own renewal timer lands here as well as explicit renewals.
        deps.userManager.events.addUserLoaded(user => this.adopt(user));
        deps.userManager.events.addSilentRenewError(() => { void this.end('expired'); });
    }

    onChange(listener: (event: SessionEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /** Completes a redirect back from Cognito, or restores this tab's session. Resolves to the path to return to after a redirect, else null. */
    start(): Promise<string | null> {
        const run = this.begin();
        this.ready = run.catch(() => undefined);
        return run;
    }

    private async begin(): Promise<string | null> {
        const url = new URL(this.deps.location.href);
        if (url.searchParams.has('code') && url.searchParams.has('state')) {
            // Out of the address bar before the exchange, not after: the URL
            // sync and Share copy location.search, and the exchange is a
            // network round trip.
            this.deps.replaceUrl(`${this.page}${url.hash}`);
            try {
                const user = await this.deps.userManager.signinRedirectCallback(url.href);
                this.adopt(user);
                const back = safeReturnTo(user.state, this.page);
                this.deps.replaceUrl(back);
                return back;
            } catch (error) {
                this.deps.replaceUrl(this.page);
                throw new Error(`Sign-in did not complete: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (url.searchParams.has('error')) {
            this.deps.replaceUrl(this.page);
            throw new Error(`Sign-in did not complete: ${url.searchParams.get('error_description') ?? url.searchParams.get('error')}`);
        }
        const saved = this.saved();
        if (!saved) {
            this.emit({ identity: null, reason: 'signed-out' });
            return null;
        }
        try {
            await this.deps.userManager.storeUser(new User({
                access_token: '', token_type: 'Bearer', refresh_token: saved.refresh_token, scope: saved.scope, profile: saved.profile, expires_at: 0,
            }));
            const user = await this.deps.userManager.signinSilent();
            if (!user) throw new Error('no session');
            this.adopt(user);
        } catch {
            await this.end('signed-out');
        }
        return null;
    }

    signIn(returnTo: string): Promise<void> {
        return this.deps.userManager.signinRedirect({ state: { returnTo } });
    }

    async signOut(): Promise<void> {
        await this.end('signed-out');
        this.deps.location.assign(logoutUrl(this.settings, this.deps.location.origin, this.page));
    }

    async accessToken(): Promise<string | null> {
        await this.ready;
        const user = await this.deps.userManager.getUser();
        if (!user || !user.access_token) return null;
        if (user.expired && !(await this.refresh())) return null;
        return (await this.deps.userManager.getUser())?.access_token || null;
    }

    /** One silent renewal; a refusal ends the session as an expiry, which the page then says. */
    refresh(): Promise<boolean> {
        this.renewing ??= this.renew().finally(() => { this.renewing = null; });
        return this.renewing;
    }

    private async renew(): Promise<boolean> {
        try {
            const user = await this.deps.userManager.signinSilent();
            if (!user) throw new Error('no session');
            this.adopt(user);
            return true;
        } catch {
            await this.end('expired');
            return false;
        }
    }

    private adopt(user: User): void {
        if (user.refresh_token) {
            const saved: SavedSession = { refresh_token: user.refresh_token, scope: user.scope, profile: user.profile };
            this.deps.session.setItem(SESSION_KEY, JSON.stringify(saved));
        }
        const identity = identityOf(user);
        if (this.announced === identity.email) return;
        this.announced = identity.email;
        this.emit({ identity, reason: 'signed-in' });
    }

    private async end(reason: 'signed-out' | 'expired'): Promise<void> {
        this.deps.session.removeItem(SESSION_KEY);
        await this.deps.userManager.removeUser();
        this.announced = undefined;
        this.emit({ identity: null, reason });
    }

    private saved(): SavedSession | null {
        try {
            const raw = this.deps.session.getItem(SESSION_KEY);
            const value = raw ? (JSON.parse(raw) as SavedSession) : null;
            return value && typeof value.refresh_token === 'string' ? value : null;
        } catch {
            return null;
        }
    }

    private emit(event: SessionEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}
