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
    if (narrow) fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // the phone's mode menu (spec §9.8) replaced the Mode toggle in the View tab
    // Unanchored: the item's name is "Molecules (molecule mode)" (WCAG
    // 2.5.3, label in name). Ruling R23a: on a desktop this is now the top
    // bar's own tab (a link); the phone's mode menu (opened above) still
    // renders it as a button.
    fireEvent.click(screen.getByRole(narrow ? 'button' : 'link', { name: /molecule mode/ }));
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

    // Ruling R23f-2: pins the overlay mechanism itself, not just its visible
    // effect -- a future change back to resizing/re-scrolling the panel
    // above (rather than a true, out-of-flow overlay) would fail here even
    // before it reached a live check. `/tmp/check_overlay.mjs` (this task's
    // own live check, not committed) confirmed `.molecule-explore-scroll`'s
    // height/scrollTop/scrollHeight are unaffected by opening the overlay.
    it('positions the provenance overlay out of flow, scrolling inside its own cap', () => {
        const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
        const start = css.indexOf('.molecule-provenance-footer .provenance-body {');
        const rule = css.slice(start, css.indexOf('}', start));
        expect(rule).toMatch(/position:\s*absolute/);
        expect(rule).toMatch(/bottom:\s*100%/);
        expect(rule).toMatch(/overflow-y:\s*auto/);
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

    // Ruling R23f-2 (owner): "How this was computed" pinned to the Explore
    // panel's bottom edge, outside the part that scrolls, so it is never
    // out of reach and the Selection section above it keeps its full text.
    it('pins "How this was computed" below the scrolling part of the Explore panel', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store); // MoleculeProvenanceFooter renders nothing until a molecule is loaded
        const side = container.querySelector('.side-panel') as HTMLElement;
        const explore = side.querySelector('.molecule-explore') as HTMLElement;
        expect(explore).not.toBeNull();
        const scroll = explore.querySelector('.molecule-explore-scroll') as HTMLElement;
        const footer = explore.querySelector('.molecule-provenance-footer') as HTMLElement;
        expect(scroll).not.toBeNull();
        expect(footer).not.toBeNull();
        // Siblings, not one inside the other: the footer is not part of what scrolls.
        expect(scroll.contains(footer)).toBe(false);
        expect(footer.contains(scroll)).toBe(false);
        expect(within(footer).getByRole('button', { name: 'How this was computed' })).toBeInTheDocument();
        // The orbital list and the owner's job tools are the part that scrolls, not the footer.
        expect(scroll.querySelector('.molecule-nav')).not.toBeNull();
    });

    // Ruling R23f-2: pinned, the explanation is an overlay -- Esc closes it
    // too, the same as the link itself (MoleculeProvenanceFooter's onKeyDown,
    // the same find-the-expanded-trigger-and-click-it pattern
    // Inspector.tsx's drawer uses for its own Esc).
    it('closes the pinned "How this was computed" overlay on Esc', async () => {
        const { store, container } = await enterMolecules(false);
        pickWater(store);
        const footer = container.querySelector('.molecule-provenance-footer') as HTMLElement;
        const trigger = within(footer).getByRole('button', { name: 'How this was computed' });
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(footer, { key: 'Escape' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
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
