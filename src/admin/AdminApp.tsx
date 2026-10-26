import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, CssBaseline, IconButton, Popover, Skeleton, TextField, ThemeProvider, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useMediaQuery } from '../useMediaQuery';
import { useSelector } from 'react-redux';
import JobsPage from './JobsPage';
import { recentMonths } from './jobs_table';
import { monthLabel } from './jobs_month';
import { ConnectedOwnerBar } from '../components/OwnerBar';
import { jobsApi } from '../jobs/client';
import { currentMonth } from '../jobs/format';
import { selectIsOwner, JobsState } from '../store/jobsSlice';
import { SESSION_ENDED } from '../jobs/api';
import type { CostsResponse, JobView } from '../jobs/api_types';
import ThemeSwitch from '../design/ThemeSwitch';
import { useQuantumTheme } from '../design/useQuantumTheme';
import Wordmark from '../design/Wordmark';
import BrandMark from '../design/BrandMark';
import { BRAND } from '../design/brands';

/** The root's class, and the string tools/check_admin_split.mjs looks for in the main bundle. */
export const ADMIN_ROOT_CLASS = 'eov-admin-dashboard';

interface Loaded { month: string; jobs: JobView[] | null; costs: CostsResponse | null; listError: string | null; costsError: string | null }
const reason = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure));

/** The page's shape while the first answer is on its way: the strip, the band and a few rows, without figures. */
const LoadingShape: React.FC = () => (
    <div className="admin-loading" aria-busy="true" aria-label="Loading jobs and costs">
        <Skeleton variant="rounded" height={52} />
        <Skeleton variant="rounded" height={120} />
        {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={40} />)}
    </div>
);

const PHONE_MENU = 'Jobs target, sign-in and viewer link';

/** A phone's top bar keeps one line: where jobs run, the sign-in and the way back to the viewer fold into this. */
const PhoneMenu: React.FC<{ problem: boolean }> = ({ problem }) => {
    const anchor = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    return (
        <>
            <IconButton ref={anchor} aria-label={problem ? `${PHONE_MENU}: sign-in problem` : PHONE_MENU} aria-haspopup="dialog"
                aria-expanded={open} onClick={() => setOpen(true)} className={problem ? 'admin-phone-menu-button has-problem' : 'admin-phone-menu-button'}>
                <Badge variant="dot" color="error" invisible={!problem} overlap="circular"><MoreVertIcon /></Badge>
            </IconButton>
            <Popover open={open} anchorEl={anchor.current} onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { role: 'dialog', 'aria-label': PHONE_MENU, className: 'admin-phone-menu' } }}>
                <ConnectedOwnerBar page="/admin.html" showDashboardLink={false} explainUnconfigured />
                <a className="admin-back" href="/">Back to the viewer</a>
            </Popover>
        </>
    );
};

/**
 * The owner's dashboard (spec §9.4): every job of a month with predicted
 * against actual, and what the month has cost. Behind the same sign-in as
 * the viewer; a visitor gets a sign-in prompt and nothing is fetched. The
 * jobs and the costs are read side by side, and one failing never hides
 * the other.
 */
const AdminApp: React.FC = () => {
    const { theme, mode } = useQuantumTheme();
    const isOwner = useSelector(selectIsOwner);
    const target = useSelector((state: { jobs: JobsState }) => state.jobs.target);
    const months = useMemo(() => recentMonths(new Date()), []);
    const [month, setMonth] = useState(() => currentMonth());
    const [reload, setReload] = useState(0);
    const [data, setData] = useState<Loaded | null>(null);
    const [loading, setLoading] = useState(false);
    const phone = useMediaQuery('(max-width: 600px)');
    // The OwnerBar says these itself; on a phone it lives in the menu, so the page says them outside it too.
    const session = useSelector((state: { jobs: JobsState }) => state.jobs.session);
    const signInProblem = session.expired && !session.signedIn ? `${SESSION_ENDED} The menu holds the sign-in.`
        : session.error ? `${session.error} Open the menu to sign in again.` : null;

    useEffect(() => {
        if (!isOwner) {
            setData(null);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        const api = jobsApi();
        void Promise.allSettled([api.list(month), api.costs(month)]).then(([listing, costs]) => {
            if (cancelled) return;
            setData({
                month,
                jobs: listing.status === 'fulfilled' ? listing.value.jobs : null,
                costs: costs.status === 'fulfilled' ? costs.value : null,
                listError: listing.status === 'rejected' ? reason(listing.reason) : null,
                costsError: costs.status === 'rejected' ? reason(costs.reason) : null,
            });
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [isOwner, month, target, reload]);

    useEffect(() => { document.title = `Owner dashboard · ${BRAND.name}`; }, []);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <main className={ADMIN_ROOT_CLASS}>
                <header className="admin-header">
                    <span className="admin-brand"><BrandMark size={24} /><Wordmark brand={BRAND} mode={mode} /></span>
                    <Typography variant="h5" component="h1" className={phone ? 'admin-visually-hidden' : 'admin-title'}>Owner dashboard</Typography>
                    {!phone && <a className="admin-back" href="/">Back to the viewer</a>}
                    <span className="admin-header-end">
                        <ThemeSwitch />
                        {phone ? <PhoneMenu problem={signInProblem !== null} /> : <ConnectedOwnerBar page="/admin.html" showDashboardLink={false} explainUnconfigured />}
                    </span>
                </header>
                {phone && signInProblem && (
                    <Alert severity="error" role="alert" className="admin-phone-notice">{signInProblem}</Alert>
                )}
                <div className="admin-body">
                    {!isOwner ? (
                        <Alert severity="info">Sign in as the owner to see jobs and costs.</Alert>
                    ) : (
                        <>
                            <div className="admin-month-bar">
                                <h2 className="admin-month-title">{monthLabel(month)}</h2>
                                <TextField select size="small" label="Month" value={month} onChange={event => setMonth(event.target.value)}
                                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                                    {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                                </TextField>
                                <Button size="small" startIcon={<RefreshIcon fontSize="small" />} disabled={loading} onClick={() => setReload(n => n + 1)}>
                                    {loading ? 'Loading…' : 'Reload'}
                                </Button>
                            </div>
                            {data?.listError && (
                                <Alert severity="error" role="alert"
                                    action={<Button color="inherit" size="small" disabled={loading} onClick={() => setReload(n => n + 1)}>Try again</Button>}>
                                    {data.listError}
                                </Alert>
                            )}
                            {loading && !data && <LoadingShape />}
                            {data?.jobs && (
                                <JobsPage month={data.month} jobs={data.jobs} costs={data.costs} costsError={data.costsError} onReload={() => setReload(n => n + 1)} />
                            )}
                        </>
                    )}
                </div>
            </main>
        </ThemeProvider>
    );
};

export default AdminApp;
