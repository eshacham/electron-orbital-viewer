import React from 'react';
import { Link, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsOwner, sessionFailed, JobsState, JobsTarget, OwnerSession } from '../store/jobsSlice';
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
    /**
     * Say "not configured" even in a production build (/admin.html: it is the
     * owner's page, and explains why sign-in is absent). The viewer says it
     * on the dev server only: a public visitor has no use for owner plumbing
     * (ruling R4-rec).
     */
    explainUnconfigured?: boolean;
    /** The viewer shows a failed sign-in in its own alert, on every screen (final review I3); /admin.html shows it here. */
    showError?: boolean;
}

/**
 * The owner's corner, under Share and Export (spec §9.5, §9.6): a discreet
 * sign-in link, and on the dev server the choice of where jobs run. Anyone
 * may see the link; it grants nothing without the owner's Cognito login.
 */
const OwnerBar: React.FC<OwnerBarProps> = ({
    dev, target, session, isOwner, onTarget, onSignIn, onSignOut, showDashboardLink = false, explainUnconfigured = false, showError = true,
}) => {
    const signInLine = session.signedIn ? (
        <Typography variant="caption">
            Signed in as {session.email ?? 'the owner'} · <Link component="button" variant="caption" onClick={onSignOut}>Sign out</Link>
        </Typography>
    ) : session.configured ? (
        <Link component="button" variant="caption" className="owner-sign-in" onClick={onSignIn}>Owner sign-in</Link>
    ) : dev || explainUnconfigured ? (
        <Typography variant="caption" className="owner-sign-in">Owner sign-in: not configured in this build</Typography>
    ) : null;
    const ended = session.expired && !session.signedIn;
    const error = showError ? session.error : null;
    if (!dev && !signInLine && !(isOwner && showDashboardLink) && !ended && !error) return null;
    return (
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
            {signInLine}
            {isOwner && showDashboardLink && <Link href="/admin.html" variant="caption">Dashboard</Link>}
            {ended && <Typography variant="caption" role="status">{SESSION_ENDED}</Typography>}
            {error && <Typography variant="caption" role="alert">{error}</Typography>}
        </div>
    );
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Back to this page after Cognito, with the view the owner left in its hash.
 * The page is named, not read from location.pathname: '/index.html' or a
 * stray path would otherwise come back as the address (Task 7's carry), and
 * safeReturnTo trusts any same-site path. A sign-in that cannot start --
 * Cognito's discovery document unreachable, offline or misconfigured -- is
 * said through `onFailed`, never swallowed (m4).
 */
export function signInHere(page: OwnerPage, onFailed: (message: string) => void): void {
    ownerAuth()?.signIn(`${page}${window.location.hash}`).catch(error => onFailed(`Sign-in could not start: ${message(error)}`));
}

/**
 * The bar wired to whichever page's store holds `jobs` (the viewer's, or
 * /admin.html's). `page` has no default: a page that forgot to name itself
 * would sign the owner in and land them on the other page.
 */
export function ConnectedOwnerBar({ page, showDashboardLink = true, explainUnconfigured = false, showError = true }: {
    page: OwnerPage; showDashboardLink?: boolean; explainUnconfigured?: boolean; showError?: boolean;
}) {
    const jobs = useSelector((state: { jobs: JobsState }) => state.jobs);
    const isOwner = useSelector(selectIsOwner);
    const dispatch = useDispatch();
    const failed = (text: string) => { dispatch(sessionFailed(text)); };
    return (
        <OwnerBar
            dev={BUILD_ENV.dev} target={jobs.target} session={jobs.session} isOwner={isOwner} showDashboardLink={showDashboardLink}
            explainUnconfigured={explainUnconfigured} showError={showError}
            onTarget={chooseTarget}
            onSignIn={() => signInHere(page, failed)}
            onSignOut={() => { ownerAuth()?.signOut().catch(error => failed(`Sign-out did not complete: ${message(error)}`)); }}
        />
    );
}

export default OwnerBar;
