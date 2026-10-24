import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from './store';
import { selectMolecule, setShowStructure } from './store/moleculeSlice';
import { followJob, jobUpdated, sessionChanged, sessionExpired, TARGET_STORAGE_KEY } from './store/jobsSlice';
import { BUILD_ENV } from './jobs/build_env';
import { setOwnerAuthForTests, startOwnerSession } from './jobs/owner_session';
import { SIGN_IN_FAILED } from './jobs/auth';
import { LOCAL_SERVER_HINT, SESSION_ENDED } from './jobs/api';
import { currentMonth } from './jobs/format';
import { loadMoleculeIndex, loadMoleculeMeta, MoleculeLoadError, RESULT_NOT_FINISHED } from './molecules/loader';
import type { MoleculeProvenance } from './molecules/types';
import { resetBuildEnv } from '../tests/jobs/build_env_stub';
import { jobFixture, listFixture, previewFixture } from '../tests/jobs/api_fixtures';
import { LIBRARY_INDEX, waterMeta } from '../tests/molecules/fixtures';
import App from './App';

// The same module mocks as tests/App.molecules.test.tsx (Phase 6): every
// import.meta.url worker module App reaches is replaced, the 3D view is a
// stub, and the molecule files come from fixtures.
jest.mock('./components/OrbitalViewer', () => ({ __esModule: true, default: () => <div data-testid="orbital-viewer" /> }));
jest.mock('./orbital_visualizer', () => ({ getOptimizedParameters: () => ({ rMax: 15, isoLevel: 0.005 }) }));
jest.mock('./workers/createAtomWorker', () => ({
    createAtomWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null })),
}));
jest.mock('./workers/createExportWorker', () => ({ createExportWorker: jest.fn() }));
jest.mock('./workers/createH2PlusCurveWorker', () => ({
    createH2PlusCurveWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null })),
}));
// Preflight D20: Phase 6's grid-mesh worker mock, for parity with its App suite.
jest.mock('./workers/createGridMeshWorker', () => ({ createGridMeshWorker: jest.fn() }));
jest.mock('./molecules/loader', () => ({
    ...jest.requireActual('./molecules/loader'),
    loadMoleculeIndex: jest.fn(), loadMoleculeMeta: jest.fn(), loadDensityGrid: jest.fn(), loadBasis: jest.fn(),
}));
const mockApi = { preview: jest.fn(), submit: jest.fn(), get: jest.fn(), list: jest.fn(), costs: jest.fn() };
const mockRelease = jest.fn();
const mockPoller = { watch: jest.fn(() => mockRelease), restart: jest.fn() };
jest.mock('./jobs/client', () => ({
    jobsApi: () => mockApi,
    jobsPoller: () => mockPoller,
    chooseTarget: jest.fn(),
    bindJobsClient: jest.fn(),
}));

function installMatchMedia(matches: boolean) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({ media, matches, addEventListener: () => {}, removeEventListener: () => {} });
}
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const KEY = jobFixture('get_done').key;
const PROVENANCE: MoleculeProvenance = {
    jobKey: KEY, computeVersion: 1, recipe: 'single',
    geometrySource: { kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' },
    caveats: ['The geometry is not optimised.'], generatorCommit: 'abc1234', imageDigest: 'local', pyscfVersion: '2.8.0',
    sizingVersion: 1, size: 'S', capacity: 'local', wallSeconds: 70.2, costUsd: null,
};
const COGNITO = { authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc', clientId: 'c', domain: 'https://d' };

async function enterMolecules(narrow: boolean) {
    installMatchMedia(narrow);
    const store = createAppStore();
    const utils = render(<Provider store={store}><App /></Provider>);
    if (narrow) fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // the phone's mode menu (spec §9.8) replaced the Mode toggle in the View tab
    // Unanchored: the item's name is "Molecules (molecule mode)" (WCAG
    // 2.5.3, label in name). Ruling R23a: on a desktop this is now the top
    // bar's own tab (a link); the phone's mode menu (opened above) still
    // renders it as a button.
    fireEvent.click(screen.getByRole(narrow ? 'button' : 'link', { name: /molecule mode/ }));
    await flush();
    return { store, ...utils };
}
/**
 * Task 12 (ruling P1): the molecule picker -- and with it the owner's Computed category chip -- is no longer
 * inline in the Explore panel; it is the popover under the header tile's "Change ▾". Opens it and returns it,
 * so a test asks about the chips where they are (a negative check on the panel alone would pass vacuously).
 */
function openPicker(side: HTMLElement): HTMLElement {
    fireEvent.click(within(side).getByRole('button', { name: /^(Change|Choose a) molecule$/ }));
    return screen.getByRole('dialog', { name: 'Choose a molecule' });
}

async function show(store: ReturnType<typeof createAppStore>, id: string) {
    act(() => { store.dispatch(selectMolecule({ id })); });
    await flush();
}

beforeEach(() => {
    (loadMoleculeIndex as jest.Mock).mockResolvedValue(LIBRARY_INDEX);
    (loadMoleculeMeta as jest.Mock).mockImplementation(async (id: string) =>
        (id === KEY ? waterMeta({ id, tier: 'computed', provenance: PROVENANCE, references: [] }) : waterMeta({ id })));
    mockApi.list.mockResolvedValue(listFixture('list_done'));
    mockApi.get.mockResolvedValue(jobFixture('get_done'));
});
afterEach(() => { resetBuildEnv(); jest.clearAllMocks(); window.localStorage.clear(); });

describe('Molecules mode with on-demand molecules', () => {
    it('a visitor sees how a molecule was computed and its tier, but no request panel, no Computed category and no cost', async () => {
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('button', { name: 'How this was computed' })).toBeInTheDocument();
        // Task 16 (ruling P12): on a desktop the request's entry is a button that opens the workspace.
        expect(within(side).queryByRole('button', { name: 'Request a new molecule' })).toBeNull();
        // Ruling R22c: the tier line moved from the canvas's legend stack into the title block.
        expect(container.querySelector('.viewport-title')).toHaveTextContent('Library');
        // Task 12: the categories are in the header tile's picker popover now.
        expect(within(openPicker(side)).queryByRole('button', { name: 'Computed' })).toBeNull();
        // Ruling R4-rec: a production build without sign-in shows visitors no owner plumbing.
        expect(screen.queryByText(/Owner sign-in/)).toBeNull();
        expect(mockApi.list).not.toHaveBeenCalled();
    });

    // Task 5's carry: the owner rule decides the Computed category and its
    // fetch, never the build alone -- a dev server set to AWS, or a
    // production build with sign-in, is a visitor until signed in.
    it.each([
        ['the dev server with jobs on AWS, not signed in', () => { BUILD_ENV.dev = true; window.localStorage.setItem(TARGET_STORAGE_KEY, 'aws'); }],
        ['a production build with sign-in, not signed in', () => { BUILD_ENV.cognito = COGNITO; }],
    ])('on %s: no Computed category, no list fetched, no request panel, no cost', async (_label, setUp) => {
        setUp();
        const { store, container } = await enterMolecules(false);
        await show(store, KEY);
        await flush();
        expect(mockApi.list).not.toHaveBeenCalled();
        expect(mockApi.get).not.toHaveBeenCalled();
        const side = container.querySelector('.side-panel') as HTMLElement;
        // Task 16 (ruling P12): on a desktop the request's entry is a button that opens the workspace.
        expect(within(side).queryByRole('button', { name: 'Request a new molecule' })).toBeNull();
        // Task 12: the categories are in the header tile's picker popover now.
        const picker = openPicker(side);
        expect(within(picker).getByRole('group', { name: 'molecule categories' })).toBeInTheDocument();
        expect(within(picker).queryByRole('button', { name: 'Computed' })).toBeNull();
        fireEvent.keyDown(picker, { key: 'Escape' });
        await flush();
        // Anyone may open a computed molecule's link, and is told what it is.
        // Ruling R22c: the tier line moved from the canvas's legend stack into the title block.
        expect(container.querySelector('.viewport-title')).toHaveTextContent('Computed');
        fireEvent.click(within(side).getByRole('button', { name: 'How this was computed' }));
        await flush();
        expect(screen.queryByText(/Owner only/)).toBeNull();
        expect(screen.queryByText(/Cost:/)).toBeNull();
    });

    it("gives the owner on the dev server, running on this Mac, the request panel and this month's Computed category", async () => {
        BUILD_ENV.dev = true;
        const { container } = await enterMolecules(false);
        await flush();
        expect(mockApi.list).toHaveBeenCalledWith(currentMonth(), 'DONE');
        const side = container.querySelector('.side-panel') as HTMLElement;
        // Task 16 (ruling P12): on a desktop the request's entry is a button that opens the workspace in the
        // viewport cell (the phone keeps the accordion, below). m5's rule still holds: one element carries the
        // id the entry's aria-controls names, and only while it is open.
        const entry = within(side).getByRole('button', { name: 'Request a new molecule' });
        expect(container.querySelectorAll('#request-body')).toHaveLength(0);
        expect(container.querySelectorAll(`#${entry.getAttribute('aria-controls')}`)).toHaveLength(0);
        fireEvent.click(entry);
        expect(container.querySelectorAll(`#${entry.getAttribute('aria-controls')}`)).toHaveLength(1);
        fireEvent.click(entry);
        expect(container.querySelectorAll(`#${entry.getAttribute('aria-controls')}`)).toHaveLength(0);
        // Task 12: the categories are in the header tile's picker popover now.
        const picker = openPicker(side);
        fireEvent.click(within(picker).getByRole('button', { name: 'Computed' }));
        expect(within(within(picker).getByRole('list', { name: 'molecules' })).getAllByRole('button')).toHaveLength(1);
        fireEvent.keyDown(picker, { key: 'Escape' });
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Owner sign-in' })); // the owner bar lives in the avatar menu now (ruling R15)
        expect(screen.getByRole('group', { name: 'where jobs run' })).toBeInTheDocument();
    });

    // Review M4 (Task 12): the owner's jobs section is part of the Explore order -- header tile, the surface
    // switch, Selection, then jobs -- inside the part that scrolls, with the footer pinned below it. (Owner R25-A3
    // removed the quick pick from after the tile.)
    it('puts the owner\'s jobs after Selection, inside the scrolling part of Explore', async () => {
        BUILD_ENV.dev = true;
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        await flush();
        const side = container.querySelector('.side-panel') as HTMLElement;
        const scroll = side.querySelector('.molecule-explore-scroll') as HTMLElement;
        const jobs = side.querySelector('.molecule-jobs') as HTMLElement;
        expect(jobs).not.toBeNull();
        const order = [
            side.querySelector('.molecule-tile') as HTMLElement,
            within(side).getByRole('group', { name: 'surface' }),
            within(side).getByText('Selection'),
            jobs,
            side.querySelector('.molecule-provenance-footer') as HTMLElement,
        ];
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        expect(scroll.contains(jobs)).toBe(true);
        expect(scroll.contains(order[order.length - 1])).toBe(false);
    });

    // Owner R25-A1: on This Mac, a job server that is not running is the usual state, not a fault -- one muted
    // line says so, with the command folded under "How to start it"; no warning-coloured alert box.
    it('says in one muted line that the local job server is not running, with how to start it folded (R25-A1)', async () => {
        BUILD_ENV.dev = true;
        mockApi.list.mockRejectedValue(new Error(LOCAL_SERVER_HINT));
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        await flush();
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).queryByRole('alert')).toBeNull();
        expect(side.querySelector('.MuiAlert-root')).toBeNull();
        expect(within(side).queryByText(/Could not list/)).toBeNull();
        const line = within(side).getByText('Computed molecules: the local job server isn’t running.');
        const details = line.closest('.local-server-note')!.querySelector('details') as HTMLDetailsElement;
        expect(details).not.toBeNull();
        expect(details.open).toBe(false);
        expect(within(details).getByText('How to start it').tagName).toBe('SUMMARY');
        expect(within(details).getByText('../tools/molecules/.venv/bin/python -m jobs.local_server').tagName).toBe('CODE');
        // The request entry is still offered beneath it.
        expect(within(side).getByRole('button', { name: 'Request a new molecule' })).toBeInTheDocument();
    });

    // Owner R25-A1: any other failure keeps today's honest alert -- on This Mac (a server that answered badly), on
    // the AWS target, and for the signed-in owner of a production build.
    it.each([
        ['This Mac, a server that answered badly', () => { BUILD_ENV.dev = true; },
            'The jobs API answered HTTP 418 without a readable error.', false],
        ['the dev server set to AWS, signed in', () => { BUILD_ENV.dev = true; BUILD_ENV.cognito = COGNITO; window.localStorage.setItem(TARGET_STORAGE_KEY, 'aws'); },
            'The dev proxy answered HTTP 502. AWS jobs are not configured on this dev server.', true],
        ['a production build, signed in', () => { BUILD_ENV.cognito = COGNITO; BUILD_ENV.jobsApiUrl = 'https://abc.execute-api.us-east-1.amazonaws.com'; },
            'The jobs API could not be reached: Failed to fetch', true],
    ])('keeps the warning alert for any other failure: %s (R25-A1)', async (_label, setUp, message, signIn) => {
        setUp();
        mockApi.list.mockRejectedValue(new Error(message));
        const { store, container } = await enterMolecules(false);
        if (signIn) act(() => { store.dispatch(sessionChanged({ signedIn: true, email: 'owner@example.com', groups: ['owners'] })); });
        await flush();
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(side.querySelector('.MuiAlert-standardWarning')).toHaveTextContent(`Could not list this month’s computed molecules: ${message}`);
        expect(within(side).queryByText(/local job server isn’t running/)).toBeNull();
    });

    it("says a computed molecule is computed, on the canvas, and gives the owner its time and cost", async () => {
        BUILD_ENV.dev = true;
        const { store, container } = await enterMolecules(false);
        await show(store, KEY);
        // Ruling R22c: the tier line moved from the canvas's legend stack into the title block.
        expect(container.querySelector('.viewport-title')).toHaveTextContent('Computed');
        fireEvent.click(screen.getByRole('button', { name: 'How this was computed' }));
        await flush();
        expect(screen.getByText(/Cost: spent \$0\.00 \(This Mac\)\./)).toBeInTheDocument();
    });

    // Preflight D12: spec §9.1's "always visible" -- with the structure off
    // and no key up, the stack used to vanish and take the badge with it.
    it('keeps the tier on screen with the structure off and no key showing', async () => {
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        act(() => { store.dispatch(setShowStructure(false)); });
        // Ruling R22c: the tier badge lives in the title block now, unaffected by showStructure.
        expect(container.querySelector('.viewport-title')).toHaveTextContent('Library');
    });

    // Preflight D13 / ruling T16-c: the phone's badge is the chip alone.
    it('on a phone, the badge is compact and still says what the tier means', async () => {
        const { store, container } = await enterMolecules(true);
        await show(store, 'h2o');
        // Ruling R22c: a phone has no viewport-title, so the compact badge rides in the phone header instead.
        const badge = within(container.querySelector('.phone-header') as HTMLElement).getByRole('note', { name: 'data tier' });
        expect(badge).toHaveClass('compact');
        // Final review I2: water's own line -- its dipole is checked; its geometry is experiment's.
        expect(badge).toHaveAccessibleDescription('Curated; geometry from experiment; dipole checked against published values.');
    });

    it('a link to a job that has not finished says so, and draws nothing', async () => {
        (loadMoleculeMeta as jest.Mock).mockRejectedValue(new MoleculeLoadError(RESULT_NOT_FINISHED));
        const { store, container } = await enterMolecules(false);
        await show(store, '0'.repeat(64));
        expect(screen.getByText(/This computed molecule has no finished result yet/)).toBeInTheDocument();
        // Ruling R22c: no meta loaded means no tier badge, wherever it would otherwise render.
        expect(container.querySelector('.tier-badge')).toBeNull();
    });

    it("puts the owner's panels in the phone's Explore tab", async () => {
        BUILD_ENV.dev = true;
        const { store } = await enterMolecules(true);
        await show(store, 'h2o');
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const sheet = screen.getByRole('tabpanel');
        expect(within(sheet).getByRole('button', { name: 'How this was computed' })).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'Request a molecule' })).toBeInTheDocument();
    });

    // Final review I2: tapping the open Explore tab folds the sheet and
    // unmounts the status panel; the job is still followed, and opens.
    it('on a phone, a followed job that finishes while the sheet is folded still opens in the viewer', async () => {
        BUILD_ENV.dev = true;
        const { store } = await enterMolecules(true);
        await show(store, 'h2o');
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        act(() => {
            store.dispatch(jobUpdated({ ...jobFixture('get_running'), key: KEY }));
            store.dispatch(followJob(KEY));
        });
        expect(within(screen.getByRole('tabpanel')).getByRole('region', { name: 'job status' })).toHaveTextContent('Running');
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        expect(screen.queryByRole('tabpanel')).toBeNull();
        expect(mockPoller.watch).toHaveBeenCalledWith(KEY);
        expect(mockRelease).not.toHaveBeenCalled();
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        await flush();
        expect(store.getState().molecule.selectedId).toBe(KEY);
    });

    it('on a phone, the request typed survives a switch to another tab and back', async () => {
        BUILD_ENV.dev = true;
        await enterMolecules(true);
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        fireEvent.click(screen.getByRole('button', { name: 'Request a molecule' }));
        // Fix round 1 (T16-M5): the accordion's own region is the one named "Request a molecule"; the panel adds none.
        expect(screen.getAllByRole('region', { name: /request a molecule/i })).toHaveLength(1);
        fireEvent.change(screen.getByRole('textbox', { name: /^molecule/ }), { target: { value: 'water' } });
        fireEvent.click(screen.getByRole('tab', { name: 'View' }));
        expect(screen.queryByRole('textbox', { name: /^molecule/ })).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        expect(screen.getByRole('textbox', { name: /^molecule/ })).toHaveValue('water');
    });

    // Task 16 (ruling P12): the request opens a workspace in the viewport cell, left of the canvas; while its
    // preview is drawn the view is titled as the preview, and nothing on screen describes it as the molecule.
    it('opens the request workspace in the viewport cell, and titles the preview on the canvas as a preview', async () => {
        BUILD_ENV.dev = true;
        mockApi.preview.mockResolvedValue(previewFixture('preview_ok'));
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        const side = container.querySelector('.side-panel') as HTMLElement;
        const viewportCell = container.querySelector('#canvas-container') as HTMLElement;
        expect(viewportCell.querySelector('.thumbnail-strip')).not.toBeNull();
        const entry = within(side).getByRole('button', { name: 'Request a new molecule' });
        fireEvent.click(entry);
        const workspace = within(viewportCell).getByRole('region', { name: 'Request a molecule' });
        expect(side.contains(workspace)).toBe(false);
        // The Tab order: the entry, then the workspace, then the viewport's toolbar.
        const toolbar = viewportCell.querySelector('.viewport-toolbar') as HTMLElement;
        expect(entry.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(workspace.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // The strip would describe the molecule, not the preview: it hides while the workspace is open.
        expect(viewportCell.querySelector('.thumbnail-strip')).toBeNull();
        expect(viewportCell.querySelector('.molecule-hover-caption')).toBeNull();

        fireEvent.change(within(workspace).getByRole('textbox', { name: 'molecule (Name)' }), { target: { value: 'water' } });
        fireEvent.click(within(workspace).getByRole('button', { name: 'Preview' }));
        await flush();
        const title = viewportCell.querySelector('.viewport-title') as HTMLElement;
        expect(within(title).getByRole('heading', { level: 1 })).toHaveTextContent('Preview — H₂O');
        expect(title).toHaveTextContent('resolved structure, not yet computed');
        // The library line and the surface keys belong to the molecule the preview has replaced on the canvas.
        expect(title.querySelector('.tier-badge')).toBeNull();
        expect(viewportCell.querySelector('.key-column')).toBeNull();
        // Properties is still the molecule's, and says so.
        expect(screen.getByText('The view shows the request’s preview; these are Water’s properties.')).toBeInTheDocument();

        fireEvent.keyDown(within(workspace).getByRole('textbox', { name: 'molecule (Name)' }), { key: 'Escape' });
        await flush();                                   // the entry's focus ripple mounts lazily
        expect(within(viewportCell).queryByRole('region', { name: 'Request a molecule' })).toBeNull();
        expect(entry).toHaveFocus();
        expect(within(title).getByRole('heading', { level: 1 })).toHaveTextContent('Water');
        expect(title.querySelector('.tier-badge')).not.toBeNull();
        expect(viewportCell.querySelector('.thumbnail-strip')).not.toBeNull();
        expect(screen.queryByText(/these are Water’s properties/)).toBeNull();
    });

    // Fix round 1 (T16-M1): choosing another molecule closes the workspace and the canvas shows that molecule --
    // from the picker (the quick pick until owner R25-A3 removed it), and when a followed job finishes and opens.
    it('closes the request workspace when another molecule is chosen: the picker, or a followed job that finishes', async () => {
        BUILD_ENV.dev = true;
        mockApi.preview.mockResolvedValue(previewFixture('preview_ok'));
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        const side = container.querySelector('.side-panel') as HTMLElement;
        const viewportCell = container.querySelector('#canvas-container') as HTMLElement;
        const preview = async () => {
            fireEvent.click(within(side).getByRole('button', { name: 'Request a new molecule' }));
            const workspace = within(viewportCell).getByRole('region', { name: 'Request a molecule' });
            fireEvent.change(within(workspace).getByRole('textbox', { name: 'molecule (Name)' }), { target: { value: 'water' } });
            fireEvent.click(within(workspace).getByRole('button', { name: 'Preview' }));
            await flush();
            expect(store.getState().jobs.request.previewAtoms).not.toBeNull();
        };
        await preview();
        fireEvent.click(within(openPicker(side)).getByRole('button', { name: /Ammonia/ }));
        await flush();
        expect(store.getState().molecule.selectedId).toBe('nh3');
        expect(within(viewportCell).queryByRole('region', { name: 'Request a molecule' })).toBeNull();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();
        expect(within(viewportCell.querySelector('.viewport-title') as HTMLElement).getByRole('heading', { level: 1 })).not.toHaveTextContent('Preview');

        await preview();
        act(() => {
            store.dispatch(jobUpdated({ ...jobFixture('get_running'), key: KEY }));
            store.dispatch(followJob(KEY));
        });
        act(() => { store.dispatch(jobUpdated(jobFixture('get_done'))); });
        await flush();
        expect(store.getState().molecule.selectedId).toBe(KEY);
        expect(within(viewportCell).queryByRole('region', { name: 'Request a molecule' })).toBeNull();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();
    });

    // Task 16d item 9 (Task 16 re-review): re-picking the molecule already chosen -- Water from the picker (the quick
    // pick until owner R25-A3) under a water preview -- reloads it behind the preview; the workspace closes for it too.
    it('closes the request workspace when the molecule already chosen is picked again', async () => {
        BUILD_ENV.dev = true;
        mockApi.preview.mockResolvedValue(previewFixture('preview_ok'));
        const { store, container } = await enterMolecules(false);
        await show(store, 'h2o');
        const side = container.querySelector('.side-panel') as HTMLElement;
        const viewportCell = container.querySelector('#canvas-container') as HTMLElement;
        fireEvent.click(within(side).getByRole('button', { name: 'Request a new molecule' }));
        const workspace = within(viewportCell).getByRole('region', { name: 'Request a molecule' });
        fireEvent.change(within(workspace).getByRole('textbox', { name: 'molecule (Name)' }), { target: { value: 'water' } });
        fireEvent.click(within(workspace).getByRole('button', { name: 'Preview' }));
        await flush();
        expect(store.getState().jobs.request.previewAtoms).not.toBeNull();
        const nonce = store.getState().molecule.loadNonce;
        // The library's Water, the row marked current (the owner's list also holds a computed Water).
        fireEvent.click(within(openPicker(side)).getAllByRole('button', { name: 'H₂O Water' }).find(row => row.classList.contains('Mui-selected'))!);
        await flush();
        expect(store.getState().molecule.selectedId).toBe('h2o');
        expect(store.getState().molecule.loadNonce).toBe(nonce + 1);
        expect(within(viewportCell).queryByRole('region', { name: 'Request a molecule' })).toBeNull();
        expect(store.getState().jobs.request.previewAtoms).toBeNull();
    });

    it('says an ended session, with the way back, rather than hiding the request panel silently', async () => {
        BUILD_ENV.cognito = COGNITO;
        const { store, container } = await enterMolecules(false);
        // The owner group claim (selectIsOwner needs it since the owner-group check, 2026-10-15).
        act(() => { store.dispatch(sessionChanged({ signedIn: true, email: 'owner@example.com', groups: ['owners'] })); });
        await flush();
        act(() => { store.dispatch(sessionExpired()); });
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(within(side).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    // V4: the production owner -- signed in through Cognito, no dev server.
    it('gives the signed-in owner of a production build the request panel, the Computed category and the dashboard link', async () => {
        BUILD_ENV.cognito = COGNITO;
        BUILD_ENV.jobsApiUrl = 'https://abc.execute-api.us-east-1.amazonaws.com';
        const { store, container } = await enterMolecules(false);
        expect(mockApi.list).not.toHaveBeenCalled();
        // The owner group claim (selectIsOwner needs it since the owner-group check, 2026-10-15).
        act(() => { store.dispatch(sessionChanged({ signedIn: true, email: 'owner@example.com', groups: ['owners'] })); });
        await flush();
        expect(mockApi.list).toHaveBeenCalledWith(currentMonth(), 'DONE');
        const side = container.querySelector('.side-panel') as HTMLElement;
        // Task 16 (ruling P12): on a desktop the request's entry is a button that opens the workspace.
        expect(within(side).getByRole('button', { name: 'Request a new molecule' })).toBeInTheDocument();
        // Task 12: the categories are in the header tile's picker popover now.
        const picker = openPicker(side);
        expect(within(picker).getByRole('button', { name: 'Computed' })).toBeInTheDocument();
        fireEvent.keyDown(picker, { key: 'Escape' });
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Owner menu, signed in as owner@example.com' })); // ruling R15
        expect(screen.getByText(/Signed in as owner@example.com/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin.html');
        expect(screen.queryByRole('group', { name: 'where jobs run' })).toBeNull();
    });

    // The brief, 2026-10-15: a signed-in user with no `owners` group claim is
    // refused by the server (tools/jobs/lambdas.py); the UI must not offer
    // controls that would only end in a 403.
    it('gives a signed-in non-owner no request panel, no Computed category and no dashboard link', async () => {
        BUILD_ENV.cognito = COGNITO;
        BUILD_ENV.jobsApiUrl = 'https://abc.execute-api.us-east-1.amazonaws.com';
        const { store, container } = await enterMolecules(false);
        act(() => { store.dispatch(sessionChanged({ signedIn: true, email: 'visitor@example.com', groups: [] })); });
        await flush();
        expect(mockApi.list).not.toHaveBeenCalled();
        const side = container.querySelector('.side-panel') as HTMLElement;
        // Task 16 (ruling P12): on a desktop the request's entry is a button that opens the workspace.
        expect(within(side).queryByRole('button', { name: 'Request a new molecule' })).toBeNull();
        // Task 12: the categories are in the header tile's picker popover now.
        const picker = openPicker(side);
        expect(within(picker).getByRole('group', { name: 'molecule categories' })).toBeInTheDocument();
        expect(within(picker).queryByRole('button', { name: 'Computed' })).toBeNull();
        fireEvent.keyDown(picker, { key: 'Escape' });
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Owner menu, signed in as visitor@example.com' }));
        expect(screen.getByText(/Signed in — this account is not an owner/)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    });
});

// Final review I3: Cognito comes back to / with no hash, so the default
// (atom) mode is on screen, where no OwnerBar is -- the failure must still be said.
describe('a sign-in that did not complete', () => {
    afterEach(() => { setOwnerAuthForTests(null); window.history.replaceState(null, '', '/'); });

    it('is said on whatever screen the owner lands on, once, and can be dismissed', async () => {
        BUILD_ENV.cognito = COGNITO;
        window.history.replaceState(null, '', '/?error=access_denied&error_description=Visit+evil.example');
        installMatchMedia(false);
        const store = createAppStore();
        await startOwnerSession(store.dispatch, '/');
        render(<Provider store={store}><App /></Provider>);
        expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_FAILED);
        expect(screen.queryByText(/evil/)).toBeNull();
        // Unanchored: the item's name is "Molecules (molecule mode)" (WCAG
        // 2.5.3, label in name). Ruling R23a: the desktop mode switch is now
        // the top bar's own tab (a link), not the rail's button.
        fireEvent.click(screen.getByRole('link', { name: /molecule mode/ }));
        await flush();
        expect(screen.getAllByText(SIGN_IN_FAILED)).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByText(SIGN_IN_FAILED)).toBeNull();
        expect(store.getState().jobs.session.error).toBeNull();
    });
});
