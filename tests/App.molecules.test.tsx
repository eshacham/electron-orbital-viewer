// tests/App.molecules.test.tsx -- Molecules mode assembled in the app (Task 16).
import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../src/store';
import {
    selectMolecule, metaLoaded, metaFailed, setSurface, renderStarted, renderFinished, renderFailed,
} from '../src/store/moleculeSlice';
import { setSurfaceStyle } from '../src/store/orbitalSlice';
import { resetUrlKeysForTests, registerBuiltInUrlKeys, applyStateTo } from '../src/url_state';
import { registerMoleculeUrlKeys } from '../src/molecules/url_keys';
import { PHONE_LANDSCAPE } from '../src/useMediaQuery';
import App from '../src/App';
import { LIBRARY_INDEX, waterMeta } from './molecules/fixtures';

jest.mock('../src/components/OrbitalViewer', () => ({ __esModule: true, default: () => <div data-testid="orbital-viewer" /> }));
jest.mock('../src/orbital_visualizer', () => ({}));
// D17: App.test.tsx's worker mocks -- each of these modules reads
// import.meta.url, which this project's ts-jest cannot parse.
jest.mock('../src/workers/createAtomWorker', () => ({
    createAtomWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null })),
}));
jest.mock('../src/workers/createExportWorker', () => ({ createExportWorker: jest.fn() }));
jest.mock('../src/workers/createH2PlusCurveWorker', () => ({
    createH2PlusCurveWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null })),
}));
jest.mock('../src/workers/createGridMeshWorker', () => ({ createGridMeshWorker: jest.fn() }));
jest.mock('../src/molecules/loader', () => ({
    ...jest.requireActual('../src/molecules/loader'),
    loadMoleculeIndex: jest.fn(async () => LIBRARY_INDEX),
    loadMoleculeMeta: jest.fn(async () => waterMeta()),
    loadDensityGrid: jest.fn(),
}));

function installMatchMedia(narrow: boolean, landscape = false) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
        media, matches: media === PHONE_LANDSCAPE ? landscape : narrow, addEventListener: () => {}, removeEventListener: () => {},
    });
}
// D17 / D36: the app's own store, so every slice App reads (bonds too) is there.
const makeStore = () => createAppStore();
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

async function enterMolecules(narrow: boolean, { landscape = false, before }: { landscape?: boolean; before?: (store: ReturnType<typeof makeStore>) => void } = {}) {
    installMatchMedia(narrow, landscape);
    const store = makeStore();
    before?.(store);
    const utils = render(<Provider store={store}><App /></Provider>);
    if (narrow) fireEvent.click(screen.getByRole('tab', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
    await flush();
    return { store, ...utils };
}

/** Water chosen and its meta in -- what the loader would have done. */
function pickWater(store: ReturnType<typeof makeStore>, meta = waterMeta()) {
    act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta })); });
}

describe('Molecules mode', () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => { window.matchMedia = originalMatchMedia; });

    it('puts the picker in the left column on a desktop, and the view settings on the right', async () => {
        const { container } = await enterMolecules(false);
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).getByRole('list', { name: 'molecules' })).toBeInTheDocument();
        expect(within(container.querySelector('.view-panel') as HTMLElement).getByText(/Opacity/)).toBeInTheDocument();
    });

    it('offers the picker from the phone header and in the Explore tab', async () => {
        const { container } = await enterMolecules(true);
        const header = container.querySelector('.phone-header') as HTMLElement;
        fireEvent.click(within(header).getByRole('button', { name: 'Choose a molecule' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('Choose a molecule');
        fireEvent.click(screen.getByRole('button', { name: 'close molecule picker' }));
        // The dialog's exit transition keeps the page aria-hidden until it is gone.
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        expect(screen.getByText('Browse molecules')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Plot' })).toBeInTheDocument();
    });

    it('names the molecule in the phone header once picked, and lists its orbitals in the Plot tab', async () => {
        const { store, container } = await enterMolecules(true);
        fireEvent.click(within(container.querySelector('.phone-header') as HTMLElement).getByRole('button', { name: 'Choose a molecule' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Water'));
        await flush();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(store.getState().molecule.selectedId).toBe('h2o');
        expect(within(container.querySelector('.phone-header') as HTMLElement)
            .getByRole('button', { name: 'Change molecule, currently Water' })).toHaveTextContent('Water · H₂O ▾');
        fireEvent.click(screen.getByRole('tab', { name: 'Plot' }));
        expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: /1b1/ })).toBeInTheDocument();
    });

    it('locks the contour to ρ = 0.001 for the ESP map, and shows its key', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); store.dispatch(renderFinished({ isoLevel: 0.001, espRange: [-0.06, 0.07] })); });
        expect(container.textContent).toMatch(/Fixed at ρ = 0\.001 e\/a₀³/);
        expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByLabelText('electrostatic potential colour key')).toBeInTheDocument();
        expect(screen.queryByLabelText('surface colour key')).toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
        expect(screen.queryByLabelText('electrostatic potential colour key')).toBeNull();
    });

    // D22: the density and an MO keep the enclosed fraction, and the helper
    // states the contour it produced -- without disabling the select.
    it('states the drawn ρ for the density and |ψ|² for an orbital, leaving the fraction live', async () => {
        const { store } = await enterMolecules(false);
        pickWater(store);
        act(() => { store.dispatch(renderFinished({ isoLevel: 0.00234 })); });
        expect(screen.getByText('ρ = 2.34e-3 e/a₀³')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /electron enclosed/i })).not.toHaveAttribute('aria-disabled');
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); store.dispatch(renderStarted('Computing 1b1…')); });
        // Mid-render the last contour belongs to the density, so it is not labelled as |ψ|².
        expect(screen.queryByText(/2\.34e-3/)).toBeNull();
        act(() => { store.dispatch(renderFinished({ isoLevel: 0.0005 })); });
        expect(screen.getByText('|ψ|² = 5.00e-4')).toBeInTheDocument();
    });

    // Ruling D23: the Plot slot is the energy-sorted orbital list, not MoDiagram.
    it('shows the orbital list where the other modes show their plot, and picking one draws it', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(viewPanel.querySelector('.mo-diagram')).toBeNull();
        const card = viewPanel.querySelector('.molecule-orbital-card') as HTMLElement;
        expect(card).not.toBeNull();
        fireEvent.click(within(card).getByRole('button', { name: /1b1/ }));
        expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 4 });
    });

    it('puts the structure and dipole switches, and ozone\'s caveat, in the view settings', async () => {
        const { store, container } = await enterMolecules(false);
        act(() => {
            store.dispatch(selectMolecule({ id: 'o3' }));
            store.dispatch(metaLoaded({ id: 'o3', meta: waterMeta({ id: 'o3', name: 'Ozone', caveat: 'Ozone has strong multireference character.' }) }));
        });
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(within(viewPanel).getByLabelText('Ball-and-stick')).toBeInTheDocument();
        expect(within(viewPanel).getByText(/μ = 1\.86 D .*Ozone has strong multireference character\./)).toBeInTheDocument();
    });

    it('does not start a hydrogen calculation, and lowers an untouched full opacity so the structure shows', async () => {
        const { store } = await enterMolecules(false);
        expect(store.getState().orbital.isLoading).toBe(false);
        expect(store.getState().orbital.currentParams).toBeNull();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
    });

    it('lowers full opacity on the way in from Basic Orbitals too', async () => {
        installMatchMedia(false);
        const store = makeStore();
        render(<Provider store={store}><App /></Provider>);
        fireEvent.click(screen.getByRole('button', { name: 'basic orbitals mode' }));
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(1);
        fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
        await flush();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
    });

    it('leaves an opacity the user chose alone on the way in', async () => {
        const { store } = await enterMolecules(false, { before: s => s.dispatch(setSurfaceStyle({ opacity: 0.4 })) });
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.4);
    });

    // Final review I1: the lowered opacity is Molecules' own, so leaving
    // gives the other modes their full opacity back.
    it('restores the full opacity it lowered on the way out', async () => {
        const { store } = await enterMolecules(false);
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
        fireEvent.click(screen.getByRole('button', { name: 'atom mode' }));
        await flush();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(1);
    });

    it('keeps an opacity the user chose inside Molecules on the way out', async () => {
        const { store } = await enterMolecules(false);
        act(() => { store.dispatch(setSurfaceStyle({ opacity: 0.4 })); });
        fireEvent.click(screen.getByRole('button', { name: 'atom mode' }));
        await flush();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.4);
    });

    it('does not raise an opacity it did not lower', async () => {
        installMatchMedia(false);
        const store = makeStore();
        act(() => { store.dispatch(setSurfaceStyle({ opacity: 0.6 })); });
        render(<Provider store={store}><App /></Provider>);
        fireEvent.click(screen.getByRole('button', { name: 'molecule mode' }));
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'atom mode' }));
        await flush();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
    });

    // Review (Important): a shared link is applied before the first render,
    // so a link's op=1 is the link's choice -- mounting into Molecules mode
    // is not "entering" it.
    describe('opened from a shared link', () => {
        beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); registerMoleculeUrlKeys(); });
        afterEach(() => { resetUrlKeysForTests(); window.history.replaceState(null, '', '/'); });

        it('keeps the link\'s full opacity', async () => {
            installMatchMedia(false);
            const hash = '#mode=molecule&id=h2o&op=1';
            window.history.replaceState(null, '', `/${hash}`);
            const store = makeStore();
            applyStateTo(hash, store.dispatch);
            expect(store.getState().atom.mode).toBe('molecule');
            render(<Provider store={store}><App /></Provider>);
            await flush();
            expect(store.getState().orbital.surfaceStyle.opacity).toBe(1);
        });
    });

    // Ruling T16-a: the list appears once on a desktop, in the plot slot.
    it('lists the orbitals once on a desktop, in the right-hand column', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(container.querySelectorAll('.molecule-orbital-list')).toHaveLength(1);
        expect(container.querySelector('.view-panel .molecule-orbital-list')).not.toBeNull();
        expect(container.querySelector('.side-panel .molecule-nav-orbital')).toHaveTextContent('Showing 1b1 (HOMO)');
    });

    // Ruling T16-c: a sideways phone gets the compact ESP key.
    it('uses the compact ESP key on a sideways phone only', async () => {
        const { store, container, unmount } = await enterMolecules(true, { landscape: true });
        pickWater(store);
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
        expect(container.querySelector('.esp-legend.compact')).not.toBeNull();
        unmount();
        const upright = await enterMolecules(true);
        pickWater(upright.store);
        act(() => { upright.store.dispatch(setSurface({ kind: 'esp' })); });
        expect(upright.container.querySelector('.esp-legend')).not.toBeNull();
        expect(upright.container.querySelector('.esp-legend.compact')).toBeNull();
    });

    // Review Minor 3: on a phone the error joins the key stack (under the
    // header) instead of sitting over the readout chip at top: 80px.
    it('puts a failed surface\'s alert in the key stack on a phone, and over the canvas on a desktop', async () => {
        const phone = await enterMolecules(true);
        pickWater(phone.store);
        act(() => { phone.store.dispatch(renderFailed('HTTP 404')); });
        expect(phone.container.querySelector('.molecule-legend-stack [role="alert"]')).not.toBeNull();
        phone.unmount();
        const desk = await enterMolecules(false);
        pickWater(desk.store);
        act(() => { desk.store.dispatch(renderFailed('HTTP 404')); });
        expect(desk.container.querySelector('.molecule-legend-stack [role="alert"]')).toBeNull();
        expect(screen.getByRole('alert')).toHaveTextContent('HTTP 404');
    });

    it('says on the canvas what it is drawing', async () => {
        const { store } = await enterMolecules(false);
        pickWater(store);
        act(() => { store.dispatch(renderStarted('Loading Water…')); });
        await act(async () => { await new Promise(r => setTimeout(r, 450)); });
        expect(document.querySelector('.canvas-busy')).toHaveTextContent('Loading Water…');
    });

    // Task 15's carry: a failed surface must be an explicit message over the
    // canvas (spec §3.5), and, as Bonds' ruling C9, never a Snackbar too.
    it('shows a failed render as an alert over the canvas, without a snackbar', async () => {
        const { store } = await enterMolecules(false);
        pickWater(store);
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); store.dispatch(renderFailed('Could not load /molecules/v2/h2o/esp.bin.gz (HTTP 404)')); });
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Could not draw the electrostatic potential');
        expect(alert).toHaveTextContent('HTTP 404');
        expect(document.querySelector('.MuiSnackbar-root')).toBeNull();
        // The surface was cleared, so no key describes it.
        expect(screen.queryByLabelText('electrostatic potential colour key')).toBeNull();
    });

    it('shows a molecule that fails to load as an alert, without a snackbar', async () => {
        const { store } = await enterMolecules(false);
        act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaFailed({ id: 'h2o', message: 'HTTP 403' })); });
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load “h2o”: HTTP 403');
        expect(document.querySelector('.MuiSnackbar-root')).toBeNull();
    });
});
