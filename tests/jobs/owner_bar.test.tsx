import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import OwnerBar, { ConnectedOwnerBar } from '../../src/components/OwnerBar';
import jobsReducer from '../../src/store/jobsSlice';
import type { OwnerSession } from '../../src/store/jobsSlice';
import { setOwnerAuthForTests } from '../../src/jobs/owner_session';
import type { OwnerAuth } from '../../src/jobs/auth';
import { BUILD_ENV, resetBuildEnv } from './build_env_stub';

const SIGNED_OUT: OwnerSession = { configured: true, signedIn: false, email: null, expired: false, error: null };
const handlers = () => ({ onTarget: jest.fn(), onSignIn: jest.fn(), onSignOut: jest.fn() });

afterEach(() => { resetBuildEnv(); setOwnerAuthForTests(null); window.history.replaceState(null, '', '/'); });

describe('OwnerBar', () => {
    it('is a discreet link when sign-in is configured', () => {
        const h = handlers();
        render(<OwnerBar dev={false} target="aws" session={SIGNED_OUT} isOwner={false} {...h} />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(h.onSignIn).toHaveBeenCalled();
    });
    // Ruling R4-rec: public visitors are not shown owner plumbing; the dev server and /admin.html still say why sign-in is absent.
    it('without sign-in settings, says so on the dev server and on /admin.html, and shows a production visitor nothing', () => {
        const unconfigured = { ...SIGNED_OUT, configured: false };
        const { rerender, container } = render(<OwnerBar dev={false} target="aws" session={unconfigured} isOwner={false} {...handlers()} />);
        expect(screen.queryByText(/Owner sign-in/)).toBeNull();
        expect(container).toBeEmptyDOMElement();
        rerender(<OwnerBar dev target="local" session={unconfigured} isOwner {...handlers()} />);
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
        rerender(<OwnerBar dev={false} target="aws" session={unconfigured} isOwner={false} explainUnconfigured {...handlers()} />);
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Owner sign-in' })).toBeNull();
    });
    it('names the signed-in owner, offers sign-out and the dashboard', () => {
        const h = handlers();
        render(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, signedIn: true, email: 'owner@example.com' }} isOwner {...h} showDashboardLink />);
        expect(screen.getByText(/Signed in as owner@example.com/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(h.onSignOut).toHaveBeenCalled();
        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin.html');
    });
    it('on the dev server, offers where jobs run', () => {
        const h = handlers();
        render(<OwnerBar dev target="local" session={SIGNED_OUT} isOwner {...h} />);
        fireEvent.click(screen.getByRole('button', { name: 'AWS' }));
        expect(h.onTarget).toHaveBeenCalledWith('aws');
        expect(screen.getByRole('group', { name: 'where jobs run' })).toBeInTheDocument();
    });
    it('says an ended session and a failed sign-in out loud', () => {
        render(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, expired: true, error: 'Sign-in did not complete: User cancelled' }} isOwner={false} {...handlers()} />);
        expect(screen.getByRole('status')).toHaveTextContent('Your owner session has ended. Sign in again to continue.');
        expect(screen.getByRole('alert')).toHaveTextContent('Sign-in did not complete: User cancelled');
    });
    it('leaves a failed sign-in to the page when the page says it itself (the viewer)', () => {
        render(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, error: 'Sign-in did not complete.' }} isOwner={false} showError={false} {...handlers()} />);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

describe('ConnectedOwnerBar', () => {
    // Task 7's carry: the return path is this page's own path (and the view in
    // its hash), never whatever location.pathname happens to read -- else the
    // address bar can come back naming the wrong page.
    it.each([['/', '/'], ['/admin.html', '/admin.html']] as const)('signs in back to its own page (%s), with the view the owner left', (page, expected) => {
        BUILD_ENV.cognito = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };
        const signIn = jest.fn(async () => undefined);
        setOwnerAuthForTests({ signIn } as unknown as OwnerAuth);
        window.history.replaceState(null, '', '/index.html#mode=molecule&mol=h2o');
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        render(<Provider store={store}><ConnectedOwnerBar page={page} /></Provider>);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(signIn).toHaveBeenCalledWith(`${expected}#mode=molecule&mol=h2o`);
    });
    // m4: an unreachable sign-in service (offline, a wrong VITE_COGNITO_AUTHORITY) is said, not swallowed.
    it('says a sign-in that could not start', async () => {
        BUILD_ENV.cognito = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };
        setOwnerAuthForTests({ signIn: jest.fn(async () => { throw new TypeError('Failed to fetch'); }) } as unknown as OwnerAuth);
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        render(<Provider store={store}><ConnectedOwnerBar page="/admin.html" /></Provider>);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        await act(async () => { await Promise.resolve(); });
        expect(store.getState().jobs.session.error).toBe('Sign-in could not start: Failed to fetch');
        expect(screen.getByRole('alert')).toHaveTextContent('Sign-in could not start: Failed to fetch');
    });
});
