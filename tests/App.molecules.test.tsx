// tests/App.molecules.test.tsx -- Molecules mode assembled in the app (Task 16).
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../src/store';
import {
    selectMolecule, metaLoaded, metaFailed, setSurface, renderStarted, renderFinished, renderFailed, setPick,
} from '../src/store/moleculeSlice';
import { setGlowExtrasSuppressed, setSurfaceStyle } from '../src/store/orbitalSlice';
import { resetUrlKeysForTests, registerBuiltInUrlKeys, applyStateTo } from '../src/url_state';
import { registerMoleculeUrlKeys } from '../src/molecules/url_keys';
import { MEDIUM_VIEWPORT, PHONE_LANDSCAPE } from '../src/useMediaQuery';
import App from '../src/App';
import { LIBRARY_INDEX, waterMeta } from './molecules/fixtures';
import { thumbnailService } from '../src/thumbs/ThumbnailService';
import { setMode } from '../src/store/atomSlice';
import { clearGridCache } from '../src/molecules/grid_cache';

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
// Task 15: the strip's density, ESP and orbital tiles need the molecule's density grid, ESP grid and basis. Unless
// a test asks for them (the strip's own, below) they never land, so no other test sees a late, un-awaited update.
// A function, not a const arrow: the mock factories are hoisted above this line and call it only later.
function never(): Promise<never> { return new Promise(() => {}); }
jest.mock('../src/molecules/loader', () => ({
    ...jest.requireActual('../src/molecules/loader'),
    loadMoleculeIndex: jest.fn(async () => LIBRARY_INDEX),
    loadMoleculeMeta: jest.fn(async () => waterMeta()),
    loadDensityGrid: jest.fn(() => never()),
    loadBasis: jest.fn(() => never()),
}));
jest.mock('../src/molecules/esp', () => ({
    ...jest.requireActual('../src/molecules/esp'),
    loadEspGrid: jest.fn(() => never()),
}));

// R25-A fix round: `medium` is a tablet (MEDIUM_VIEWPORT matches, nothing narrow).
function installMatchMedia(narrow: boolean, landscape = false, medium = false) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
        media, matches: media === PHONE_LANDSCAPE ? landscape : media === MEDIUM_VIEWPORT ? (medium || narrow) : narrow,
        addEventListener: () => {}, removeEventListener: () => {},
    });
}
// D17 / D36: the app's own store, so every slice App reads (bonds too) is there.
const makeStore = () => createAppStore();
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

async function enterMolecules(narrow: boolean, { landscape = false, medium = false, before }: { landscape?: boolean; medium?: boolean; before?: (store: ReturnType<typeof makeStore>) => void } = {}) {
    installMatchMedia(narrow, landscape, medium);
    const store = makeStore();
    before?.(store);
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
 * Task 12 (rulings P10, R24-3): with a molecule loaded the inspector has a Properties section, and with nothing
 * stored that content section is the open one -- so a test that reads Display's controls opens Display first,
 * as a viewer would.
 */
function openDisplay(container: HTMLElement) {
    const display = within(container.querySelector('.view-panel') as HTMLElement).getByRole('button', { name: 'Display' });
    if (display.getAttribute('aria-expanded') !== 'true') fireEvent.click(display);
}

/** Water chosen and its meta in -- what the loader would have done. */
function pickWater(store: ReturnType<typeof makeStore>, meta = waterMeta()) {
    act(() => { store.dispatch(selectMolecule({ id: 'h2o' })); store.dispatch(metaLoaded({ id: 'h2o', meta })); });
}

describe('Molecules mode', () => {
    // Task 2: these tests work controls above the default Explore level (the enclosed fraction, Advanced appearance).
    beforeEach(() => { window.localStorage.setItem('eov.level', 'research'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); });
    const originalMatchMedia = window.matchMedia;
    // The open inspector section is a stored preference (R24-3); each test starts from none.
    afterEach(() => { window.matchMedia = originalMatchMedia; window.localStorage.removeItem('eov.display'); });

    // Task 12 (ruling P1): the picker is no longer inline in the left column -- it hangs, as a popover, under
    // the header tile's "Change ▾" (spec §9.4 "in a popover"). Owner R25-A3: the quick pick under the tile is gone
    // (its thumbnails are in the picker's rows now), so this asserts its absence instead of its presence.
    it('puts the picker in the left column on a desktop, and the view settings on the right', async () => {
        const { container } = await enterMolecules(false);
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(within(side).queryByRole('list', { name: 'molecules' })).toBeNull();
        expect(within(side).queryByRole('group', { name: 'Quick pick' })).toBeNull();
        expect(side.querySelector('.quick-pick')).toBeNull();
        fireEvent.click(within(side).getByRole('button', { name: 'Choose a molecule' }));
        expect(within(screen.getByRole('dialog', { name: 'Choose a molecule' })).getByRole('list', { name: 'molecules' })).toBeInTheDocument();
        expect(within(container.querySelector('.view-panel') as HTMLElement).getByText(/Opacity/)).toBeInTheDocument();
    });

    // Task 12 (ruling P1): Explore reads header tile → the surface switch (and its list) → Selection → jobs. Owner
    // R25-A3 removed the quick pick from between the tile and the switch; ruling PF5 the footer pinned below.
    it('heads Explore with the molecule tile, above the surface switch and Selection (desktop)', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush(); // the loader's own meta request settles (no act warning)
        const side = container.querySelector('.side-panel') as HTMLElement;
        const order = [
            side.querySelector('.molecule-tile') as HTMLElement,
            within(side).getByRole('group', { name: 'Surface' }) /* R25-A4: named by its visible label */,
            within(side).getByText('Selection'),
        ];
        // (The jobs section, owner-only, renders nothing here; its place after Selection is App's markup.)
        order.forEach(node => expect(node).not.toBeNull());
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        expect(within(side.querySelector('.molecule-tile') as HTMLElement).getByText('Water')).toBeInTheDocument();
        // The tier is said once, in the title block (R22c), not again in the tile.
        expect((side.querySelector('.molecule-tile') as HTMLElement).querySelector('.tier-badge')).toBeNull();
        // Ruling PF5 (Task 7b): no footer is pinned under the part that scrolls -- "How this was computed" is Info's.
        const scroll = side.querySelector('.molecule-explore-scroll') as HTMLElement;
        expect(scroll.contains(side.querySelector('.molecule-tile'))).toBe(true);
        expect(side.querySelector('.molecule-provenance-footer')).toBeNull();
    });

    // Owner R25-A3: the second choice was a quick-pick tile; with the quick pick gone, it is the popover again, whose
    // rows now carry the thumbnails the tiles had and mark the current molecule.
    it('chooses a molecule from the header\'s popover, whose rows show the structure thumbnails', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        const side = container.querySelector('.side-panel') as HTMLElement;
        fireEvent.click(within(side).getByRole('button', { name: 'Change molecule' }));
        const popover = screen.getByRole('dialog', { name: 'Choose a molecule' });
        fireEvent.click(within(within(popover).getByRole('list', { name: 'molecules' })).getByRole('button', { name: /Ozone/ }));
        await flush(); // the loader's meta request settles
        expect(store.getState().molecule.selectedId).toBe('o3');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.click(within(side).getByRole('button', { name: 'Change molecule' }));
        const again = screen.getByRole('dialog', { name: 'Choose a molecule' });
        const ammonia = within(again).getByRole('button', { name: 'NH₃ Ammonia' });
        expect(ammonia.querySelector('img')).toHaveAttribute('alt', 'Ball-and-stick model of Ammonia');
        fireEvent.click(ammonia);
        await flush();
        expect(store.getState().molecule.selectedId).toBe('nh3');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.click(within(side).getByRole('button', { name: 'Change molecule' }));
        expect(within(screen.getByRole('dialog', { name: 'Choose a molecule' })).getByRole('button', { name: 'NH₃ Ammonia' }))
            .toHaveClass('Mui-selected');
    });

    // Task 12 (rulings P10, R24-3): the inspector's sections are Display and Properties; with nothing stored,
    // the content section (Properties) is the open one and Display is folded.
    it('adds a Properties section to the inspector after Display, open by default', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush(); // the loader's own meta request settles (no act warning)
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(Array.from(viewPanel.querySelectorAll('.inspector-section-toggle')).map(header => header.textContent))
            .toEqual(['Display', 'Properties']);
        // Task 4: Info is always open above the accordion, not one of its toggles -- a heading of its own, first.
        const info = within(viewPanel).getByRole('heading', { level: 2, name: 'Info' });
        expect(info.compareDocumentPosition(within(viewPanel).getByRole('button', { name: 'Display' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const display = within(viewPanel).getByRole('button', { name: 'Display' });
        const properties = within(viewPanel).getByRole('button', { name: 'Properties' });
        expect(display.compareDocumentPosition(properties) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(properties).toHaveAttribute('aria-expanded', 'true');
        expect(display).toHaveAttribute('aria-expanded', 'false');
        const region = within(viewPanel).getByRole('region', { name: 'Properties' });
        // Task 7b fix round 1 (ruling on concern 4): the point group and the gap are Info's facts; the card keeps what
        // Info does not show.
        expect(within(region).getByText('Multiplicity')).toBeInTheDocument();
        expect(within(region).getByText('Data tier')).toBeInTheDocument();
        expect(within(region).queryByText('Point group')).toBeNull();
        expect(within(region).queryByText('HOMO–LUMO gap')).toBeNull();
    });

    // Ruling T12-I1: while a molecule is chosen, Properties stays a section -- "Loading…" until its meta arrives --
    // so a molecule change never folds the open section to Display and back.
    it('keeps Properties the open section across a molecule change, loading then filled', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        const properties = () => within(viewPanel).getByRole('button', { name: 'Properties' });
        expect(properties()).toHaveAttribute('aria-expanded', 'true');
        // Another molecule, its meta load held pending until the test lets it land.
        const loader = jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock };
        let land: (meta: ReturnType<typeof waterMeta>) => void = () => {};
        loader.loadMoleculeMeta.mockImplementationOnce(() => new Promise(resolve => { land = resolve; }));
        act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); });
        await flush();
        expect(store.getState().molecule.meta).toBeNull();
        expect(properties()).toHaveAttribute('aria-expanded', 'true');
        expect(within(viewPanel).getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
        const region = () => within(viewPanel).getByRole('region', { name: 'Properties' });
        expect(region()).toHaveTextContent('Loading…');
        // Task 7b fix round 1 (ruling on concern 4): the card no longer repeats the formula (Info's title has it), so the
        // filled card is told by its own geometry row.
        await act(async () => { land(waterMeta({ id: 'nh3', name: 'Ammonia', formula: 'NH3', geometrySource: 'experiment (NIST)' })); });
        await flush();
        expect(properties()).toHaveAttribute('aria-expanded', 'true');
        expect(region()).not.toHaveTextContent('Loading…');
        expect(within(region()).getByText('experiment (NIST)')).toBeInTheDocument();
    });

    // Task 16d item 7 (T12 re-review minor): a molecule whose meta failed keeps its Properties section, and says so
    // (the alert over the view gives the reason) -- never "Loading…" forever, never a silent empty card.
    it('says in Properties that a molecule did not load when its meta failed', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        const loader = jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock };
        loader.loadMoleculeMeta.mockImplementationOnce(never);
        act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); });
        await flush();
        act(() => { store.dispatch(metaFailed({ id: 'nh3', message: 'Could not load /molecules/v3/nh3/meta.json (HTTP 503)' })); });
        const region = within(viewPanel).getByRole('region', { name: 'Properties' });
        expect(within(viewPanel).getByRole('button', { name: 'Properties' })).toHaveAttribute('aria-expanded', 'true');
        expect(region).toHaveTextContent('This molecule did not load.');
        expect(region).not.toHaveTextContent('Loading…');
        expect(region.querySelector('dl')).toBeNull();
    });

    // Task 16d items 12, 13 and 10: Advanced appearance is absent while no surface is drawn;
    // its edge whiteness is offered only over the density (an orbital's rim is its phase's, an ESP map's is never
    // whitened); and the frame-time guard's latch, up from the viewer through the store, disables the extras' rows.
    it('fits Advanced appearance to the surface drawn: none hides it, edge whiteness only over the density', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        openDisplay(container);
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        const block = () => within(viewPanel).queryByRole('button', { name: 'Advanced appearance' });
        fireEvent.click(block()!);
        const whiteness = () => within(viewPanel).queryByRole('slider', { name: 'Edge whiteness (density and lobes)' });
        expect(whiteness()).not.toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(block()).not.toBeNull();
        expect(whiteness()).toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
        expect(whiteness()).toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'none' })); });
        expect(block()).toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'density' })); });
        expect(block()).not.toBeNull();
        if (block()!.getAttribute('aria-expanded') !== 'true') fireEvent.click(block()!);
        expect(within(viewPanel).getByRole('slider', { name: 'Halo' })).toBeEnabled();
        act(() => { store.dispatch(setGlowExtrasSuppressed(true)); });
        expect(within(viewPanel).getByRole('slider', { name: 'Halo' })).toBeDisabled();
        expect(within(viewPanel).getByText('Off to keep this device smooth')).toBeInTheDocument();
    });

    // Ruling T12-I2: on a desktop or tablet the library's load failure is said in the panel, under the tile --
    // not only inside the popover -- as the inline picker said it before.
    it('says, in the Explore panel, that the molecule library could not be loaded', async () => {
        const loader = jest.requireMock('../src/molecules/loader') as { loadMoleculeIndex: jest.Mock };
        loader.loadMoleculeIndex.mockRejectedValueOnce(new Error('HTTP 503'));
        const { container } = await enterMolecules(false);
        await flush();
        const side = container.querySelector('.side-panel') as HTMLElement;
        const alert = within(side).getByRole('alert');
        expect(alert).toHaveTextContent('Could not load the molecule library');
        expect((side.querySelector('.molecule-tile') as HTMLElement).compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('has no Properties section before a molecule is chosen (real or absent)', async () => {
        const { container } = await enterMolecules(false);
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(within(viewPanel).queryByRole('button', { name: 'Properties' })).toBeNull();
        expect(within(viewPanel).getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'true');
    });

    // Task 12: a phone's Explore tab opens with the compact tile, then today's order. Owner R25-A3: the quick-pick
    // row that followed the tile is gone.
    it('opens the phone\'s Explore tab with the compact tile, then Selection and the switch', async () => {
        const { store } = await enterMolecules(true);
        pickWater(store);
        await flush(); // the loader's own meta request settles (no act warning)
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const tabpanel = screen.getByRole('tabpanel');
        const order = [
            tabpanel.querySelector('.molecule-tile.compact') as HTMLElement,
            within(tabpanel).getByText('Selection'),
            within(tabpanel).getByRole('group', { name: 'Surface' }) /* R25-A4: named by its visible label */,
            within(tabpanel).getByText('Browse molecules'),
        ];
        order.forEach(node => expect(node).not.toBeNull());
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        expect(within(tabpanel).queryByRole('group', { name: 'Quick pick' })).toBeNull();
        // The inline browse list's rows show the thumbnails too (R25-A3).
        expect(within(tabpanel).getByRole('button', { name: 'H₂O Water' }).querySelector('img')).not.toBeNull();
        // The compact tile's Change opens the phone's full-screen picker, as the header's name does.
        fireEvent.click(within(tabpanel.querySelector('.molecule-tile') as HTMLElement).getByRole('button', { name: 'Change molecule' }));
        expect(screen.getByRole('button', { name: 'close molecule picker' })).toBeInTheDocument();
    });

    // Task 4: Molecules' sheet has no Plot tab; Info is its second tab, as in every mode.
    it('gives a phone the tabs Explore, Info and View, Info naming the molecule', async () => {
        const { store } = await enterMolecules(true);
        pickWater(store);
        await flush(); // the loader's own meta request settles (no act warning)
        expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Explore', 'Info', 'View']);
        fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
        const tabpanel = screen.getByRole('tabpanel');
        expect(within(tabpanel).getByRole('heading', { level: 2, name: 'Info' })).toBeInTheDocument();
        // Task 7b: Info explains the molecule (its plain text names it too), titled by moleculeTitle and the surface.
        expect(tabpanel.querySelector('.info-title')).toHaveTextContent('Water (H₂O) — electron density');
    });

    it('gives a phone the Properties under the view settings in its View tab', async () => {
        const { store } = await enterMolecules(true);
        pickWater(store);
        await flush(); // the loader's own meta request settles (no act warning)
        fireEvent.click(screen.getByRole('tab', { name: 'View' }));
        const tabpanel = screen.getByRole('tabpanel');
        const heading = within(tabpanel).getByRole('heading', { name: 'Properties' });
        // Review M3: the inspector's own stacked section, as the other modes' phone sheets use.
        expect(heading.closest('.inspector-stacked')).not.toBeNull();
        expect(within(tabpanel).getByText(/Opacity/).compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // Task 7b fix round 1 (ruling on concern 4): the card's rows are those Info does not show.
        expect(within(tabpanel).getByText('Multiplicity')).toBeInTheDocument();
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
        // Ruling R23f: the orbital list moved into the Explore tab (below, beside
        // the Orbitals switch); the Plot tab had nothing left once it did (ruling
        // D23's one-time reason for a Plot tab in Molecules mode) and is retired.
        expect(screen.queryByRole('tab', { name: 'Plot' })).toBeNull();
    });

    // Ruling R23f: the list used to show unconditionally in the Plot tab; it
    // now lives beside the Density | Electrostatic potential | Orbitals switch
    // in the Explore tab, and only once Orbitals is chosen (matching the
    // desktop behaviour below, "shows the orbital list ... under the switch").
    it('names the molecule in the phone header once picked, and lists its orbitals in the Explore tab once Orbitals is chosen', async () => {
        const { store, container } = await enterMolecules(true);
        fireEvent.click(within(container.querySelector('.phone-header') as HTMLElement).getByRole('button', { name: 'Choose a molecule' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Water'));
        await flush();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(store.getState().molecule.selectedId).toBe('h2o');
        expect(within(container.querySelector('.phone-header') as HTMLElement)
            .getByRole('button', { name: 'Change molecule, currently Water' })).toHaveTextContent('Water · H₂O ▾');
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const tabpanel = screen.getByRole('tabpanel');
        expect(within(tabpanel).queryByRole('button', { name: /1b1/ })).toBeNull();
        fireEvent.click(within(tabpanel).getByRole('button', { name: 'Orbitals' }));
        expect(within(tabpanel).getByRole('button', { name: /1b1/ })).toBeInTheDocument();
    });

    it('locks the contour to ρ = 0.001 for the ESP map, and shows its key', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        openDisplay(container); // Task 12: Properties is the section open by default
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); store.dispatch(renderFinished({ isoLevel: 0.001, espRange: [-0.06, 0.07] })); });
        // Task 7b: why the fraction is locked is Info's (ESP_SURFACE_SENTENCE); the select is still disabled.
        expect(container.querySelector('.info-section')).toHaveTextContent(/The map is drawn on the surface ρ = 0\.001 e\/a₀³.*not at an enclosed fraction, so Electron enclosed does not apply to it/);
        expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByLabelText('electrostatic potential colour key')).toBeInTheDocument();
        expect(screen.queryByLabelText('surface colour key')).toBeNull();
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
        expect(screen.queryByLabelText('electrostatic potential colour key')).toBeNull();
    });

    // D22: the density and an MO keep the enclosed fraction, and the contour it produced is stated -- without
    // disabling the select. Task 7b: stated by Info's iso value fact (with its unit), not a helper under the select.
    it('states the drawn ρ for the density and |ψ|² for an orbital, leaving the fraction live', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush(); // Task 7b: the loader's own meta request settles (Info re-renders on it; no act warning)
        openDisplay(container); // Task 12: Properties is the section open by default
        act(() => { store.dispatch(renderFinished({ isoLevel: 0.00234 })); });
        const info = () => (container.querySelector('.info-section')?.textContent ?? '').replace(/\u00A0/g, ' ');
        expect(info()).toContain('Iso valueρ = 2.34 × 10⁻³ e/a₀³');
        expect(screen.getByRole('combobox', { name: /electron enclosed/i })).not.toHaveAttribute('aria-disabled');
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); store.dispatch(renderStarted('Computing 1b1…')); });
        // Mid-render the last contour belongs to the density, so it is not labelled as |ψ|².
        expect(info()).not.toMatch(/2\.34 × 10/);
        expect(info()).not.toContain('Iso value');
        act(() => { store.dispatch(renderFinished({ isoLevel: 0.0005 })); });
        expect(info()).toContain('Iso value|ψ|² = 5.00 × 10⁻⁴ a₀⁻³');
    });

    // Ruling D23 put the energy-sorted orbital list (not MoDiagram) where the
    // other modes show their plot; ruling R23f moves it again, into the
    // Explore panel beside the Density | Electrostatic potential | Orbitals
    // switch -- the left panel chooses WHAT you look at. The right panel
    // (view-panel) keeps none of it.
    it('shows the orbital list in the Explore panel beside the switch, not the view panel, and picking one draws it', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(viewPanel.querySelector('.mo-diagram')).toBeNull();
        expect(viewPanel.querySelector('.molecule-orbital-list')).toBeNull();
        const side = container.querySelector('.side-panel') as HTMLElement;
        expect(side.querySelector('.molecule-orbital-list')).toBeNull(); // not yet: Density is still chosen
        fireEvent.click(within(side).getByRole('button', { name: 'Orbitals' }));
        const list = side.querySelector('.molecule-orbital-list') as HTMLElement;
        expect(list).not.toBeNull();
        fireEvent.click(within(list).getByRole('button', { name: /1b1/ }));
        expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 4 });
    });

    it('puts the structure and dipole switches in the view settings, and ozone\'s caveat beside its dipole in Info', async () => {
        const { store, container } = await enterMolecules(false);
        act(() => {
            store.dispatch(selectMolecule({ id: 'o3' }));
            store.dispatch(metaLoaded({ id: 'o3', meta: waterMeta({ id: 'o3', name: 'Ozone', caveat: 'Ozone has strong multireference character.' }) }));
        });
        openDisplay(container); // Task 12: Properties is the section open by default
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        // Task 13 (ruling P8): the "Ball-and-stick" switch is now the Structure segmented control's first segment.
        expect(within(viewPanel).getByRole('button', { name: /ball-and-stick structure/ })).toHaveAttribute('aria-pressed', 'true');
        // Task 7b: the dipole's value, with ozone's caveat beside it (T7-O3), is Info's fact (and the Properties row's).
        const dipole = [...(viewPanel.querySelectorAll('.info-fact') as NodeListOf<HTMLElement>)].find(row => row.textContent?.startsWith('Dipole μ'))!;
        expect(dipole).toHaveTextContent(/1\.86 D computed .*Ozone has strong multireference character\./);
        expect(within(viewPanel).getByRole('checkbox', { name: 'Dipole arrow' })).toBeInTheDocument();
    });

    // Ruling P8 (spec §9.4 View): Structure is Ball and stick | Space filling | None, each name holding its
    // visible label (WCAG 2.5.3); None leaves nothing to pick, so the Selection readout and the hover caption go.
    it('chooses the structure with the Structure segments, and drops Selection and the hover caption for None', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        openDisplay(container);
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        const group = within(viewPanel).getByRole('group', { name: 'Structure' });
        expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Ball and stick', 'Space filling', 'None']);
        const side = container.querySelector('.side-panel') as HTMLElement;
        // Task 7b: what the sticks or spheres show, and what the spheres can hide, are Info's (the readout's note and
        // the Structure control's caption moved there).
        const info = () => (viewPanel.querySelector('.info-section') as HTMLElement).textContent;
        const hoverCaption = () => container.querySelector('#canvas-container .molecule-hover-caption');
        expect(info()).toMatch(/Sticks show connectivity, not bond order\./);
        expect(hoverCaption()).toHaveTextContent(/^Hover or tap an atom or bond$/);
        fireEvent.click(within(group).getByRole('button', { name: 'Space filling (space-filling structure)' }));
        expect(store.getState().molecule.representation).toBe('space-filling');
        expect(within(side).getByText('Selection')).toBeInTheDocument();
        // Ruling T13-I4: space filling draws no sticks and no bonds to pick, so neither text says it does.
        expect(info()).toMatch(/The spheres are van der Waals spheres \(Bondi 1964 \/ Mantina 2009\)\./);
        expect(info()).not.toMatch(/Sticks|bond order/);
        expect(hoverCaption()).toHaveTextContent(/^Hover or tap an atom$/);
        // Ruling T13-M: over a surface the spheres can hide it, and Info says so.
        expect(info()).toContain('The spheres can hide the surface inside them.');
        act(() => { store.dispatch(setSurface({ kind: 'none' })); });
        expect(info()).not.toContain('The spheres can hide the surface inside them.');
        act(() => { store.dispatch(setSurface({ kind: 'density' })); });
        fireEvent.click(within(group).getByRole('button', { name: 'None (no structure)' }));
        expect(store.getState().molecule.representation).toBe('none');
        expect(within(side).queryByText('Selection')).toBeNull();
        expect(container.querySelector('#canvas-container .molecule-hover-caption')).toBeNull();
        fireEvent.click(within(group).getByRole('button', { name: 'Ball and stick (ball-and-stick structure)' }));
        expect(store.getState().molecule.representation).toBe('ball-and-stick');
    });

    // Ruling P9 (spec §9.4.1, §6.7): "Show bond lengths and angles" is a switch in View, stored in eov.display
    // and never in a link -- the share link is byte-identical before and after it is turned on.
    it('offers the bond-label switch in Display, off by default, and leaves the share link byte-identical', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        // The real keys, so the link carries the molecule view's state and an equal second link means something.
        resetUrlKeysForTests(); registerBuiltInUrlKeys(); registerMoleculeUrlKeys();
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        openDisplay(container);
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        const toggle = within(viewPanel).getByRole('checkbox', { name: 'Show bond lengths and angles' });
        expect(toggle).not.toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(writeText.mock.calls[0][0]).toMatch(/#mode=molecule&.*id=h2o/);
        fireEvent.click(toggle);
        expect(toggle).toBeChecked();
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toMatchObject({ moleculeLabels: true });
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
        expect(writeText.mock.calls[1][0]).toBe(writeText.mock.calls[0][0]);
        // Space filling draws no bonds, so only angles are labelled; with no structure there is nothing to label.
        // Task 7b: said by Info (the switch keeps the disabled reason as its description).
        const info = viewPanel.querySelector('.info-section') as HTMLElement;
        fireEvent.click(within(viewPanel).getByRole('button', { name: 'Space filling (space-filling structure)' }));
        expect(info).toHaveTextContent('Space filling draws no bonds, so only angles are labelled.');
        fireEvent.click(within(viewPanel).getByRole('button', { name: 'None (no structure)' }));
        expect(within(viewPanel).getByRole('checkbox', { name: 'Show bond lengths and angles' })).toBeDisabled();
        expect(info).toHaveTextContent('No structure is drawn, so there is nothing to label.');
        expect(within(viewPanel).getByRole('checkbox', { name: 'Show bond lengths and angles' }))
            .toHaveAccessibleDescription('No structure is drawn, so there is nothing to label.');
        resetUrlKeysForTests();
    });

    // Ruling P8b: no van der Waals radius is tabulated for Sc–Co, so Space filling is disabled for a molecule
    // holding one, and says why where the viewer looks for it.
    it('disables Space filling for a molecule with no tabulated radius, saying which element and why', async () => {
        const { store, container } = await enterMolecules(false);
        // Water's id (the loader refuses an id its index lacks) with iron in place of the oxygen.
        const iron = waterMeta({ name: 'Iron dihydride', formula: 'FeH2', atoms: waterMeta().atoms.map((a, i) => (i === 0 ? { ...a, Z: 26 } : a)) });
        const loader = jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock };
        loader.loadMoleculeMeta.mockResolvedValueOnce(iron);
        pickWater(store, iron);
        await flush();
        openDisplay(container);
        const space = within(container.querySelector('.view-panel') as HTMLElement).getByRole('button', { name: /space-filling structure/ });
        expect(space).toBeDisabled();
        const reason = 'no van der Waals radius tabulated for Fe (Bondi 1964 / Mantina 2009)';
        expect(space.closest('[title]')).toHaveAttribute('title', reason);
        // Task 7b: the reason is Info's words, and the button's description for a screen reader.
        expect(container.querySelector('.view-panel .info-section')).toHaveTextContent(`Space filling is unavailable: ${reason}.`);
        expect(space).toHaveAccessibleDescription(`Space filling is unavailable: ${reason}`);
    });

    // Ruling P8: the surface switch gains None -- structure only -- which clears the surface (show=none).
    it('offers no surface as the surface switch\'s fourth choice', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        const side = container.querySelector('.side-panel') as HTMLElement;
        const surface = within(side).getByRole('group', { name: 'Surface' }) /* R25-A4: named by its visible label */;
        // Owner R25-A4: "None" reads "No surface" now, its name its visible text.
        fireEvent.click(within(surface).getByRole('button', { name: 'No surface' }));
        expect(store.getState().molecule.surface).toEqual({ kind: 'none' });
        // Task 8 (addendum 8): the subtitle no longer names the geometry source -- Info does, once.
        expect(within(container.querySelector('.viewport-title') as HTMLElement).getByText('Structure only'))
            .toBeInTheDocument();
        // No contour is drawn, so the enclosed fraction applies to nothing: disabled, saying why (never the
        // orbital's "contour of constant |ψ|²" fallback), and no colour key stands for a surface.
        openDisplay(container);
        // Ruling T13-I3: Surface style, Opacity and Cut away act on nothing -- disabled, each saying why. Owner R25-B1
        // removed Wireframe; ruling R25-finish brings the Glow | Solid finish here, disabled with its note again.
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(within(viewPanel).queryByRole('button', { name: /wireframe surface/ })).toBeNull();
        expect(within(viewPanel).getByRole('button', { name: 'glow surface' })).toBeDisabled();
        expect(within(viewPanel).getByRole('button', { name: 'solid surface' })).toBeDisabled();
        expect(within(viewPanel).getByText('No surface is drawn to style.')).toBeInTheDocument();
        expect(within(viewPanel).getByRole('slider', { name: 'surface opacity' })).toBeDisabled();
        ['no cut', 'cut along x', 'cut along y', 'cut along z'].forEach(name => expect(within(viewPanel).getByRole('button', { name })).toBeDisabled());
        expect(within(viewPanel).getByText('No surface is drawn to make see-through.')).toBeInTheDocument();
        expect(within(viewPanel).getByText('No surface is drawn to cut; the structure is never cut.')).toBeInTheDocument();
        expect(viewPanel.textContent).not.toMatch(/slice the orbital open/);
        expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
        expect(container.textContent).toMatch(/No surface is drawn, so no contour applies/);
        expect(container.textContent).not.toMatch(/contour of constant/);
        expect(screen.queryByLabelText('surface colour key')).toBeNull();
        expect(screen.queryByLabelText('electrostatic potential colour key')).toBeNull();
        // A surface again: all live. Task 7b: what a cut removes is Info's once a cut is chosen (none here), so no
        // help comes back under the toggle.
        fireEvent.click(within(surface).getByRole('button', { name: 'Density' }));
        expect(within(viewPanel).getByRole('slider', { name: 'surface opacity' })).not.toBeDisabled();
        expect(within(viewPanel).getByRole('button', { name: 'cut along x' })).not.toBeDisabled();
        expect(within(viewPanel).queryByText('No surface is drawn to cut; the structure is never cut.')).toBeNull();
    });

    // Ruling R22c (brief requirement 5): the hover/pick readout lives in the
    // Explore panel (never over the canvas), updates live, and keeps
    // role=status/aria-live -- replaces the floating-chip placement the old
    // `.molecule-legend-stack` tests (above, now retired) used to assert.
    // Ruling R23c-3 changes this test: the "nothing picked yet" hint is no
    // longer said inside the Explore-panel readout on a desktop -- it is a
    // one-line caption in the viewport's key/caption corner instead, visually
    // gone once something is picked. Ruling R23f-3 changes it again: the
    // caption element itself stays mounted across a pick (only `.hidden`
    // toggles) -- that is the fix for the hover flicker (its root cause was
    // this very element mounting and unmounting, which changed `.key-column`'s
    // measured camera inset on every pick and re-fit the camera under the
    // mouse). What must still hold is that nobody SEES "Hover or tap…" once
    // something is picked -- checked here by `.hidden`'s own CSS rule
    // (visibility, so it also leaves the accessibility tree) rather than by
    // the element's absence from the DOM.
    it('puts the hover/pick readout in the Explore panel, never over the canvas, and updates it live', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        const side = container.querySelector('.side-panel') as HTMLElement;
        const readout = within(side).getByRole('status');
        expect(readout).toHaveClass('molecule-readout');
        expect(container.querySelector('#canvas-container .molecule-readout')).toBeNull();
        expect(readout).toHaveAttribute('aria-live', 'polite');
        expect(readout).not.toHaveTextContent(/hover|tap/i);
        const caption = () => container.querySelector('#canvas-container .molecule-hover-caption');
        expect(caption()).toHaveTextContent('Hover or tap an atom or bond');
        expect(caption()).not.toHaveClass('hidden');
        act(() => { store.dispatch(setPick({ kind: 'atom', index: 0 })); });
        expect(within(side).getByRole('status')).toHaveTextContent('∠H–O–H 104.5°');
        // Still in the DOM -- unlike before R23f-3 -- just hidden.
        expect(caption()).toHaveClass('hidden');
    });

    // Ruling R23f-3, the regression test the addendum asks for: reproduce the
    // root cause's mechanism directly. On the default Density surface no
    // other key is shown (no ESP map, no phase legend), so before this fix
    // `<KeyColumn>` had nothing else keeping it mounted -- picking and
    // unpicking (which happens on nearly every pointermove while hovering)
    // added and removed the whole `.key-column` element, which is itself a
    // measured camera inset (useViewInsets' RIGHT_ZONES). That is what made
    // the camera jump on every hover transition. Proof here is at the DOM
    // level (jsdom does no real layout, so insets/camera cannot be asserted
    // in jest -- the live check below is where that part is verified): the
    // zone's root element, and the caption inside it, must both survive a
    // pick exactly as they must before one.
    it('never mounts or unmounts the key column (or the caption in it) when a pick comes or goes', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store); // default surface: density -- no ESP/phase key to keep the column up on its own
        const keyColumn = () => container.querySelector('#canvas-container .key-column');
        const before = keyColumn();
        expect(before).not.toBeNull();
        expect(before!.querySelector('.molecule-hover-caption')).not.toBeNull();
        act(() => { store.dispatch(setPick({ kind: 'atom', index: 0 })); });
        const picked = keyColumn();
        expect(picked).not.toBeNull();
        expect(picked).toBe(before); // the same node, not a fresh mount
        expect(picked!.querySelector('.molecule-hover-caption')).not.toBeNull();
        act(() => { store.dispatch(setPick(null)); });
        expect(keyColumn()).toBe(before);
    });

    // Ruling R22c: jsdom's CSS imports are stubbed (jest.config.ts), so
    // getComputedStyle cannot see style.css -- read the rule's own source,
    // the project's established way of asserting a CSS property
    // (tests/a11y/panel_contrast.test.ts does the same for colour pairs).
    // Ruling R23f-2 overrides this test's old premise: Task 23c's FIXED
    // 140 px height (reserved so "How this was computed" below never moved)
    // is dropped -- that link is pinned to the panel's own footer now
    // (`.molecule-explore-footer`, outside this scroll entirely), so the
    // readout is free to grow to its full text and `.molecule-explore-scroll`
    // (its new containing scroll area, checked below) scrolls instead.
    it('lets the readout grow to its full text, with no height or scroll of its own', () => {
        const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
        const start = css.indexOf('.molecule-readout {');
        const rule = css.slice(start, css.indexOf('}', start));
        expect(rule).not.toMatch(/pointer-events:\s*none/);
        expect(rule).not.toMatch(/height/);
        expect(rule).not.toMatch(/overflow/);
        const scrollStart = css.indexOf('.molecule-explore-scroll {');
        const scrollRule = css.slice(scrollStart, css.indexOf('}', scrollStart));
        expect(scrollRule).toMatch(/overflow-y:\s*auto/);
    });

    // Ruling R23f-2 pinned "How this was computed" as an overlay over the Explore column; ruling PF5 (Task 7b) moves it
    // into Info, so the overlay's rules are gone with it (the replacement: 'puts "How this was computed" in Info, with
    // no footer pinned under Explore', below).
    it('keeps no provenance overlay rule in the stylesheet', () => {
        const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
        expect(css).not.toMatch(/^\.molecule-provenance-footer/m);
        expect(css).not.toMatch(/^\.provenance-panel/m);
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
        // Unanchored: the item's name is "<Visible label> (<old name>)"
        // (WCAG 2.5.3, label in name). Ruling R23a: the desktop mode switch
        // is now the top bar's own tab (a link), not the rail's button.
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/ }));
        // Ruling R24-1: the untouched opacity is the default, 0.9 (was 0.7, R20a-2).
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.9);
        fireEvent.click(screen.getByRole('link', { name: /molecule mode/ }));
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
        // Unanchored: the desktop mode switch is the top bar's own tab now (ruling R23a), a link not a button.
        fireEvent.click(screen.getByRole('link', { name: /atom mode/ }));
        await flush();
        // Ruling R24-1: what it hands back is the default it took, now 0.9 (was 0.7, R20a-2).
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.9);
    });

    it('keeps an opacity the user chose inside Molecules on the way out', async () => {
        const { store } = await enterMolecules(false);
        act(() => { store.dispatch(setSurfaceStyle({ opacity: 0.4 })); });
        // Unanchored: the desktop mode switch is the top bar's own tab now (ruling R23a), a link not a button.
        fireEvent.click(screen.getByRole('link', { name: /atom mode/ }));
        await flush();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.4);
    });

    it('does not raise an opacity it did not lower', async () => {
        installMatchMedia(false);
        const store = makeStore();
        act(() => { store.dispatch(setSurfaceStyle({ opacity: 0.6 })); });
        render(<Provider store={store}><App /></Provider>);
        // Unanchored: the desktop mode switch is the top bar's own tab now (ruling R23a), a link not a button.
        fireEvent.click(screen.getByRole('link', { name: /molecule mode/ }));
        await flush();
        fireEvent.click(screen.getByRole('link', { name: /atom mode/ }));
        await flush();
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
    });

    it('on a phone, the mode menu enters and leaves Molecules with the old toggle\'s opacity rule (Review Focus 4)', async () => {
        const { store } = await enterMolecules(true);
        expect(store.getState().atom.mode).toBe('molecule');
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.6);
        fireEvent.click(screen.getByRole('button', { name: /^Mode: / }));
        // Unanchored: the menu reuses the rail's names, "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
        fireEvent.click(screen.getByRole('button', { name: /atom mode/ }));
        await flush();
        expect(store.getState().atom.mode).toBe('atom');
        // Ruling R24-1: back to the default it lowered, now 0.9 (was 0.7, R20a-2).
        expect(store.getState().orbital.surfaceStyle.opacity).toBe(0.9);
        fireEvent.click(screen.getByRole('button', { name: /^Mode: / }));
        expect(screen.getByRole('button', { name: /atom mode/ })).toHaveAttribute('aria-pressed', 'true');
        // The names now end in "mode)" and lead with the visible label (WCAG
        // 2.5.3); ruling R23a reordered the four modes to Orbitals | Atoms |
        // Bonds | Molecules and renamed "Basic Orbitals" to "Orbitals".
        expect(screen.getAllByRole('button', { name: /mode\)$/ }).map(b => b.getAttribute('aria-label')))
            .toEqual(['Orbitals (basic orbitals mode)', 'Atoms (atom mode)', 'Bonds (bonds mode)', 'Molecules (molecule mode)']);
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

    // Ruling R23f (replacing T16-a): the list appears once on a desktop, in
    // the Explore panel beside the switch, not the right-hand column.
    it('lists the orbitals once on a desktop, in the Explore panel', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(container.querySelectorAll('.molecule-orbital-list')).toHaveLength(1);
        expect(container.querySelector('.side-panel .molecule-orbital-list')).not.toBeNull();
        expect(container.querySelector('.view-panel .molecule-orbital-list')).toBeNull();
        expect(within(container.querySelector('.side-panel .molecule-orbital-list') as HTMLElement)
            .getByRole('button', { name: /1b1/ })).toHaveAttribute('aria-pressed', 'true');
    });

    // Ruling R23f-2 (owner) pinned "How this was computed" below the scrolling part of the Explore column, and closed
    // its overlay on Esc. Ruling PF5 (Task 7b) supersedes both: it is Info's, folded below Research and open at
    // Research, at the top of the right panel -- 'puts "How this was computed" in Info, with no footer pinned under
    // Explore' (the "Molecules Info (Task 7b)" block) is their replacement; Info's <details> needs no Esc of its own.
    it('keeps the Explore column one scrolling part, with nothing pinned below it', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        const explore = container.querySelector('.side-panel .molecule-explore') as HTMLElement;
        const scroll = explore.querySelector('.molecule-explore-scroll') as HTMLElement;
        expect([...explore.children]).toEqual([scroll]);
        expect(scroll.querySelector('.molecule-nav')).not.toBeNull();
        expect(within(explore).queryByText('How this was computed')).toBeNull();
    });

    // Ruling R22c: the ESP key now lives in the right-hand key column on
    // every viewport (desktop included), not just a sideways phone -- the
    // column is a narrow strip everywhere, so it is compact everywhere (the
    // brief's own "colour keys ... compact, no prose"). Replaces the old
    // T16-c test, which this ruling overrides.
    it('keeps the ESP key compact wherever it is shown', async () => {
        const { store, container, unmount } = await enterMolecules(true, { landscape: true });
        pickWater(store);
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
        expect(container.querySelector('.esp-legend.compact')).not.toBeNull();
        unmount();
        const upright = await enterMolecules(true);
        pickWater(upright.store);
        act(() => { upright.store.dispatch(setSurface({ kind: 'esp' })); });
        expect(upright.container.querySelector('.esp-legend.compact')).not.toBeNull();
        upright.unmount();
        const desk = await enterMolecules(false);
        pickWater(desk.store);
        act(() => { desk.store.dispatch(setSurface({ kind: 'esp' })); });
        expect(desk.container.querySelector('.esp-legend.compact')).not.toBeNull();
    });

    // Review Minor 3; ruling R22c: the legend stack that used to carry the
    // phone's alert is retired, so it keeps its own class/position
    // (`.molecule-error`) rather than riding in a shared container.
    it('puts a failed surface\'s alert under the phone header, and over the canvas on a desktop', async () => {
        const phone = await enterMolecules(true);
        pickWater(phone.store);
        act(() => { phone.store.dispatch(renderFailed('HTTP 404')); });
        expect(phone.container.querySelector('.molecule-error[role="alert"]')).not.toBeNull();
        phone.unmount();
        const desk = await enterMolecules(false);
        pickWater(desk.store);
        act(() => { desk.store.dispatch(renderFailed('HTTP 404')); });
        expect(desk.container.querySelector('.molecule-error')).toBeNull();
        expect(screen.getByRole('alert')).toHaveTextContent('HTTP 404');
    });

    // Task 8: a phone names what is drawn in a caption under the header -- the molecule and its surface kind, an
    // orbital's irrep typeset -- and, while the next molecule loads, that molecule with "loading…".
    it('on a phone, names the molecule and what is drawn in the caption under the header', async () => {
        const { store } = await enterMolecules(true);
        pickWater(store);
        const caption = () => document.querySelector('.phone-caption') as HTMLElement;
        expect(caption()).toHaveTextContent(/^Water · electron density$/);
        expect(caption()).toHaveAttribute('aria-live', 'polite');
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(caption()).toHaveTextContent(/^Water 1b1 · HOMO, 90 % enclosed$/);
        expect(caption().innerHTML).toContain('1b<sub>1</sub>');
        const { loadMoleculeMeta } = jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock };
        loadMoleculeMeta.mockImplementationOnce(() => new Promise(() => {}));
        act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); });
        await act(async () => { await new Promise(r => setTimeout(r, 450)); });
        expect(caption()).toHaveTextContent(/^Ammonia · loading…$/);
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

    // Task 15 (spec §9.4 Strip, §12; rulings P6, P7): the molecule's views under the canvas.
    describe('the strip', () => {
        // Tiny stand-ins: no worker meshes them here (the thumbnail service is detached), they only have to arrive.
        const loader = jest.requireMock('../src/molecules/loader') as Record<'loadDensityGrid' | 'loadBasis', jest.Mock>;
        const esp = jest.requireMock('../src/molecules/esp') as Record<'loadEspGrid', jest.Mock>;
        const grid = () => ({ shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: new Float32Array(8) });
        const basis = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/molecules/h2o/basis.json'), 'utf8'));
        beforeEach(() => {
            clearGridCache(); // the other tests' never-landing grids stay out of this one's way
            loader.loadDensityGrid.mockImplementation(async (meta: { id: string }) => ({ kind: 'grid', id: `density:${meta.id}`, quantity: 'density', ...grid() }));
            esp.loadEspGrid.mockImplementation(async () => grid());
            loader.loadBasis.mockImplementation(async (id: string) => ({ ...basis, id }));
        });
        afterEach(() => {
            [loader.loadDensityGrid, esp.loadEspGrid, loader.loadBasis].forEach(mock => mock.mockImplementation(never));
            clearGridCache();
        });
        const STRIP = 'views of this molecule';
        const strip = () => screen.getByRole('listbox', { name: STRIP });
        const optionNames = () => within(strip()).getAllByRole('option').map(option => option.getAttribute('aria-label'));

        it('shows the molecule\'s views as a listbox under the canvas, the drawn one selected (desktop)', async () => {
            const { store, container } = await enterMolecules(false);
            pickWater(store);
            await flush(); // the meta, the grids and the basis settle
            expect(container.querySelector('#canvas-container')!.contains(strip())).toBe(true);
            expect(optionNames()).toEqual([
                'Ball and stick structure', 'Space filling structure', 'Electron density surface',
                'Electrostatic potential on the density surface, red negative to blue positive',
                'HOMO orbital', 'LUMO orbital', 'Orbital list — go to the list',
            ]);
            expect(within(strip()).getByRole('option', { name: 'Electron density surface' })).toHaveAttribute('aria-selected', 'true');
            // Ruling R23b-3: the handle names what it folds away.
            expect(screen.getByRole('button', { name: 'Hide views' })).toBeInTheDocument();
        });

        it('draws the orbital a frontier tile names, exactly as the orbital list does', async () => {
            const { store } = await enterMolecules(false);
            pickWater(store);
            await flush();
            fireEvent.click(within(strip()).getByRole('option', { name: 'HOMO orbital' }));
            expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 4 });
            expect(within(strip()).getByRole('option', { name: 'HOMO orbital' })).toHaveAttribute('aria-selected', 'true');
            fireEvent.click(within(strip()).getByRole('option', { name: /^Electrostatic potential/ }));
            expect(store.getState().molecule.surface).toEqual({ kind: 'esp' });
        });

        it('shows the structure alone, in the tile\'s representation, from a structure tile', async () => {
            const { store } = await enterMolecules(false);
            pickWater(store);
            await flush();
            fireEvent.click(within(strip()).getByRole('option', { name: 'Space filling structure' }));
            expect(store.getState().molecule).toMatchObject({ surface: { kind: 'none' }, representation: 'space-filling' });
            expect(within(strip()).getByRole('option', { name: 'Space filling structure' })).toHaveAttribute('aria-selected', 'true');
            fireEvent.click(within(strip()).getByRole('option', { name: 'Ball and stick structure' }));
            expect(store.getState().molecule).toMatchObject({ surface: { kind: 'none' }, representation: 'ball-and-stick' });
        });

        // Owner R25-A2: the tile is "Orbital list" now (it was "All orbitals").
        it('opens the orbital list from "Orbital list", on the HOMO, and puts focus on its row', async () => {
            const { store, container } = await enterMolecules(false);
            pickWater(store);
            await flush();
            fireEvent.click(within(strip()).getByRole('option', { name: 'Orbital list — go to the list' }));
            expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 4 });
            const list = container.querySelector('.side-panel .molecule-orbital-list') as HTMLElement;
            expect(list).not.toBeNull();
            const homoRow = within(list).getByRole('button', { name: /1b1/ });
            expect(homoRow).toHaveAttribute('aria-pressed', 'true');
            expect(document.activeElement).toBe(homoRow);
            // Already showing an orbital: the list opens on it, and the choice is kept.
            act(() => { store.dispatch(setSurface({ kind: 'mo', index: 2 })); });
            fireEvent.click(within(strip()).getByRole('option', { name: 'Orbital list — go to the list' }));
            expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 2 });
            expect(document.activeElement).toBe(within(list).getByRole('button', { name: /1b2/ }));
        });

        // Owner R25-A2: "clicking on it does nothing" -- with Orbitals already drawn, the tile only moved focus. Now its
        // effect is always visible: Explore scrolls the list into view, focus lands on the drawn row, and the list
        // is highlighted briefly.
        // R25-A-I1 (review): on a tablet with Explore folded the list was mounted but not displayed, so the tile changed
        // nothing visible. It unfolds Explore, then reveals the list there.
        it('unfolds a folded Explore on a tablet, then brings the list into view, focused and highlighted (R25-A-I1)', async () => {
            const { store, container } = await enterMolecules(false, { medium: true });
            pickWater(store);
            await flush();
            act(() => { store.dispatch(setSurface({ kind: 'mo', index: 2 })); });
            fireEvent.click(screen.getByRole('button', { name: 'Hide the Explore panel' }));
            const explore = container.querySelector('#explore-panel') as HTMLElement;
            expect(explore).toHaveAttribute('hidden');
            fireEvent.click(within(strip()).getByRole('option', { name: 'Orbital list — go to the list' }));
            await flush();
            expect(explore).not.toHaveAttribute('hidden');
            const list = explore.querySelector('.molecule-orbital-list') as HTMLElement;
            expect(document.activeElement).toBe(within(list).getByRole('button', { name: /1b2/ }));
            expect(list).toHaveClass('highlight');
            expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 2 });
        });

        // R25-A-I1 (review, controller ruling): in full screen Explore is not shown at all; the user asked to see the
        // list, so the tile leaves full screen first, then reveals it.
        it('leaves full screen, then brings the list into view, focused and highlighted (R25-A-I1)', async () => {
            const { store, container } = await enterMolecules(false);
            pickWater(store);
            await flush();
            fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
            const shell = container.querySelector('.app-shell') as HTMLElement;
            expect(shell).toHaveClass('is-fullscreen');
            fireEvent.click(within(strip()).getByRole('option', { name: 'Orbital list — go to the list' }));
            await flush();
            expect(shell).not.toHaveClass('is-fullscreen');
            // Not in full screen: the density drawn before switches to the HOMO, as from the docked layout.
            expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 4 });
            const list = container.querySelector('#explore-panel .molecule-orbital-list') as HTMLElement;
            expect(document.activeElement).toBe(within(list).getByRole('button', { name: /1b1/ }));
            expect(list).toHaveClass('highlight');
        });

        it('brings the list into view from "Orbital list" even with Orbitals already drawn, focused and highlighted (R25-A2)', async () => {
            const { store, container } = await enterMolecules(false);
            pickWater(store);
            await flush();
            act(() => { store.dispatch(setSurface({ kind: 'mo', index: 2 })); });
            const side = container.querySelector('.side-panel') as HTMLElement;
            const scroller = side.querySelector('.molecule-explore-scroll') as HTMLElement;
            const list = side.querySelector('.molecule-orbital-list') as HTMLElement;
            expect(list).not.toHaveClass('highlight');
            // Explore shows 100–500; the list sits at 700–1000, below the fold.
            const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
                const at = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
                if (this === scroller) return at(100, 400);
                if (this === list) return at(700, 300);
                return at(0, 0);
            });
            try {
                scroller.scrollTop = 0;
                fireEvent.click(within(strip()).getByRole('option', { name: 'Orbital list — go to the list' }));
                // The drawn orbital is kept, not switched to the HOMO.
                expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 2 });
                // Scrolled just far enough that the list's bottom clears Explore's, 8 px in: 1000 − 500 + 8.
                expect(scroller.scrollTop).toBe(508);
                expect(document.activeElement).toBe(within(list).getByRole('button', { name: /1b2/ }));
                expect(list).toHaveClass('highlight');
            } finally {
                rects.mockRestore();
            }
        });

        // Task 16d item 5 (T15-M2, science): a radical's frontier orbital is its SOMO -- NO₂ (²A₁) names a doubly
        // occupied HOMO 4b2 below its singly occupied 6a1 -- so the Orbitals switch and "Orbital list" open on 6a1.
        it('opens a radical on its SOMO, from the Orbitals switch and from "Orbital list" (NO₂)', async () => {
            const no2 = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/molecules/no2/meta.json'), 'utf8'));
            const no2Basis = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/molecules/no2/basis.json'), 'utf8'));
            loader.loadBasis.mockImplementation(async (id: string) => ({ ...no2Basis, id }));
            const metaLoader = (jest.requireMock('../src/molecules/loader') as Record<'loadMoleculeMeta', jest.Mock>).loadMoleculeMeta;
            metaLoader.mockImplementation(async () => no2);
            try {
                const { store, container } = await enterMolecules(false);
                const pickNo2 = () => act(() => { store.dispatch(selectMolecule({ id: 'no2' })); store.dispatch(metaLoaded({ id: 'no2', meta: no2 })); });
                pickNo2();
                await flush();
                const somo = no2.orbitals.find((o: { role?: string }) => o.role === 'SOMO');
                expect(somo).toMatchObject({ index: 11, label: '6a1', occupation: 1 });
                const side = container.querySelector('.side-panel') as HTMLElement;
                fireEvent.click(within(side).getByRole('button', { name: 'Orbitals' }));
                expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 11 });
                // And from the strip, starting again from the density.
                act(() => { store.dispatch(setSurface({ kind: 'density' })); });
                fireEvent.click(within(strip()).getByRole('option', { name: 'Orbital list — go to the list' }));
                expect(store.getState().molecule.surface).toEqual({ kind: 'mo', index: 11 });
                const list = side.querySelector('.molecule-orbital-list') as HTMLElement;
                expect(document.activeElement).toBe(within(list).getByRole('button', { name: /^6a1/ }));
            } finally {
                metaLoader.mockImplementation(async () => waterMeta());
            }
        });

        // Ruling T16-tilekey with preflight D9: the orbital tiles' ψ hues get a key of their own only while the
        // column holds no phase key already -- the density, the ESP map or no surface drawn; never beside an orbital's.
        it('keys the orbital tiles\' phase colours while the drawn surface is not an orbital', async () => {
            const { store } = await enterMolecules(false);
            pickWater(store);
            await flush();
            expect(screen.getByLabelText('orbital tile colour key')).toHaveTextContent('Orbital tilesψ > 0ψ < 0');
            act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
            expect(screen.queryByLabelText('orbital tile colour key')).toBeNull();
            expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
            act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
            expect(screen.getByLabelText('orbital tile colour key')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Hide views' }));
            expect(screen.queryByLabelText('orbital tile colour key')).toBeNull();
        });

        // Spec §12, preflight D19 (Review Focus 5's equivalent here): a new molecule cancels the old one's jobs.
        it('cancels every thumbnail job when the molecule changes', async () => {
            const { store } = await enterMolecules(false);
            pickWater(store);
            await flush();
            const cancelAll = jest.spyOn(thumbnailService, 'cancelAll');
            try {
                act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); });
                expect(cancelAll).toHaveBeenCalledTimes(1);
                await flush();
            } finally {
                cancelAll.mockRestore();
            }
        });

        // As ruling T10-M6 for Bonds: outside Molecules a molecule change (a search result, a restored link) is not
        // this strip's change, and another mode's waiting tiles are left alone.
        it('cancels nothing when the molecule changes outside Molecules mode', async () => {
            const { store } = await enterMolecules(false);
            pickWater(store);
            await flush();
            act(() => { store.dispatch(setMode('atom')); });
            const cancelAll = jest.spyOn(thumbnailService, 'cancelAll');
            try {
                act(() => { store.dispatch(selectMolecule({ id: 'nh3' })); });
                expect(cancelAll).not.toHaveBeenCalled();
                await flush();
            } finally {
                cancelAll.mockRestore();
            }
        });

        // Ruling T10-I1: the strip is a bottom inset zone, so a molecule change must not take it away and bring it
        // back (the camera would re-fit twice): its tiles wait on their glyphs while the next molecule loads.
        it('keeps the strip up as glyphs while the next molecule loads, and fills it once it has', async () => {
            const { store, container } = await enterMolecules(false);
            pickWater(store);
            await flush();
            const before = strip();
            const loader = jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock };
            let land: (meta: ReturnType<typeof waterMeta>) => void = () => {};
            loader.loadMoleculeMeta.mockImplementationOnce(() => new Promise(resolve => { land = resolve; }));
            const drawnStructures = () => before.querySelectorAll('canvas.thumb-canvas[data-drawn="true"]').length;
            expect(drawnStructures()).toBe(2);
            // Owner R25-A3: chosen from the header's picker (the quick-pick tile this used is gone).
            fireEvent.click(within(container.querySelector('.side-panel') as HTMLElement).getByRole('button', { name: 'Change molecule' }));
            fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose a molecule' })).getByRole('button', { name: 'NH₃ Ammonia' }));
            await flush();
            expect(store.getState().molecule.meta).toBeNull();
            expect(strip()).toBe(before);
            // Every tile on its glyph -- the structure glyphs too, which would draw the molecule being left.
            expect([...before.querySelectorAll('.strip-tile-glyph')].map(glyph => glyph.textContent)).toEqual([
                'Ball and stick', 'Space filling', 'Electron density', 'ESP', 'HOMO', 'LUMO',
            ]);
            expect(drawnStructures()).toBe(0);
            await act(async () => { land(waterMeta({ id: 'nh3', name: 'Ammonia', formula: 'NH3' })); await new Promise(r => setTimeout(r, 0)); });
            await flush();
            expect(strip()).toBe(before);
            // The new molecule's structure is drawn at once; its pictures wait for the (here detached) renderer.
            expect(drawnStructures()).toBe(2);
        });

        // Spec §9.8: on a phone the strip is the Explore tab's first row, as in every other mode.
        it('heads the phone\'s Explore tab', async () => {
            const { store } = await enterMolecules(true);
            pickWater(store);
            await flush();
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            const tabpanel = screen.getByRole('tabpanel');
            const sheetStrip = within(tabpanel).getByRole('listbox', { name: STRIP });
            expect(sheetStrip.closest('.thumbnail-strip')).toHaveClass('sheet');
            expect(sheetStrip.compareDocumentPosition(tabpanel.querySelector('.molecule-tile') as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            // Owner R25-A2: on a phone the tile sits in the open Explore sheet, and the sheet's own body is what scrolls
            // the list into view -- here a list at 600–900 under a body showing 400–800: down until its bottom clears, 8 px in.
            expect(tabpanel).toHaveClass('phone-sheet-body');
            const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
                const at = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
                if (this === tabpanel) return at(400, 400);
                if (this.classList.contains('molecule-orbital-list')) return at(600, 300);
                return at(0, 0);
            });
            try {
                tabpanel.scrollTop = 0;
                fireEvent.click(within(sheetStrip).getByRole('option', { name: 'Orbital list — go to the list' }));
                await flush(); // the switch to Orbitals renders the list a render later
                expect(document.activeElement).toBe(within(tabpanel).getByRole('button', { name: /1b1/ }));
                expect(tabpanel.scrollTop).toBe(900 - 800 + 8);
                expect(tabpanel.querySelector('.molecule-orbital-list')).toHaveClass('highlight');
            } finally {
                rects.mockRestore();
            }
        });
    });
});

describe('Molecules at Basics (Task 2, fix round 1)', () => {
    // Task 2: these tests read Molecules at the Basics level.
    beforeEach(() => { window.localStorage.setItem('eov.level', 'basics'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); window.localStorage.removeItem('eov.display'); });
    const originalMatchMedia = window.matchMedia;
    afterEach(() => { window.matchMedia = originalMatchMedia; });

    // Ruling T2-I2: the switch is Explore's, but the arrow drawn keeps its value, caveat and sign convention -- Task 7b:
    // in Info, which every level reads.
    it('keeps the dipole arrow\'s value, caveat and convention in Info, with no switch', async () => {
        const { store, container } = await enterMolecules(false);
        act(() => {
            store.dispatch(selectMolecule({ id: 'o3' }));
            store.dispatch(metaLoaded({ id: 'o3', meta: waterMeta({ id: 'o3', name: 'Ozone', caveat: 'Ozone has strong multireference character.' }) }));
        });
        const viewPanel = container.querySelector('.view-panel') as HTMLElement;
        expect(within(viewPanel).queryByRole('checkbox', { name: 'Dipole arrow' })).toBeNull();
        const info = viewPanel.querySelector('.info-section') as HTMLElement;
        expect(info).toHaveTextContent(/Dipole μ1\.86 D computed .*Ozone has strong multireference character\./);
        expect(info).toHaveTextContent(/The arrow points from − to \+ \(the physics convention\)/);
    });

    // Ruling T2-energies: orbital energies are Explore's; the list keeps names, occupancy and the frontier chips.
    it('lists the orbitals without their energies', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        const list = container.querySelector('.molecule-orbital-list') as HTMLElement;
        expect(list.querySelector('.molecule-orbital-energy')).toBeNull();
        expect(list).not.toHaveTextContent(/Ha/);
        expect(within(list).getByRole('button', { name: /1b1.*HOMO/ })).toBeInTheDocument();
        expect(list).toHaveTextContent('↑↓');
    });

    // Ruling T2-M7: structure options are Explore's, so the strip offers no Space filling tile at Basics.
    it('leaves the Space filling tile out of the strip', async () => {
        const { store } = await enterMolecules(false);
        pickWater(store);
        await flush();
        const strip = screen.getByRole('listbox', { name: 'views of this molecule' });
        expect(within(strip).getByRole('option', { name: 'Ball and stick structure' })).toBeInTheDocument();
        expect(within(strip).queryByRole('option', { name: 'Space filling structure' })).toBeNull();
    });
});

// Task 7b: Info owns Molecules' explanations; the geometry source and the Kohn–Sham caveat are each said once.
describe('Molecules Info (Task 7b)', () => {
    // Each test sets its own level (the stored preference), cleared after it.
    afterEach(() => { window.localStorage.removeItem('eov.level'); window.localStorage.removeItem('eov.display'); });
    const originalMatchMedia = window.matchMedia;
    afterEach(() => { window.matchMedia = originalMatchMedia; });

    /** Water with its shipped references: bond and angle from the experimental geometry, and the dipole. */
    const realWater = () => waterMeta({ references: [
        { quantity: 'bond', value: 0.958, unit: 'Å', source: 'experiment (CCCBDB)', tolerance: 0.01, atoms: [0, 1], label: 'O–H' },
        { quantity: 'angle', value: 104.5, unit: 'deg', source: 'experiment (CCCBDB)', tolerance: 1.0, atoms: [1, 0, 2], label: 'H–O–H' },
        { quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 }] });

    /** How often `text` occurs in what the page says. */
    const occurrences = (container: HTMLElement, text: string) => (container.textContent ?? '').split(text).length - 1;

    // Fix round 1 (I1): real water's references -- its bond and angle sourced "experiment (CCCBDB)", as the shipped data
    // has them (tests/fixtures/molecules/h2o/meta.json) -- so the open "How this was computed" at Research is counted too.
    it.each(['explore', 'research'])('on water\'s desktop view at %s, says the geometry source once and the Kohn–Sham caveat at most once', async level => {
        window.localStorage.setItem('eov.level', level);
        const water = realWater();
        (jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock }).loadMoleculeMeta.mockResolvedValueOnce(water);
        const { store, container } = await enterMolecules(false);
        pickWater(store, water);
        await flush();
        expect(store.getState().molecule.meta?.references).toHaveLength(3);
        if (level === 'research') expect((container.querySelector('details.info-computed') as HTMLDetailsElement).open).toBe(true);
        expect(occurrences(container, 'experiment (CCCBDB)')).toBe(1);
        // The tier line (title block) says "geometry from experiment", once.
        expect(occurrences(container, 'geometry from experiment')).toBe(1);
        act(() => { store.dispatch(setSurface({ kind: 'mo', index: 4 })); });
        expect(container.querySelector('.molecule-orbital-list')).not.toBeNull();
        expect(occurrences(container, 'experiment (CCCBDB)')).toBe(1);
        const text = container.textContent ?? '';
        expect(text.match(/ionisation energ/gi)?.length ?? 0).toBeLessThanOrEqual(1);
        expect(text.match(/neither the optical gap/g)?.length ?? 0).toBeLessThanOrEqual(1);
    });

    it('reads the ESP key\'s ends as "electron-rich" and "electron-poor"', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush(); // the loader's own meta request settles (no act warning)
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
        const key = within(container).getByLabelText('electrostatic potential colour key');
        const ends = key.querySelector('.esp-legend-ends') as HTMLElement;
        expect([...ends.children].map(end => end.textContent)).toEqual(['electron-rich', 'electron-poor']);
    });

    it('puts "How this was computed" in Info, with no footer pinned under Explore (ruling PF5)', async () => {
        window.localStorage.setItem('eov.level', 'research');
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        await flush();
        expect(container.querySelector('.molecule-provenance-footer')).toBeNull();
        const info = container.querySelector('.view-panel .info-section') as HTMLElement;
        const computed = info.querySelector('details.info-computed') as HTMLDetailsElement;
        expect(computed.open).toBe(true);
        expect(computed).toHaveTextContent('dipole: 1.855 D — CRC Handbook, via CCCBDB');
    });

    // Fix round 1 (ruling on concern 5): a phone's tier chip is compact (its line a tooltip no touch screen shows), so
    // Info states the line as its last note; a desktop says it once, in the title block, and Info does not repeat it.
    it('states the tier line as Info\'s last note on a phone, and not on a desktop', async () => {
        const line = 'Library: Curated; geometry from experiment; dipole checked against published values.';
        const loader = jest.requireMock('../src/molecules/loader') as { loadMoleculeMeta: jest.Mock };
        loader.loadMoleculeMeta.mockResolvedValueOnce(realWater());
        const phone = await enterMolecules(true);
        pickWater(phone.store, realWater());
        await flush();
        fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
        const notes = [...screen.getByRole('tabpanel').querySelectorAll('.info-notes')];
        expect(notes[notes.length - 1]).toHaveTextContent(line);
        phone.unmount();
        loader.loadMoleculeMeta.mockResolvedValueOnce(realWater());
        const desk = await enterMolecules(false);
        pickWater(desk.store, realWater());
        await flush();
        expect(desk.container.querySelector('.view-panel .info-section')).not.toHaveTextContent('Library: Curated');
        expect(desk.container.querySelector('.viewport-title')).toHaveTextContent('Curated; geometry from experiment; dipole checked against published values.');
    });

    // Task 4 review ruling: a Molecules (i) on a phone switches the sheet to the Info tab on its term.
    it('on a phone, the ESP key\'s (i) opens the Info tab on its term', async () => {
        const { store } = await enterMolecules(true);
        pickWater(store);
        await flush();
        act(() => { store.dispatch(setSurface({ kind: 'esp' })); });
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        fireEvent.click(screen.getByRole('button', { name: 'About Electrostatic potential' }));
        expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
        const info = screen.getByRole('tabpanel');
        expect(within(info).getByRole('heading', { level: 2, name: /^Info/ }).querySelector('.info-topic-chip'))
            .toHaveTextContent('Electrostatic potential');
    });
});
