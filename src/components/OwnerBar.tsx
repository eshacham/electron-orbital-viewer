import React from 'react';
import { Link, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useSelector } from 'react-redux';
import { selectIsOwner, JobsState, JobsTarget, OwnerSession } from '../store/jobsSlice';
import { BUILD_ENV } from '../jobs/build_env';
import { SESSION_ENDED } from '../jobs/api';
import { chooseTarget } from '../jobs/client';
import { ownerAuth } from '../jobs/owner_session';
import type { OwnerPage } from '../jobs/auth';

interface OwnerBarProps {
    dev: boolean;
    target: JobsTarget;
    session: OwnerSession;
    isOwner: boolean;
    onTarget(target: JobsTarget): void;
    onSignIn(): void;
    onSignOut(): void;
    /** The viewer links the dashboard; the dashboard itself does not. */
    showDashboardLink?: boolean;
}

/**
 * The owner's corner, under Share and Export (spec §9.5, §9.6): a discreet
 * sign-in link, and on the dev server the choice of where jobs run. Anyone
 * may see the link; it grants nothing without the owner's Cognito login.
 */
const OwnerBar: React.FC<OwnerBarProps> = ({ dev, target, session, isOwner, onTarget, onSignIn, onSignOut, showDashboardLink = false }) => (
    <div className="owner-bar">
        {dev && (
            <div className="owner-bar-target">
                <Typography variant="caption">Jobs run on</Typography>
                <ToggleButtonGroup exclusive size="small" value={target} aria-label="where jobs run"
                    onChange={(_event, next: JobsTarget | null) => { if (next) onTarget(next); }}>
                    <ToggleButton value="local">This Mac</ToggleButton>
                    <ToggleButton value="aws">AWS</ToggleButton>
                </ToggleButtonGroup>
            </div>
        )}
        {session.signedIn ? (
            <Typography variant="caption">
                Signed in as {session.email ?? 'the owner'} · <Link component="button" variant="caption" onClick={onSignOut}>Sign out</Link>
            </Typography>
        ) : session.configured ? (
            <Link component="button" variant="caption" className="owner-sign-in" onClick={onSignIn}>Owner sign-in</Link>
        ) : (
            <Typography variant="caption" className="owner-sign-in">Owner sign-in: not configured in this build</Typography>
        )}
        {isOwner && showDashboardLink && <Link href="/admin.html" variant="caption">Dashboard</Link>}
        {session.expired && !session.signedIn && <Typography variant="caption" role="status">{SESSION_ENDED}</Typography>}
        {session.error && <Typography variant="caption" role="alert">{session.error}</Typography>}
    </div>
);

/**
 * Back to this page after Cognito, with the view the owner left in its hash.
 * The page is named, not read from location.pathname: '/index.html' or a
 * stray path would otherwise come back as the address (Task 7's carry), and
 * safeReturnTo trusts any same-site path.
 */
export function signInHere(page: OwnerPage): void {
    void ownerAuth()?.signIn(`${page}${window.location.hash}`);
}

/** The bar wired to whichever page's store holds `jobs` (the viewer's, or /admin.html's). */
export function ConnectedOwnerBar({ page = '/', showDashboardLink = true }: { page?: OwnerPage; showDashboardLink?: boolean }) {
    const jobs = useSelector((state: { jobs: JobsState }) => state.jobs);
    const isOwner = useSelector(selectIsOwner);
    return (
        <OwnerBar
            dev={BUILD_ENV.dev} target={jobs.target} session={jobs.session} isOwner={isOwner} showDashboardLink={showDashboardLink}
            onTarget={chooseTarget}
            onSignIn={() => signInHere(page)}
            onSignOut={() => { void ownerAuth()?.signOut(); }}
        />
    );
}

export default OwnerBar;
