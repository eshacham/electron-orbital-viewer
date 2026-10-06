import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RequestPanel, { RequestPanelProps } from '../../src/components/RequestPanel';
import { JobsApiError, SESSION_ENDED } from '../../src/jobs/api';
import type { PreviewResponse } from '../../src/jobs/api_types';
import { jobFixture, previewFixture } from './api_fixtures';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function setup(over: Partial<RequestPanelProps> = {}) {
    const props: RequestPanelProps = {
        target: 'local',
        preview: jest.fn(async () => previewFixture('preview_ok')),
        submit: jest.fn(async () => ({ status: 201, job: jobFixture('submit_created') })),
        onOpen: jest.fn(), onFollow: jest.fn(), sessionExpired: false, onSignIn: jest.fn(),
        ...over,
    };
    const utils = render(<RequestPanel {...props} />);
    return { props, ...utils };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('previewing', () => {
    it('previews a name: the structure PubChem resolved, its facts and the sizing decision', async () => {
        const { props } = setup();
        type('molecule', 'water');
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
        type('molecule', 'water');
        press('Preview');
        await flush();
        expect(screen.getByRole('img', { name: /3 atoms/ })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/^Monthly budget reached/);
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });
    it("shows the server's own message when nothing could be resolved", async () => {
        setup({ preview: jest.fn(async () => { throw new JobsApiError(422, 'unknown-compound', 'PubChem does not know "unobtainium"'); }) });
        type('molecule', 'unobtainium');
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
        type('molecule', 'water');
        press('Preview');
        type('molecule', 'ethanol');
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
        type('molecule', 'water');
        press('Preview');
        await flush();
        fireEvent.click(screen.getByRole('radio', { name: /B · optimise first/ }));
        expect(screen.queryByLabelText('preview')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
        press('Preview');
        type('molecule', 'ethanol');
        await act(async () => { pending.resolve(previewFixture('preview_ok')); });
        expect(screen.queryByLabelText('preview')).toBeNull();
    });
    it('checks charge and multiplicity before asking the server', () => {
        setup();
        type('molecule', 'water');
        type('charge', '1.5');
        expect(screen.getByText('A whole number, e.g. 0, 1 or -1.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    });
});

describe('submitting', () => {
    it('sends exactly what was previewed, and follows the new job', async () => {
        const { props } = setup();
        type('molecule', 'water');
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
        type('molecule', 'water');
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
        type('molecule', 'water');
        press('Preview');
        await flush();
        press('Already running — follow it');
        expect(running.props.onFollow).toHaveBeenCalledWith(expect.objectContaining({ status: 'RUNNING' }));
    });
    it('a failed molecule shows its error, and Retry posts retry: true for the same molecule', async () => {
        const failed = jobFixture('get_failed');
        const { props } = setup({ preview: jest.fn(async () => ({ ...previewFixture('preview_ok'), existing: failed })) });
        type('molecule', 'water');
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
    it('an ended session keeps the form, disables it and offers sign-in', () => {
        const { props, rerender } = setup();
        type('molecule', 'water');
        rerender(<RequestPanel {...props} sessionExpired />);
        expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(screen.getByLabelText('molecule')).toHaveValue('water');
        expect(screen.getByLabelText('molecule')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
        press('Sign in');
        expect(props.onSignIn).toHaveBeenCalled();
    });
});
