import React, { useState } from 'react';
import {
    Alert, Button, FormControlLabel, Radio, RadioGroup, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import PreviewDetails from './PreviewDetails';
import { FormProblem, formProblems, formSignature, InputKind, requestBody, RequestForm, retryBody } from '../jobs/request_form';
import { PreviewFn, usePreview } from '../jobs/usePreview';
import { SESSION_ENDED } from '../jobs/api';
import { isActive, JobRequest, JobView, PreviewResponse, Recipe } from '../jobs/api_types';
import type { JobsTarget } from '../store/jobsSlice';

export interface RequestPanelProps {
    target: JobsTarget;
    /** The form as typed, kept by the caller (the jobs slice): a folded phone sheet unmounts this panel (final review I2). */
    form: RequestForm;
    onFormChange(change: Partial<RequestForm>): void;
    preview: PreviewFn;
    submit(body: JobRequest): Promise<{ status: number; job: JobView }>;
    onOpen(key: string): void;
    onFollow(job: JobView): void;
    /** The session ended mid-session: keep the form, disable it, and offer sign-in (spec §9.5). */
    sessionExpired: boolean;
    onSignIn(): void;
}

/** Spec §8.2's recipes and their caveats, as the owner chooses between them. */
const RECIPES: Array<{ value: Recipe; label: string; detail: string }> = [
    { value: 'single', label: 'A · single point', detail: 'B3LYP/def2-TZVPD at the geometry given. Geometry is PubChem’s force-field conformer (or as pasted), not optimised.' },
    { value: 'optimise', label: 'B · optimise first', detail: 'B3LYP/def2-SVP optimisation (geomeTRIC), then B3LYP/def2-TZVPD. No dispersion correction and no frequency check: not confirmed to be a minimum.' },
];

interface SubmitAreaProps {
    preview: PreviewResponse;
    busy: boolean;
    onOpen(key: string): void;
    onFollow(job: JobView): void;
    onSubmit(): void;
    onRetry(job: JobView): void;
}

/** Spec §6.3 / §9.2: a known key is never resubmitted -- the button says what will happen instead. */
function SubmitArea({ preview, busy, onOpen, onFollow, onSubmit, onRetry }: SubmitAreaProps) {
    const existing = preview.existing;
    const allowed = preview.decision.ok && preview.generationEnabled;
    if (existing?.status === 'DONE') return <Button variant="contained" onClick={() => onOpen(existing.key)}>Already computed — open it</Button>;
    if (existing && isActive(existing.status)) return <Button variant="contained" onClick={() => onFollow(existing)}>Already running — follow it</Button>;
    return (
        <>
            {existing?.status === 'FAILED' && (
                <Alert severity="error" role="alert">This molecule failed before: {existing.error?.message ?? 'no reason was recorded'}</Alert>
            )}
            {!preview.generationEnabled && (
                <Alert severity="info">Generation is paused: nothing new can be submitted until it is resumed.</Alert>
            )}
            {existing?.status === 'FAILED'
                ? <Button variant="contained" disabled={busy || !allowed} onClick={() => onRetry(existing)}>Retry</Button>
                : <Button variant="contained" disabled={busy || !allowed} onClick={onSubmit}>Submit</Button>}
        </>
    );
}

/**
 * The owner's request (spec §9.2): name, SMILES or XYZ; recipe A or B;
 * optional charge and multiplicity; then Preview, which shows what was
 * resolved and how it would run, before anything is submitted or reserved.
 */
const RequestPanel: React.FC<RequestPanelProps> = ({ target, form, onFormChange, preview, submit, onOpen, onFollow, sessionExpired, onSignIn }) => {
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const { state, run, clear } = usePreview(preview);
    const problems = formProblems(form);
    const problem = (field: FormProblem['field']) => problems.find(p => p.field === field)?.message;
    // A preview belongs to the exact request it was asked for; anything typed since makes it stale.
    const current = state.phase !== 'idle' && state.signature === formSignature(form) ? state : null;

    const edit = (change: Partial<RequestForm>) => {
        onFormChange(change);
        clear();
        setSubmitError(null);
    };

    const send = async (body: JobRequest) => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            const { job } = await submit(body);
            if (job.status === 'DONE') onOpen(job.key);
            else onFollow(job);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : String(error));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="request-panel" aria-label="request a molecule">
            {sessionExpired && (
                <Alert severity="warning" role="alert" action={<Button size="small" color="inherit" onClick={onSignIn}>Sign in</Button>}>
                    {SESSION_ENDED}
                </Alert>
            )}
            <ToggleButtonGroup exclusive size="small" value={form.kind} aria-label="molecule given as" disabled={sessionExpired}
                onChange={(_event, kind: InputKind | null) => { if (kind) edit({ kind }); }}>
                <ToggleButton value="name">Name</ToggleButton>
                <ToggleButton value="smiles">SMILES</ToggleButton>
                <ToggleButton value="xyz">XYZ</ToggleButton>
            </ToggleButtonGroup>
            <TextField
                size="small" fullWidth multiline={form.kind === 'xyz'} minRows={form.kind === 'xyz' ? 4 : undefined}
                label={form.kind === 'name' ? 'Name' : form.kind === 'smiles' ? 'SMILES' : 'XYZ (Å)'}
                value={form.text} disabled={sessionExpired}
                onChange={event => edit({ text: event.target.value })}
                error={Boolean(form.text) && Boolean(problem('text'))}
                helperText={form.text ? problem('text') : undefined}
                slotProps={{ htmlInput: { 'aria-label': 'molecule', spellCheck: false, className: form.kind === 'xyz' ? 'mono' : undefined } }}
            />
            <RadioGroup value={form.recipe} aria-label="recipe" onChange={event => edit({ recipe: event.target.value as Recipe })}>
                {RECIPES.map(recipe => (
                    <FormControlLabel key={recipe.value} value={recipe.value} disabled={sessionExpired} control={<Radio size="small" />}
                        label={<><strong>{recipe.label}</strong><span className="recipe-detail">{recipe.detail}</span></>} />
                ))}
            </RadioGroup>
            <div className="request-optional">
                <TextField size="small" label="Charge" placeholder="0" value={form.charge} disabled={sessionExpired}
                    onChange={event => edit({ charge: event.target.value })}
                    error={Boolean(problem('charge'))} helperText={problem('charge') ?? 'optional'}
                    slotProps={{ htmlInput: { 'aria-label': 'charge', inputMode: 'numeric' } }} />
                <TextField size="small" label="Multiplicity" placeholder="lowest" value={form.multiplicity} disabled={sessionExpired}
                    onChange={event => edit({ multiplicity: event.target.value })}
                    error={Boolean(problem('multiplicity'))} helperText={problem('multiplicity') ?? 'optional'}
                    slotProps={{ htmlInput: { 'aria-label': 'multiplicity', inputMode: 'numeric' } }} />
            </div>
            <Typography variant="caption" className="molecule-caption">
                {target === 'local' ? 'Runs on This Mac: $0, timings tagged local.' : 'Runs on AWS, against this month’s compute cap.'}
            </Typography>
            <Button variant="outlined" disabled={sessionExpired || problems.length > 0 || state.phase === 'loading'} onClick={() => run(form)}>
                {state.phase === 'loading' ? 'Previewing…' : 'Preview'}
            </Button>
            {current?.phase === 'failed' && <Alert severity="error" role="alert">{current.error.message}</Alert>}
            {current?.phase === 'ready' && (
                <>
                    <PreviewDetails preview={current.preview} />
                    <SubmitArea preview={current.preview} busy={submitting || sessionExpired} onOpen={onOpen} onFollow={onFollow}
                        onSubmit={() => { void send(requestBody(form)); }} onRetry={job => { void send(retryBody(job)); }} />
                </>
            )}
            {submitError && <Alert severity="error" role="alert">{submitError}</Alert>}
        </section>
    );
};

export default RequestPanel;
