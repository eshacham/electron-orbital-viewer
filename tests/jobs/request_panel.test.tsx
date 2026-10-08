import React, { useState } from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import RequestPanel, { RequestPanelProps } from '../../src/components/RequestPanel';
import { JobsApiError, SESSION_ENDED } from '../../src/jobs/api';
import type { PreviewResponse } from '../../src/jobs/api_types';
import { EMPTY_FORM, RequestForm } from '../../src/jobs/request_form';
import { jobFixture, previewFixture } from './api_fixtures';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

type PanelProps = Omit<RequestPanelProps, 'form' | 'onFormChange'>;
/** The panel's form lives with its caller (the jobs slice in the app); here, in a parent's state. */
const Harness: React.FC<PanelProps> = props => {
    const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
    return <RequestPanel {...props} form={form} onFormChange={change => setForm(previous => ({ ...previous, ...change }))} />;
};

function setup(over: Partial<PanelProps> = {}) {
    const props: PanelProps = {
        target: 'local',
        preview: jest.fn(async () => previewFixture('preview_ok')),
        submit: jest.fn(async () => ({ status: 201, job: jobFixture('submit_created') })),
        onOpen: jest.fn(), onFollow: jest.fn(), sessionExpired: false, onSignIn: jest.fn(),
        ...over,
    };
    const utils = render(<Harness {...props} />);
    return { props, ...utils };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('previewing', () => {
    it('previews a name: the structure PubChem resolved, its facts and the sizing decision', async () => {
        const { props } = setup();
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        expect(props.preview).toHaveBeenCalledWith({ recipe: 'single', molecule: { name: 'water' } }, expect.any(AbortSignal));
        expect(screen.getByRole('img', { name: 'preview of the resolved structure, 3 atoms' })).toBeInTheDocument();
        const preview = screen.getByLabelText('preview');
        // D7: a local run's "Predicted" figure is really a Fargate estimate, and there is no
        // local time limit -- the labels say so rather than implying a Mac-specific prediction.
        for (const text of ['H₂O', 'Electrons10', 'Basis functions58 (def2-TZVPD)', 'This Mac', 'remaining $8.80', 'Fargate estimate', 'none on This Mac']) {
            expect(preview).toHaveTextContent(text);
        }
        expect(preview).toHaveTextContent(/sizing v\d+ prediction/);
        expect(screen.getByRole('link', { name: '962' })).toHaveAttribute('href', 'https://pubchem.ncbi.nlm.nih.gov/compound/962');
        expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });
    it('still shows what a refused molecule resolved to, with the reason, and cannot submit it', async () => {
        setup({ preview: jest.fn(async () => previewFixture('preview_refused')) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        expect(screen.getByRole('img', { name: /3 atoms/ })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/^Monthly budget reached/);
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });
    it("shows the server's own message when nothing could be resolved", async () => {
        setup({ preview: jest.fn(async () => { throw new JobsApiError(422, 'unknown-compound', 'PubChem does not know "unobtainium"'); }) });
        type('molecule (Name)', 'unobtainium');
        press('Preview');
        await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('PubChem does not know "unobtainium"');
        expect(screen.queryByLabelText('preview')).toBeNull();
    });
    it('a preview that answers after the input changed is never shown', async () => {
        const first = deferred<PreviewResponse>();
        const second = deferred<PreviewResponse>();
        const preview = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        setup({ preview });
        type('molecule (Name)', 'water');
        press('Preview');
        type('molecule (Name)', 'ethanol');
        press('Preview');
        await act(async () => { second.resolve({ ...previewFixture('preview_ok'), name: 'Ethanol', formula: 'C2H6O' }); });
        await act(async () => { first.resolve(previewFixture('preview_ok')); });
        expect(screen.getByLabelText('preview')).toHaveTextContent('C₂H₆O');
        expect(screen.getByLabelText('preview')).not.toHaveTextContent('H₂O');
        expect((preview.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    });
    it('drops a preview as soon as the form changes, so Submit needs a new one', async () => {
        const pending = deferred<PreviewResponse>();
        setup({ preview: jest.fn().mockResolvedValueOnce(previewFixture('preview_ok')).mockReturnValueOnce(pending.promise) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        fireEvent.click(screen.getByRole('radio', { name: /B · optimise first/ }));
        expect(screen.queryByLabelText('preview')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
        press('Preview');
        type('molecule (Name)', 'ethanol');
        await act(async () => { pending.resolve(previewFixture('preview_ok')); });
        expect(screen.queryByLabelText('preview')).toBeNull();
    });
    // Final review I1: a This Mac preview ($0) must not stay up, with Submit, once jobs go to AWS.
    it('drops the preview and Submit when the target changes', async () => {
        const { props, rerender } = setup();
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
        rerender(<Harness {...props} target="aws" />);
        expect(screen.queryByLabelText('preview')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
        expect(props.submit).not.toHaveBeenCalled();
        expect(screen.getByLabelText('molecule (Name)')).toHaveValue('water');
    });
    it('on AWS, shows the Spot worker, its attempts, its time limit and what it would reserve', async () => {
        setup({ target: 'aws', preview: jest.fn(async () => previewFixture('preview_aws')) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        const sizing = screen.getByLabelText('sizing decision');
        expect(sizing).toHaveTextContent('Spot, up to 3 attempts');
        expect(sizing).toHaveTextContent('Time limit10 min 00 s');
        expect(sizing).toHaveTextContent('reserved $0.02 if submitted; projected $0.0001290');
        expect(sizing).not.toHaveTextContent('on AWS');
    });
    // R6: a This Mac run costs nothing; the projection is what AWS would have cost.
    it('says a local projection is what it would cost on AWS', async () => {
        setup();
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        expect(screen.getByLabelText('sizing decision')).toHaveTextContent('projected on AWS $0.00');
    });
    it('says generation is paused, and offers no Submit that works', async () => {
        setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), generationEnabled: false })) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        expect(screen.getByText(/Generation is paused/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });
    // R1: the same PubChem record asked for by another name or on another day is the same source.
    it('calls the same PubChem record the same source, and says how it was asked for before', async () => {
        const done = jobFixture('get_done');
        const existing = { ...done, geometrySource: { kind: 'pubchem' as const, cid: 962, title: 'Water', query: 'H2O', retrievedAt: '2026-09-01' } };
        setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), existing })) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        const preview = screen.getByLabelText('preview');
        expect(preview).toHaveTextContent('(same source; asked as "H2O", retrieved 2026-09-01)');
        expect(preview).not.toHaveTextContent('a different source');
    });
    // R4: the accessible name carries the visible label, and the preview says when it is busy and when it lands.
    it('names each input by what it takes, and announces the preview', async () => {
        const pending = deferred<PreviewResponse>();
        setup({ preview: jest.fn(() => pending.promise) });
        fireEvent.click(screen.getByRole('button', { name: 'SMILES' }));
        expect(screen.getByLabelText('molecule (SMILES)')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'XYZ' }));
        expect(screen.getByLabelText('molecule (XYZ)')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Name' }));
        type('molecule (Name)', 'water');
        press('Preview');
        const live = document.querySelector('.preview-live') as HTMLElement;
        expect(live).toHaveAttribute('aria-live', 'polite');
        expect(live).toHaveAttribute('aria-busy', 'true');
        await act(async () => { pending.resolve(previewFixture('preview_ok')); });
        expect(live).toHaveAttribute('aria-busy', 'false');
        expect(within(live).getByLabelText('preview')).toBeInTheDocument();
    });
    // R2: iOS's numeric keypad has no minus sign, and a charge can be negative.
    it('lets a negative charge be typed on a phone', () => {
        setup();
        expect(screen.getByLabelText('charge')).not.toHaveAttribute('inputmode');
        expect(screen.getByLabelText('multiplicity')).toHaveAttribute('inputmode', 'numeric');
    });
    it('checks charge and multiplicity before asking the server', () => {
        setup();
        type('molecule (Name)', 'water');
        type('charge', '1.5');
        expect(screen.getByText('A whole number, e.g. 0, 1 or -1.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    });
});

describe('submitting', () => {
    it('sends exactly what was previewed, and follows the new job', async () => {
        const { props } = setup();
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        press('Submit');
        await flush();
        expect(props.submit).toHaveBeenCalledWith({ recipe: 'single', molecule: { name: 'water' } });
        expect(props.onFollow).toHaveBeenCalledWith(jobFixture('submit_created'));
    });
    it('a known molecule: computed opens it, running follows it', async () => {
        const done = jobFixture('get_done');
        const { props, unmount } = setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), existing: done })) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        // D8: the same key can come from a different PubChem record or a pasted XYZ; show the
        // request's own geometry source beside the one already on record, so "already computed"
        // under a "new" name makes sense.
        expect(screen.getByLabelText('preview')).toHaveTextContent('On record');
        press('Already computed — open it');
        expect(props.onOpen).toHaveBeenCalledWith(done.key);
        unmount();
        const running = setup({ preview: jest.fn(async () => previewFixture('preview_known')) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        press('Already running — follow it');
        expect(running.props.onFollow).toHaveBeenCalledWith(expect.objectContaining({ status: 'RUNNING' }));
    });
    it('a failed molecule shows its error, and Retry posts retry: true for the same molecule', async () => {
        const failed = jobFixture('get_failed');
        const { props } = setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), existing: failed })) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('SCF did not converge');
        press('Retry');
        await flush();
        expect(props.submit).toHaveBeenCalledWith(expect.objectContaining({
            retry: true, recipe: 'optimise', charge: 0, multiplicity: 1,
            molecule: { xyz: expect.stringMatching(/^3\nretry\nH 0\.00000 -0\.75545 -0\.47116\n/) },
        }));
    });
    // R5: what was sent is not offered again.
    it('takes the preview down once the job is sent', async () => {
        setup();
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        press('Submit');
        await flush();
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
        expect(screen.getByLabelText('molecule (Name)')).toHaveValue('water');
    });
    it('says why a submit failed, and keeps the preview to try again', async () => {
        const { props } = setup({ submit: jest.fn(async () => { throw new JobsApiError(409, 'cap-reached', 'Monthly budget reached'); }) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        press('Submit');
        await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('Monthly budget reached');
        expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
        expect(props.onFollow).not.toHaveBeenCalled();
    });
    // R3 and R4: one alert, the one that says what to do; and focus does not stay on a field just disabled.
    it('after a session ends, says only that, and moves focus to Sign in', async () => {
        const { props, rerender } = setup({ submit: jest.fn(async () => { throw new JobsApiError(401, 'session-expired', SESSION_ENDED); }) });
        type('molecule (Name)', 'water');
        press('Preview');
        await flush();
        press('Submit');
        await flush();
        screen.getByLabelText('molecule (Name)').focus();
        rerender(<Harness {...props} sessionExpired />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
    });
    it('an ended session keeps the form, disables it and offers sign-in', () => {
        const { props, rerender } = setup();
        type('molecule (Name)', 'water');
        rerender(<Harness {...props} sessionExpired />);
        expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(screen.getByLabelText('molecule (Name)')).toHaveValue('water');
        expect(screen.getByLabelText('molecule (Name)')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
        press('Sign in');
        expect(props.onSignIn).toHaveBeenCalled();
    });
});
