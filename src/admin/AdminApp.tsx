import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, CssBaseline, TextField, ThemeProvider, Typography, createTheme } from '@mui/material';
import { useSelector } from 'react-redux';
import JobsTable from './JobsTable';
import CostPanel from './CostPanel';
import { recentMonths } from './jobs_table';
import { ConnectedOwnerBar } from '../components/OwnerBar';
import { jobsApi } from '../jobs/client';
import { currentMonth } from '../jobs/format';
import { selectIsOwner, JobsState } from '../store/jobsSlice';
import type { CostsResponse, JobView } from '../jobs/api_types';

/** The root's class, and the string tools/check_admin_split.mjs looks for in the main bundle. */
export const ADMIN_ROOT_CLASS = 'eov-admin-dashboard';

// A light page for reading tables, unlike the viewer's dark canvas theme.
const adminTheme = createTheme({ palette: { primary: { main: '#1565c0' } } });

/**
 * The owner's dashboard (spec §9.4): every job of a month with predicted
 * against actual, and what the month has cost. Behind the same sign-in as
 * the viewer; a visitor gets a sign-in prompt and nothing is fetched.
 */
const AdminApp: React.FC = () => {
    const isOwner = useSelector(selectIsOwner);
    const target = useSelector((state: { jobs: JobsState }) => state.jobs.target);
    const months = useMemo(() => recentMonths(new Date()), []);
    const [month, setMonth] = useState(() => currentMonth());
    const [reload, setReload] = useState(0);
    const [data, setData] = useState<{ jobs: JobView[]; costs: CostsResponse } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOwner) {
            setData(null);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        const api = jobsApi();
        Promise.all([api.list(month), api.costs(month)]).then(
            ([listing, costs]) => { if (!cancelled) { setData({ jobs: listing.jobs, costs }); setLoading(false); } },
            failure => { if (!cancelled) { setError(failure instanceof Error ? failure.message : String(failure)); setData(null); setLoading(false); } },
        );
        return () => { cancelled = true; };
    }, [isOwner, month, target, reload]);

    return (
        <ThemeProvider theme={adminTheme}>
            <CssBaseline />
            <main className={ADMIN_ROOT_CLASS}>
                <header className="admin-header">
                    <Typography variant="h5" component="h1">Owner dashboard</Typography>
                    <a href="/">Back to the viewer</a>
                    <ConnectedOwnerBar page="/admin.html" showDashboardLink={false} explainUnconfigured />
                </header>
                {!isOwner ? (
                    <Alert severity="info">Sign in as the owner to see jobs and costs.</Alert>
                ) : (
                    <>
                        <div className="admin-controls">
                            <TextField select size="small" label="Month" value={month} onChange={event => setMonth(event.target.value)}
                                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </TextField>
                            <Button size="small" disabled={loading} onClick={() => setReload(n => n + 1)}>{loading ? 'Loading…' : 'Reload'}</Button>
                        </div>
                        {error && <Alert severity="error" role="alert">{error}</Alert>}
                        {data && (
                            <div className="admin-grid">
                                <JobsTable jobs={data.jobs} />
                                <CostPanel costs={data.costs} />
                            </div>
                        )}
                    </>
                )}
            </main>
        </ThemeProvider>
    );
};

export default AdminApp;
