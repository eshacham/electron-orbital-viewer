import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'; // Add screen import
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './store/orbitalSlice';
import { SERIALIZABLE_CHECK } from './store';
import moleculeReducer from './store/moleculeSlice';
import jobsReducer from './store/jobsSlice';
import bondsReducer, { setDensityIso, setH2PlusR, setBondsView, setScanPoint, selectBondsSystem } from './store/bondsSlice';
import atomReducer, { AtomState, drillToOrbital, drillToShell, solveSucceeded, requestAtomView, setElement } from './store/atomSlice';
import { setSurfaceStyle, setBasicSelection, requestCut, finishOrbitalCalculation, startOrbitalCalculation } from './store/orbitalSlice';
import { SerialisedAtomProfile } from './workers/atomWorker';
import { createAtomWorker } from './workers/createAtomWorker';
import { basicOrbitalParams, computeSamplingRadius, SHELL_VIEW_CUT_AXIS, DEFAULT_ENCLOSED_FRACTION } from './orbital_presets';
import { clearProfileCacheForTests, setCachedProfile } from './atom/profile_cache';
import { resetUrlKeysForTests, registerBuiltInUrlKeys, applyStateTo, encodeStateOf } from './url_state';
import { registerBondsUrlKeys } from './bonds/bonds_url';
import type { ViewerExportHandle } from './export/handle';
import { createH2PlusCurveWorker } from './workers/createH2PlusCurveWorker';
import { resetH2PlusCurveForTests } from './bonds/useH2PlusCurve';
import { loadScan, loadMoleculeMeta, loadBasis } from './molecules/loader';
import type { MoleculeBasis, MoleculeMeta, MoleculeScan } from './molecules/types';
import { hintPref, renderPref } from './design/presentation';
import { MEDIUM_VIEWPORT } from './useMediaQuery';
import * as downloadModule from './export/download';
import { readBlob } from '../tests/export/fixtures';
import { DRAW_DEBOUNCE_MS } from './basic_ui/useDrawOnSelection';
import { thumbnailService } from './thumbs/ThumbnailService';
import { GLOW_SETTLE_MS } from './design/glow_pref';
import { clearVisit } from './levels/level_pref';
import { FIXED_RHO_NOTE } from './info/bonds_info';
import { nearestScanIndex } from './bonds/systems';
import App from './App';

// Mock OrbitalViewer component. A test that needs the 3D view's export
// handle sets mockViewerHandle; the mock hands it to App the way the real
// viewer fills exportHandleRef on mount.
let mockViewerHandle: ViewerExportHandle | null = null;
jest.mock('./components/OrbitalViewer', () => ({
    __esModule: true,
    default: ({ exportHandleRef }: { exportHandleRef?: { current: ViewerExportHandle | null } }) => {
        if (exportHandleRef) exportHandleRef.current = mockViewerHandle;
        return <div data-testid="orbital-viewer">Orbital Viewer Mock</div>;
    }
}));

// Mock just what App directly uses
jest.mock('./orbital_visualizer', () => ({
    getOptimizedParameters: () => ({ rMax: 15, isoLevel: 0.005 })
}));

// Atom mode is the app's default, so every render of <App/> below mounts
// useAtomSolver, which constructs a worker via createAtomWorker.ts --
// `import.meta.url` there is unparseable by this project's Babel-less
// ts-jest, so that module has to be mocked out rather than let load for
// real (see createAtomWorker.ts's own doc comment). The fake worker is
// otherwise inert: tests that need a completed solve use preloadedState
// instead of driving this worker's onmessage, which is exercised directly
// and thoroughly in tests/atom/use_atom_solver.test.tsx.
jest.mock('./workers/createAtomWorker', () => ({
    createAtomWorker: jest.fn(() => ({
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null,
        onerror: null,
    })),
}));

// Ruling C1: App now imports createExportWorker (import.meta.url), which
// this project's ts-jest cannot parse -- see createAtomWorker's mock above
// for the same reason. Nothing here drives it; the cube export path is
// covered directly in tests/export/cube_request.test.ts and run_export.test.ts.
jest.mock('./workers/createExportWorker', () => ({ createExportWorker: jest.fn() }));

// Ruling C7: App gates the H2+ curve worker to Bonds mode with H2+ selected,
// via useH2PlusCurve(enabled) -- another import.meta.url module, mocked here
// for the same reason as createAtomWorker/createExportWorker above. Nothing
// in this suite drives it; see tests/bonds/use_h2plus_curve.test.tsx.
jest.mock('./workers/createH2PlusCurveWorker', () => ({
    createH2PlusCurveWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null })),
}));

// Task 3 (picture control): Bonds' curve is drawn at its block's measured width (useElementWidth, a ResizeObserver),
// and nothing before. jsdom lays nothing out and has no ResizeObserver, so the block is "measured" at a fixed width
// here; tests/shell/use_element_width.test.tsx and tests/bonds/bonds_panel.test.tsx cover the measuring itself.
const mockCurveWidth = 268;
jest.mock('./shell/useElementWidth', () => ({ useElementWidth: () => [() => {}, mockCurveWidth] }));

// Bonds mode loads a molecule's files lazily (useBondsData); here they come
// from the committed N₂ fixtures instead of the network. The rest of the
// loader is the real one.
jest.mock('./molecules/loader', () => ({
    ...jest.requireActual('./molecules/loader'),
    loadScan: jest.fn(), loadMoleculeMeta: jest.fn(), loadBasis: jest.fn(),
}));
const n2Fixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../tests/fixtures/molecules/n2', file), 'utf8'));
const n2Scan: MoleculeScan = n2Fixture('scan.json');
const n2Meta: MoleculeMeta = n2Fixture('meta.json');
const n2Basis: MoleculeBasis = n2Fixture('basis.json');

/** A matchMedia stand-in reporting a fixed narrow/wide state (see tests/useMediaQuery.test.tsx for the original). */
function installMatchMedia(matches: boolean) {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({
        media,
        matches,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
}

/** Minimal but structurally faithful profile: one shell (n=1), one subshell (1s) -- hydrogen-shaped. */
function hydrogenProfile(): SerialisedAtomProfile {
    return {
        Z: 1,
        converged: true,
        rMin: 1e-3,
        dx: 0.05,
        size: 9,
        total: new Float32Array([0, 1, 2, 3, 2, 1, 0.5, 0.2, 0.05]),
        totalEmphasis: new Float32Array([0, 0.3, 0.6, 1, 0.6, 0.3, 0.1, 0.05, 0.01]),
        contourRadius: 2,
        valencePeakRadius: 1.2,
        displayRadius: 2,
        shellPeaks: new Float64Array([1.2]),
        shellIndexAtR: new Float32Array(9),
        shells: [
            {
                n: 1, electrons: 1, contourRadius: 2,
                curve: new Float64Array([0, 1, 2, 3, 2, 1, 0.5, 0.2, 0.05]),
                emphasis: new Float32Array([0, 0.3, 0.6, 1, 0.6, 0.3, 0.1, 0.05, 0.01]),
            },
        ],
        subshells: [
            {
                n: 1, l: 0, electrons: 1, energy: -0.5,
                curve: new Float64Array([0, 1, 2, 3, 2, 1, 0.5, 0.2, 0.05]),
                R: new Float64Array(9),
                samplingRadius: 2, compositeSamplingRadius: 2,
            },
        ],
    };
}

/**
 * A profile whose occupied 2p subshell carries a small `samplingRadius`
 * (~1.7, in argon's actual range -- see atom_profile.ts's
 * subshellSamplingRadius) -- structurally enough to drive App.tsx's level-3
 * effect, which dispatches this straight into the shared `orbital` slice.
 */
function argonLikeProfile(): SerialisedAtomProfile {
    return {
        Z: 18,
        converged: true,
        rMin: 1e-3,
        dx: 0.05,
        size: 9,
        total: new Float32Array([0, 1, 2, 3, 2, 1, 0.5, 0.2, 0.05]),
        totalEmphasis: new Float32Array([0, 0.3, 0.6, 1, 0.6, 0.3, 0.1, 0.05, 0.01]),
        contourRadius: 2,
        valencePeakRadius: 1.2,
        displayRadius: 2,
        shellPeaks: new Float64Array([0.06, 0.29, 1.22]),
        shellIndexAtR: new Float32Array(9),
        shells: [
            { n: 2, electrons: 8, contourRadius: 0.5, curve: new Float64Array(9), emphasis: new Float32Array(9) },
        ],
        subshells: [
            {
                n: 2, l: 0, electrons: 2, energy: -10.794,
                curve: new Float64Array(9),
                R: new Float64Array(9),
                samplingRadius: 2.5, compositeSamplingRadius: 2.5,
            },
            {
                n: 2, l: 1, electrons: 6, energy: -8.443,
                curve: new Float64Array(9),
                R: new Float64Array(9),
                samplingRadius: 1.7, compositeSamplingRadius: 1.7,
            },
        ],
    };
}

// Redux Toolkit's preloadedState *replaces* the slice's state outright
// rather than merging with its initialState, so a caller here only naming
// the fields it cares about (Z, profile, ...) would silently null out every
// other field (mode included) -- defaultAtomState fills in the rest.
const defaultAtomState: AtomState = {
    mode: 'atom',
    Z: 1,
    charge: 0,
    excitation: null,
    unbound: null,
    energies: { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null },
    solveNonce: 0,
    relativityOverride: null,
    level: 'atom',
    selectedShell: null,
    selectedSubshell: null,
    selectedOrbital: null,
    profile: null,
    isSolving: false,
    error: null,
    pendingView: null,
    hoverRadius: null,
};

// Simple store setup
const createTestStore = (atomState?: Partial<AtomState>) => configureStore({
    // App reads state.molecule too (Phase 6's Molecules mode).
    reducer: { orbital: orbitalReducer, atom: atomReducer, bonds: bondsReducer, molecule: moleculeReducer, jobs: jobsReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: SERIALIZABLE_CHECK }),
    preloadedState: atomState ? { atom: { ...defaultAtomState, ...atomState } } : undefined,
});

// Test wrapper
const renderWithProvider = (ui: React.ReactElement, atomState?: Partial<AtomState>) => {
    const store = createTestStore(atomState);
    return {
        store,
        ...render(
            <Provider store={store}>{ui}</Provider>
        )
    };
};

/**
 * Ruling R24-3: the inspector's sections are titled accordions, one open at a time -- Plot and data by
 * default, Display folded -- so a test that works a section's controls opens it first.
 */
const openInspectorSection = (name: 'Display' | 'Plot and data') => {
    const header = screen.queryByRole('button', { name, expanded: false });
    if (header) fireEvent.click(header);
};

// Ruling R24-3: the open inspector section is remembered in eov.display; start every test from the default.
// Task 2: a pasted link's hashchange can raise the level for the visit (module state); no test inherits one.
afterEach(() => { window.localStorage.removeItem('eov.display'); act(() => clearVisit()); });

describe('App', () => {
    // Task 2: these tests work controls above the default Explore level (charge, combinations, the enclosed fraction, the finish).
    beforeEach(() => { window.localStorage.setItem('eov.level', 'research'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); });
    const originalMatchMedia = window.matchMedia;
    afterEach(() => { window.matchMedia = originalMatchMedia; });
    beforeEach(() => {
        (createAtomWorker as jest.Mock).mockClear();
        // Task 20's main-thread profile cache is module-level state (see
        // profile_cache.ts), so without this a converged profile cached by
        // one test could silently short-circuit a later test's own
        // mount-time solve.
        clearProfileCacheForTests();
    });

    it('renders main components', () => {
        renderWithProvider(<App />);

        // Check if container exists by id
        expect(screen.getByTestId('orbital-viewer')).toBeInTheDocument();

        // Atom mode is the default: n/l/ml collapse into the drill-down, so
        // the element selector (not Basic Orbitals' selects) is what shows.
        // On a desktop viewport that selector is the periodic table.
        expect(screen.getByLabelText('periodic table')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /atom mode/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /basic orbitals mode/i })).toBeInTheDocument();
    });

    it('defaults to atom mode and shows LevelNav for the default element', () => {
        renderWithProvider(<App />);

        // The element is the head of the card, and the way to change it --
        // it reopens the periodic table.
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(screen.queryByLabelText('periodic table')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /change element, currently Hydrogen/i }));
        expect(screen.getByLabelText('periodic table')).toBeInTheDocument();
    });

    // Ruling P3: the chip draws on selection; Update Orbital is gone. The n/l/mL selects
    // became BasicExplore's chip row (Phase 6G-2 Task 6; Task 1 picture control: Shell n is
    // the only one left -- the strip picks l and mₗ now, tested in "the strip holds every orbital of n").
    it('switching to Basic Orbitals restores the Shell n chips, with no element control of its own', () => {
        renderWithProvider(<App />);

        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));

        expect(screen.getByRole('group', { name: /^shell n/i })).toBeInTheDocument(); // Task 5: named by its visible label
        // Addendum 2's mode rename: no second element control, Z fixed at 1
        // -- but the one-electron framing still stated outright (spec §7).
        expect(screen.queryByRole('combobox', { name: /Nucleus/i })).not.toBeInTheDocument();
        // Anchored: the top bar's search combobox is "Search elements, …" (spec §8.3); this pins the old Element select.
        expect(screen.queryByRole('combobox', { name: /^Element/i })).not.toBeInTheDocument();
        // Task 5: the framing moved from the Explore panel into Info (basicInfo), where it is still said outright.
        expect(within(screen.getByRole('region', { name: /^Info/ })).getByText(/one electron, Z = 1/i)).toBeInTheDocument();
        // LevelNav is atom-mode only.
        expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument();
    });

    // Spec bugfix / regression guard: both modes' marching-cubes path reads
    // the same `orbital.currentParams`, and atom mode's level 3 dispatches
    // into it with a tiny, subshell-specific rMax (~1.7 a0 for argon's 2p,
    // per the fix in App.tsx / atom_profile.ts's subshellSamplingRadius).
    // Switching to Basic Orbitals without this fix left that leftover
    // rMax in place -- at that scale a hydrogen 3d's sampling box holds only
    // its innermost, near-featureless tail, rendering as a blob instead of
    // the correct lobed shape. The fix must reset to
    // computeSamplingRadius(n, l, Z) on the mode transition itself.
    it('switching out of atom mode resets rMax to the Basic Orbitals panel\'s own value, not whatever atom mode last set', () => {
        const { store } = renderWithProvider(<App />, {
            mode: 'atom',
            Z: 18,
            level: 'orbital',
            selectedShell: 2,
            selectedSubshell: { n: 2, l: 1 },
            selectedOrbital: { n: 2, l: 1, ml: 0 },
            profile: argonLikeProfile(),
        });

        // Confirm the level-3 effect actually ran and left the small
        // atom-mode rMax in the shared slice, so the assertion below is
        // proof the switch *changed* it rather than it having never been set.
        expect(store.getState().orbital.currentParams?.rMax).toBeCloseTo(1.7);

        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));

        // App.tsx's default Basic Orbitals selection is n=3, l=2, and Z is
        // now fixed at 1 for the whole mode (BASIC_ORBITALS_Z).
        expect(store.getState().orbital.currentParams?.rMax).toBeCloseTo(computeSamplingRadius(3, 2, 1));
    });

    it('drilling into a shell shows the SubshellPanel, and drilling back out hides it', () => {
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

        // Hydrogen has exactly one shell (K, n=1); LevelNav exposes it as a
        // clickable chip built from shellsFor(Z), per ruling R26.
        // Final review M2: shell names are spaced, "L shell (n = 2)".
        fireEvent.click(screen.getByText(/K shell \(n = 1\)/));

        expect(screen.getByLabelText('subshells')).toBeInTheDocument();

        // Back to the whole atom via the breadcrumb's first segment --
        // atomSlice.goToLevel, since drillToShell/Subshell/Orbital have no
        // "no n/l/ml at all" case of their own.
        fireEvent.click(screen.getByRole('button', { name: 'Hydrogen' }));
        expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
    });

    // Task 16 (spec §3.3, §13; rulings T16-tilekey, T16-optname): the strip's
    // orbital tiles are ψ-coloured, so at shell level the key column keys them
    // too -- only while the strip shows them.
    it('keys the strip\'s orbital tiles at shell level, and only while the strip shows them', () => {
        installMatchMedia(false);
        const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBeInTheDocument();
        // The whole atom's strip is ring glyphs, keyed by the shell key.
        expect(screen.queryByLabelText('orbital tile colour key')).toBeNull();

        act(() => { store.dispatch(drillToShell(1)); });
        expect(screen.getByRole('option', { name: '1s orbital' })).toBeInTheDocument();
        expect(screen.getByLabelText('shell colour key')).toBeInTheDocument();
        expect(screen.getByLabelText('orbital tile colour key')).toHaveTextContent('Orbital tilesψ > 0ψ < 0');

        // Ruling R23b-3: the handle's name is now "Hide orbitals" (was "Hide the orbital strip").
        fireEvent.click(screen.getByRole('button', { name: 'Hide orbitals' }));
        expect(screen.queryByLabelText('orbital tile colour key')).toBeNull();
    });

    // A shell view is nothing but its cut face, but an orbital is a closed
    // surface: the inherited half-cut hid half of 4f_z³. Entering an orbital
    // clears the cut; stepping back out restores the shell view's own.
    it('clears the cut on entering an orbital and restores it on the way back out', () => {
        installMatchMedia(false);
        const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        act(() => { store.dispatch(setSurfaceStyle({ clipAxis: 'y', clipPosition: 0.3 })); });

        act(() => { store.dispatch(drillToShell(1)); });
        act(() => { store.dispatch(drillToOrbital(1, 0, 0)); });
        // Off, and centred for when an axis is picked here.
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'none', clipPosition: 0 });

        act(() => { store.dispatch(drillToShell(1)); });
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'y', clipPosition: 0.3 });
    });

    it('does not carry the atom view\'s cut into Basic Orbitals, and brings it back on return', () => {
        installMatchMedia(false);
        const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        act(() => { store.dispatch(setSurfaceStyle({ clipAxis: 'z', clipPosition: -0.2 })); });

        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        expect(store.getState().orbital.surfaceStyle.clipAxis).toBe('none');

        // Unanchored: the top bar's tab name is "Atoms (atom mode)" (WCAG 2.5.3, label in name).
        fireEvent.click(screen.getByRole('link', { name: /atom mode/i }));
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'z', clipPosition: -0.2 });
    });

    // Spec bugfix: the radial plot used to keep showing every subshell of the
    // parent shell (2s alongside 2p) all the way down to level 3, instead of
    // narrowing to the one subshell actually selected -- D(r)/P(r) doesn't
    // depend on mL at all, so once a subshell is picked (with or without an
    // mL choice on top of it) there is exactly one curve to show.
    it('narrows the radial plot to the selected subshell once one is picked, not the whole parent shell', () => {
        const { container } = renderWithProvider(<App />, {
            mode: 'atom',
            Z: 18,
            level: 'orbital',
            selectedShell: 2,
            selectedSubshell: { n: 2, l: 1 },
            selectedOrbital: { n: 2, l: 1, ml: 0 },
            profile: argonLikeProfile(),
        });

        const legendLabels = Array.from(container.querySelectorAll('.radial-plot-legend-item'))
            .map(el => el.textContent);
        expect(legendLabels).toEqual(['2p']);
    });

    // Ruling R17: a solver that did not converge must show up as an
    // explicit error, never as a silently-wrong rendered picture. Driven
    // through the real mount-time solve (useAtomSolver dispatches
    // solveStarted on every mount in atom mode, which would otherwise wipe
    // out a merely-preloaded error) rather than preloaded state.
    it('shows an explicit error instead of a profile when the solve did not converge', () => {
        renderWithProvider(<App />);
        const worker = (createAtomWorker as jest.Mock).mock.results[0].value;
        // Task 20: replies are now matched to their request by an echoed
        // requestId (see useAtomSolver.ts) rather than by the worker's
        // create-terminate lifecycle, so a hand-built reply has to carry
        // whatever id the mount-time request actually posted.
        const { requestId } = worker.postMessage.mock.calls[0][0];

        act(() => {
            worker.onmessage({ data: { type: 'success', profile: { ...hydrogenProfile(), converged: false }, requestId } });
        });

        expect(screen.getByRole('alert')).toHaveTextContent(/did not converge/i);
        expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
        // Ruling FR-2: the energies, which wait for the picture, say why they never came.
        expect(screen.getAllByText(/not computed — the picture's solve failed/).length).toBeGreaterThan(0);
    });

    // Addendum 3: the periodic table replaces the dropdown on desktop, and
    // the dropdown remains the narrow-screen fallback. Exactly one of the
    // two must be present, never both and never neither.
    describe('element selector', () => {
        it('uses the periodic table, not the dropdown, on a desktop viewport', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            expect(screen.getByLabelText('periodic table')).toBeInTheDocument();
            expect(container.querySelectorAll('.periodic-tile')).toHaveLength(118);
            // Anchored: the top bar's search combobox is "Search elements, …" (spec §8.3); this pins the old Element select.
            expect(screen.queryByRole('combobox', { name: /^Element/i })).not.toBeInTheDocument();
        });

        it('opens a searchable list from the element name on a phone, where a table does not fit', () => {
            installMatchMedia(true);
            const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            expect(screen.queryByLabelText('periodic table')).not.toBeInTheDocument();
            // Not buried in the sideways-scrolling controls strip any more.
            expect(screen.queryByRole('combobox', { name: /Element/i })).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: /change element, currently Hydrogen/i }));
            fireEvent.change(screen.getByLabelText('filter elements'), { target: { value: 'iron' } });
            fireEvent.click(screen.getByRole('button', { name: /Iron/ }));

            expect(store.getState().atom.Z).toBe(26);
        });

        it('is not shown at all in Basic Orbitals mode, which has no element', () => {
            installMatchMedia(false);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));

            expect(screen.queryByLabelText('periodic table')).not.toBeInTheDocument();
        });

        it('solves the element a tile selects', () => {
            installMatchMedia(false);
            const { container, store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            fireEvent.click(container.querySelector('.periodic-tile[data-z="26"]')!);

            expect(store.getState().atom.Z).toBe(26);
            expect(store.getState().atom.isSolving).toBe(true);
        });
    });

    // A phone gets a one-line header (Back, the element, where you are) and a
    // tabbed sheet -- Explore, View, Plot -- instead of the desktop columns.
    describe('phone layout', () => {
        it('keeps the element and the way back in a header that is always on screen', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            expect(screen.getByRole('button', { name: /change element, currently Hydrogen/i })).toBeInTheDocument();
            // The sheet starts folded to its tabs: the atom gets the screen.
            expect(screen.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'false');
            expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
        });

        it('drills down from the Explore tab, and the header then offers the way back', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            // Final review M2: shell names are spaced, "L shell (n = 2)".
            fireEvent.click(screen.getByText(/K shell \(n = 1\)/));

            expect(screen.getByRole('button', { name: /back to Hydrogen/i })).toBeInTheDocument();
            expect(screen.getByLabelText('subshells')).toBeInTheDocument();
        });

        it('puts the view settings on their own tab, and a second tap folds the sheet', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            const view = screen.getByRole('tab', { name: 'View' });
            fireEvent.click(view);
            expect(screen.getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument(); // the Mode toggle moved to the phone's mode menu (spec §9.8)
            // Ruling R22a (owner): the View tab has no colour-scheme choice.
            expect(screen.queryByRole('group', { name: 'colour scheme' })).toBeNull();
            expect(screen.queryByText('Colour scheme')).toBeNull();
            fireEvent.click(view);
            expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
        });

        it('opens the Explore tab on the orbital strip, as its first row (spec §9.8)', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            const panel = screen.getByRole('tabpanel');
            const strip = within(panel).getByRole('listbox', { name: 'orbitals in view' });
            expect(panel.firstElementChild!.contains(strip)).toBe(true);
        });
    });

    // Ruling P3 / plan step 5: the phone sheet reuses BasicExplore itself. Task 4 (plan: sheet tabs Explore · Info ·
    // View · Plot in every mode) splits the old "Orbital & view" tab: the chips and the combination picker in Explore,
    // the view settings in View.
    it('on a phone, puts the chips and the combination picker in Explore and the view settings in View', () => {
        installMatchMedia(true);
        renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // spec §9.8
        fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
        expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Explore', 'Info', 'View', 'Plot']);
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const explore = screen.getByRole('tabpanel');
        expect(within(explore).getByRole('group', { name: /^shell n/i })).toBeInTheDocument(); // Task 5: named by its visible label
        expect(within(explore).getByRole('combobox', { name: /combination/i })).toBeInTheDocument();
        expect(within(explore).queryByRole('slider', { name: 'surface opacity' })).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'View' }));
        const view = screen.getByRole('tabpanel');
        expect(within(view).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
        expect(within(view).queryByRole('group', { name: /^shell n/i })).toBeNull();
    });

    // Task 5 (Task 4 review ruling): the first real (i) in the app. On a phone, pressing one switches the sheet to the
    // Info tab, showing the term; pressing the active (i) again returns Info to the selection without switching tabs.
    it('on a phone, an Orbitals (i) opens the Info tab on its term, and pressing it again clears the term in place', () => {
        installMatchMedia(true);
        renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Mode: / }));
        fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Shell' }));
        // (a) the sheet is on Info, and Info names the term.
        expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
        const info = screen.getByRole('tabpanel');
        expect(within(info).getByRole('heading', { level: 2, name: /^Info/ }).querySelector('.info-topic-chip')).toHaveTextContent('Shell');
        // (c) back on Explore the (i) is still the active one; pressing it clears the term and stays on Explore.
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const shell = within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Shell' });
        expect(shell).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(shell);
        expect(screen.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'false');
        expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Shell' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
        expect(document.querySelector('.info-topic-chip')).toBeNull();
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(screen.getByRole('tabpanel').querySelector('.info-title')).toHaveSeenText('Hydrogen — 3dz² orbital');
    });

    // Task 4: Info is the phone sheet's second tab -- Explore · Info · View · Plot -- holding the same Info as the
    // desktop's inspector (Review Focus 5).
    it('on a phone, gives Atoms the tabs Explore, Info, View and Plot, Info naming the view', () => {
        installMatchMedia(true);
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Explore', 'Info', 'View', 'Plot']);
        fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
        const panel = screen.getByRole('tabpanel');
        expect(within(panel).getByRole('heading', { level: 2, name: 'Info' })).toBeInTheDocument();
        // Task 9 review I3: the heading's hidden description repeats the title, so the visible title is the one asked for.
        expect(within(panel).getByText('Hydrogen — whole atom', { selector: '.info-title' })).toBeInTheDocument();
    });

    // Task 6 (Task 4 review ruling): an Atoms (i) on a phone switches the sheet to the Info tab on its term; pressing
    // the active one again clears the term and stays where it is.
    it('on a phone, an Atoms (i) opens the Info tab on its term, and pressing it again clears the term in place', () => {
        installMatchMedia(true);
        renderWithProvider(<App />, { Z: 18, profile: argonLikeProfile() });
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Shell' }));
        expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
        const info = screen.getByRole('tabpanel');
        expect(within(info).getByRole('heading', { level: 2, name: /^Info/ }).querySelector('.info-topic-chip')).toHaveTextContent('Shell');
        expect(info).toHaveTextContent(/A shell is a set of orbitals/);
        fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
        const shell = within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Shell' });
        expect(shell).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(shell);
        expect(screen.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
        expect(document.querySelector('.info-topic-chip')).toBeNull();
        expect(screen.getByRole('tabpanel').querySelector('.info-title')).toHaveTextContent('Argon — whole atom');
    });

    // Task 6 fix round 1 ruling: a neutral atom's IE is a key number at Explore, in Info -- its label's (i) opens the
    // ionisation entry -- while the panel's line and NIST wait for Advanced.
    it('at Explore, shows a neutral atom\'s ionisation energy in Info, with an (i) to the ionisation entry', () => {
        installMatchMedia(false);
        // Explore, whatever this block's own level is (the stored preference; cleared after each test).
        window.localStorage.setItem('eov.level', 'explore');
        const { container } = renderWithProvider(<App />, {
            Z: 18, profile: argonLikeProfile(),
            energies: { speciesKey: '18', status: 'done', ionisation: { valueEv: 15.52, fromLabel: 'Ar', toLabel: 'Ar⁺' }, excitation: null, message: null },
        });
        const info = container.querySelector('.info-section') as HTMLElement;
        expect(info).toHaveTextContent('Ionisation energy (Ar → Ar⁺)15.52 eV');
        expect(info).not.toHaveTextContent('NIST');
        expect(container.querySelector('.species-energy')).toBeNull();
        fireEvent.click(within(info).getByRole('button', { name: 'About Ionisation energy' }));
        expect(container.querySelector('.info-topic-chip')).toHaveTextContent('Ionisation energy');
    });

    // Final review M3: Orbitals' Nodes fact carries the (i) that opens Node in Info.
    it('in Orbitals, the Nodes fact\'s (i) opens Info on Node', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        const info = container.querySelector('.info-section') as HTMLElement;
        fireEvent.click(within(info).getByRole('button', { name: 'About Nodes' }));
        expect(container.querySelector('.info-topic-chip')).toHaveTextContent('Node');
    });

    // Task 6 fix round 2 (owner: only one (i) is ever shown pressed) had a second ionisation (i) on the panel's line.
    // Task 9b (fix 2): that line is gone -- Info's fact is the energy's one home -- so its (i) is the only one, and
    // pressing it opens the entry (Info then shows the entry, not the fact). The per-instance rule itself is pinned in
    // tests/info/info_button.test.tsx.
    it('in Atoms, gives the ionisation energy one (i), Info\'s', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />, {
            Z: 18, profile: argonLikeProfile(),
            energies: { speciesKey: '18', status: 'done', ionisation: { valueEv: 15.52, fromLabel: 'Ar', toLabel: 'Ar⁺' }, excitation: null, message: null },
        });
        expect(container.querySelector('.species-energy')).toBeNull();
        expect(screen.getAllByRole('button', { name: 'About Ionisation energy' })).toHaveLength(1);
        const infoButton = within(container.querySelector('.info-section') as HTMLElement).getByRole('button', { name: 'About Ionisation energy' });
        fireEvent.click(infoButton);
        expect(container.querySelector('.info-topic-chip')).toHaveTextContent('Ionisation energy');
        expect(screen.queryAllByRole('button', { name: 'About Ionisation energy' })).toHaveLength(0);
    });

    // Task 6: the Atoms panels keep controls and short labelled values; their captions are Info's (atomInfo).
    it('in Atoms, the Explore panel has no About, shell hint or isolate hint -- Info says them', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />, {
            Z: 18, profile: argonLikeProfile(), level: 'shell', selectedShell: 2, selectedSubshell: { n: 2, l: 1 },
        });
        const explore = container.querySelector('.explore-panel')!;
        expect(explore).not.toBeNull();
        for (const caption of ['.level-nav-about', '.level-nav-method', '.level-nav-shell-hint', '.subshell-isolate-hint', '.level-nav-valence-note']) {
            expect(explore.querySelector(caption)).toBeNull();
        }
        fireEvent.click(within(explore as HTMLElement).getByRole('tab', { name: 'Orbitals' }));
        expect(container.querySelector('.explore-panel .level-nav-about')).toBeNull();
        expect(container.querySelector('.info-section')).toHaveTextContent('Showing 2p alone — click its chip again for the whole shell.');
        expect(container.querySelector('.info-section .info-title')).toHaveTextContent('Argon — 2p');
    });

    // Task 6: the cut face's shading caveat was printed twice, under the plot and in the key column; Info says it once.
    it('in Atoms, says the cut-face caption exactly once on screen, in Info', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />, { Z: 18, profile: argonLikeProfile() });
        expect(container.querySelector('.shell-ring-key')).not.toBeNull();
        const text = document.body.textContent ?? '';
        expect(text.match(/cut face shading is scaled to local shell structure/gi)).toHaveLength(1);
        expect(container.querySelector('.info-section')).toHaveTextContent(/Cut face shading is scaled to local shell structure\./);
    });

    // Plan step 5 / ruling P3: useDrawOnSelection's debounce never fires on mount, so
    // entering the mode (the nonce effect's own draw) must not be followed by a second,
    // redundant draw 150 ms later for the very same, unchanged selection.
    it('entering the mode draws once (nonce), not twice', () => {
        jest.useFakeTimers();
        try {
            const { store } = renderWithProvider(<App />);
            const dispatchSpy = jest.spyOn(store, 'dispatch');
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            const drawsAtEntry = dispatchSpy.mock.calls.filter(([action]) => action.type === startOrbitalCalculation.type).length;
            expect(drawsAtEntry).toBe(1);
            act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
            const drawsAfterWaiting = dispatchSpy.mock.calls.filter(([action]) => action.type === startOrbitalCalculation.type).length;
            expect(drawsAfterWaiting).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });

    describe('Basic Orbitals combinations', () => {
        const chooseCombination = (option: string | RegExp) => {
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
        };

        beforeEach(() => installMatchMedia(false));

        it('draws a chosen combination at once, with its key and its radial components', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            chooseCombination('sp³');

            expect(store.getState().orbital.currentField?.sources.map(s => s.id))
                .toEqual(['hybrid:sp3:0', 'hybrid:sp3:1', 'hybrid:sp3:2', 'hybrid:sp3:3']);
            expect(store.getState().orbital.currentParams).toBeNull();
            expect(screen.getByLabelText('combination colour key')).toHaveTextContent('h₁');
            expect(screen.queryByLabelText('surface colour key')).not.toBeInTheDocument();
            expect(screen.getByText('each hybrid: ¼·2s + ¾·2p')).toBeInTheDocument();
        });

        it('redraws when the enclosed fraction changes, with no Update step', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            chooseCombination('Electric field');
            openInspectorSection('Display');
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
            expect(store.getState().orbital.currentField?.enclosedFraction).toBe(0.75);
            expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'polarized1s', field: 0.03 });
        });

        // Ruling T20b-enclosed: the inspector's enclosed fraction applies on change, with the
        // same dispatch a chip's own debounced draw sends (ruling P3: Update Orbital is gone).
        it('redraws the orbital in the panel when the enclosed fraction changes', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            const { n, l, ml } = store.getState().orbital.basicSelection;
            const inspector = screen.getByRole('complementary', { name: 'Inspector' });
            openInspectorSection('Display');
            fireEvent.mouseDown(within(inspector).getByRole('combobox', { name: /electron enclosed/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
            expect(store.getState().orbital.enclosedFraction).toBe(0.75);
            expect(store.getState().orbital.currentParams).toEqual(basicOrbitalParams(n, l, ml, 0.75));
            expect(store.getState().orbital.isLoading).toBe(true);
        });

        // Review Focus 1.
        it('None redraws the orbital in the panel', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            chooseCombination('sp');
            chooseCombination(/None/);
            expect(store.getState().orbital.currentField).toBeNull();
            expect(store.getState().orbital.currentParams).toMatchObject({ n: 3, l: 2, ml: 0, Z: 1 });
        });

        // Review Focus 2.
        it('a combination survives a round trip through atom mode, and is not drawn there', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            chooseCombination('sp²');
            fireEvent.click(screen.getByRole('link', { name: /atom mode/i }));
            expect(store.getState().orbital.currentField).toBeNull();
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            expect(store.getState().orbital.currentField?.sources.map(s => s.id))
                .toEqual(['hybrid:sp2:0', 'hybrid:sp2:1', 'hybrid:sp2:2']);
            expect(store.getState().orbital.currentParams).toBeNull();
        });
    });

    describe('ions and excited states', () => {
        /** The solver's first post, answered with a one-shell profile for `speciesKey`. */
        const landPicture = (speciesKey: string, Z: number) => {
            const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
            const { requestId } = solver.postMessage.mock.calls[0][0];
            act(() => {
                solver.onmessage({ data: { type: 'success', profile: { ...hydrogenProfile(), Z, speciesKey }, requestId } });
            });
        };

        /** The solver's first post, answered as an anion LDA does not bind. */
        const replyUnbound = () => {
            const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
            const { requestId } = solver.postMessage.mock.calls[0][0];
            act(() => {
                solver.onmessage({ data: { type: 'unbound', message: 'LDA does not bind this anion: its 3p electron is not bound.', requestId } });
            });
        };

        it('puts the charge controls in the navigation card on a desktop', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { Z: 11 });
            expect(container.querySelector('.side-panel .species-controls')).not.toBeNull();
            expect(container.querySelector('.view-panel .species-controls')).toBeNull();
        });

        it('stepping the charge starts a solve for the ion', () => {
            installMatchMedia(false);
            renderWithProvider(<App />, { Z: 11 });
            const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
            fireEvent.click(screen.getByRole('button', { name: 'increase charge' }));
            expect(solver.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'solve', Z: 11, charge: 1 }));
        });

        // Carry from Tasks 9/11: like picking an element, a species change is
        // solving from the very render it happens in, and a link's cut still
        // waiting on the old species does not land on the new one. Unlike
        // picking an element, the camera stays put -- that is what lets Na⁺
        // visibly shrink against the scale bar.
        it('a charge step is solving at once, drops a waiting link cut, and leaves the camera alone', () => {
            installMatchMedia(false);
            const { store } = renderWithProvider(<App />, { Z: 11 });
            act(() => {
                store.dispatch(requestAtomView({ level: 'shell', shell: 3, subshell: null, orbital: null }));
                store.dispatch(requestCut({ clipAxis: 'x', clipPosition: 0.5 }));
                store.dispatch(setSurfaceStyle({ clipPosition: 0.2 }));
            });
            const resetNonce = store.getState().orbital.viewResetNonce;
            fireEvent.click(screen.getByRole('button', { name: 'increase charge' }));
            expect(store.getState().atom).toMatchObject({ charge: 1, isSolving: true });
            expect(store.getState().orbital.pendingCut).toBeNull();
            expect(store.getState().orbital.surfaceStyle.clipPosition).toBe(0.2);
            expect(store.getState().orbital.viewResetNonce).toBe(resetNonce);
        });

        // The same pairing for an excitation (fix round 1, M5).
        it('an excitation is solving at once, drops a waiting link cut, and leaves the camera alone', () => {
            installMatchMedia(false);
            const { store } = renderWithProvider(<App />, { Z: 11 });
            act(() => {
                store.dispatch(requestAtomView({ level: 'shell', shell: 3, subshell: null, orbital: null }));
                store.dispatch(requestCut({ clipAxis: 'x', clipPosition: 0.5 }));
                store.dispatch(setSurfaceStyle({ clipPosition: 0.2 }));
            });
            const resetNonce = store.getState().orbital.viewResetNonce;
            fireEvent.click(screen.getByRole('button', { name: /Excite/ }));
            fireEvent.click(screen.getByRole('menuitem', { name: '3s → 3p' }));
            expect(store.getState().atom).toMatchObject({ excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } }, isSolving: true });
            expect(store.getState().orbital.pendingCut).toBeNull();
            expect(store.getState().orbital.surfaceStyle.clipPosition).toBe(0.2);
            expect(store.getState().orbital.viewResetNonce).toBe(resetNonce);
        });

        it('shows "LDA does not bind this anion" instead of a picture', () => {
            installMatchMedia(false);
            renderWithProvider(<App />, { Z: 17, charge: -1 });
            const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
            const { requestId } = solver.postMessage.mock.calls[0][0];
            act(() => {
                solver.onmessage({ data: { type: 'unbound', message: 'LDA does not bind this anion: its 3p electron has no bound state (eigenvalue ≥ 0).', requestId } });
            });
            expect(screen.getAllByText(/LDA does not bind this anion/).length).toBeGreaterThan(0);
            expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
        });

        it('shows an unbound anion\'s shells as unavailable, with its configuration still named', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { Z: 17, charge: -1 });
            replyUnbound();
            const chips = container.querySelectorAll('.side-panel .level-nav-shell-chip');
            expect(chips).toHaveLength(3);
            chips.forEach(chip => expect(chip).toHaveAttribute('aria-disabled', 'true'));
            expect(container.querySelector('.side-panel .level-nav-configuration')).toHaveTextContent('3p⁶');
        });

        // One alert, not two: the card's own (SpeciesControls) is announced;
        // the note over the empty canvas only says it again for the eye.
        it('announces an unbound anion once, with the note over the canvas hidden from assistive technology', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { Z: 17, charge: -1 });
            replyUnbound();
            expect(screen.getAllByRole('alert')).toHaveLength(1);
            expect(container.querySelector('.canvas-unbound')).toHaveAttribute('aria-hidden', 'true');
        });

        // A folded phone sheet has no card on screen, so the canvas note is
        // the only place the reason is said: a status there, still not a
        // second alert.
        // A folded phone sheet has no card on screen, so the canvas note is
        // the only place the reason is said. It is announced through a
        // status region that was already mounted (fix round 1, M4): a live
        // region inserted together with its text is not reliably read.
        it('on a phone with the sheet folded, fills an already-mounted status region with the reason', () => {
            installMatchMedia(true);
            const { container } = renderWithProvider(<App />, { Z: 17, charge: -1 });
            const live = container.querySelector('.canvas-unbound-live')!;
            expect(live).toHaveAttribute('role', 'status');
            expect(live).toBeEmptyDOMElement();

            replyUnbound();
            expect(container.querySelector('.canvas-unbound-live')).toBe(live);
            expect(screen.queryAllByRole('alert')).toHaveLength(0);
            expect(live).toHaveTextContent('LDA does not bind this anion');

            // Explore open: the card's alert speaks, the region empties, and
            // the note over the canvas is for the eye only.
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            expect(screen.getAllByRole('alert')).toHaveLength(1);
            expect(live).toBeEmptyDOMElement();
            expect(container.querySelector('.canvas-unbound')).toHaveAttribute('aria-hidden', 'true');
        });

        it('says which species it is solving', () => {
            installMatchMedia(false);
            jest.useFakeTimers();
            try {
                renderWithProvider(<App />, { Z: 11, charge: 1, isSolving: true });
                act(() => { jest.advanceTimersByTime(500); });
                expect(screen.getByText('Solving Sodium ion Na⁺…')).toBeInTheDocument();
            } finally {
                jest.useRealTimers();
            }
        });

        // Ruling C15: the energies wait for the picture, in a second worker.
        it('asks for the ΔSCF energies once the ion\'s picture has landed', () => {
            installMatchMedia(false);
            renderWithProvider(<App />, { Z: 11, charge: 1 });
            expect(createAtomWorker).toHaveBeenCalledTimes(1);
            landPicture('11+1', 11);
            const energies = (createAtomWorker as jest.Mock).mock.results[1].value;
            expect(energies.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'energies', Z: 11, charge: 1 }));
            const { requestId } = energies.postMessage.mock.calls[0][0];
            act(() => {
                energies.onmessage({ data: { type: 'energies', speciesKey: '11+1', ionisation: { valueEv: 47.1, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null, requestId } });
            });
            // Task 9b (fix 2): Info's fact is the energy's one home; the panel has no line for it.
            expect(document.querySelector('.species-energy')).toBeNull();
            expect(document.querySelector('.info-section')).toHaveTextContent(/47\.10 eV/);
        });

        it('names the ion in the phone header and puts the controls in the Explore tab', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 11, charge: 1 });
            expect(screen.getByRole('button', { name: /change element/i })).toHaveTextContent('Na⁺ · Sodium');
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            expect(screen.getByLabelText('ion and excitation')).toBeInTheDocument();
        });

        it('the Explore tab opens on the charge controls, above the configuration', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 11 });
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            const panel = screen.getByRole('tabpanel');
            const controls = panel.querySelector('.species-controls')!;
            const configuration = panel.querySelector('.level-nav-configuration')!;
            expect(controls.compareDocumentPosition(configuration) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });
    });

    describe('Bonds mode', () => {
        const chooseCombination = (option: string | RegExp) => {
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
        };
        const chooseFraction = (option: string) => {
            openInspectorSection('Display');
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
        };
        // Ruling R23e: the select's label is now "Molecule (by bond type)" (grouped by bond type, each with its bond order).
        const chooseSystem = (option: string) => {
            fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Molecule (by bond type)' }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
        };

        beforeEach(() => {
            installMatchMedia(false);
            resetH2PlusCurveForTests();
            (createH2PlusCurveWorker as jest.Mock).mockClear();
            (loadScan as jest.Mock).mockReset().mockResolvedValue(n2Scan);
            // Each scan point's files carry that point's id (n2@07), which is what the request checks.
            (loadMoleculeMeta as jest.Mock).mockReset().mockImplementation(async (id: string) => ({ ...n2Meta, id }));
            (loadBasis as jest.Mock).mockReset().mockImplementation(async (id: string) => ({ ...n2Basis, id }));
        });

        it('draws exact H2+ and shows the Bonds panel beside the curve', () => {
            const { store, container } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'h2plus', R: 2, state: '1sigma_g' });
            expect(screen.getByLabelText('molecular orbital energy diagram')).toBeInTheDocument();
            // Task 3 (picture control): the panel down the left, with the curve in it under the R slider (layout contract
            // §3.8 had it under the controls on the right); the inspector keeps Data.
            expect(container.querySelector('.side-panel .bonds-panel')).not.toBeNull();
            const inspector = container.querySelector('.view-panel') as HTMLElement;
            expect(within(container.querySelector('.side-panel') as HTMLElement).getByText('Computing the exact H₂⁺ curves…')).toBeInTheDocument();
            expect(within(inspector).queryByText('Computing the exact H₂⁺ curves…')).toBeNull();
            expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ψ > 0');
            // Task 7a: the methods list ("Exact within Born–Oppenheimer …") is Info's "How this was computed" now
            // (bondsInfo; open at this block's Research level), not the Data tab's -- fix round 1 (ruling I5): H₂⁺'s
            // Data tab holds its exact levels instead -- and still never in the side panel.
            expect(within(inspector).getByRole('region', { name: 'Data' })).toHaveTextContent(/Exact levels/);
            expect(inspector.querySelector('.bonds-frontier')).not.toHaveTextContent(/Born–Oppenheimer/);
            expect(within(container.querySelector('.info-computed') as HTMLElement).getByText(/Exact within Born–Oppenheimer/)).toBeInTheDocument();
            expect(container.querySelector('.side-panel')?.textContent).not.toMatch(/Exact within Born–Oppenheimer/);
        });

        // Ruling C7: the curve's worker exists only while Bonds shows H₂⁺.
        it('starts the H2+ curve worker only in Bonds with H2+, and stops it on the way out', () => {
            renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            expect(createH2PlusCurveWorker).not.toHaveBeenCalled();
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(1);
            const worker = (createH2PlusCurveWorker as jest.Mock).mock.results[0].value;
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            expect(worker.terminate).toHaveBeenCalled();
        });

        // Task 9's carry: a curve that could not be computed says why, where the curve would be.
        // Final review M3: the phase key names the sign of ψ, and its (i) opens Phase in Info.
        it('the phase key\'s (i) opens Info on Phase', () => {
            const { container } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            fireEvent.click(within(screen.getByLabelText('surface colour key')).getByRole('button', { name: 'About Phase' }));
            expect(container.querySelector('.info-topic-chip')).toHaveTextContent('Phase');
        });

        it('shows why the H2+ curve could not be computed', async () => {
            const { container } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            const worker = (createH2PlusCurveWorker as jest.Mock).mock.results[0].value;
            await act(async () => { worker.onmessage({ data: { type: 'error', message: 'no root in the bracket' } }); });
            // Task 3 (picture control): said where the curve would be -- the Bond length block in the left panel.
            expect(within(screen.getByRole('region', { name: 'Bond length' })).getByRole('alert'))
                .toHaveTextContent('The H₂⁺ potential curves could not be computed: no root in the bracket');
        });

        it('redraws only for a different picture, not for every change to the selection', () => {
            const { store } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            const drawn = store.getState().orbital.currentField;
            // A ρ chosen while H₂⁺'s orbital is shown changes the selection, not the picture.
            act(() => { store.dispatch(setDensityIso(0.05)); });
            expect(store.getState().orbital.currentField).toBe(drawn);
            act(() => { store.dispatch(setH2PlusR(3)); });
            expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'h2plus', R: 3, state: '1sigma_g' });
        });

        // Review Focus 1.
        it('Bonds and back restores the Basic Orbitals request', () => {
            const { store } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/ }));
            const basic = store.getState().orbital.currentParams;
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            expect(store.getState().orbital.currentParams).toBeNull();
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/ }));
            expect(store.getState().orbital.currentField).toBeNull();
            expect(store.getState().orbital.currentParams).toEqual(basic);
        });

        // Review Focus 1, Task 8's carry: a combination chosen in Basic
        // Orbitals persists, but is drawn there and nowhere else -- not on
        // the way through atom mode into Bonds, not when the enclosed
        // fraction changes while Bonds is showing, and again on the way back.
        it('keeps a Basic combination out of Bonds, through atom mode and a fraction change, and redraws it on return', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            chooseCombination('sp³');
            fireEvent.click(screen.getByRole('link', { name: /atom mode/i }));
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            expect(store.getState().orbital.currentField?.sources.map(s => s.id)).toEqual(['h2plus:2.0000:1sigma_g']);
            expect(screen.queryByLabelText('combination colour key')).not.toBeInTheDocument();

            chooseFraction('75%');
            const drawn = store.getState().orbital.currentField;
            expect(drawn?.sources.map(s => s.recipe.type)).toEqual(['h2plus']);
            expect(drawn?.enclosedFraction).toBe(0.75);

            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            expect(store.getState().orbital.currentField?.sources.map(s => s.id))
                .toEqual(['hybrid:sp3:0', 'hybrid:sp3:1', 'hybrid:sp3:2', 'hybrid:sp3:3']);
            expect(store.getState().orbital.currentField?.enclosedFraction).toBe(0.75);
            expect(screen.getByLabelText('combination colour key')).toBeInTheDocument();
        });

        it('draws a molecule\'s density at a fixed ρ, says so beside the fraction, and keys the grey surface', async () => {
            const { store, container } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            chooseSystem('N₂ — Nitrogen');
            await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                .toEqual({ type: 'gaussianDensity', moleculeId: 'n2@07' }));
            expect(loadScan).toHaveBeenCalledWith('n2');
            expect(store.getState().bonds).toMatchObject({ system: 'n2', scanIndex: 7 });
            expect(store.getState().orbital.currentField?.densityIsoValue).toBe(0.002);

            expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ρ = 0.002 e/a₀³, total electron density');
            // Task 10: the strip's orbital tiles now bring their own ψ key ("Orbital tiles", T16-tilekey); the
            // surface's key -- the only 'surface colour key' (getByLabelText throws on two) -- still has no ψ.
            expect(within(screen.getByLabelText('surface colour key')).queryByText('ψ > 0')).not.toBeInTheDocument();
            openInspectorSection('Display');
            expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
            // Task 7a: why the fraction is fixed is Info's now (bondsInfo, from Advanced, where the select is), not
            // helper text under the select.
            expect(screen.getByRole('combobox', { name: /electron enclosed/i }).closest('.MuiFormControl-root')!
                .querySelector('.MuiFormHelperText-root')).toBeNull();
            expect(container.querySelector('.info-section')).toHaveTextContent(FIXED_RHO_NOTE);
            // Task 3 (picture control): the curve is the left panel's, under the R slider, not the inspector's.
            expect(within(container.querySelector('.side-panel') as HTMLElement)
                .getByLabelText('potential energy curve')).toBeInTheDocument();
            expect(within(container.querySelector('.view-panel') as HTMLElement).queryByLabelText('potential energy curve')).toBeNull();
        });

        // Fix round 1, I1 and M2: the key, the fraction select and the
        // panel's note describe the picture DRAWN, which stays up while the
        // next scan point's files load -- and after a molecule fails to load.
        // The canvas says what it is waiting for.
        it('keys the drawn density, not the pending selection, while a point loads and after a load fails', async () => {
            const { store } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            chooseSystem('N₂ — Nitrogen');
            await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                .toEqual({ type: 'gaussianDensity', moleculeId: 'n2@07' }));
            // A label this geometry does not keep: the density is drawn, and the panel says why.
            act(() => { store.dispatch(setBondsView({ kind: 'mo', label: '4σg', spin: 'restricted', component: 0 })); });
            const note = '4σg is not among the orbitals kept at this geometry; showing the total density.';
            // Task 7a: the note's 4σg has a real subscript g, so its text is split around it -- read the note whole.
            const panelNote = () => document.querySelector('.side-panel .bonds-note');
            expect(panelNote()).toHaveTextContent(note);
            const drawn = store.getState().orbital.currentField;

            (loadBasis as jest.Mock).mockImplementation(() => new Promise(() => {}));
            act(() => { store.dispatch(setScanPoint({ system: 'n2', index: 8, RBohr: n2Scan.points[8].RBohr })); });
            const stillKeyed = () => {
                expect(store.getState().orbital.currentField).toBe(drawn);
                expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ρ = 0.002 e/a₀³, total electron density');
                // Ruling T10-I1: the strip (and so its "Orbital tiles" ψ key) now stays up while a point loads;
                // the surface's own key -- the only 'surface colour key' (getByLabelText throws on two) -- has no ψ.
                expect(within(screen.getByLabelText('surface colour key')).queryByText('ψ > 0')).not.toBeInTheDocument();
                openInspectorSection('Display');
                expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
            };
            stillKeyed();
            expect(panelNote()).toHaveTextContent(note);
            expect(await screen.findByText(`Loading N₂ at R = ${n2Scan.points[8].RBohr.toFixed(2)} a₀…`, {}, { timeout: 2000 })).toBeInTheDocument();

            (loadScan as jest.Mock).mockRejectedValue(new Error('Could not load /molecules/v1/o2/scan.json (HTTP 403)'));
            act(() => { store.dispatch(selectBondsSystem('o2')); });
            // The alert says why; Task 4 (T3 M2, ruling C9): the Bond length block only says it has no curve.
            expect(await screen.findByRole('alert')).toHaveTextContent(/O₂ could not be loaded: /);
            expect(within(screen.getByRole('region', { name: 'Bond length' })).getByText('No curve to show.')).toBeInTheDocument();
            stillKeyed();
            // A failure is not a wait: the cue goes (the mocked viewer never finishes, so "Computing…" may remain).
            await waitFor(() => expect(screen.queryByText(/^Loading O₂/)).not.toBeInTheDocument());
        });

        // Ruling C9: a molecule that fails to load is said once, in the
        // panel; the orbital slice's Snackbar is for pictures that fail.
        it('reports a molecule that fails to load in the panel only', async () => {
            (loadScan as jest.Mock).mockRejectedValue(new Error('Could not load /molecules/v1/n2/scan.json (HTTP 403)'));
            const { store } = renderWithProvider(<App />);
            // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            chooseSystem('N₂ — Nitrogen');
            // Task 4 (T3 M2, ruling C9): said once, by the alert; the Bond length block's line only says it has no curve.
            expect(await screen.findByRole('alert')).toHaveTextContent(/N₂ could not be loaded: /);
            expect(within(screen.getByRole('region', { name: 'Bond length' })).getByText('No curve to show.')).toBeInTheDocument();
            expect(store.getState().orbital.error).toBeNull();
            expect(screen.getAllByRole('alert')).toHaveLength(1);
        });

        // Task 10 (spec §9.3 "Strip", §12): the Bonds strip -- the total density, then
        // every orbital the diagram lists -- and a tile is the diagram's own choice.
        it('the strip opens on the total density, lists every orbital, and draws the one chosen', async () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            // H₂⁺: its two exact states, phase-coloured like the surface, so the ψ key covers them (preflight D9).
            const h2plusStrip = screen.getByRole('listbox', { name: 'orbitals in view' });
            expect(within(h2plusStrip).getAllByRole('option').map(option => option.getAttribute('aria-label'))).toEqual(['1σg orbital', '1σu* orbital']);
            expect(screen.queryByLabelText('orbital tile colour key')).not.toBeInTheDocument();

            chooseSystem('N₂ — Nitrogen');
            await waitFor(() => expect(within(screen.getByRole('listbox', { name: 'orbitals in view' })).getAllByRole('option')).toHaveLength(1 + n2Meta.orbitals.length));
            const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
            const [first] = within(strip).getAllByRole('option');
            // Ruling T10-I2 (WCAG 2.5.3): the name holds the visible label "Total density".
            expect(first).toHaveAttribute('aria-label', 'Total density, total electron density');
            expect(first).toHaveAttribute('aria-selected', 'true');
            // Ruling T16-tilekey with D9: the grey density has the ρ key; the strip's phase-coloured tiles get theirs.
            expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ρ = 0.002 e/a₀³, total electron density');
            expect(screen.getByLabelText('orbital tile colour key')).toHaveTextContent('Orbital tiles');

            fireEvent.click(within(strip).getByRole('option', { name: '2σu* orbital' }));
            expect(store.getState().bonds.view).toEqual({ kind: 'mo', label: '2σu*', spin: 'restricted', component: 0 });
            await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                .toEqual({ type: 'gaussianMO', moleculeId: 'n2@07', index: 3 }));
            expect(within(screen.getByRole('listbox', { name: 'orbitals in view' })).getByRole('option', { name: '2σu* orbital' }))
                .toHaveAttribute('aria-selected', 'true');
            // The surface is phase-coloured now: its ψ key covers the tiles too.
            expect(screen.queryByLabelText('orbital tile colour key')).not.toBeInTheDocument();
        });

        // Review Focus 5, second half (preflight D19): a job in flight for the old
        // system is cancelled; the items' half is tests/thumbs/bonds_strip_items.test.ts.
        it('cancels every thumbnail job when the Bonds system changes (Review Focus 5)', () => {
            const cancelAll = jest.spyOn(thumbnailService, 'cancelAll');
            try {
                const { store } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
                cancelAll.mockClear();
                act(() => { store.dispatch(selectBondsSystem('co')); });
                expect(cancelAll).toHaveBeenCalledTimes(1);
                act(() => { store.dispatch(selectBondsSystem('h2plus')); });
                expect(cancelAll).toHaveBeenCalledTimes(2);
            } finally {
                cancelAll.mockRestore();
            }
        });

        // Ruling T10-I1: an uncached R step must not take the strip away -- that moved the
        // camera's bottom inset (and the phone sheet) twice per step. The tiles show their
        // glyphs meanwhile and ask for nothing until the new point's own basis has landed.
        it('keeps the strip up as glyphs while the next scan point loads, asking for nothing until its basis lands (T10-I1)', async () => {
            const idle = () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker;
            act(() => { thumbnailService.attach({ createWorker: idle, createGridWorker: idle, isBusy: () => false, themeKey: () => 'dark|glow|full|72|0.7', render: () => new Promise(() => {}) }); });
            const request = jest.spyOn(thumbnailService, 'request');
            try {
                const { store } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
                chooseSystem('N₂ — Nitrogen');
                await waitFor(() => expect(within(screen.getByRole('listbox', { name: 'orbitals in view' })).getAllByRole('option')).toHaveLength(1 + n2Meta.orbitals.length));
                const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
                expect(request.mock.calls.some(([asked]) => asked.contentKey.includes('n2@07'))).toBe(true);

                let land = () => {};
                (loadBasis as jest.Mock).mockImplementation((id: string) => (id === 'n2@08'
                    ? new Promise(resolve => { land = () => resolve({ ...n2Basis, id }); })
                    : Promise.resolve({ ...n2Basis, id })));
                request.mockClear();
                act(() => { store.dispatch(setScanPoint({ system: 'n2', index: 8, RBohr: n2Scan.points[8].RBohr })); });
                // The same listbox, never unmounted: every tile on its glyph, nothing asked for.
                expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBe(strip);
                expect(within(strip).getAllByRole('option')).toHaveLength(1 + n2Meta.orbitals.length);
                expect(strip.querySelectorAll('.strip-tile-glyph')).toHaveLength(1 + n2Meta.orbitals.length);
                expect(request).not.toHaveBeenCalled();

                await act(async () => { land(); });
                await waitFor(() => expect(request.mock.calls.some(([asked]) => asked.contentKey.includes('n2@08'))).toBe(true));
                expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBe(strip);
                expect(request.mock.calls.every(([asked]) => asked.contentKey.includes('n2@08'))).toBe(true);
            } finally {
                request.mockRestore();
                act(() => { thumbnailService.detach(); });
            }
        });

        // Ruling T10-M6: outside Bonds mode a Bonds system change (a restored link, say) is not
        // Bonds' strip changing, so another mode's waiting tiles are left alone.
        it('cancels nothing when the Bonds system changes outside Bonds mode (T10-M6)', () => {
            const cancelAll = jest.spyOn(thumbnailService, 'cancelAll');
            try {
                const { store } = renderWithProvider(<App />);
                expect(store.getState().atom.mode).not.toBe('bonds');
                cancelAll.mockClear();
                act(() => { store.dispatch(selectBondsSystem('co')); });
                expect(cancelAll).not.toHaveBeenCalled();
            } finally {
                cancelAll.mockRestore();
            }
        });

        // Task 3 (picture control), Review Focus 4: the curve under the R slider sets R through the slider's own commit
        // paths -- a scan system's nearest point (the one the slider would choose), H₂⁺'s 0.01 a₀ step -- clamps a tap
        // outside its range to the range's end, and He₂ (no well, so no Rₑ line) still takes taps.
        describe('the curve sets R (Review Focus 4)', () => {
            /** The pixel PotentialCurvePlot draws R at on the measured block (34 px left padding, 8 right). */
            const pixelFor = (R: number, [lo, hi]: [number, number]) => 34 + ((R - lo) / (hi - lo)) * (mockCurveWidth - 42);
            const curveSvg = () => within(screen.getByRole('region', { name: 'Bond length' })).getByRole('img', { name: /against R/ });
            const n2Range: [number, number] = [n2Scan.points[0].RBohr, n2Scan.points[n2Scan.points.length - 1].RBohr];

            it('N₂: a tap at R = 2.4 a₀ commits the scan point the slider would choose; one left of the plot, the first', async () => {
                const { store } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
                chooseSystem('N₂ — Nitrogen');
                await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(7));
                const expected = nearestScanIndex(n2Scan.points, 2.4);
                expect(expected).not.toBe(7);
                fireEvent.click(curveSvg(), { clientX: pixelFor(2.4, n2Range) });
                expect(store.getState().bonds).toMatchObject({ scanIndex: expected, R: n2Scan.points[expected].RBohr });
                // The slider and the marker agree with what was committed.
                expect(screen.getByRole('slider', { name: 'Internuclear distance R' }))
                    .toHaveAttribute('aria-valuetext', expect.stringMatching(new RegExp(`point ${expected + 1} of ${n2Scan.points.length}$`)));
                expect(Number(screen.getByRole('region', { name: 'Bond length' }).querySelector('.potential-marker')!.getAttribute('x1')))
                    .toBeCloseTo(pixelFor(n2Scan.points[expected].RBohr, n2Range), 6);
                fireEvent.click(curveSvg(), { clientX: 2 });
                expect(store.getState().bonds.scanIndex).toBe(0);
                // Let the committed point's files land and draw, inside the test.
                await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                    .toEqual({ type: 'gaussianDensity', moleculeId: 'n2@00' }));
            });

            it('H₂⁺: a tap commits R on its 0.01 a₀ step; one left of the plot, the range minimum', async () => {
                const { store } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
                const worker = (createH2PlusCurveWorker as jest.Mock).mock.results[0].value;
                await act(async () => {
                    worker.onmessage({ data: {
                        type: 'curveSuccess', R: [0.5, 1, 2, 4, 10], sigmaG: [0.27, -0.45, -0.6026, -0.546, -0.5005],
                        sigmaU: [2.3, 0.6, -0.1675, -0.4686, -0.5], equilibrium: { R: 1.9971924, totalEnergy: -0.6026346 },
                    } });
                });
                fireEvent.click(curveSvg(), { clientX: pixelFor(3.1234, [0.5, 10]) });
                expect(store.getState().bonds.R).toBe(3.12);
                expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'h2plus', R: 3.12, state: '1sigma_g' });
                fireEvent.click(curveSvg(), { clientX: 0 });
                expect(store.getState().bonds.R).toBe(0.5);
            });

            it('He₂: the curve has no Rₑ line and still commits a tap', async () => {
                // N₂'s points with He₂'s defining trait: no bound well (diatomicCurveSpec then marks no Rₑ).
                (loadScan as jest.Mock).mockResolvedValue({ ...n2Scan, id: 'he2', formula: 'He₂', fit: { ...n2Scan.fit, bound: false } });
                const { store } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
                chooseSystem('He₂ — Helium dimer');
                await waitFor(() => expect(store.getState().bonds.scanIndex).not.toBeNull());
                const block = screen.getByRole('region', { name: 'Bond length' });
                expect(within(block).getByRole('figure', { name: 'potential energy curve' })).toBeInTheDocument();
                expect(block.querySelector('.potential-reference')).toBeNull();
                fireEvent.click(curveSvg(), { clientX: pixelFor(n2Scan.points[12].RBohr, n2Range) });
                expect(store.getState().bonds).toMatchObject({ system: 'he2', scanIndex: 12, R: n2Scan.points[12].RBohr });
                // Let the committed point's files land and draw, inside the test.
                await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                    .toEqual({ type: 'gaussianDensity', moleculeId: 'he2@12' }));
            });
        });

        // Task 3 (picture control), spec §6: the curve shows at every level, Basics included, in the left panel; the
        // inspector has no "Plot and data" for Bonds at any level, and its Data section appears from Explore -- below
        // that, the Display line says so, not that "the plot" appears (it is on screen).
        it('shows the curve in the left panel at every level, and Data in the inspector from Explore', async () => {
            for (const level of ['basics', 'explore', 'advanced', 'research']) {
                window.localStorage.setItem('eov.level', level);
                const { store, container, unmount } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
                chooseSystem('N₂ — Nitrogen');
                await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(7));
                const side = container.querySelector('.side-panel') as HTMLElement;
                const block = within(side).getByRole('region', { name: 'Bond length' });
                expect([level, within(block).queryByRole('figure', { name: 'potential energy curve' }) !== null]).toEqual([level, true]);
                const inspector = screen.getByRole('complementary', { name: 'Inspector' });
                expect([level, within(inspector).queryByRole('button', { name: 'Plot and data' })]).toEqual([level, null]);
                expect([level, within(inspector).queryByRole('button', { name: 'Data' }) !== null]).toEqual([level, level !== 'basics']);
                expect([level, within(inspector).queryByText('Data appears at Explore') !== null]).toEqual([level, level === 'basics']);
                expect(within(inspector).queryByText(/The plot/)).toBeNull();
                unmount();
                act(() => { window.localStorage.removeItem('eov.display'); clearVisit(); });
            }
        });

        // Task 4 (picture control), Review Focus 5: lowering the level to Basics with R at a non-default scan point keeps
        // R, the scan point and the picture; the curve stays in the block, now in plain words.
        it('keeps R, the point and the picture when lowered to Basics, and the curve reads in plain words (Review Focus 5)', async () => {
            window.localStorage.setItem('eov.level', 'explore');
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            chooseSystem('N₂ — Nitrogen');
            await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(7));
            const n2Range: [number, number] = [n2Scan.points[0].RBohr, n2Scan.points[n2Scan.points.length - 1].RBohr];
            const pixelFor = (R: number) => 34 + ((R - n2Range[0]) / (n2Range[1] - n2Range[0])) * (mockCurveWidth - 42);
            const block = () => screen.getByRole('region', { name: 'Bond length' });
            fireEvent.click(within(block()).getByRole('img', { name: /against R/ }), { clientX: pixelFor(n2Scan.points[5].RBohr) });
            await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                .toEqual({ type: 'gaussianDensity', moleculeId: 'n2@05' }));
            const before = store.getState().bonds;
            expect(before).toMatchObject({ scanIndex: 5, R: n2Scan.points[5].RBohr });
            expect(block().querySelector('.radial-plot-title')).toHaveTextContent('E − E(separated atoms) (eV)');
            const field = store.getState().orbital.currentField;

            fireEvent.click(screen.getByRole('radio', { name: 'Basics' }));
            expect(screen.getByRole('radio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'true');
            expect(store.getState().bonds).toEqual(before);
            expect(store.getState().orbital.currentField).toBe(field);
            const figure = within(block()).getByRole('figure', { name: 'potential energy curve' });
            expect(figure.querySelector('.radial-plot-title')!.textContent).toBe('Energy (eV)');
            expect(within(figure).getByText('Distance between nuclei (Å)')).toBeInTheDocument();
            expect(figure.querySelector('.potential-reference-note')).toHaveTextContent(/^Dotted line: most stable, \d\.\d\d Å$/);
            // The marker still stands at point 5, and the slider says so.
            expect(Number(figure.querySelector('.potential-marker')!.getAttribute('x1'))).toBeCloseTo(pixelFor(n2Scan.points[5].RBohr), 6);
            expect(screen.getByRole('slider', { name: 'Internuclear distance R' }))
                .toHaveAttribute('aria-valuetext', expect.stringMatching(new RegExp(`point 6 of ${n2Scan.points.length}$`)));
        });

        // Task 3 (picture control): the sheet's fourth tab keeps its key ('plot') but reads "Data" -- the curve is in Explore,
        // under the R slider, as on the desktop.
        it('on a phone: the header names the system and R, and the sheet has Explore, Info, View and Data', async () => {
            installMatchMedia(true);
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // spec §9.8
            // Unanchored: rail items are named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
            fireEvent.click(screen.getByRole('button', { name: /bonds mode/ }));
            // Task 4: Info is the sheet's second tab in every mode.
            expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Explore', 'Info', 'View', 'Data']);
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            chooseSystem('N₂ — Nitrogen');
            await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(7));
            // Task 8: the header's "N₂ · R" line folds into the caption, which names what is drawn too -- once it is.
            await waitFor(() => expect(document.querySelector('.phone-caption')).toHaveTextContent(/^N₂ .+ · R = 2\.07 a₀$/));
            expect(within(screen.getByRole('tabpanel')).getByLabelText('molecular orbital energy diagram')).toBeInTheDocument();
            // Task 10 (spec §9.8): the strip is the Explore tab's first row, as in Atoms and Orbitals.
            const sheetStrip = await within(screen.getByRole('tabpanel')).findByRole('listbox', { name: 'orbitals in view' });
            expect(sheetStrip.closest('.thumbnail-strip')).toHaveClass('sheet');
            expect(sheetStrip.compareDocumentPosition(screen.getByLabelText('molecular orbital energy diagram')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            const block = within(screen.getByRole('tabpanel')).getByRole('region', { name: 'Bond length' });
            expect(within(block).getByLabelText('potential energy curve')).toBeInTheDocument();
            // Task 5b (finish fix 1): the block sits right under the strip, above the molecule select, so the curve
            // shares the screen with the picture.
            expect(sheetStrip.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            expect(block.compareDocumentPosition(within(screen.getByRole('tabpanel')).getByRole('combobox', { name: 'Molecule (by bond type)' }))
                & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
            expect(within(screen.getByRole('tabpanel')).queryByLabelText('potential energy curve')).toBeNull();
            expect(within(screen.getByRole('tabpanel')).getByRole('heading', { level: 2, name: 'Data' })).toBeInTheDocument();
            expect(screen.getByRole('tabpanel')).toHaveTextContent(/HOMO 3σg/);
        });

        // Task 7a (plan Step 1): at Basics the Bonds screen names no method -- CCSD(T) and the T1 diagnostic are said
        // under Info's folded "How this was computed" and nowhere else (the panel's energy line, the plot's caption and
        // the Data tab's methods list all said them before).
        it('at Basics, N₂ shows no "CCSD(T)" and no "T1 diagnostic" outside the folded "How this was computed"', async () => {
            // Basics, whatever this block's own level is (the stored preference; cleared after each test).
            window.localStorage.setItem('eov.level', 'basics');
            const { store, container } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            chooseSystem('N₂ — Nitrogen');
            await waitFor(() => expect(store.getState().orbital.currentField?.sources[0].recipe)
                .toEqual({ type: 'gaussianDensity', moleculeId: 'n2@07' }));
            const info = container.querySelector('.info-section') as HTMLElement;
            expect(info).toHaveTextContent('N₂ has 14 electrons');
            const computed = info.querySelector('details.info-computed') as HTMLDetailsElement;
            expect(computed.open).toBe(false);
            expect(computed).toHaveTextContent(/CCSD\(T\)/);
            const page = container.cloneNode(true) as HTMLElement;
            page.querySelectorAll('.info-computed').forEach(node => node.remove());
            expect(page.textContent).not.toMatch(/CCSD\(T\)/);
            expect(page.textContent).not.toMatch(/T1 diagnostic/);
        });

        // Task 7a fix round 1 (ruling I5): H₂⁺, Bonds' opening view, keeps its Data, with real content (its exact levels).
        // Task 3 (picture control): the Plot tab is gone (the curve is the left panel's), so the medium-width drawer's
        // one-press button is Data's (Inspector's barSection) -- not a lone "View settings".
        it('at medium width, offers H₂⁺ the drawer\'s Data panel button, which opens it on the exact levels', () => {
            window.matchMedia = ((media: string) => ({ media, matches: media === MEDIUM_VIEWPORT,
                addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
            const { container } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
            expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('folded');
            expect(screen.queryByRole('button', { name: 'Plot panel' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'View settings' })).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Data panel' }));
            expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('open');
            expect(screen.getByRole('region', { name: 'Data' })).toHaveTextContent(/Exact levels/);
            // The curve stays in the left panel, under the slider, at this width too.
            expect(within(container.querySelector('.side-panel') as HTMLElement).getByText('Computing the exact H₂⁺ curves…')).toBeInTheDocument();
        });

        // Task 7a (Task 4 review ruling): a Bonds (i) on a phone switches the sheet to the Info tab on its term; pressing
        // the active one again clears the term and stays where it is.
        it('on a phone, a Bonds (i) opens the Info tab on its term, and pressing it again clears the term in place', () => {
            installMatchMedia(true);
            renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('button', { name: /^Mode: / })); // spec §9.8
            fireEvent.click(screen.getByRole('button', { name: /bonds mode/ }));
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Molecular orbitals' }));
            expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
            const info = screen.getByRole('tabpanel');
            expect(within(info).getByRole('heading', { level: 2, name: /^Info/ }).querySelector('.info-topic-chip')).toHaveTextContent('MO diagram');
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            const diagram = within(screen.getByRole('tabpanel')).getByRole('button', { name: 'About Molecular orbitals' });
            expect(diagram).toHaveAttribute('aria-pressed', 'true');
            fireEvent.click(diagram);
            expect(screen.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
            fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
            expect(document.querySelector('.info-topic-chip')).toBeNull();
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(screen.getByRole('tabpanel').querySelector('.info-title')).toHaveSeenText('H₂⁺ — 1σg orbital');
        });
    });

    it('switching to Basic Orbitals draws the selection held in the store', () => {
        const { store } = renderWithProvider(<App />);
        act(() => { store.dispatch(setBasicSelection({ n: 2, l: 1, ml: 1 })); });
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        expect(store.getState().orbital.currentParams).toMatchObject({ n: 2, l: 1, ml: 1, Z: 1 });
    });

    // Task 8 (spec §9.2 "Strip", §12): Basic Orbitals' own strip -- n² tiles
    // of the current n grouped by subshell, no drill-down -- stands in for
    // the Atom strip there. Picking a tile is exactly a chip's own change
    // (setBasicSelection), so the existing 150 ms debounce (useDrawOnSelection)
    // is what draws it, same as a BasicExplore chip click would.
    it('in Basic Orbitals mode the strip holds every orbital of n, and choosing one draws it 150 ms later', () => {
        jest.useFakeTimers();
        try {
            const { store } = renderWithProvider(<App />, { mode: 'hydrogenic' });
            // DEFAULT_BASIC_SELECTION is n = 3, l = 2, mₗ = 0: 9 tiles (3s, 3p×3, 3d×5).
            const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
            expect(within(strip).getAllByRole('option')).toHaveLength(9);
            // Task 6 (ruling): options are named flat ("3dz² orbital") -- the underscore was read aloud.
            expect(within(strip).getByRole('option', { name: '3dz² orbital' })).toHaveAttribute('aria-selected', 'true');

            fireEvent.click(within(strip).getByRole('option', { name: '3px orbital' }));
            expect(store.getState().orbital.basicSelection).toEqual({ n: 3, l: 1, ml: 1 });
            // Not drawn yet -- the debounce has not elapsed.
            expect(store.getState().orbital.currentParams).toBeNull();

            act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS); });
            expect(store.getState().orbital.currentParams).toMatchObject({ n: 3, l: 1, ml: 1, Z: 1 });
        } finally {
            jest.useRealTimers();
        }
    });

    // Task 1 (picture control): the strip is Orbitals' only picker for l and mₗ now -- the Subshell and Orbital chip
    // rows are gone from BasicExplore. Picking a tile within the current shell's own group (3d, not 3p as above)
    // sets the full selection in one dispatch, at desktop width (the overlay strip, not the phone sheet).
    it('at desktop width, pressing the strip option "3dxz" sets orbital.selection to {n:3, l:2, ml:1}', () => {
        const { store } = renderWithProvider(<App />, { mode: 'hydrogenic' });
        // DEFAULT_BASIC_SELECTION is n = 3, l = 2, mₗ = 0: the strip already holds the 3d group.
        const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
        fireEvent.click(within(strip).getByRole('option', { name: '3dxz orbital' }));
        expect(store.getState().orbital.basicSelection).toEqual({ n: 3, l: 2, ml: 1 });
    });

    // Review Focus 1: `stripCollapsed` is one boolean shared across every mode's strip, so Orbitals can be entered
    // with it already set from Atoms. Orbitals' strip is its only picker, so it must show regardless, with no handle
    // offering to hide it (ThumbnailStrip's `collapsible={false}`).
    it('Review Focus 1: a strip collapsed in Atoms does not carry into Orbitals, which offers no way to hide its strip', () => {
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide orbitals' }));
        expect(screen.queryByRole('listbox', { name: 'orbitals in view' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        expect(screen.getByRole('listbox', { name: 'orbitals in view' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Hide orbitals' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show orbitals' })).not.toBeInTheDocument();

        // M5 (Task 1 review): the shared preference itself is untouched by the visit -- switching back to Atoms
        // finds its strip exactly as it was left, still collapsed, not reopened by Orbitals never reading it.
        fireEvent.click(screen.getByRole('link', { name: /atom mode/i }));
        expect(screen.queryByRole('listbox', { name: 'orbitals in view' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show orbitals' })).toBeInTheDocument();
    });

    // Review Focus 3: at Advanced, the Subshell/Orbital chips used to be the only other picker, and they waited
    // disabled while a combination was drawn (chipsFrozen) -- so a chip press could never reach this case, and the
    // strip was the only one that could. The strip must leave the combination exactly as a below-Advanced chip
    // press did (ruling T2-I1), not draw over it. (Ruling T1 M2, Task 2, later unfroze the n chips too -- see the
    // App-level test below for that path; this test stays on the strip.)
    // M4 (Task 1 review): runs at Advanced itself (not Research, which the outer describe sets by default), and
    // asserts the orbital is actually drawn (currentField cleared, currentParams the picked orbital), as the
    // T2-I1 test (below Advanced) does -- not state alone.
    it('Review Focus 3: at Advanced, a strip pick while an n = 2 Stark combination is active clears it, selects {n:2, l:1, ml:1} and draws it', () => {
        window.localStorage.setItem('eov.level', 'advanced');
        const { store } = renderWithProvider(<App />);
        act(() => { store.dispatch(setBasicSelection({ n: 2, l: 0, ml: 0 })); });
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));

        fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
        fireEvent.click(within(screen.getByRole('listbox')).getByText('Electric field'));
        fireEvent.click(screen.getByRole('button', { name: /first excited level n = 2/i }));
        expect(store.getState().orbital.combination).toMatchObject({ kind: 'field', level: 2 });

        const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
        // M3 (Task 1 review, ruled): while the combination is drawn, no tile in the strip shows selected -- the
        // combination is what is drawn, not any one orbital.
        expect(within(strip).queryAllByRole('option', { selected: true })).toHaveLength(0);

        fireEvent.click(within(strip).getByRole('option', { name: '2px orbital' }));
        expect(store.getState().orbital.combination.kind).toBe('none');
        expect(store.getState().orbital.basicSelection).toEqual({ n: 2, l: 1, ml: 1 });
        expect(store.getState().orbital.currentField).toBeNull();
        expect(store.getState().orbital.currentParams).toMatchObject({ n: 2, l: 1, ml: 1, Z: 1 });
    });

    // M4 (Task 2 review, fix round 1): ruling T1 M2 at App level, not through a harness that re-implements
    // handleBasicPick (as basic_explore.test.tsx's `withPick` does) -- the n chip itself, wired to App's own
    // onPick, leaves the held combination and draws the corrected selection.
    it('ruling T1 M2: at Advanced, pressing the n = 3 chip while an n = 2 Stark combination is active leaves it, selects {n:3, l:0, ml:0} and draws it', () => {
        window.localStorage.setItem('eov.level', 'advanced');
        const { store } = renderWithProvider(<App />);
        act(() => { store.dispatch(setBasicSelection({ n: 2, l: 0, ml: 0 })); });
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));

        fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
        fireEvent.click(within(screen.getByRole('listbox')).getByText('Electric field'));
        fireEvent.click(screen.getByRole('button', { name: /first excited level n = 2/i }));
        expect(store.getState().orbital.combination).toMatchObject({ kind: 'field', level: 2 });

        const chip = screen.getByRole('button', { name: 'n = 3' });
        expect(chip).not.toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(chip);
        expect(store.getState().orbital.combination.kind).toBe('none');
        expect(store.getState().orbital.basicSelection).toEqual({ n: 3, l: 0, ml: 0 });
        expect(store.getState().orbital.currentField).toBeNull();
        expect(store.getState().orbital.currentParams).toMatchObject({ n: 3, l: 0, ml: 0, Z: 1 });
    });

    // Final review I1: leaving a combination draws the picked orbital once -- the combination effect's own draw --
    // not that and then the debounced selection draw 150 ms later for the very same orbital (which rebuilt the mesh
    // just drawn and cleared currentField). The twin of "entering the mode draws once (nonce), not twice".
    describe('final review I1: a pick that leaves a combination draws once, not twice', () => {
        const drawCount = (spy: jest.SpyInstance) =>
            spy.mock.calls.filter(([action]) => action.type === startOrbitalCalculation.type).length;
        const holdStarkCombination = () => {
            window.localStorage.setItem('eov.level', 'advanced');
            const rendered = renderWithProvider(<App />);
            act(() => { rendered.store.dispatch(setBasicSelection({ n: 2, l: 0, ml: 0 })); });
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText('Electric field'));
            fireEvent.click(screen.getByRole('button', { name: /first excited level n = 2/i }));
            expect(rendered.store.getState().orbital.combination).toMatchObject({ kind: 'field', level: 2 });
            return rendered;
        };

        it('at Advanced, a strip pick (2px) draws exactly once, at once', () => {
            jest.useFakeTimers();
            try {
                const { store } = holdStarkCombination();
                const dispatchSpy = jest.spyOn(store, 'dispatch');
                const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
                fireEvent.click(within(strip).getByRole('option', { name: '2px orbital' }));
                expect(drawCount(dispatchSpy)).toBe(1);
                act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
                expect(drawCount(dispatchSpy)).toBe(1);
                expect(store.getState().orbital.currentParams).toMatchObject({ n: 2, l: 1, ml: 1, Z: 1 });
            } finally {
                jest.useRealTimers();
            }
        });

        it('at Advanced, an n = 3 chip press draws exactly once, at once', () => {
            jest.useFakeTimers();
            try {
                const { store } = holdStarkCombination();
                const dispatchSpy = jest.spyOn(store, 'dispatch');
                fireEvent.click(screen.getByRole('button', { name: 'n = 3' }));
                expect(drawCount(dispatchSpy)).toBe(1);
                act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
                expect(drawCount(dispatchSpy)).toBe(1);
                expect(store.getState().orbital.currentParams).toMatchObject({ n: 3, l: 0, ml: 0, Z: 1 });
            } finally {
                jest.useRealTimers();
            }
        });

        it('a plain strip pick, with no combination, still draws once, after the debounce', () => {
            jest.useFakeTimers();
            try {
                window.localStorage.setItem('eov.level', 'advanced');
                const { store } = renderWithProvider(<App />);
                fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
                const dispatchSpy = jest.spyOn(store, 'dispatch');
                const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
                fireEvent.click(within(strip).getByRole('option', { name: '3px orbital' }));
                expect(drawCount(dispatchSpy)).toBe(0);
                act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
                expect(drawCount(dispatchSpy)).toBe(1);
                expect(store.getState().orbital.currentParams).toMatchObject({ n: 3, l: 1, ml: 1, Z: 1 });
                // And a second pick right after, still with no combination, draws once more.
                fireEvent.click(within(strip).getByRole('option', { name: '3s orbital' }));
                act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
                expect(drawCount(dispatchSpy)).toBe(2);
            } finally {
                jest.useRealTimers();
            }
        });

        it('a strip pick right after leaving a combination draws once more, after the debounce', () => {
            jest.useFakeTimers();
            try {
                const { store } = holdStarkCombination();
                const dispatchSpy = jest.spyOn(store, 'dispatch');
                const strip = screen.getByRole('listbox', { name: 'orbitals in view' });
                fireEvent.click(within(strip).getByRole('option', { name: '2px orbital' }));
                fireEvent.click(within(strip).getByRole('option', { name: '2s orbital' }));
                expect(drawCount(dispatchSpy)).toBe(1);
                act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
                expect(drawCount(dispatchSpy)).toBe(2);
                expect(store.getState().orbital.currentParams).toMatchObject({ n: 2, l: 0, Z: 1 });
            } finally {
                jest.useRealTimers();
            }
        });
    });
});

describe('App: opening a shared link', () => {
    // Task 2: these tests work controls above the default Explore level (the finish, Advanced appearance).
    beforeEach(() => { window.localStorage.setItem('eov.level', 'research'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); });
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); clearProfileCacheForTests(); });
    // The hook writes the hash, and jsdom keeps it between tests: clean up so
    // later tests still open with the periodic table.
    afterEach(() => { resetUrlKeysForTests(); window.history.replaceState(null, '', '/'); });

    const openLink = (hash: string) => {
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        render(<Provider store={store}><App /></Provider>);
        act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });
        return store;
    };

    // Task 6 (the critique's researcher red flag): a link without rel opens gold non-relativistic (ruling C1), and
    // Info says scalar is this element's default.
    it('says scalar is the default when a link opens a heavy element without rel', () => {
        const store = openLink('#mode=atom&Z=79&level=atom');
        expect(store.getState().atom.relativityOverride).toBe('off');
        // Fix round 1 (I1): the note names the state first.
        expect(document.querySelector('.info-section')).toHaveTextContent('Relativity is off here, though scalar relativistic is the default for an element this heavy.');
    });

    it('lands on the linked orbital with no cut, once the solve arrives', () => {
        const store = openLink('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&frac=0.9&cut=none&op=1&surf=solid');
        expect(store.getState().atom).toMatchObject({ level: 'orbital', selectedOrbital: { n: 2, l: 1, ml: 0 } });
        expect(store.getState().orbital.surfaceStyle.clipAxis).toBe('none');
        expect(store.getState().orbital.pendingCut).toBeNull();
    });

    // Owner R25-B1: the Wireframe option is gone. A link copied while it was on (surf=wire) -- or naming it in full --
    // opens on the solid surface in the viewer's own finish, and the link written back says solid.
    it.each(['wire', 'wireframe'])('opens an old surf=%s link on the solid surface, offering no Wireframe (owner R25-B1)', value => {
        const store = openLink(`#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&frac=0.9&cut=none&op=1&surf=${value}`);
        openInspectorSection('Display');
        expect(screen.getByRole('group', { name: 'surface style' })).toHaveTextContent(/^GlowSolid$/);
        expect(screen.getByRole('button', { name: 'glow surface' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('button', { name: /wireframe/i })).toBeNull();
        expect(encodeStateOf(store.getState())).toMatch(/&surf=solid(&|$)/);
    });

    // Ruling R25-finish: Atoms keeps the same control, at the orbital level, and the same Glow-only rule for its tuning.
    it('keeps the finish in Atoms\' Display at the orbital level, Solid folding away Advanced appearance (R25-finish)', () => {
        openLink('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&frac=0.9&cut=none&op=1&surf=solid');
        openInspectorSection('Display');
        const display = within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('region', { name: 'Display' });
        expect(display.querySelectorAll('.surface-style-controls')).toHaveLength(1);
        expect(within(display).getByRole('button', { name: 'Advanced appearance' })).toBeInTheDocument();
        fireEvent.click(within(display).getByRole('button', { name: 'solid surface' }));
        expect(within(display).queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        fireEvent.click(within(display).getByRole('button', { name: 'glow surface' }));
        expect(within(display).getByRole('button', { name: 'Advanced appearance' })).toBeInTheDocument();
    });

    it('keeps a linked cut at the orbital level, where entering it would clear the cut', () => {
        const store = openLink('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&cut=y:0.25');
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'y', clipPosition: 0.5 });
    });

    it('opens without the periodic table over a shared view', () => {
        openLink('#mode=atom&Z=18&level=atom');
        expect(screen.queryByLabelText('periodic table')).not.toBeInTheDocument();
    });

    // Ruling C2 / spec §3.5 + Review Focus 1: a link naming a refused
    // combination (sp has two hybrids; member 5 does not exist) must not
    // draw the last picture under the wrong title -- the canvas clears and
    // the panel says so. A real picture is put up first (fix round 1, I2),
    // so the assertions below prove the canvas was actually cleared by the
    // refused link, rather than having started empty. Applied through the
    // real hashchange path (a pasted link into an already-open tab), not
    // applyStateTo directly, since that is what the App is wired to for a
    // link that arrives after the app is already running.
    it('clears the canvas for a refused combination named by a pasted link, and says it is not drawn', async () => {
        const store = openLink('#mode=basic&n=2&l=1&ml=0');
        expect(store.getState().orbital.currentParams).not.toBeNull();

        // jsdom fires 'hashchange' asynchronously, not within the assignment;
        // currentParams is non-null beforehand, so waiting on it becoming
        // null (rather than currentField, already null) actually observes
        // the transition instead of passing immediately.
        act(() => { window.location.hash = '#mode=basic&combo=sp&member=5'; });
        await waitFor(() => expect(store.getState().orbital.currentParams).toBeNull());

        expect(store.getState().orbital.currentField).toBeNull();
        expect(document.getElementById('orbital-name')).toHaveTextContent(/not drawn/);
    });

    // Fix round 1, I1: switching mode while a link's atom is still solving
    // used to let the link's cut land later, on the *other* mode's view --
    // the reapply effect only watches pendingCut/atomPendingView, not which
    // mode is on screen by the time the solve lands.
    it("switching mode while a link's atom is still solving does not let the link's cut land on the other mode's view", () => {
        const hash = '#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&cut=y:0.25';
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        render(<Provider store={store}><App /></Provider>);

        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        // The solve for the abandoned atom link still lands and still clears
        // atom.pendingView -- that must not resurrect the link's cut here.
        act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });

        expect(store.getState().orbital.surfaceStyle.clipAxis).toBe('none');
        expect(store.getState().orbital.pendingCut).toBeNull();
    });

    // Fix round 1, M1: picking another element while a link's atom is still
    // solving must drop the link's cut too -- otherwise it would land on the
    // newly picked element's shell view once the (unrelated) solve for the
    // link's own element eventually lands.
    it("picking another element mid-solve clears a link's still-pending cut, so it does not land on the new element", () => {
        const hash = '#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&cut=y:0.25';
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        const { container } = render(<Provider store={store}><App /></Provider>);

        expect(store.getState().orbital.pendingCut).toEqual({ clipAxis: 'y', clipPosition: 0.5 });

        fireEvent.click(screen.getByRole('button', { name: /change element, currently/i }));
        fireEvent.click(container.querySelector('.periodic-tile[data-z="26"]')!);

        expect(store.getState().orbital.pendingCut).toBeNull();
        // The new element's own default shell-view cut, not the old link's.
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: SHELL_VIEW_CUT_AXIS, clipPosition: 0 });
    });

    // Fix round 1, M2: a link pasted into an address bar that already has
    // the app open must not stay hidden behind a pop-over left open from
    // before.
    it("closes the periodic table pop-over when a pasted link's hash is applied", async () => {
        const store = createTestStore();
        render(<Provider store={store}><App /></Provider>);
        expect(screen.getByLabelText('periodic table')).toBeInTheDocument();

        // jsdom fires 'hashchange' asynchronously, not within the assignment.
        act(() => { window.location.hash = '#mode=atom&Z=18&level=atom'; });
        await waitFor(() => expect(store.getState().atom.Z).toBe(18));

        expect(screen.queryByLabelText('periodic table')).not.toBeInTheDocument();
    });

    // Carry to Task 6 (progress.md): a user cut change made while a link's
    // pendingCut is still waiting on the solve must clear pendingCut, or
    // the link's stale cut would land on top of the user's own choice once
    // the profile arrives.
    it("a user cut change made while a link's cut is still pending clears it, so the link cannot later overwrite the user's choice", () => {
        const hash = '#mode=atom&Z=18&level=atom&cut=y:0.25';
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        render(<Provider store={store}><App /></Provider>);

        // Mid-solve: the link's cut has already been applied and is waiting
        // to be re-applied once the profile confirms the view.
        expect(store.getState().orbital.pendingCut).toEqual({ clipAxis: 'y', clipPosition: 0.5 });

        // Ruling R20b-atoms: the view controls are the inspector's Display section now, there before the profile too.
        openInspectorSection('Display');
        const display = within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('region', { name: 'Display' });
        fireEvent.click(within(display).getByRole('button', { name: 'cut along x' }));
        expect(store.getState().orbital.pendingCut).toBeNull();

        act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });

        // The user's own cut survives; the link's y-axis cut is not reasserted.
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'x' });
    });
});

describe('App: Share', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); registerBondsUrlKeys(); clearProfileCacheForTests(); });
    afterEach(() => {
        resetUrlKeysForTests();
        window.history.replaceState(null, '', '/');
        Reflect.deleteProperty(navigator, 'clipboard');
    });

    // Review Focus 3: handleShare reads store.getState() at the moment of the
    // click and hands it to encodeStateOf, which prefers atom.pendingView --
    // so a link copied mid-solve names the orbital that was asked for, not
    // the transient whole-atom view still on screen while that solve runs
    // (see url_state.ts's encodeAtomKeys, pinned directly in Task 5's
    // url_state.test.ts; this test pins the App wiring that reaches it).
    it('copies the requested view, not the transient whole-atom view, while the linked atom is still solving', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

        const hash = '#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0';
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        render(<Provider store={store}><App /></Provider>);

        // Mid-solve: the whole atom is what is actually on screen...
        expect(store.getState().atom).toMatchObject({ level: 'atom', isSolving: true });
        // ...but the link asked for the orbital, held here until the solve lands.
        expect(store.getState().atom.pendingView).toMatchObject({ level: 'orbital', shell: 2, subshell: { n: 2, l: 1 }, orbital: { n: 2, l: 1, ml: 0 } });

        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));

        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const url = writeText.mock.calls[0][0] as string;
        expect(url).toMatch(/#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0&/);
        expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
    });

    // Final review M4: the store hears the camera only once it has sat still
    // for 300 ms, so Share asks the view for its angle at the click instead.
    it('copies the camera angle on screen now, not the one last settled into the store', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        mockViewerHandle = {
            capturePng: jest.fn(), collectSurfaces: () => [], surfaceCount: () => 0,
            cameraAngles: () => ({ azimuth: 40, elevation: 20 }), standardAxis: () => 'none',
        };
        try {
            const { store } = renderWithProvider(<App />);
            expect(store.getState().orbital.cameraAngles).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Share' }));
            // Task 2: Share opens a menu now; Copy link is the copy it used to make.
            fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
            await waitFor(() => expect(writeText).toHaveBeenCalled());
            expect(writeText.mock.calls[0][0]).toMatch(/&cam=40,20$/);
            expect(store.getState().orbital.cameraAngles).toEqual({ azimuth: 40, elevation: 20 });
        } finally {
            mockViewerHandle = null;
        }
    });

    // Task 14: Bonds mode gets its own URL keys (bonds_url.ts), registered
    // next to the built-in ones -- this App test pins the wiring (Share
    // reaches a real Bonds link, carrying system/R/state and nothing of the
    // atom or Basic selection, and that link restores the same view). The
    // key/value rules themselves, including a molecule's, are
    // tests/bonds/bonds_url.test.ts's job -- it needs no live component tree.
    it('copies a real Bonds link, that restores the same H2+ view', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        const { store } = renderWithProvider(<App />);
        // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
        fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
        act(() => {
            store.dispatch(setH2PlusR(3.5));
            store.dispatch(setBondsView({ kind: 'h2plus', state: '1sigma_u' }));
        });
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const url = writeText.mock.calls[0][0] as string;
        expect(url).toMatch(/#mode=bonds&system=h2plus&R=3\.500&state=1sigma_u&frac=/);
        expect(url).not.toMatch(/[#&]Z=|[#&]n=\d|combo=/);

        const landed = createTestStore();
        applyStateTo(new URL(url).hash, landed.dispatch);
        expect(landed.getState().bonds).toMatchObject({ system: 'h2plus', R: 3.5, view: { kind: 'h2plus', state: '1sigma_u' } });
        expect(landed.getState().atom.mode).toBe('bonds');
    });

    // Review Focus 5, at the App level (ShareExportBar's own unit test in
    // tests/share_export_bar.test.tsx pins the dialog itself): a page served
    // without clipboard permission -- plain http, or an iframe that was
    // refused it -- must still let the link be copied by hand.
    it('shows the link in a dialog when the clipboard API is absent and execCommand refuses', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
        const originalExecCommand = document.execCommand;
        document.execCommand = jest.fn().mockReturnValue(false);

        renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));

        const linkField = await screen.findByRole('textbox', { name: /link to this view/i });
        expect((linkField as HTMLInputElement).value).toMatch(/^https?:\/\/.*#mode=atom&Z=1&level=atom&/);

        document.execCommand = originalExecCommand;
    });
});

describe('App: the first-view hint (Task 5, ruling P17)', () => {
    beforeEach(() => { window.localStorage.clear(); });
    afterEach(() => { window.localStorage.clear(); });

    it('shows on first render in Atoms mode', () => {
        renderWithProvider(<App />);
        expect(screen.getByRole('note')).toHaveTextContent('Drag to rotate · pick a shell to explore');
    });

    it('never renders in Orbitals mode', () => {
        renderWithProvider(<App />, { mode: 'hydrogenic' });
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    // 6G-2 Task 17 round 2 (ruling T17-hint): an unbound anion draws nothing and its shells cannot be opened, so the
    // hint's "Drag to rotate · pick a shell" would be untrue (spec §3.5) -- and on a desktop it sat on the centred
    // unbound note (Cl⁻: 74 × 42 px; tablet 144 × 42). It stays away while nothing is drawn, without being dismissed,
    // and the unbound note is the only thing over the empty canvas.
    it('stays away while an anion is unbound, without being dismissed', () => {
        const originalMatchMedia = window.matchMedia;
        (createAtomWorker as jest.Mock).mockClear();
        clearProfileCacheForTests();
        try {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { Z: 17, charge: -1 });
            expect(screen.getByRole('note')).toHaveTextContent('Drag to rotate');
            const solver = (createAtomWorker as jest.Mock).mock.results[0].value;
            const { requestId } = solver.postMessage.mock.calls[0][0];
            act(() => {
                solver.onmessage({ data: { type: 'unbound', message: 'LDA does not bind this anion: its 3p electron is not bound.', requestId } });
            });
            expect(container.querySelector('.canvas-unbound')).not.toBeNull();
            expect(container.querySelector('.first-view-hint')).toBeNull();
            expect(hintPref.get().rotateDismissed).toBe(false);
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });

    // The other suggestion the hint names, besides rotating (OrbitalViewer's
    // own job -- it is mocked out of this file, so that path is pinned at
    // the component level instead, in tests/orbital_viewer.test.tsx).
    it('goes away once a shell is picked, and remembers it', () => {
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.getByRole('note')).toBeInTheDocument();

        // Final review M2: shell names are spaced, "L shell (n = 2)".
        fireEvent.click(screen.getByText(/K shell \(n = 1\)/));

        expect(screen.queryByRole('note')).not.toBeInTheDocument();
        expect(hintPref.get()).toEqual({ rotateDismissed: true });
    });

    // Review Focus 1's own recipe: hintPref lives in localStorage only (spec
    // §6.7), never in a link, so dismissing it by its own button -- which
    // touches no Redux state at all -- must leave the share link untouched.
    it('leaves the share link byte-identical before and after dismissal (Review Focus 1)', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        try {
            renderWithProvider(<App />);

            fireEvent.click(screen.getByRole('button', { name: 'Share' }));
            // Task 2: Share opens a menu now; Copy link is the copy it used to make.
            fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
            await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

            fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));
            expect(screen.queryByRole('note')).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Share' }));
            // Task 2: Share opens a menu now; Copy link is the copy it used to make.
            fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
            await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));

            expect(writeText.mock.calls[1][0]).toBe(writeText.mock.calls[0][0]);
        } finally {
            Reflect.deleteProperty(navigator, 'clipboard');
        }
    });
});

describe('App: shell', () => {
    // Task 2: these tests work controls above the default Explore level (the finish, Advanced appearance, the Combination picker).
    beforeEach(() => { window.localStorage.setItem('eov.level', 'research'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); });
    const originalMatchMedia = window.matchMedia;
    // Ruling DB1: the URL keys registered as in 'App: Share', so the share link carries real state and the
    // Review Focus 1 comparison below can fail.
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); registerBondsUrlKeys(); clearProfileCacheForTests(); });
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        window.localStorage.clear();
        resetUrlKeysForTests();
        window.history.replaceState(null, '', '/');
        Reflect.deleteProperty(navigator, 'clipboard');
    });

    // Ruling R23a (round 23): the rail is gone -- its four destinations are
    // the top bar's own tabs now, in order Orbitals | Atoms | Bonds | Molecules.
    it('lays out the workstation: banner with the mode tabs, Explore, the 3D view and the inspector', () => {
        renderWithProvider(<App />);
        const banner = screen.getByRole('banner');
        expect(banner).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'view mode' })).toBeNull();
        expect(within(banner).getAllByRole('link', { name: /mode\)$/ }).map(link => link.getAttribute('aria-label'))).toEqual([
            'Orbitals (basic orbitals mode)', 'Atoms (atom mode)', 'Bonds (bonds mode)', 'Molecules (molecule mode)',
        ]);
        expect(screen.getByRole('complementary', { name: 'Explore' })).toBeInTheDocument();
        expect(screen.getByRole('main', { name: '3D view' })).toHaveAttribute('id', 'canvas-container');
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveClass('view-panel');
    });

    it('reads top bar → Explore → toolbar → strip → inspector, under one h1 (spec §13)', () => {
        const { container } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        const order = ['.app-topbar', '.explore-panel', '.viewport-toolbar', '.thumbnail-strip', '.inspector']
            .map(selector => container.querySelector(selector)!);
        order.forEach(element => expect(element).not.toBeNull());
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    // Ruling R23a replaces the old Explore/Molecules "area tab" pair (and its
    // lastExploreModeRef memory) with four direct mode tabs: each switches to
    // its own mode outright, with no "last of Atoms, Basic Orbitals and
    // Bonds" to return to.
    it('each top bar tab switches directly to its own mode', () => {
        const { store } = renderWithProvider(<App />);
        // Unanchored: the top bar's tab name is "Bonds (bonds mode)" (WCAG 2.5.3, label in name).
        fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
        expect(store.getState().atom.mode).toBe('bonds');
        fireEvent.click(screen.getByRole('link', { name: /molecule mode/ }));
        expect(store.getState().atom.mode).toBe('molecule');
        expect(screen.getByRole('link', { name: /molecule mode/ })).toHaveAttribute('aria-current', 'page');
        fireEvent.click(screen.getByRole('link', { name: /atom mode/ }));
        expect(store.getState().atom.mode).toBe('atom');
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/ }));
        expect(store.getState().atom.mode).toBe('hydrogenic');
    });

    // Spec §8.2: like the old exclusive Mode toggle, re-picking the mode on screen dispatches nothing,
    // so Bonds' picture is not cleared (its request effect would never redraw it).
    it('re-picking the mode already shown, from its own top bar tab, leaves the picture alone', () => {
        const { store } = renderWithProvider(<App />);
        // Unanchored: the top bar's tab name is "Bonds (bonds mode)" (WCAG 2.5.3, label in name).
        fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
        const field = store.getState().orbital.currentField;
        const nonce = store.getState().orbital.basicRenderNonce;
        expect(field).not.toBeNull();
        fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
        expect(store.getState().orbital.currentField).toBe(field);
        expect(store.getState().orbital.basicRenderNonce).toBe(nonce);
        expect(store.getState().atom.mode).toBe('bonds');
    });

    it('opens a search result the way the pickers do', async () => {
        const { store } = renderWithProvider(<App />);
        const search = screen.getByRole('combobox', { name: 'Search elements, molecules and orbitals' });
        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: 'fe' } });
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(store.getState().atom.Z).toBe(26);
        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: '2px' } });
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(store.getState().atom.mode).toBe('hydrogenic');
        expect(store.getState().orbital.basicSelection).toEqual({ n: 2, l: 1, ml: 1 });
        // Focusing the search asked for the molecule index (spec §8.3); let its load settle inside the test.
        await waitFor(() => expect(store.getState().molecule.index !== null || store.getState().molecule.indexError !== null).toBe(true));
    });

    // Owner R25-B3: one brand. A preview choice stored before (eov.brand) is ignored: the bar, the home link and the
    // document title say QuantumLab whatever it holds.
    it('shows QuantumLab whatever an old eov.brand holds (owner R25-B3)', () => {
        window.localStorage.setItem('eov.brand', 'novalab');
        try {
            renderWithProvider(<App />);
            expect(screen.getByRole('link', { name: 'QuantumLab, home' })).toHaveTextContent('QuantumLab');
            expect(screen.queryByText(/NovaLab/)).toBeNull();
            expect(document.title).toMatch(/ · QuantumLab$/);
        } finally {
            window.localStorage.removeItem('eov.brand');
        }
    });

    // Owner R25-B3: the brand switch left with the brand preview; a theme switch is what can still change here.
    it('a theme switch leaves the share link byte-identical (Review Focus 1)', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        // Ruling DB1: the link carries the view's state, so an equal second link means something.
        expect(writeText.mock.calls[0][0]).toMatch(/#mode=atom&/);
        fireEvent.click(screen.getByRole('button', { name: /^Theme: / }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light Clean' }));
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        // Task 2: Share opens a menu now; Copy link is the copy it used to make.
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
        expect(writeText.mock.calls[1][0]).toBe(writeText.mock.calls[0][0]);
    });

    // Task 5 (Task 4 review ruling): at medium width, with the drawer folded, an Orbitals (i) opens the drawer on Info's
    // term; pressing the active (i) again clears the term and opens nothing -- the drawer, folded again, stays folded.
    it('at medium width, an Orbitals (i) opens the folded drawer on its term, and pressing it again opens nothing', () => {
        window.matchMedia = ((media: string) => ({ media, matches: media === MEDIUM_VIEWPORT,
            addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
        const { container } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        const drawer = () => container.querySelector('#canvas-container .view-panel')!;
        expect(drawer()).toHaveClass('folded');
        const explore = screen.getByRole('complementary', { name: 'Explore' });
        const shell = within(explore).getByRole('button', { name: 'About Shell' });
        // (b) the drawer opens, with Info on the term.
        fireEvent.click(shell);
        expect(drawer()).toHaveClass('open');
        const inspector = screen.getByRole('complementary', { name: 'Inspector' });
        expect(within(inspector).getByRole('heading', { level: 2, name: /^Info/ }).querySelector('.info-topic-chip')).toHaveTextContent('Shell');
        // (c) fold the drawer, then press the active (i): the term clears and the drawer stays folded.
        fireEvent.keyDown(within(inspector).getByRole('heading', { level: 2, name: /^Info/ }), { key: 'Escape' });
        expect(drawer()).toHaveClass('folded');
        expect(shell).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(shell);
        expect(shell).toHaveAttribute('aria-pressed', 'false');
        expect(drawer()).toHaveClass('folded');
        expect(container.querySelector('.info-topic-chip')).toBeNull();
    });

    it('at medium width the inspector is a drawer over the viewport, folded until asked, and Esc closes it', () => {
        window.matchMedia = ((media: string) => ({ media, matches: media === MEDIUM_VIEWPORT,
            addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
        const { container } = renderWithProvider(<App />);
        const drawer = container.querySelector('#canvas-container .view-panel')!;
        expect(drawer).toHaveClass('folded');
        fireEvent.click(screen.getByRole('button', { name: 'View settings' }));
        expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('open');
        // Ruling T18-a11y-carry (b): Esc is the drawer's own key -- pressed inside it (here on the
        // bar button that opened it), not on document, so an Esc meant for the table or search is not its.
        fireEvent.keyDown(screen.getByRole('button', { name: 'View settings' }), { key: 'Escape' });
        expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('folded');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View settings' }));
    });

    it('exports the curves of the plot tab on screen (ruling C6)', async () => {
        const download = jest.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {});
        try {
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile(), level: 'shell', selectedShell: 1, selectedSubshell: { n: 1, l: 0 } });
            // Ruling T13-tablabels: tabs show the curve symbol; the name is the words plus that symbol.
            fireEvent.click(screen.getByRole('tab', { name: 'Wave function R(r)' }));
            fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
            fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
            await waitFor(() => expect(download).toHaveBeenCalled());
            const text = new TextDecoder().decode(await readBlob(download.mock.calls[0][0] as Blob));
            expect(text).toContain('1s · R(r)');
            expect(text).toContain('# quantity: R(r)');
        } finally {
            download.mockRestore();
            window.localStorage.clear();
        }
    });

    // Task 7 fix round 1, Important 2: the Basic Orbitals screen's own version of the
    // test above -- it must go through the real App wiring (displayPref.plotTab,
    // basicTabCurves, handleExport), not build the curves itself.
    it('Basic Orbitals: exports the curves of the plot tab on screen (ruling C6)', async () => {
        const download = jest.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {});
        try {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            // The default selection (n=3, l=2, ml=0) draws on entry (the nonce effect); the mocked
            // OrbitalViewer never calls back, so the render is finished here, as the isostale test does.
            act(() => { store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 })); });
            fireEvent.click(screen.getByRole('tab', { name: 'Wave function R(r)' }));
            fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
            fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
            await waitFor(() => expect(download).toHaveBeenCalled());
            const text = new TextDecoder().decode(await readBlob(download.mock.calls[0][0] as Blob));
            expect(text).toContain('3d · R(r)');
            expect(text).toContain('# quantity: R(r)');
        } finally {
            download.mockRestore();
            window.localStorage.clear();
        }
    });

    // Ruling T7-dist (fix round 1): the D(r) tab is unchanged from before this task --
    // a plain 'P(r)' CSV header and today's quantity text, never the shared tab's own label.
    it('Basic Orbitals: the D(r) tab\'s CSV stays exactly as before (ruling T7-dist)', async () => {
        const download = jest.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {});
        try {
            const { store, container } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
            act(() => { store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 })); });
            // D(r) is the default tab -- no tab click needed. It keeps today's single-curve
            // plot exactly: its own title (not the Atom screen's "D(r) = 4πr²ρ(r)"), its area
            // fill, and no legend/hover line (isMultiCurve stays false).
            expect(screen.getByText('Radial distribution — r²R(r)²')).toBeInTheDocument();
            expect(container.querySelector('.radial-plot-fill')).not.toBeNull();
            expect(container.querySelector('.radial-plot-legend')).toBeNull();
            fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
            fireEvent.click(screen.getByRole('button', { name: 'Export CSV of this plot' }));
            await waitFor(() => expect(download).toHaveBeenCalled());
            const text = new TextDecoder().decode(await readBlob(download.mock.calls[0][0] as Blob));
            expect(text).toContain('P(r)');
            expect(text).not.toContain('D(r)');
            expect(text).toContain('# quantity: P(r) = r^2*R(r)^2, probability per bohr');
        } finally {
            download.mockRestore();
            window.localStorage.clear();
        }
    });

    // Ruling DX1/DC1: the inspector column holds its place while the atom solves (§8.6), then gains its tabs.
    it('keeps the Atom inspector landmark before the profile arrives, and gives it Plot and Data once it does', () => {
        const { store } = renderWithProvider(<App />);
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Data' })).toBeNull();
        act(() => { store.dispatch(solveSucceeded(hydrogenProfile())); });
        const inspector = screen.getByRole('complementary', { name: 'Inspector' });
        expect(within(inspector).getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
        // Ruling T13-tablabels: tabs show the curve symbol; the name is the words plus that symbol.
        expect(within(inspector).getByRole('tab', { name: 'Radial distribution D(r)' })).toHaveAttribute('aria-selected', 'true');
    });

    // Ruling DX1/DC1: at medium width the atom's drawer opens from its "Plot panel" button.
    it('at medium width, with an atom solved, the drawer opens on Plot from its Plot panel button', () => {
        window.matchMedia = ((media: string) => ({ media, matches: media === MEDIUM_VIEWPORT,
            addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
        const { container } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('folded');
        fireEvent.click(screen.getByRole('button', { name: 'Plot panel' }));
        expect(container.querySelector('#canvas-container .view-panel')).toHaveClass('open');
        // Ruling T13-tablabels: tabs show the curve symbol; the name is the words plus that symbol.
        expect(screen.getByRole('tab', { name: 'Density ρ(r)' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Radial distribution D(r)' })).toHaveAttribute('aria-selected', 'true');
    });

    // Ruling R20b (owner decision): Basic Orbitals keeps its choice of orbital in Explore and puts its view
    // settings in the inspector, above the plot -- where Bonds and Molecules have theirs.
    // Ruling P3: the chip draws on selection; Update Orbital is gone. BasicExplore's Shell n chip
    // (and the combination picker it now renders itself) replace the old n/l/mₗ selects
    // and Update Orbital button in Explore; the view settings stay in the inspector. Task 1 (picture
    // control): Subshell and Orbital are gone -- the strip under the picture picks them now.
    it('in Basic Orbitals, puts the Shell n chip and the combination picker in Explore, and the view settings in the inspector', () => {
        const { container } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        const explore = screen.getByRole('complementary', { name: 'Explore' });
        const inspector = screen.getByRole('complementary', { name: 'Inspector' });
        for (const name of [/^shell n/i]) { // Task 5: the row is named by its visible label
            expect(within(explore).getByRole('group', { name })).toBeInTheDocument();
            expect(within(inspector).queryByRole('group', { name })).toBeNull();
        }
        expect(within(explore).getByRole('combobox', { name: /combination/i })).toBeInTheDocument();
        expect(within(inspector).queryByRole('combobox', { name: /combination/i })).toBeNull();
        expect(within(explore).queryByRole('button', { name: 'Update Orbital' })).toBeNull();
        // Task 5: the one-electron framing is Info's now (basicInfo), not the Explore panel's.
        expect(within(explore).queryByText(/one electron, Z = 1/i)).toBeNull();
        expect(within(inspector).getByText(/one electron, Z = 1/i)).toBeInTheDocument();
        // Ruling R24-3: the plot's section is open by default; the settings are in the Display section above it.
        expect(inspector.querySelector('.radial-plot')).not.toBeNull();
        openInspectorSection('Display');
        expect(within(inspector).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
        expect(within(explore).queryByRole('slider', { name: 'surface opacity' })).toBeNull();
        expect(within(inspector).getByRole('combobox', { name: /electron enclosed/i })).toBeInTheDocument();
        // Owner R25-B1 removed Orbitals' Solid | Wireframe; ruling R25-finish offers the Glow | Solid finish here instead.
        expect(within(inspector).getByRole('group', { name: 'surface style' })).toHaveTextContent(/^GlowSolid$/);
        expect(within(inspector).getByRole('group', { name: 'cut-away axis' })).toBeInTheDocument();
        // The settings sit above the plot, as in Bonds' inspector -- R24-3: the Plot and data header follows them.
        const opacity = within(inspector).getByRole('slider', { name: 'surface opacity' });
        expect(opacity.compareDocumentPosition(within(inspector).getByRole('button', { name: 'Plot and data' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // Preflight D30 / ruling P3: the selection half no longer renders in Basic
        // Orbitals at all, so the view half (in the inspector) carries #controls now --
        // still exactly one on the page.
        expect(container.querySelectorAll('#controls')).toHaveLength(1);
        expect(inspector.querySelector('#controls')).not.toBeNull();
    });

    it("in Basic Orbitals, the inspector's opacity slider commits the same setSurfaceStyle as before", () => {
        const { store } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        const before = store.getState().orbital;
        openInspectorSection('Display');
        const slider = within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('slider', { name: 'surface opacity' });
        fireEvent.keyDown(slider, { key: 'ArrowLeft' });
        const expected = orbitalReducer(before, setSurfaceStyle({ opacity: before.surfaceStyle.opacity - 0.05 })).surfaceStyle;
        expect(store.getState().orbital.surfaceStyle.opacity).toBeCloseTo(expected.opacity);
        // Owner R25-B1: the render mode compared here is gone with the Wireframe option; the cut is the rest of the style.
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: expected.clipAxis });
    });

    // Ruling R20b-atoms (owner decision): the Atom screen's Display settings leave Explore for the top of the inspector.
    // Ruling R24-3: as a titled section above "Plot and data" -- the plot open by default, Display opened on demand.
    it('in Atoms, Explore has Configuration and Orbitals, and Display heads the inspector above Plot and Data', () => {
        const { container } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        const explore = screen.getByRole('complementary', { name: 'Explore' });
        expect(within(explore).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Configuration', 'Orbitals']);
        const inspector = screen.getByRole('complementary', { name: 'Inspector' });
        expect(within(inspector).getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
        expect(within(inspector).getByRole('tab', { name: 'Plot' })).toBeInTheDocument();
        openInspectorSection('Display');
        const display = within(inspector).getByRole('region', { name: 'Display' });
        expect(within(display).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
        // Ruling R22a (owner): the colour-scheme toggle (was asserted here by its Phase ψ button) is gone.
        expect(within(display).queryByRole('button', { name: 'Phase ψ colours' })).toBeNull();
        expect(within(display).getByRole('checkbox', { name: 'Show axes' })).toBeInTheDocument();
        expect(within(display).getByRole('combobox', { name: /electron enclosed/i })).toBeInTheDocument();
        // The Plot and data header stays in view below the open Display section (R24-3).
        expect(display.compareDocumentPosition(within(inspector).getByRole('button', { name: 'Plot and data' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(explore).queryByRole('slider', { name: 'surface opacity' })).toBeNull();
        expect(container.querySelectorAll('#controls')).toHaveLength(1);
    });

    // Task 16b ("Advanced appearance", owner R24-adv): Glow's tuning ends the Display section, folded; a slider
    // writes eov.glow at once, but the strip's tiles are asked for again only once it rests (GLOW_SETTLE_MS).
    it('ends Display with the folded Advanced appearance, whose sliders re-request the strip only once they rest', async () => {
        installMatchMedia(false);
        const idle = () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null }) as unknown as Worker;
        act(() => { thumbnailService.attach({ createWorker: idle, createGridWorker: idle, isBusy: () => false, themeKey: () => 'dark|glow|full|72|0.9', render: () => new Promise(() => {}) }); });
        const request = jest.spyOn(thumbnailService, 'request');
        try {
            const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
            openInspectorSection('Display');
            const displayNow = () => within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('region', { name: 'Display' });
            // The whole atom wears no Glow (a shell picture, ring-glyph tiles): nothing to tune there.
            expect(within(displayNow()).queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
            act(() => { store.dispatch(drillToShell(1)); });
            expect(screen.getByRole('option', { name: '1s orbital' })).toBeInTheDocument();
            // Owner R25-B1: "nor does a wireframe" went with the Wireframe option -- a shell's surface always wears Glow.
            const display = displayNow();
            const advanced = within(display).getByRole('button', { name: 'Advanced appearance' });
            expect(advanced).toHaveAttribute('aria-expanded', 'false');
            // At the bottom of the section: after Show axes.
            expect(within(display).getByRole('checkbox', { name: 'Show axes' }).compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            fireEvent.click(advanced);
            request.mockClear();
            // Task 16d item 13: a shell's composition lobes are phase-less, so the edge whiteness is offered here.
            expect(within(display).getByRole('slider', { name: 'Edge whiteness (density and lobes)' })).toBeInTheDocument();
            // Task 16d item 11: "Edge glow" is now "Edge strength".
            const edge = within(display).getByRole('slider', { name: 'Edge strength' });
            ['ArrowRight', 'ArrowRight', 'ArrowRight'].forEach(key => fireEvent.keyDown(edge, { key }));
            expect(JSON.parse(window.localStorage.getItem('eov.glow')!)).toEqual({ dark: { rimStrength: 0.78 } });
            expect(request).not.toHaveBeenCalled();
            await act(async () => { await new Promise(resolve => setTimeout(resolve, GLOW_SETTLE_MS + 50)); });
            expect(request).toHaveBeenCalled();
            expect(request.mock.calls.every(([asked]) => asked.contentKey.length > 0)).toBe(true);
        } finally {
            request.mockRestore();
            act(() => { thumbnailService.detach(); });
            window.localStorage.removeItem('eov.glow');
        }
    });

    // Owner R25-B2: Advanced appearance is Display's own sub-section -- inside its region, gone when Display folds.
    it('keeps Advanced appearance inside Display, so folding Display folds it too (owner R25-B2)', () => {
        installMatchMedia(false);
        const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        act(() => { store.dispatch(drillToShell(1)); });
        openInspectorSection('Display');
        const inspector = screen.getByRole('complementary', { name: 'Inspector' });
        const display = within(inspector).getByRole('region', { name: 'Display' });
        fireEvent.click(within(display).getByRole('button', { name: 'Advanced appearance' }));
        expect(within(display).getByRole('slider', { name: 'Edge strength' })).toBeInTheDocument();
        fireEvent.click(within(inspector).getByRole('button', { name: 'Display', expanded: true }));
        expect(within(inspector).queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        expect(within(inspector).queryByRole('slider', { name: 'Edge strength' })).toBeNull();
    });

    it('in Atoms at medium width, the drawer holds the Display section above Plot and Data', () => {
        window.matchMedia = ((media: string) => ({ media, matches: media === MEDIUM_VIEWPORT,
            addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.queryByRole('region', { name: 'Display' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Plot panel' }));
        const inspector = screen.getByRole('complementary', { name: 'Inspector' });
        // Ruling R24-3: the bar's Plot opens the drawer at Plot and data; the folded Display header sits above it.
        expect(within(inspector).getByRole('region', { name: 'Plot and data' })).toContainElement(within(inspector).getByRole('tab', { name: 'Plot' }));
        expect(within(inspector).getByRole('button', { name: 'Display' }).compareDocumentPosition(within(inspector).getByRole('tab', { name: 'Plot' }))
            & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        openInspectorSection('Display');
        const display = within(inspector).getByRole('region', { name: 'Display' });
        expect(within(display).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
        expect(display.compareDocumentPosition(within(inspector).getByRole('button', { name: 'Plot and data' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // Ruling T20b-display-header: in every mode the inspector's view settings sit under a visible "Display"
    // heading that folds them away. Ruling R24-3: every section is titled -- Display, then Plot and data in
    // Atoms and Basic Orbitals, Data in Bonds (Task 3, picture control); Display alone (and so open) in Molecules.
    it('heads the view settings with a foldable Display heading in Atoms, Basic Orbitals, Bonds and Molecules', async () => {
        (loadScan as jest.Mock).mockResolvedValue(n2Scan);
        (loadMoleculeMeta as jest.Mock).mockImplementation(async (id: string) => ({ ...n2Meta, id }));
        (loadBasis as jest.Mock).mockImplementation(async (id: string) => ({ ...n2Basis, id }));
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        const check = (mode: string) => {
            const inspector = screen.getByRole('complementary', { name: 'Inspector' });
            // Task 4: Info is always open above the accordion, not an accordion section -- so the toggles are read, not every
            // h2, and Info's own heading is checked separately.
            const headers = Array.from(inspector.querySelectorAll('.inspector-section-toggle')).map(toggle => toggle.textContent);
            expect([mode, headers]).toEqual([mode, mode === 'molecules' ? ['Display'] : mode === 'bonds' ? ['Display', 'Data'] : ['Display', 'Plot and data']]);
            expect([mode, within(inspector).getAllByRole('heading', { level: 2, name: 'Info' }).length]).toEqual([mode, 1]);
            openInspectorSection('Display');
            const display = within(inspector).getByRole('region', { name: 'Display' });
            // R24-3: the header sits just above the region it labels (it used to be inside a labelled section).
            const toggle = within(within(inspector).getByRole('heading', { name: 'Display' })).getByRole('button', { name: 'Display' });
            expect([mode, toggle.getAttribute('aria-expanded')]).toEqual([mode, 'true']);
            expect(within(display).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
            expect(within(display).getByRole('combobox', { name: /electron enclosed/i })).toBeInTheDocument();
            // Ruling R22a (owner): no mode offers a colour-scheme choice.
            expect([mode, screen.queryByRole('group', { name: 'colour scheme' })]).toEqual([mode, null]);
            expect([mode, screen.queryByText('Colour scheme')]).toEqual([mode, null]);
        };
        check('atoms');
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        check('basic');
        // Unanchored: the top bar's tab is named "<Visible label> (<old name>)" (WCAG 2.5.3, label in name).
        fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
        await act(async () => {});     // Bonds' and Molecules' files load as the mode opens; let them land
        check('bonds');
        fireEvent.click(screen.getByRole('link', { name: /molecule mode/ }));     // all four modes are top-bar tabs now (ruling R23a)
        await act(async () => {});
        check('molecules');
    });

    // Ruling R25-finish (controller): the Glow | Solid finish -- one global preference (eov.render, never in a link) -- is
    // offered in Display in every mode, not only Atoms; Advanced appearance (Glow's tuning) shows only under Glow.
    it('offers the Glow | Solid finish in Display in Orbitals, Bonds and Molecules; Solid folds away Advanced appearance (R25-finish)', async () => {
        (loadScan as jest.Mock).mockResolvedValue(n2Scan);
        (loadMoleculeMeta as jest.Mock).mockImplementation(async (id: string) => ({ ...n2Meta, id }));
        (loadBasis as jest.Mock).mockImplementation(async (id: string) => ({ ...n2Basis, id }));
        const { store } = renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        const link = () => encodeStateOf(store.getState());
        const check = (mode: string, finish: 'glow' | 'solid') => {
            openInspectorSection('Display');
            const display = within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('region', { name: 'Display' });
            const group = within(display).getByRole('group', { name: 'surface style' });
            expect([mode, group.textContent]).toEqual([mode, 'GlowSolid']);
            expect([mode, within(group).getByRole('button', { name: `${finish} surface` }).getAttribute('aria-pressed')]).toEqual([mode, 'true']);
            return { display, group };
        };
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        const basic = check('basic', 'glow');
        expect(within(basic.display).getByRole('button', { name: 'Advanced appearance' })).toBeInTheDocument();
        const before = link();
        fireEvent.click(within(basic.group).getByRole('button', { name: 'solid surface' }));
        expect(renderPref.get().finish).toBe('solid');
        expect(within(basic.display).queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        // The finish is the viewer's own: the share link is byte-identical.
        expect(link()).toBe(before);
        // Global: the next mode shows the same finish, and choosing Glow there brings Advanced appearance back.
        fireEvent.click(screen.getByRole('link', { name: /bonds mode/ }));
        await act(async () => {});
        const bonds = check('bonds', 'solid');
        expect(within(bonds.display).queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        fireEvent.click(within(bonds.group).getByRole('button', { name: 'glow surface' }));
        expect(within(bonds.display).getByRole('button', { name: 'Advanced appearance' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: /molecule mode/ }));
        await act(async () => {});
        const molecules = check('molecules', 'glow');
        fireEvent.click(within(molecules.group).getByRole('button', { name: 'solid surface' }));
        expect(within(molecules.display).queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        expect(renderPref.get().finish).toBe('solid');
        act(() => { renderPref.set({ ...renderPref.get(), finish: 'glow' }); });
    });

    // Ruling R24-3 (was: folding Display, T20b-display-header): the open section is one at a time, survives a mode
    // change and a reload, and is never in the share link.
    it('opening Display folds Plot and data, survives a mode change and a reload, and leaves the share link alone', () => {
        const { store, unmount } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        const link = encodeStateOf(store.getState());
        const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
        expect(within(inspector()).queryByRole('slider', { name: 'surface opacity' })).toBeNull();
        fireEvent.click(within(inspector()).getByRole('button', { name: 'Display' }));
        expect(within(inspector()).getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'true');
        expect(within(inspector()).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
        expect(within(inspector()).getByRole('button', { name: 'Plot and data' })).toHaveAttribute('aria-expanded', 'false');
        expect(inspector().querySelector('.radial-plot')).toBeNull();
        expect(encodeStateOf(store.getState())).toBe(link);
        fireEvent.click(screen.getByRole('link', { name: /\(atom mode\)/ }));
        expect(within(inspector()).getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
        unmount();

        renderWithProvider(<App />);
        expect(within(inspector()).getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(within(inspector()).getByRole('button', { name: 'Plot and data' }));
        expect(within(inspector()).queryByRole('slider', { name: 'surface opacity' })).toBeNull();
        expect(within(inspector()).getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
    });

    // Ruling T13-shellcard: under a shell's name the card states that shell's facts, not the whole atom's.
    it('gives a shell its own facts card: occupancy, electrons and drawn radius', () => {
        renderWithProvider(<App />, { Z: 18, profile: argonLikeProfile(), level: 'shell', selectedShell: 2 });
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        const card = screen.getByRole('region', { name: 'orbital facts' });
        expect(within(card).getByRole('heading', { name: 'L shell' })).toBeInTheDocument();
        expect(card).toHaveTextContent('Occupancy2s² 2p⁶');
        expect(card).toHaveTextContent('Electrons8');
        expect(card).toHaveTextContent('Drawn radius0.500 a₀ (non-relativistic LDA)');
        expect(card).not.toHaveTextContent('Configuration');
        expect(card).not.toHaveTextContent('Shells');
    });

    // Ruling T13-isostale: while the orbital computes, the card does not show the previous orbital's iso value.
    it('shows the iso value as pending until the orbital has rendered', () => {
        const { store } = renderWithProvider(<App />, {
            Z: 1, profile: hydrogenProfile(), level: 'orbital', selectedShell: 1, selectedSubshell: { n: 1, l: 0 }, selectedOrbital: { n: 1, l: 0, ml: 0 },
        });
        expect(store.getState().orbital.isLoading).toBe(true);
        fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
        const card = screen.getByRole('region', { name: 'orbital facts' });
        expect(card).toHaveTextContent('Iso value…computing');
        act(() => { store.dispatch(finishOrbitalCalculation({ isoLevel: 1.234e-3 })); });
        // Task 6: ×10ⁿ and its unit (isoValueText, shared with Info).
        expect(card).toHaveTextContent('Iso value|ψ|² = 1.23 × 10⁻³ a₀⁻³');
        expect(card).not.toHaveTextContent('computing');
    });

    // Ruling R7: on a phone the sheet's Plot tab stacks the plot and the data, with no inner Plot/Data tabs.
    it('on a phone the Plot tab holds the plot and then the data, stacked', () => {
        installMatchMedia(true);
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        fireEvent.click(screen.getByRole('tab', { name: 'Plot' }));
        // The sheet's own panel; the plot's function tabs have their own tabpanel inside it.
        const panel = document.getElementById('phone-sheet-body')!;
        expect(panel).toHaveAttribute('role', 'tabpanel');
        const sections = within(panel).getAllByRole('region').filter(region => ['Plot', 'Data'].includes(region.getAttribute('aria-label') ?? ''));
        expect(sections.map(section => section.getAttribute('aria-label'))).toEqual(['Plot', 'Data']);
        // Ruling T13-tablabels: tabs show the curve symbol; the name is the words plus that symbol.
        expect(within(sections[0]).getByRole('tab', { name: 'Radial distribution D(r)' })).toHaveAttribute('aria-selected', 'true');
        expect(within(sections[1]).getByRole('region', { name: 'orbital facts' })).toHaveTextContent('Whole atom');
        expect(within(panel).queryByRole('tab', { name: 'Data' })).toBeNull();
    });
});

describe('App: relativity', () => {
    // Task 2: these tests work controls above the default Explore level (the Relativity switch).
    beforeEach(() => { window.localStorage.setItem('eov.level', 'research'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); });
    beforeEach(() => { clearProfileCacheForTests(); });
    // Fix round 1, I1: with spin–orbit a level-3 orbital is drawn with its
    // own j-level's R(r) and sampling box, not the first (n, l) found.
    it('draws a spin–orbit orbital with the selected j-level\'s radial function', () => {
        const argon = argonLikeProfile();
        const p = argon.subshells.find(s => s.n === 2 && s.l === 1)!;
        const pHalf = { ...p, j: 0.5, samplingRadius: 1.1, R: new Float64Array(argon.size).fill(1) };
        const pThreeHalves = { ...p, j: 1.5, samplingRadius: 1.9, R: new Float64Array(argon.size).fill(2) };
        const { store } = renderWithProvider(<App />, {
            mode: 'atom',
            Z: 18,
            relativityOverride: 'spinOrbit',
            level: 'orbital',
            selectedShell: 2,
            selectedSubshell: { n: 2, l: 1, j: 1.5 },
            selectedOrbital: { n: 2, l: 1, ml: 0, j: 1.5 },
            profile: {
                ...argon, relativity: 'spinOrbit',
                subshells: [...argon.subshells.filter(s => !(s.n === 2 && s.l === 1)), pHalf, pThreeHalves],
            },
        });
        const params = store.getState().orbital.currentParams!;
        expect(params.rMax).toBeCloseTo(1.9);
        expect(params.radialSamples!.R[0]).toBe(2);
    });

    // Fix round 1, M2: the busy label names the j-level, as the crumb does.
    it('names the j-level while its orbital is computed', () => {
        installMatchMedia(false);
        // The picture is already solved, so the canvas is busy with the orbital alone.
        setCachedProfile('18', DEFAULT_ENCLOSED_FRACTION, { ...spinOrbitArgon(), speciesKey: '18' }, 'spinOrbit');
        jest.useFakeTimers();
        try {
            renderWithProvider(<App />, {
                mode: 'atom', Z: 18, relativityOverride: 'spinOrbit',
                level: 'orbital', selectedShell: 2,
                selectedSubshell: { n: 2, l: 1, j: 1.5 },
                selectedOrbital: { n: 2, l: 1, ml: 0, j: 1.5 },
                profile: spinOrbitArgon(),
            });
            act(() => { jest.advanceTimersByTime(500); });
            // Task 8 (addendum 4): the orbital typeset, 2p<sub>z</sub>, never "2p_z".
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(document.querySelector('.canvas-busy')).toHaveSeenText('Computing 2pz · 2p³⁄₂…');
            expect(document.querySelector('.canvas-busy')!.innerHTML).toContain('2p<sub>z</sub>');
        } finally {
            jest.useRealTimers();
        }
    });

    // Controller ruling T10-wholeatom: at the whole atom no shell is open, so
    // Explore › Orbitals picks none out -- no j-level note about lobes the
    // 3D view's shell rings do not draw, no current-shell colours.
    it('picks out no shell in Explore › Orbitals at the whole atom, even under spin–orbit', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />, {
            mode: 'atom', Z: 18, relativityOverride: 'spinOrbit', level: 'atom', profile: spinOrbitArgon(),
        });
        fireEvent.click(screen.getByRole('tab', { name: 'Orbitals' }));
        expect(container.querySelector('.subshell-energy-diagram')).not.toBeNull();
        expect(container.querySelector('.subshell-j-note')).toBeNull();
        expect(container.querySelector('.subshell-energy-rule.current')).toBeNull();
    });

    function spinOrbitArgon(): SerialisedAtomProfile {
        const argon = argonLikeProfile();
        const p = argon.subshells.find(s => s.n === 2 && s.l === 1)!;
        return {
            ...argon, relativity: 'spinOrbit',
            subshells: [
                ...argon.subshells.filter(s => s.l === 0).map(s => ({ ...s, j: 0.5 })),
                { ...p, j: 0.5, electrons: 2, energy: -8.6 },
                { ...p, j: 1.5, electrons: 4, energy: -8.4 },
            ],
        };
    }

    // Task 9 carry: a spin–orbit chip used to do nothing, since its (n, l)
    // names no subshell of a j-split profile.
    it('drills through a spin–orbit j-level from its chip, and Back returns to that j-level', () => {
        installMatchMedia(false);
        const { store, container } = renderWithProvider(<App />, {
            mode: 'atom', Z: 18, relativityOverride: 'spinOrbit',
            level: 'shell', selectedShell: 2, profile: spinOrbitArgon(),
        });
        const legend = () => Array.from(container.querySelectorAll('.radial-plot-legend-item')).map(e => e.textContent);
        expect(legend()).toEqual(['2s½', '2p½', '2p³⁄₂']);
        // Task 11 (Task 10 carry): each j-level is also named aloud.
        expect(Array.from(container.querySelectorAll('.radial-plot-legend .visually-hidden')).map(e => e.textContent))
            .toEqual(['2s j = 1/2', '2p j = 1/2', '2p j = 3/2']);
        fireEvent.click(screen.getByRole('button', { name: /^2p j = 3\/2,/ }));
        expect(store.getState().atom.selectedSubshell).toEqual({ n: 2, l: 1, j: 1.5 });
        // The radial plot isolates the same j-level.
        expect(legend()).toEqual(['2p³⁄₂']);
        // Task 6: the mₗ button is named flat ("2px"), drawn with a real subscript.
        fireEvent.click(screen.getByRole('button', { name: '2px' }));
        expect(store.getState().atom.level).toBe('orbital');
        expect(store.getState().atom.selectedOrbital).toEqual({ n: 2, l: 1, ml: 1, j: 1.5 });
        fireEvent.click(screen.getByRole('button', { name: 'Back to 2p j = 3/2' }));
        expect(store.getState().atom.level).toBe('shell');
        expect(store.getState().atom.selectedSubshell).toEqual({ n: 2, l: 1, j: 1.5 });
        // A chip is a toggle: the selected j-level's chip clears it, the other one switches to it.
        fireEvent.click(screen.getByRole('button', { name: /^2p j = 1\/2,/ }));
        expect(store.getState().atom.selectedSubshell).toEqual({ n: 2, l: 1, j: 0.5 });
        fireEvent.click(screen.getByRole('button', { name: /^2p j = 1\/2,/ }));
        expect(store.getState().atom.selectedSubshell).toBeNull();
    });

    // Ruling C9: what describes the drawn picture reads the profile's mode,
    // not the switch's -- a spin–orbit picture still up while a scalar
    // solve runs is labelled as the Dirac result it is.
    it('labels the energies with the drawn profile\'s method', () => {
        installMatchMedia(false);
        const { container } = renderWithProvider(<App />, {
            mode: 'atom', Z: 18, relativityOverride: 'scalar', isSolving: true,
            level: 'shell', selectedShell: 2, profile: spinOrbitArgon(),
        });
        const energies = Array.from(container.querySelectorAll('.subshell-chip-energy'));
        expect(energies).toHaveLength(3);
        for (const energy of energies) expect(energy.getAttribute('title')).toMatch(/Dirac/);
    });

    // Task 11: the switch, its default, its readout and its busy label.
    describe('the Relativity switch', () => {
        const goldChange = { n: 6, label: '6s', nonRelativisticMeanRadius: 3.21, relativisticMeanRadius: 2.76, contractionPercent: 14.1 };
        /** A gold-sized stand-in: argon's shape, gold's Z and a scalar solve's payload. */
        function scalarGold(): SerialisedAtomProfile {
            return { ...argonLikeProfile(), Z: 79, speciesKey: '79', relativity: 'scalar', valenceS: goldChange, nonRelativistic: null, comparisonUnavailable: null };
        }
        const switchIn = (root: HTMLElement = document.body) => within(root).getByRole('group', { name: 'relativity treatment' });
        // Task 6: the readout and About are said in Info (atomInfo), docked at the top of the right panel.
        const info = (container: HTMLElement) => container.querySelector('.info-section')!;

        // Spec §9.1: Relativity is in Explore › Configuration, no longer the right-hand view panel.
        it('sits in Explore › Configuration, at scalar by default for gold', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { mode: 'atom', Z: 79 });
            const group = switchIn(container.querySelector('.side-panel') as HTMLElement);
            expect(within(group).getByRole('button', { name: 'scalar relativistic' })).toHaveAttribute('aria-pressed', 'true');
            // Task 6: what the mode is, and that it is the default, are said in Info (relativityHelp).
            expect(info(container)).toHaveTextContent(/Scalar-relativistic \(Koelling–Harmon\).*Default for this element\./);
            expect(info(container)).not.toHaveTextContent(/Relativity is off here/);
        });

        it('is off by default for a light atom', () => {
            installMatchMedia(false);
            renderWithProvider(<App />, { mode: 'atom', Z: 6 });
            expect(within(switchIn()).getByRole('button', { name: 'relativity off' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByText(/Default for this element/)).toBeInTheDocument();
        });

        it('records a choice as the user\'s own, which then stops claiming to be the default', () => {
            installMatchMedia(false);
            const { store } = renderWithProvider(<App />, { mode: 'atom', Z: 79, profile: scalarGold() });
            fireEvent.click(within(switchIn()).getByRole('button', { name: 'with spin–orbit' }));
            expect(store.getState().atom.relativityOverride).toBe('spinOrbit');
            expect(within(switchIn()).getByRole('button', { name: 'with spin–orbit' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.queryByText(/Default for this element/)).toBeNull();
        });

        // Final review I3 (ruling T11-a): a real departure persists across
        // element picks, so Scalar chosen on carbon is still the choice on
        // gold -- where it is also the default, and the helper says so.
        // Clicking it there is choosing the default, which follows the
        // default again: carbon is then off.
        it('round trip: Scalar chosen on carbon reads as the default on gold, and re-choosing it there follows the default again', () => {
            installMatchMedia(false);
            const { store } = renderWithProvider(<App />, { mode: 'atom', Z: 6 });
            fireEvent.click(within(switchIn()).getByRole('button', { name: 'scalar relativistic' }));
            expect(store.getState().atom.relativityOverride).toBe('scalar');
            expect(screen.queryByText(/Default for this element/)).toBeNull();

            act(() => { store.dispatch(setElement(79)); });
            expect(store.getState().atom.relativityOverride).toBe('scalar');
            expect(within(switchIn()).getByRole('button', { name: 'scalar relativistic' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByText(/Default for this element/)).toBeInTheDocument();

            fireEvent.click(within(switchIn()).getByRole('button', { name: 'scalar relativistic' }));
            expect(store.getState().atom.relativityOverride).toBeNull();
            act(() => { store.dispatch(setElement(6)); });
            expect(within(switchIn()).getByRole('button', { name: 'relativity off' })).toHaveAttribute('aria-pressed', 'true');
        });

        // Final review M6: no picture, no "this picture" -- the switch's mode
        // still names the method being solved for, but nothing is drawn in it.
        it('says nothing about "this picture" in About when the verdict left none', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, {
                mode: 'atom', Z: 85, charge: -1,
                unbound: 'Scalar-relativistic SCF for Astatine ion At⁻: LDA does not bind this anion: its 6p electron is not bound by 10⁻⁴ Ha or more.',
            });
            // Task 6: About is Info's "How this was computed" (open at Research), no longer in Explore › Orbitals.
            expect(info(container).querySelector('.info-computed')).toHaveTextContent(/central-field model/);
            expect(info(container).textContent).not.toMatch(/This picture/);
        });

        it('names the mode it is solving in', () => {
            installMatchMedia(false);
            jest.useFakeTimers();
            try {
                renderWithProvider(<App />, { mode: 'atom', Z: 79, isSolving: true });
                act(() => { jest.advanceTimersByTime(500); });
                expect(screen.getByText('Solving Gold (scalar-relativistic)…')).toBeInTheDocument();
            } finally {
                jest.useRealTimers();
            }
        });

        it('says what changed for the drawn picture, with its method', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { mode: 'atom', Z: 79, profile: scalarGold() });
            expect(info(container)).toHaveTextContent('What changed: 6s contracts by 14.1 % (mean radius ⟨r⟩ 3.21 → 2.76 a₀');
            expect(info(container)).toHaveTextContent(/Scalar-relativistic LDA \(MacDonald–Vosko exchange\)/);
            expect(container.querySelector('.side-panel')).not.toHaveTextContent(/What changed/);
        });

        // Ruling C9: while spin–orbit solves, the scalar picture is still up,
        // and its 6s figure must not sit under a switch that says spin–orbit.
        it('speaks for the picture on screen while another mode solves', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, {
                mode: 'atom', Z: 79, relativityOverride: 'spinOrbit', isSolving: true, profile: scalarGold(),
            });
            expect(info(container)).toHaveTextContent('Solving the picture with spin–orbit… the picture on screen is still scalar-relativistic.');
        });

        // Task 9 (live check item 6): Task 6 took the readout out of its live region, and the screen-reader pass found
        // the switch's result unspoken. Fix round 1: a phone then heard it twice (the readout, and the caption's
        // "loading…"/done), so one line says it, once, when the new picture lands -- "Relativity: with spin–orbit" names
        // the change -- from a polite region mounted for all of Atom mode (on a phone the switch is in the Explore tab,
        // where Info is not mounted), the same element throughout: a region inserted with its text is not reliably read.
        it('says a relativity change once, when it lands, from an always-mounted line -- also on a phone', () => {
            installMatchMedia(true);
            const { container, store } = renderWithProvider(<App />, {
                mode: 'atom', Z: 79, relativityOverride: 'spinOrbit', isSolving: true, profile: scalarGold(),
            });
            expect(container.querySelector('.info-section')).toBeNull();
            const live = container.querySelector('.relativity-live')!;
            expect(live).toHaveAttribute('aria-live', 'polite');
            // While spin–orbit solves, the scalar picture is still up: nothing has changed yet, so nothing is said.
            expect(live).toHaveTextContent(/^$/);
            const caption = container.querySelector('.phone-caption-live')!.textContent;
            act(() => { store.dispatch(solveSucceeded({ ...scalarGold(), relativity: 'spinOrbit' })); });
            expect(container.querySelector('.relativity-live')).toBe(live);
            expect(live).toHaveTextContent(/^Relativity: with spin–orbit$/);
            // The caption's spoken copy did not change: the change is heard once.
            expect(container.querySelector('.phone-caption-live')!.textContent).toBe(caption);
            // Another element is not a relativity change (its own default), so nothing is said -- and the line is cleared
            // (Task 9 review I1: a virtual cursor must not find "with spin–orbit" under argon's non-relativistic picture).
            act(() => { store.dispatch(setElement(18)); });
            act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });
            expect(container.querySelector('.relativity-live')).toBe(live);
            expect(live).toHaveTextContent(/^$/);
        });

        // Task 9 review I1: the same words on a new element are still a change. Off → Scalar on gold, then carbon (its own
        // default, off: silent), then Scalar on carbon -- "Relativity: scalar relativistic" again, and it must be heard.
        it('says Scalar on carbon after Scalar on gold: a new element starts its line afresh', () => {
            installMatchMedia(false);
            const offGold = (): SerialisedAtomProfile => ({ ...scalarGold(), relativity: 'off' });
            const carbon = (relativity: 'off' | 'scalar'): SerialisedAtomProfile => ({ ...argonLikeProfile(), Z: 6, speciesKey: '6', relativity });
            const { container, store } = renderWithProvider(<App />, {
                mode: 'atom', Z: 79, relativityOverride: 'off', profile: offGold(),
            });
            const live = container.querySelector('.relativity-live')!;
            expect(live).toHaveTextContent(/^$/);
            act(() => { store.dispatch(solveSucceeded(scalarGold())); });
            expect(live).toHaveTextContent(/^Relativity: scalar relativistic$/);
            act(() => { store.dispatch(setElement(6)); });
            act(() => { store.dispatch(solveSucceeded(carbon('off'))); });
            expect(live).toHaveTextContent(/^$/);
            act(() => { store.dispatch(solveSucceeded(carbon('scalar'))); });
            expect(container.querySelector('.relativity-live')).toBe(live);
            expect(live).toHaveTextContent(/^Relativity: scalar relativistic$/);
        });

        it('has the one spoken line on a desktop too, quiet on first load; Info shows the readout', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { mode: 'atom', Z: 79, profile: scalarGold() });
            expect(container.querySelectorAll('.relativity-live')).toHaveLength(1);
            expect(container.querySelector('.relativity-live')).toHaveTextContent(/^$/);
            expect(info(container)).toHaveTextContent('What changed: 6s contracts by 14.1 %');
        });

        // Ruling P18 (D13): Help's About text (LevelNav variant="about") is
        // whatever App passes it, so it must name the switch's mode -- not
        // the stale picture's -- while also saying the picture is still the
        // old one. Same scenario as the readout test just above (a spin–orbit
        // solve in flight over a scalar picture), read through Help instead.
        it('Help names the mode being solved for, and says the on-screen picture is still the old one', () => {
            installMatchMedia(false);
            renderWithProvider(<App />, {
                mode: 'atom', Z: 79, relativityOverride: 'spinOrbit', isSolving: true, profile: scalarGold(),
            });
            fireEvent.click(screen.getByRole('button', { name: 'Help' }));
            const dialog = screen.getByRole('dialog', { name: 'Help' });
            expect(dialog).toHaveTextContent('radial Dirac equation');
            expect(dialog).toHaveTextContent('The picture on screen is still scalar-relativistic; the one with spin–orbit is being solved.');
            // Ruling T2-picturesentence (review fix round 1): the ΔSCF sentence
            // describes the drawn (scalar) picture, never the selected
            // (spin-orbit) one -- otherwise the dialog would contradict the
            // "still scalar-relativistic" sentence just above by also
            // claiming the same on-screen picture includes spin-orbit.
            expect(dialog).toHaveTextContent('This picture is scalar-relativistic; the ΔSCF energies are not');
            expect(dialog).not.toHaveTextContent('This picture includes spin–orbit');
        });

        it('says why a relativistic picture has no comparison', () => {
            installMatchMedia(false);
            const why = 'No non-relativistic comparison: LDA does not bind the 4f without relativity.';
            const { container } = renderWithProvider(<App />, {
                mode: 'atom', Z: 79, profile: { ...scalarGold(), valenceS: null, comparisonUnavailable: why },
            });
            expect(info(container)).toHaveTextContent(why);
        });

        // Spec §9.8: the phone's Explore tab holds the left panel's tabs as sections, Relativity included.
        it('is in the Explore tab of a phone', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { mode: 'atom', Z: 79, profile: scalarGold() });
            expect(screen.queryByRole('group', { name: 'relativity treatment' })).toBeNull();
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            expect(switchIn(screen.getByRole('tabpanel'))).toBeInTheDocument();
            // Task 6: what changed is said in Info -- the phone's Info tab.
            fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
            expect(screen.getByRole('tabpanel')).toHaveTextContent(/6s contracts by 14\.1 %/);
        });

        // Ruling C6: the ΔSCF energies stay non-relativistic; with a
        // relativistic picture, the About text says the two differ.
        it('says in About this model (Info) that a relativistic picture\'s energies are not', () => {
            installMatchMedia(false);
            const { container } = renderWithProvider(<App />, { mode: 'atom', Z: 79, profile: scalarGold() });
            // Task 6: About is Info's "How this was computed", no longer expanded in Explore › Orbitals.
            expect(container.querySelector('.level-nav-about')).toBeNull();
            expect(info(container).querySelector('.info-computed')!.textContent).toMatch(/This picture is scalar-relativistic; the ΔSCF energies are not/);
        });
    });
});

describe('learning levels (Task 2)', () => {
    const originalMatchMediaForLevels = window.matchMedia;
    beforeEach(() => {
        resetUrlKeysForTests(); registerBuiltInUrlKeys(); registerBondsUrlKeys(); clearProfileCacheForTests();
        window.localStorage.removeItem('eov.level');
        clearVisit();
    });
    afterEach(() => {
        resetUrlKeysForTests();
        window.history.replaceState(null, '', '/');
        Reflect.deleteProperty(navigator, 'clipboard');
        window.localStorage.removeItem('eov.level');
        // In act: the App is still mounted here (cleanup unmounts it after), and hears the raise end.
        act(() => clearVisit());
    });

    it('at Explore, Atoms hides Charge, Excite and relativity and says where they appear; Advanced shows them', () => {
        renderWithProvider(<App />, { Z: 11 });
        expect(screen.queryByRole('button', { name: 'increase charge' })).toBeNull();
        expect(screen.queryByText('Charge')).toBeNull();
        expect(screen.queryByRole('group', { name: 'relativity treatment' })).toBeNull();
        expect(screen.getByText('Charge, excitation and relativity appear at Advanced')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: 'Advanced' }));
        expect(screen.getByRole('button', { name: 'increase charge' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'relativity treatment' })).toBeInTheDocument();
        expect(screen.queryByText('Charge, excitation and relativity appear at Advanced')).toBeNull();
    });

    it('the level switch sits in the top bar, between the mode tabs and the search', () => {
        const { container } = renderWithProvider(<App />);
        const bar = container.querySelector('.app-topbar')!;
        const order = Array.from(bar.children).map(child => child.className);
        const tabs = order.findIndex(name => name.includes('app-topbar-tabs'));
        const level = order.findIndex(name => name.includes('app-topbar-level'));
        const search = order.findIndex(name => name.includes('app-topbar-search'));
        expect(tabs).toBeLessThan(level);
        expect(level).toBeLessThan(search);
        expect(within(bar as HTMLElement).getByRole('radiogroup', { name: 'Learning level' })).toBeInTheDocument();
    });

    it('on a phone the level is chosen in the menu', () => {
        installMatchMedia(true);
        try {
            renderWithProvider(<App />);
            expect(screen.queryByRole('radiogroup', { name: 'Learning level' })).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
            fireEvent.click(screen.getByRole('radio', { name: 'Research' }));
            expect(window.localStorage.getItem('eov.level')).toBe('research');
        } finally {
            window.matchMedia = originalMatchMediaForLevels;
        }
    });

    // Review Focus 1 and 2: a link to an Advanced view opens at Advanced for the visit, and lowering the level
    // never changes what is drawn.
    it('a link to Fe²⁺ opens at Advanced for the visit, and choosing Explore keeps Fe²⁺ drawn, saying so', async () => {
        const { store } = renderWithProvider(<App />);
        // jsdom fires 'hashchange' asynchronously, not within the assignment.
        act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
        await waitFor(() => expect(store.getState().atom.charge).toBe(2));

        expect(screen.getByText('Opened at Advanced for this link — your level stays Explore.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Keep Advanced' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fe²⁺');
        expect(screen.getByRole('button', { name: 'increase charge' })).toBeInTheDocument();
        expect(window.localStorage.getItem('eov.level')).toBeNull();

        fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
        expect(store.getState().atom.charge).toBe(2);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fe²⁺');
        // Final re-review N3: the held line now ends with a full stop before its way-back action.
        expect(screen.getByText('Showing Fe²⁺ — charge controls appear at Advanced.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'increase charge' })).toBeNull();
        expect(screen.queryByText(/Opened at Advanced/)).toBeNull();
    });

    // Final review (unverified item, checked): below Advanced a held charge or excitation has no control on screen;
    // the held-value line carries a one-press way back to the neutral ground state, as Ruling T2-I1 gave combinations.
    it('below Advanced, a held ion\'s line offers the neutral atom, and one press shows it', async () => {
        const { store } = renderWithProvider(<App />);
        act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
        await waitFor(() => expect(store.getState().atom.charge).toBe(2));
        // At Advanced its controls are on screen, so there is no held-value line and no extra way back.
        expect(screen.queryByRole('button', { name: 'Show the neutral atom' })).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Basics' }));
        expect(screen.getByText(/Showing Fe²⁺ — charge controls appear at Advanced/)).toBeInTheDocument();
        // Final re-review N3: the sentence ends before its action, so it never reads "…Advanced Show the neutral atom".
        expect(screen.getByText(/Showing Fe²⁺ — charge controls appear at Advanced\.$/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show the neutral atom' }));
        expect(store.getState().atom).toMatchObject({ Z: 26, charge: 0, excitation: null });
        expect(screen.queryByText(/Showing Fe²⁺/)).toBeNull();
        expect(screen.getByText('Charge, excitation and relativity appear at Advanced')).toBeInTheDocument();
    });

    it('below Advanced, a held excitation\'s line offers the ground state, and one press shows it', async () => {
        const { store } = renderWithProvider(<App />);
        act(() => { window.location.hash = '#mode=atom&Z=11&excite=3s-3p'; });
        await waitFor(() => expect(store.getState().atom.excitation).not.toBeNull());
        fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show the ground state' }));
        expect(store.getState().atom).toMatchObject({ Z: 11, charge: 0, excitation: null });
    });

    // Fix round 1 (M5): an informational notice, heard politely; its dismissal belongs to the one link.
    it('says the raise politely, and a later link to the same level says so again after a dismissal', async () => {
        const { store } = renderWithProvider(<App />);
        act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
        await waitFor(() => expect(store.getState().atom.charge).toBe(2));
        const notice = screen.getByText('Opened at Advanced for this link — your level stays Explore.').closest('.level-visit-notice')!;
        expect(notice).toHaveAttribute('role', 'status');
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText(/Opened at Advanced/)).toBeNull();
        act(() => { window.location.hash = '#mode=atom&Z=11&charge=1'; });
        await waitFor(() => expect(store.getState().atom.Z).toBe(11));
        expect(screen.getByText('Opened at Advanced for this link — your level stays Explore.')).toBeInTheDocument();
    });

    // Fix round 1 (M2): on a phone the notice takes its own room under the header, and the overlays there move down.
    it('on a phone, makes room for the notice rather than covering the scale bar and key', async () => {
        installMatchMedia(true);
        try {
            const { store, container } = renderWithProvider(<App />);
            const viewport = container.querySelector('#canvas-container') as HTMLElement;
            expect(viewport.style.getPropertyValue('--phone-notice-offset')).toBe('');
            act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
            await waitFor(() => expect(store.getState().atom.charge).toBe(2));
            const slot = container.querySelector('.phone-notice-slot') as HTMLElement;
            expect(slot).toContainElement(screen.getByText(/Opened at Advanced/));
            expect(viewport.style.getPropertyValue('--phone-notice-offset')).toMatch(/px$/);
            fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
            expect(viewport.style.getPropertyValue('--phone-notice-offset')).toBe('');
        } finally {
            window.matchMedia = originalMatchMediaForLevels;
        }
    });

    // Ruling T2-I1: below Advanced the combination picker is hidden, so a chip press is the way back to one orbital.
    it('below Advanced, a chip press leaves a held combination and draws the single orbital', () => {
        window.localStorage.setItem('eov.level', 'research');
        const { store } = renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
        fireEvent.click(within(screen.getByRole('listbox')).getByText('sp³'));
        expect(store.getState().orbital.combination.kind).toBe('hybrid');
        fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
        expect(screen.getByText('Showing hybrid orbitals — combination controls appear at Advanced')).toBeInTheDocument();
        const chip = screen.getByRole('button', { name: 'n = 2' });
        expect(chip).not.toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(chip);
        expect(store.getState().orbital.combination.kind).toBe('none');
        expect(store.getState().orbital.currentField).toBeNull();
        expect(store.getState().orbital.currentParams).toMatchObject({ n: 2, Z: 1 });
        expect(window.localStorage.getItem('eov.level')).toBeNull();
    });

    // Fix round 1 (M8): a held value reads as what is on screen.
    it('says the axes are hidden, in plain words, where the axes switch would be', () => {
        window.localStorage.setItem('eov.level', 'basics');
        window.localStorage.setItem('eov.display', JSON.stringify({ showAxes: false }));
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.getByText('Showing the view without axes — axes controls appear at Explore')).toBeInTheDocument();
    });

    it('Keep <level> stores the raised level and ends the notice', async () => {
        const { store } = renderWithProvider(<App />);
        act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
        await waitFor(() => expect(store.getState().atom.charge).toBe(2));
        fireEvent.click(screen.getByRole('button', { name: 'Keep Advanced' }));
        expect(window.localStorage.getItem('eov.level')).toBe('advanced');
        expect(screen.queryByText(/Opened at Advanced/)).toBeNull();
        expect(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true');
    });

    it('the notice can be dismissed, leaving the visit at Advanced', async () => {
        const { store } = renderWithProvider(<App />);
        act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
        await waitFor(() => expect(store.getState().atom.charge).toBe(2));
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText(/Opened at Advanced/)).toBeNull();
        expect(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true');
        expect(window.localStorage.getItem('eov.level')).toBeNull();
    });

    it('Share copies a link at the recipient\'s level, or at the level chosen under Opens at', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        renderWithProvider(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(writeText.mock.calls[0][0]).not.toMatch(/[#&]lvl=/);

        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Opens at Basics' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
        expect(writeText.mock.calls[1][0]).toMatch(/#mode=atom&.*&lvl=basics$/);
    });

    // Final review I1 (ruled): `lvl` sets the visit level in both directions, floored at what the view needs, and
    // never stored; the notice says so either way, and why when the view needed more than the link asked for.
    describe('a link that opens at a level (final review I1)', () => {
        it('opens at Basics for a reader whose level is Research, and says so', async () => {
            window.localStorage.setItem('eov.level', 'research');
            const { store } = renderWithProvider(<App />);
            act(() => { window.location.hash = '#mode=atom&Z=10&lvl=basics'; });
            await waitFor(() => expect(store.getState().atom.Z).toBe(10));
            expect(screen.getByText('Opened at Basics for this link — your level stays Research.')).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByText('Charge, excitation and relativity appear at Advanced')).toBeInTheDocument();
            expect(window.localStorage.getItem('eov.level')).toBe('research');
        });

        it('opens at Explore for a first-time visitor, their own level, with no notice', async () => {
            const { store } = renderWithProvider(<App />);
            act(() => { window.location.hash = '#mode=atom&Z=10&lvl=explore'; });
            await waitFor(() => expect(store.getState().atom.Z).toBe(10));
            expect(screen.getByRole('radio', { name: 'Explore' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.queryByText(/Opened at/)).toBeNull();
            expect(window.localStorage.getItem('eov.level')).toBeNull();
        });

        it('opens a Basics link to Fe²⁺ at Advanced, the least the view needs, and says why', async () => {
            const { store } = renderWithProvider(<App />);
            act(() => { window.location.hash = '#mode=atom&Z=26&charge=2&lvl=basics'; });
            await waitFor(() => expect(store.getState().atom.charge).toBe(2));
            expect(screen.getByText('Opened at Advanced for this link — it asks for Basics, but this view needs Advanced. Your level stays Explore.'))
                .toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('button', { name: 'increase charge' })).toBeInTheDocument();
        });

        it('leaving the link for one with no level restores the reader\'s own level', async () => {
            window.localStorage.setItem('eov.level', 'research');
            const { store } = renderWithProvider(<App />);
            act(() => { window.location.hash = '#mode=atom&Z=10&lvl=basics'; });
            await waitFor(() => expect(store.getState().atom.Z).toBe(10));
            expect(screen.getByRole('radio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'true');
            act(() => { window.location.hash = '#mode=atom&Z=11'; });
            await waitFor(() => expect(store.getState().atom.Z).toBe(11));
            expect(screen.getByRole('radio', { name: 'Research' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.queryByText(/Opened at/)).toBeNull();
        });

        // Review Focus 2: a visit below the reader's level hides controls, never what the link draws -- the view the
        // link holds is the one it holds at Research, and a held preference stays with its note.
        it('lowering the level for a link never changes what is drawn', async () => {
            window.localStorage.setItem('eov.level', 'research');
            window.localStorage.setItem('eov.display', JSON.stringify({ showAxes: false }));
            const { store } = renderWithProvider(<App />);
            const drawn = () => {
                const { atom, orbital } = store.getState();
                return {
                    mode: atom.mode, Z: atom.Z, charge: atom.charge, excitation: atom.excitation, relativity: atom.relativityOverride,
                    fraction: orbital.enclosedFraction, style: orbital.surfaceStyle,
                };
            };
            act(() => { window.location.hash = '#mode=atom&Z=10'; });
            await waitFor(() => expect(store.getState().atom.Z).toBe(10));
            const atResearch = drawn();
            act(() => { window.location.hash = '#mode=atom&Z=10&lvl=basics'; });
            await waitFor(() => expect(screen.getByRole('radio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'true'));
            expect(drawn()).toEqual(atResearch);
            expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toMatchObject({ showAxes: false });
            expect(screen.getByText('Showing the view without axes — axes controls appear at Explore')).toBeInTheDocument();
        });

        it('Share offers no level below what the view needs, and says the level its link opens at', async () => {
            const writeText = jest.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
            window.localStorage.setItem('eov.level', 'research');
            const { store } = renderWithProvider(<App />);
            act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
            await waitFor(() => expect(store.getState().atom.charge).toBe(2));
            fireEvent.click(screen.getByRole('button', { name: 'Share' }));
            expect(screen.getByRole('menuitemradio', { name: 'Opens at Basics' })).toHaveAttribute('aria-disabled', 'true');
            expect(screen.getByRole('menuitemradio', { name: 'Opens at Explore' })).toHaveAttribute('aria-disabled', 'true');
            expect(screen.getByText('This view needs Advanced, so a link to it opens at Advanced or above')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('menuitemradio', { name: 'Opens at Advanced' }));
            fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
            await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
            expect(writeText.mock.calls[0][0]).toMatch(/&lvl=advanced$/);
            expect(await screen.findByText('Link copied — it opens this exact view, at Advanced.')).toBeInTheDocument();
        });
    });

    it('at Basics the inspector drops Plot and data and says where it appears', () => {
        window.localStorage.setItem('eov.level', 'basics');
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        expect(screen.queryByRole('button', { name: 'Plot and data' })).toBeNull();
        expect(screen.getByText('The plot and axes appear at Explore')).toBeInTheDocument();
    });

    it('at Basics, Atoms\' Orbitals tab keeps the energies back, and Orbitals mode its combinations', () => {
        window.localStorage.setItem('eov.level', 'basics');
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });
        fireEvent.click(screen.getByRole('tab', { name: 'Orbitals' }));
        expect(screen.queryByRole('table', { name: /orbital energies/ })).toBeNull();
        expect(screen.getByText('Orbital energies appear at Explore')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: /basic orbitals mode/i }));
        expect(screen.getByText('Combinations appear at Advanced')).toBeInTheDocument();
    });

    it('Help names the four levels', () => {
        renderWithProvider(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Help' }));
        const help = screen.getByRole('dialog', { name: 'Help' });
        expect(within(help).getByRole('heading', { name: 'Learning levels' })).toBeInTheDocument();
        expect(help).toHaveTextContent(/Basics.*Explore.*Advanced.*Research/);
    });
});

// Task 8: what is drawn is named in real typography everywhere -- the phone's caption under the header, the canvas
// title, the busy label and the colour keys -- and never with a visible "_".
describe('App: what is drawn, named (Task 8)', () => {
    // Why: Stark states and the combination picker are above the default Explore level.
    beforeEach(() => { window.localStorage.setItem('eov.level', 'research'); });
    afterEach(() => { window.localStorage.removeItem('eov.level'); });
    const originalMatchMedia = window.matchMedia;
    beforeEach(() => {
        resetUrlKeysForTests(); registerBuiltInUrlKeys(); registerBondsUrlKeys(); clearProfileCacheForTests();
        (loadScan as jest.Mock).mockReset().mockResolvedValue(n2Scan);
        (loadMoleculeMeta as jest.Mock).mockReset().mockImplementation(async (id: string) => ({ ...n2Meta, id }));
        (loadBasis as jest.Mock).mockReset().mockImplementation(async (id: string) => ({ ...n2Basis, id }));
    });
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        resetUrlKeysForTests();
        window.history.replaceState(null, '', '/');
        jest.useRealTimers();
    });

    /** The app opened on `hash`, at a phone's width or a desktop's. */
    const open = (hash: string, narrow: boolean) => {
        installMatchMedia(narrow);
        window.history.replaceState(null, '', `/${hash}`);
        const store = createTestStore();
        applyStateTo(hash, store.dispatch);
        const utils = render(<Provider store={store}><App /></Provider>);
        return { store, ...utils };
    };
    const caption = () => document.querySelector('.phone-caption') as HTMLElement;
    const spoken = () => document.querySelector('.phone-caption-live') as HTMLElement;

    describe('phone layout: the caption under the header', () => {
        it('names an atom\'s orbital, typeset, and its enclosed fraction, in a polite live region', () => {
            const { store } = open('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0', true);
            act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });
            // Task 9 fix round 1: the visible caption changes at once ("loading…" included); a hidden polite copy says
            // the view once it has settled, so each change is heard once (the SR pass heard loading/done flicker).
            expect(caption()).not.toHaveAttribute('aria-live');
            expect(spoken()).toHaveAttribute('aria-live', 'polite');
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(caption()).toHaveSeenText(/^Argon 2pz · 90 % enclosed$/);
            expect(spoken()).toHaveTextContent(/^Argon 2pz · 90 % enclosed$/);
            expect(caption().innerHTML).toContain('2p<sub>z</sub>');
            expect(caption().textContent).not.toContain('_');
        });

        // Fix round 1 (M11): with the Info tab open, a new selection is the caption's to announce -- Info stays quiet.
        it('leaves a new selection to the caption while the Info tab is open', () => {
            const { store } = open('#mode=atom&Z=18&level=orbital&n=2&l=1&ml=0', true);
            act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });
            fireEvent.click(screen.getByRole('tab', { name: 'Info' }));
            const infoLive = () => document.querySelector('.info-section [aria-live="polite"]') as HTMLElement;
            act(() => { store.dispatch(drillToOrbital(2, 1, 1)); });
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(caption()).toHaveSeenText(/^Argon 2px · 90 % enclosed$/);
            expect(document.querySelector('.info-section')).toHaveTextContent('Argon — 2px orbital');
            expect(infoLive()).toHaveTextContent(/^$/);
        });

        // Task 9 review I2: on a phone a charge change is the caption's to say, once. The stepper's value stays visible
        // but is not a second status region (Task 8's caption made it a double: "C⁺", then the caption).
        it('says a charge change once on a phone: from the caption, not the charge stepper', () => {
            const { store } = open('#mode=atom&Z=6&level=atom', true);
            const carbon = (charge: number): SerialisedAtomProfile =>
                ({ ...argonLikeProfile(), Z: 6, speciesKey: charge ? `6+${charge}` : '6' });
            act(() => { store.dispatch(solveSucceeded(carbon(0))); });
            fireEvent.click(screen.getByRole('tab', { name: 'Explore' }));
            fireEvent.click(screen.getByRole('button', { name: 'increase charge' }));
            act(() => { store.dispatch(solveSucceeded(carbon(1))); });
            expect(document.querySelector('.species-charge-value')).toHaveTextContent('C⁺');
            expect(document.querySelector('.species-charge-value')).not.toHaveAttribute('role');
            expect(document.querySelector('[aria-label="charge"][role="status"]')).toBeNull();
            expect(spoken()).toHaveTextContent(/^Carbon ion C⁺ · electron density$/);
        });

        // Ruling M4 (fix round 1): the whole atom's caption says what is drawn of it.
        it('names the whole atom by its electron density', () => {
            const { store } = open('#mode=atom&Z=18&level=atom', true);
            act(() => { store.dispatch(solveSucceeded(argonLikeProfile())); });
            expect(caption()).toHaveTextContent(/^Argon · electron density$/);
        });

        it('names the requested atom with "loading…" while it is solved, and the busy label does not announce it again', () => {
            jest.useFakeTimers();
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 6, isSolving: true });
            act(() => { jest.advanceTimersByTime(500); });
            // Ruling M4 / M3 (fix round 1): the whole atom's electron density, then "loading…".
            expect(caption()).toHaveTextContent(/^Carbon · electron density · loading…$/);
            const busy = document.querySelector('.canvas-busy')!;
            expect(busy).toHaveTextContent('Solving Carbon…');
            expect(busy).not.toHaveAttribute('aria-live');
            expect(busy).not.toHaveAttribute('role');
            // Task 9 fix round 1: the wait is for the eye; the spoken copy waits for the settled view.
            expect(spoken()).not.toHaveTextContent(/loading/);
        });

        it('names a hydrogen orbital, typeset, and "loading…" while it is computed', () => {
            jest.useFakeTimers();
            open('#mode=basic&n=3&l=2&ml=0', true);
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(caption()).toHaveSeenText(/^Hydrogen 3dz² · 90 % enclosed$/);
            expect(caption().innerHTML).toContain('3d<sub>z²</sub>');
            expect(spoken()).toHaveTextContent(/^Hydrogen 3dz² · 90 % enclosed$/);
            act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS + 500); });
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(caption()).toHaveSeenText(/^Hydrogen 3dz² · loading…$/);
            // Task 9 fix round 1: "loading…" is not said; the settled view is, once it settles.
            expect(spoken()).toHaveTextContent(/^Hydrogen 3dz² · 90 % enclosed$/);
        });

        it('names the Bonds orbital drawn and its bond length, folding the old header line into it', async () => {
            const { container } = open('#mode=bonds&system=n2&state=mo:restricted:1πu:0', true);
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            await waitFor(() => expect(caption()).toHaveSeenText(/^N₂ 1πu · R = \d\.\d\d a₀$/));
            expect(caption().innerHTML).toContain('1π<sub>u</sub>');
            expect(container.querySelector('.bonds-header')).toBeNull();
            expect(container.querySelectorAll('.phone-caption')).toHaveLength(1);
            // Task 9 fix round 1: on a phone the caption says the loaded view, so the panel's "… loaded." status is not
            // a second live region (the SR pass heard "done" twice).
            // Spoken with plain digits (Task 8 ruling M6), once the view has settled.
            await waitFor(() => expect(spoken()).toHaveTextContent(/^N2 1πu · R = \d\.\d\d a₀$/));
            expect([...container.querySelectorAll('[role="status"]')].filter(e => /loaded\.$/.test(e.textContent ?? ''))).toHaveLength(0);
        });

        it('names the requested Bonds orbital with "loading…" while its files load', async () => {
            (loadBasis as jest.Mock).mockImplementation(() => new Promise(() => {}));
            open('#mode=bonds&system=n2&state=mo:restricted:1πu:0', true);
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            await waitFor(() => expect(caption()).toHaveSeenText(/^N₂ 1πu · loading…$/), { timeout: 2000 });
        });
    });

    describe('the canvas names what is drawn, typeset (desktop)', () => {
        it('titles a hydrogen orbital with a real subscript, and the tab with the flat name', () => {
            open('#mode=basic&n=3&l=2&ml=0', false);
            const title = screen.getByRole('heading', { level: 1 });
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(title).toHaveSeenText(/^Hydrogen — 3dz² orbital$/);
            expect(title.innerHTML).toContain('3d<sub>z²</sub>');
            expect(document.title).toBe('Hydrogen — 3dz² orbital · QuantumLab');
        });

        it('typesets the busy label of an orbital being computed', () => {
            jest.useFakeTimers();
            open('#mode=basic&n=2&l=1&ml=0', false);
            act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS + 500); });
            const busy = document.querySelector('.canvas-busy')!;
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(busy).toHaveSeenText('Computing 2pz…');
            expect(busy.innerHTML).toContain('2p<sub>z</sub>');
            expect(busy).toHaveAttribute('role', 'status');
        });

        it('typesets the n = 2 Stark states\' title and colour key', () => {
            open('#mode=basic&combo=field&level=2&F=0.002&stark=both', false);
            const title = screen.getByRole('heading', { level: 1 });
            expect(title).toHaveTextContent(/^Hydrogen — n = 2 Stark states$/);
            const key = screen.getByLabelText('combination colour key');
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            expect(key).toHaveSeenText('(2s + 2pz)/√2, −3F');
            expect(key.innerHTML).toContain('2p<sub>z</sub>');
            expect(key.textContent).not.toContain('_');
        });

        it('typesets a Bonds orbital in the canvas subtitle', async () => {
            open('#mode=bonds&system=n2&state=mo:restricted:1πu:0', false);
            // Task 9b: the subtitle names the drawn orbital without repeating the title's N₂, or R (the slider and Info's).
            // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
            await waitFor(() => expect(document.querySelector('.viewport-subtitle')).toHaveSeenText(/^1πu orbital/));
            expect(document.querySelector('.viewport-subtitle')!.innerHTML).toContain('1π<sub>u</sub>');
        });
    });
});
