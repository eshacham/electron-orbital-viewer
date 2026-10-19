import React, { useRef } from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { Provider } from 'react-redux';

// The page's jobs client, as src/App.jobs.test.tsx replaces it: a fake API the panels call through jobsApi().
const mockApi = { preview: jest.fn(), submit: jest.fn(), get: jest.fn(), list: jest.fn(), costs: jest.fn() };
const mockPoller = { watch: jest.fn(() => jest.fn()), restart: jest.fn() };
jest.mock('../../src/jobs/client', () => ({
    jobsApi: () => mockApi,
    jobsPoller: () => mockPoller,
    chooseTarget: jest.fn(),
    bindJobsClient: jest.fn(),
}));

import { createAppStore } from '../../src/store';
import { setMode } from '../../src/store/atomSlice';
import { requestOpened, sessionChanged, sessionExpired } from '../../src/store/jobsSlice';
import { selectMolecule } from '../../src/store/moleculeSlice';
import { SESSION_ENDED } from '../../src/jobs/api';
import { BUILD_ENV } from '../../src/jobs/build_env';
import MoleculeJobsSection from '../../src/components/MoleculeJobsSection';
import RequestWorkspace from '../../src/components/RequestWorkspace';
import { resetBuildEnv } from './build_env_stub';
import { jobFixture, previewFixture } from './api_fixtures';

const COGNITO = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };
const OWNER = { signedIn: true, email: 'owner@example.com', groups: ['owners'] };
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function installMatchMedia(narrow: boolean) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
        media, matches: narrow, addEventListener: () => {}, removeEventListener: () => {},
    });
}

/** Explore's entry (desktop) and the workspace in the viewport cell, as App renders them -- they share the entry's ref. */
const Harness: React.FC = () => {
    const entry = useRef<HTMLButtonElement>(null);
    return (
        <>
            <aside aria-label="Explore"><MoleculeJobsSection variant="entry" entryRef={entry} /></aside>
            <main aria-label="3D view"><RequestWorkspace returnFocusRef={entry} /></main>
        </>
    );
};

/** A production build with sign-in; `groups` decides whether the session is the owner's (selectIsOwner). */
function setup({ narrow = false, groups = ['owners'] }: { narrow?: boolean; groups?: string[] } = {}) {
    installMatchMedia(narrow);
    BUILD_ENV.cognito = COGNITO;
    const store = createAppStore();
    store.dispatch(setMode('molecule'));
    store.dispatch(sessionChanged({ ...OWNER, groups }));
    const utils = render(<Provider store={store}><Harness /></Provider>);
    return { store, ...utils };
}
const workspace = () => screen.queryByRole('region', { name: 'Request a molecule' });
const entryButton = () => screen.getByRole('button', { name: 'Request a new molecule' });
async function openAndPreview(store: ReturnType<typeof createAppStore>) {
    if (!store.getState().jobs.request.open) fireEvent.click(entryButton());
    fireEvent.change(within(workspace()!).getByRole('textbox', { name: 'molecule (Name)' }), { target: { value: 'water' } });
    fireEvent.click(within(workspace()!).getByRole('button', { name: 'Preview' }));
    await flush();
}

beforeEach(() => { mockApi.preview.mockImplementation(async () => previewFixture('preview_aws')); });
afterEach(() => { resetBuildEnv(); jest.clearAllMocks(); window.localStorage.clear(); });

describe('the request workspace (ruling P12)', () => {
    it('is not rendered for a non-owner, even with the request open, nor on a phone', () => {
        const visitor = setup({ groups: [] });
        act(() => { visitor.store.dispatch(requestOpened(true)); });
        expect(workspace()).toBeNull();
        expect(document.querySelector('.request-workspace')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Request a new molecule' })).toBeNull();
        visitor.unmount();

        const phone = setup({ narrow: true });
        act(() => { phone.store.dispatch(requestOpened(true)); });
        expect(workspace()).toBeNull();
        expect(document.querySelector('.request-workspace')).toBeNull();
    });

    it('opens from the entry with the whole form, the molecule field focused', () => {
        const { store } = setup();
        expect(workspace()).toBeNull();
        expect(entryButton()).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(entryButton());
        expect(store.getState().jobs.request.open).toBe(true);
        expect(entryButton()).toHaveAttribute('aria-expanded', 'true');
        const region = workspace()!;
        expect(region).toHaveClass('request-workspace');
        expect(entryButton()).toHaveAttribute('aria-controls', region.id);
        expect(within(region).getByRole('heading', { name: 'Request a molecule' })).toBeInTheDocument();
        for (const name of [/A · single point/, /B · optimise first/]) expect(within(region).getByRole('radio', { name })).toBeInTheDocument();
        expect(within(region).getByRole('textbox', { name: 'charge' })).toBeInTheDocument();
        expect(within(region).getByRole('button', { name: 'Preview' })).toBeInTheDocument();
        expect(within(region).getByRole('textbox', { name: 'molecule (Name)' })).toHaveFocus();
    });

    it('draws the resolved structure on the canvas, not in the panel: previewResolved carries the atoms', async () => {
        const { store } = setup();
        await openAndPreview(store);
        const region = workspace()!;
        expect(store.getState().jobs.request.previewAtoms).toEqual(previewFixture('preview_aws').atoms);
        expect(within(region).getByLabelText('preview')).toHaveTextContent('H₂O');
        expect(region.querySelector('svg[role=img]')).toBeNull();
        // The quote is in the workspace, with its line-by-line breakdown (ruling P13).
        expect(within(region).getByRole('radiogroup', { name: 'price options' })).toBeInTheDocument();
        expect(within(region).getAllByRole('list', { name: /price, line by line/ }).length).toBeGreaterThan(0);
    });

    it('editing the request drops the preview, the quote and the structure on the canvas', async () => {
        const { store } = setup();
        await openAndPreview(store);
        fireEvent.change(within(workspace()!).getByRole('textbox', { name: 'molecule (Name)' }), { target: { value: 'ethanol' } });
        expect(within(workspace()!).queryByLabelText('preview')).toBeNull();
        expect(within(workspace()!).queryByRole('radiogroup', { name: 'price options' })).toBeNull();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();
    });

    it('Esc closes it and returns focus to the entry; so does its close button', async () => {
        const { store } = setup();
        await openAndPreview(store);
        fireEvent.keyDown(within(workspace()!).getByRole('textbox', { name: 'molecule (Name)' }), { key: 'Escape' });
        await flush();                                   // the entry's focus ripple mounts lazily
        expect(workspace()).toBeNull();
        expect(store.getState().jobs.request).toEqual(expect.objectContaining({ open: false, previewAtoms: null }));
        expect(entryButton()).toHaveFocus();
        // The form typed is kept for next time (final review I2).
        fireEvent.click(entryButton());
        expect(within(workspace()!).getByRole('textbox', { name: 'molecule (Name)' })).toHaveValue('water');
        fireEvent.click(within(workspace()!).getByRole('button', { name: 'Close the request workspace' }));
        await flush();
        expect(workspace()).toBeNull();
        expect(entryButton()).toHaveFocus();
    });

    it('leaves an Esc that something inside already handled alone', () => {
        const { store } = setup();
        fireEvent.click(entryButton());
        const field = within(workspace()!).getByRole('textbox', { name: 'molecule (Name)' });
        field.addEventListener('keydown', event => event.preventDefault());
        fireEvent.keyDown(field, { key: 'Escape' });
        expect(workspace()).not.toBeNull();
        expect(store.getState().jobs.request.open).toBe(true);
    });

    it('closes and restores the molecule when the session ends, on sign-out and on mode change (Review Focus 4)', async () => {
        const { store } = setup();
        // The session ends: the workspace keeps the form, disabled, under today's R4 alert with the way back;
        // the preview leaves the canvas.
        await openAndPreview(store);
        act(() => { store.dispatch(sessionExpired()); });
        let region = workspace()!;
        expect(within(region).getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(within(region).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
        expect(within(region).getByRole('textbox', { name: 'molecule (Name)' })).toBeDisabled();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();
        // Only one alert says it: Explore's own session line is for when the workspace is closed.
        expect(screen.getAllByText(SESSION_ENDED)).toHaveLength(1);

        // Signed in again, then out: the workspace goes, and the structure with it.
        act(() => { store.dispatch(sessionChanged(OWNER)); });
        region = workspace()!;
        fireEvent.click(within(region).getByRole('button', { name: 'Preview' }));
        await flush();
        expect(store.getState().jobs.request.previewAtoms).not.toBeNull();
        act(() => { store.dispatch(sessionChanged({ signedIn: false, email: null, groups: [] })); });
        expect(workspace()).toBeNull();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();

        // A mode change: gone too.
        act(() => { store.dispatch(sessionChanged(OWNER)); });
        await openAndPreview(store);
        expect(store.getState().jobs.request.previewAtoms).not.toBeNull();
        act(() => { store.dispatch(setMode('bonds')); });
        expect(workspace()).toBeNull();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();
        expect(document.querySelector('.request-workspace')).toBeNull();
    });

    // Fix round 1 (T16-I1): opening the molecule already computed closes the workspace first, so the preview
    // leaves the canvas and the computed molecule is what is shown. (preview_known's existing job is RUNNING --
    // "Already running — follow it" -- so a DONE one is composed from the fixtures, as request_panel.test.tsx does.)
    it('"Already computed — open it" closes the workspace, clears the preview and selects the computed molecule (T16-I1)', async () => {
        const done = jobFixture('get_done');
        mockApi.preview.mockImplementation(async () => ({ ...previewFixture('preview_ok'), existing: done }));
        const { store } = setup();
        await openAndPreview(store);
        expect(store.getState().jobs.request.previewAtoms).not.toBeNull();
        fireEvent.click(within(workspace()!).getByRole('button', { name: 'Already computed — open it' }));
        await flush();
        expect(workspace()).toBeNull();
        expect(store.getState().jobs.request).toEqual(expect.objectContaining({ open: false, previewAtoms: null, previewFormula: null }));
        expect(store.getState().molecule.selectedId).toBe(done.key);
        expect(entryButton()).toHaveFocus();
    });

    // Fix round 1 (T16-M1): any other molecule chosen meanwhile -- quick pick, the picker, a followed job that
    // finishes (each dispatches selectMolecule) -- closes the workspace and takes the preview off the canvas.
    it('choosing another molecule while it is open closes it and clears the preview (T16-M1)', async () => {
        const { store } = setup();
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); });
        await openAndPreview(store);
        expect(store.getState().jobs.request.previewAtoms).not.toBeNull();
        act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); });
        await flush();
        expect(workspace()).toBeNull();
        expect(store.getState().jobs.request).toEqual(expect.objectContaining({ open: false, previewAtoms: null }));
        // Opened again with the same molecule chosen, it stays open.
        fireEvent.click(entryButton());
        await flush();
        expect(workspace()).not.toBeNull();
    });

    // Fix round 1 (T16-M5): one region carries the name, the workspace's; the panel inside adds no second one.
    it('is the one region named "Request a molecule"', () => {
        setup();
        fireEvent.click(entryButton());
        expect(screen.getAllByRole('region', { name: /request a molecule/i })).toHaveLength(1);
        expect(screen.getByRole('region', { name: /request a molecule/i })).toBe(workspace());
    });

    it('with the workspace closed, an ended session is said in Explore with the way back', () => {
        const { store } = setup();
        act(() => { store.dispatch(sessionExpired()); });
        expect(workspace()).toBeNull();
        const explore = screen.getByRole('complementary', { name: 'Explore' });
        expect(within(explore).getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(within(explore).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });
});
