import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from './store';
import { selectMolecule, setShowStructure } from './store/moleculeSlice';
import { sessionChanged, sessionExpired, TARGET_STORAGE_KEY } from './store/jobsSlice';
import { BUILD_ENV } from './jobs/build_env';
import { SESSION_ENDED } from './jobs/api';
import { currentMonth } from './jobs/format';
import { loadMoleculeIndex, loadMoleculeMeta, MoleculeLoadError, RESULT_NOT_FINISHED } from './molecules/loader';
import type { MoleculeProvenance } from './molecules/types';
import { TIER_TEXT } from './components/TierBadge';
import { resetBuildEnv } from '../tests/jobs/build_env_stub';
import { jobFixture, listFixture } from '../tests/jobs/api_fixtures';
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
jest.mock('./jobs/client', () => ({
    jobsApi: () => mockApi,
    jobsPoller: () => ({ watch: () => () => undefined, restart: () => undefined }),
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
    if (narrow) fireEvent.click(screen.getByRole('tab', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
    await flush();
    return { store, ...utils };
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
        expect(within(side).queryByRole('button', { name: 'Request a molecule' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Computed' })).toBeNull();
        expect(container.querySelector('.molecule-legend-stack')).toHaveTextContent('Validated');
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
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
        expect(within(side).queryByRole('button', { name: 'Computed' })).toBeNull();
        expect(within(side).queryByRole('button', { name: 'Request a molecule' })).toBeNull();
        // Anyone may open a computed molecule's link, and is told what it is.
        expect(container.querySelector('.molecule-legend-stack')).toHaveTextContent('Computed');
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
        expect(within(side).getByRole('button', { name: 'Request a molecule' })).toBeInTheDocument();
        fireEvent.click(within(side).getByRole('button', { name: 'Computed' }));
        expect(within(within(side).getByRole('list', { name: 'molecules' })).getAllByRole('button')).toHaveLength(1);
        expect(screen.getByRole('group', { name: 'where jobs run' })).toBeInTheDocument();
    });

    it("says a computed molecule is computed, on the canvas, and gives the owner its time and cost", async () => {
        BUILD_ENV.dev = true;
        const { store, container } = await enterMolecules(false);
        await show(store, KEY);
        expect(container.querySelector('.molecule-legend-stack')).toHaveTextContent('Computed');
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
        expect(container.querySelector('.molecule-legend-stack')).toHaveTextContent('Validated');
    });

    // Preflight D13 / ruling T16-c: the phone's badge is the chip alone.
    it('on a phone, the badge is compact and still says what the tier means', async () => {
        const { store, container } = await enterMolecules(true);
        await show(store, 'h2o');
        const badge = within(container.querySelector('.molecule-legend-stack') as HTMLElement).getByRole('note', { name: 'data tier' });
        expect(badge).toHaveClass('compact');
        expect(badge).toHaveAccessibleDescription(TIER_TEXT.validated.line);
    });

    it('a link to a job that has not finished says so, and draws nothing', async () => {
        (loadMoleculeMeta as jest.Mock).mockRejectedValue(new MoleculeLoadError(RESULT_NOT_FINISHED));
        const { store, container } = await enterMolecules(false);
        await show(store, '0'.repeat(64));
        expect(screen.getByText(/This computed molecule has no finished result yet/)).toBeInTheDocument();
        expect(container.querySelector('.molecule-legend-stack')).toBeNull();
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

    it('says an ended session, with the way back, rather than hiding the request panel silently', async () => {
        BUILD_ENV.cognito = COGNITO;
        const { store, container } = await enterMolecules(false);
        act(() => { store.dispatch(sessionChanged({ signedIn: true, email: 'owner@example.com' })); });
        await flush();
        act(() => { store.dispatch(sessionExpired()); });
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('alert')).toHaveTextContent(SESSION_ENDED);
        expect(within(side).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });
});
