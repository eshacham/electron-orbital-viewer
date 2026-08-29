import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react'; // Add screen import
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './store/orbitalSlice';
import atomReducer, { AtomState } from './store/atomSlice';
import { SerialisedAtomProfile } from './workers/atomWorker';
import { createAtomWorker } from './workers/createAtomWorker';
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
        contourRadius: 2,
        shellPeaks: new Float64Array([1.2]),
        shells: [
            { n: 1, electrons: 1, contourRadius: 2, curve: new Float64Array([0, 1, 2, 3, 2, 1, 0.5, 0.2, 0.05]) },
        ],
        subshells: [
            {
                n: 1, l: 0, electrons: 1, energy: -0.5,
                curve: new Float64Array([0, 1, 2, 3, 2, 1, 0.5, 0.2, 0.05]),
                R: new Float64Array(9),
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
    beforeEach(() => { (createAtomWorker as jest.Mock).mockClear(); });

    it('renders main components', () => {
        renderWithProvider(<App />);

        // Check if container exists by id
        expect(screen.getByTestId('orbital-viewer')).toBeInTheDocument();

        // Atom mode is the default: n/l/ml collapse into the drill-down, so
        // the element picker (not the hydrogen-like selects) is what shows.
        expect(screen.getByRole('combobox', { name: /Element/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /atom mode/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /hydrogen-like mode/i })).toBeInTheDocument();
    });

    it('defaults to atom mode and shows LevelNav for the default element', () => {
        renderWithProvider(<App />);

        expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
        expect(screen.getByText('Hydrogen')).toBeInTheDocument();
    });

    it('switching to hydrogen-like mode restores the original one-electron-ion panel unchanged', () => {
        renderWithProvider(<App />);

        fireEvent.click(screen.getByRole('button', { name: /hydrogen-like mode/i }));

        expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Angular \(l\)/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Nucleus \(Z\)/i })).toBeInTheDocument();
        expect(screen.getByText('one electron, charge-Z nucleus')).toBeInTheDocument();
        // LevelNav is atom-mode only.
        expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument();
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

    // Ruling R17: a solver that did not converge must show up as an
    // explicit error, never as a silently-wrong rendered picture. Driven
    // through the real mount-time solve (useAtomSolver dispatches
    // solveStarted on every mount in atom mode, which would otherwise wipe
    // out a merely-preloaded error) rather than preloaded state.
    it('shows an explicit error instead of a profile when the solve did not converge', () => {
        renderWithProvider(<App />);
        const worker = (createAtomWorker as jest.Mock).mock.results[0].value;

        act(() => {
            worker.onmessage({ data: { type: 'success', profile: { ...hydrogenProfile(), converged: false } } });
        });

        expect(screen.getByText(/did not converge/i)).toBeInTheDocument();
        expect(screen.queryByLabelText('subshells')).not.toBeInTheDocument();
    });

    it('keeps LevelNav reachable on a phone even while the controls sheet is closed', () => {
        installMatchMedia(true); // narrow viewport: the sheet starts closed
        renderWithProvider(<App />, { Z: 1, profile: hydrogenProfile() });

        expect(screen.getByRole('button', { name: /show controls/i })).toBeInTheDocument();

        // LevelNav does not live inside #controls (see style.css's
        // .side-panel unwrap on a narrow viewport), so it is unaffected by
        // the sheet's own open/closed state.
        expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
        expect(screen.getByText('Hydrogen')).toBeInTheDocument();
    });
});
