import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    it('is a discreet link when sign-in is configured, and says so when it is not', () => {
        const h = handlers();
        const { rerender } = render(<OwnerBar dev={false} target="aws" session={SIGNED_OUT} isOwner={false} {...h} />);
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' }));
        expect(h.onSignIn).toHaveBeenCalled();
        rerender(<OwnerBar dev={false} target="aws" session={{ ...SIGNED_OUT, configured: false }} isOwner={false} {...h} />);
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
});
