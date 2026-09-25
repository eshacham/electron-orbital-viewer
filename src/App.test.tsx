import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react'; // Add screen import
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './store/orbitalSlice';
import atomReducer, { AtomState, drillToOrbital, drillToShell } from './store/atomSlice';
import { setSurfaceStyle } from './store/orbitalSlice';
import { SerialisedAtomProfile } from './workers/atomWorker';
import { createAtomWorker } from './workers/createAtomWorker';
import { computeSamplingRadius } from './orbital_presets';
import { clearProfileCacheForTests } from './atom/profile_cache';
import App from './App';

// Mock OrbitalViewer component
jest.mock('./components/OrbitalViewer', () => ({
    __esModule: true,
    default: () => <div data-testid="orbital-viewer">Orbital Viewer Mock</div>
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
    solveNonce: 0,
    level: 'atom',
    selectedShell: null,
    selectedSubshell: null,
    selectedOrbital: null,
    profile: null,
    isSolving: false,
    error: null,
    hoverRadius: null,
};

// Simple store setup
const createTestStore = (atomState?: Partial<AtomState>) => configureStore({
    reducer: { orbital: orbitalReducer, atom: atomReducer },
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

describe('App', () => {
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
        expect(screen.getByRole('button', { name: /atom mode/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /basic orbitals mode/i })).toBeInTheDocument();
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

    it('switching to Basic Orbitals restores the n/l/mL panel, with no element control of its own', () => {
        renderWithProvider(<App />);

        fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));

        expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Angular \(l\)/i })).toBeInTheDocument();
        // Addendum 2's mode rename: no second element control, Z fixed at 1
        // -- but the one-electron framing still stated outright (spec §7).
        expect(screen.queryByRole('combobox', { name: /Nucleus/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Element/i })).not.toBeInTheDocument();
        expect(screen.getByText(/one electron, Z = 1/i)).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));

        // App.tsx's default Basic Orbitals selection is n=3, l=2, and Z is
        // now fixed at 1 for the whole mode (BASIC_ORBITALS_Z).
        expect(store.getState().orbital.currentParams?.rMax).toBeCloseTo(computeSamplingRadius(3, 2, 1));
    });

    it('drilling into a shell shows the SubshellPanel, and drilling back out hides it', () => {
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

        // Hydrogen has exactly one shell (K, n=1); LevelNav exposes it as a
        // clickable chip built from shellsFor(Z), per ruling R26.
        fireEvent.click(screen.getByText(/K shell \(n=1\)/));

        expect(screen.getByLabelText('subshells')).toBeInTheDocument();

        // Back to the whole atom via the breadcrumb's first segment --
        // atomSlice.goToLevel, since drillToShell/Subshell/Orbital have no
        // "no n/l/ml at all" case of their own.
        fireEvent.click(screen.getByRole('button', { name: 'Hydrogen' }));
        expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
        expect(store.getState().orbital.surfaceStyle.clipAxis).toBe('none');

        fireEvent.click(screen.getByRole('button', { name: /^atom mode/i }));
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

        expect(screen.getByText(/did not converge/i)).toBeInTheDocument();
        expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
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
            expect(screen.queryByRole('combobox', { name: /Element/i })).not.toBeInTheDocument();
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
            fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));

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
            fireEvent.click(screen.getByText(/K shell \(n=1\)/));

            expect(screen.getByRole('button', { name: /back to Hydrogen/i })).toBeInTheDocument();
            expect(screen.getByLabelText('subshells')).toBeInTheDocument();
        });

        it('puts the view settings on their own tab, and a second tap folds the sheet', () => {
            installMatchMedia(true);
            renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

            const view = screen.getByRole('tab', { name: 'View' });
            fireEvent.click(view);
            expect(screen.getByRole('button', { name: /atom mode/i })).toBeInTheDocument();
            fireEvent.click(view);
            expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
        });
    });
});
