import { configureStore } from '@reduxjs/toolkit';
import atomReducer, {
    setMode,
    setElement,
    solveStarted,
    solveSucceeded,
    solveFailed,
    drillToShell,
    drillToSubshell,
    drillToOrbital,
    levelUp,
    goToLevel,
    setHoverRadius,
    AtomState,
} from '../../src/store/atomSlice';
import orbitalReducer, { startOrbitalCalculation } from '../../src/store/orbitalSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { OrbitalParams } from '../../src/types/orbital';

/**
 * A minimal but structurally faithful stand-in for a solved profile: two
 * shells (n=1, n=2), three subshells (1s, 2s, 2p), Neon-shaped. Enough to
 * exercise drill-down occupancy checks without running a real SCF solve
 * (that is scf.ts's job, exercised separately and expensively there).
 */
function neonLikeProfile(): SerialisedAtomProfile {
    return {
        Z: 10,
        converged: true,
        rMin: 1e-4,
        dx: 0.01,
        size: 5,
        total: new Float32Array([1, 2, 3, 2, 1]),
        totalEmphasis: new Float32Array([0.5, 1, 1, 1, 0.5]),
        contourRadius: 3,
        shellPeaks: new Float64Array([0.5, 2]),
        shells: [
            { n: 1, electrons: 2, contourRadius: 0.5, curve: new Float64Array(5), emphasis: new Float32Array(5) },
            { n: 2, electrons: 8, contourRadius: 2.5, curve: new Float64Array(5), emphasis: new Float32Array(5) },
        ],
        subshells: [
            { n: 1, l: 0, electrons: 2, energy: -30, curve: new Float64Array(5), R: new Float64Array(5), samplingRadius: 0.5 },
            { n: 2, l: 0, electrons: 2, energy: -1.3, curve: new Float64Array(5), R: new Float64Array(5), samplingRadius: 2.5 },
            { n: 2, l: 1, electrons: 6, energy: -0.5, curve: new Float64Array(5), R: new Float64Array(5), samplingRadius: 2.5 },
        ],
    };
}

const buildStore = () => configureStore({
    reducer: { atom: atomReducer, orbital: orbitalReducer },
});

describe('atomSlice', () => {
    it('starts on the atom level with nothing selected and no profile', () => {
        const store = buildStore();
        const state = store.getState().atom;
        expect(state.level).toBe('atom');
        expect(state.selectedShell).toBeNull();
        expect(state.selectedSubshell).toBeNull();
        expect(state.selectedOrbital).toBeNull();
        expect(state.profile).toBeNull();
        expect(state.isSolving).toBe(false);
        expect(state.error).toBeNull();
        expect(state.hoverRadius).toBeNull();
        expect(state.mode).toBe('atom');
    });

    describe('setElement', () => {
        it('resets level to atom and clears all selections', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToShell(2));
            store.dispatch(drillToSubshell(2, 1));
            expect(store.getState().atom.level).not.toBe('atom');

            store.dispatch(setElement(18));

            const state = store.getState().atom;
            expect(state.Z).toBe(18);
            expect(state.level).toBe('atom');
            expect(state.selectedShell).toBeNull();
            expect(state.selectedSubshell).toBeNull();
            expect(state.selectedOrbital).toBeNull();
        });
    });

    describe('solve lifecycle', () => {
        it('solveStarted sets isSolving and clears any previous error', () => {
            const store = buildStore();
            store.dispatch(solveFailed('boom'));
            store.dispatch(solveStarted());

            const state = store.getState().atom;
            expect(state.isSolving).toBe(true);
            expect(state.error).toBeNull();
        });

        it('solveSucceeded stores the profile and clears loading/error', () => {
            const store = buildStore();
            const profile = neonLikeProfile();
            store.dispatch(solveStarted());

            store.dispatch(solveSucceeded(profile));

            const state = store.getState().atom;
            expect(state.profile).toEqual(profile);
            expect(state.isSolving).toBe(false);
            expect(state.error).toBeNull();
        });

        it('solveFailed records the error and clears loading', () => {
            const store = buildStore();
            store.dispatch(solveStarted());

            store.dispatch(solveFailed('SCF did not converge'));

            const state = store.getState().atom;
            expect(state.isSolving).toBe(false);
            expect(state.error).toBe('SCF did not converge');
        });
    });

    describe('drillToShell', () => {
        it('descends to the shell level for an occupied n', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));

            store.dispatch(drillToShell(2));

            const state = store.getState().atom;
            expect(state.level).toBe('shell');
            expect(state.selectedShell).toBe(2);
            expect(state.selectedSubshell).toBeNull();
            expect(state.selectedOrbital).toBeNull();
        });

        it('is rejected for an unoccupied n, leaving state unchanged', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const before = store.getState().atom;

            store.dispatch(drillToShell(5));   // neon has no n=5 shell

            expect(store.getState().atom).toEqual(before);
        });

        it('is rejected when there is no profile yet', () => {
            const store = buildStore();
            const before = store.getState().atom;

            store.dispatch(drillToShell(1));

            expect(store.getState().atom).toEqual(before);
        });

        it('never triggers a solve (pure navigation, ruling R28)', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const profileBefore = store.getState().atom.profile;

            store.dispatch(drillToShell(1));

            expect(store.getState().atom.profile).toBe(profileBefore);
            expect(store.getState().atom.isSolving).toBe(false);
        });
    });

    describe('drillToSubshell', () => {
        it('selects an occupied (n, l), keeping the shell level', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));

            store.dispatch(drillToSubshell(2, 1));

            const state = store.getState().atom;
            expect(state.level).toBe('shell');
            expect(state.selectedShell).toBe(2);
            expect(state.selectedSubshell).toEqual({ n: 2, l: 1 });
            expect(state.selectedOrbital).toBeNull();
        });

        it('is rejected for an unoccupied (n, l), leaving state unchanged', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const before = store.getState().atom;

            store.dispatch(drillToSubshell(2, 2));   // 2d does not exist

            expect(store.getState().atom).toEqual(before);
        });
    });

    describe('drillToOrbital', () => {
        it('descends to the orbital level for an occupied (n, l)', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));

            store.dispatch(drillToOrbital(2, 1, -1));

            const state = store.getState().atom;
            expect(state.level).toBe('orbital');
            expect(state.selectedShell).toBe(2);
            expect(state.selectedSubshell).toEqual({ n: 2, l: 1 });
            expect(state.selectedOrbital).toEqual({ n: 2, l: 1, ml: -1 });
        });

        it('is rejected for an unoccupied (n, l)', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const before = store.getState().atom;

            store.dispatch(drillToOrbital(3, 0, 0));   // n=3 is not occupied in neon

            expect(store.getState().atom).toEqual(before);
        });

        it('is rejected for ml outside [-l, l]', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const before = store.getState().atom;

            store.dispatch(drillToOrbital(2, 1, 2));   // l=1 only has ml in [-1, 1]

            expect(store.getState().atom).toEqual(before);
        });
    });

    describe('levelUp', () => {
        it('goes from orbital to shell, clearing the orbital selection', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToOrbital(2, 1, 0));

            store.dispatch(levelUp());

            const state = store.getState().atom;
            expect(state.level).toBe('shell');
            expect(state.selectedOrbital).toBeNull();
            expect(state.selectedShell).toBe(2);
        });

        it('goes from shell to atom, clearing the shell and subshell selection', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToSubshell(2, 1));

            store.dispatch(levelUp());

            const state = store.getState().atom;
            expect(state.level).toBe('atom');
            expect(state.selectedShell).toBeNull();
            expect(state.selectedSubshell).toBeNull();
        });

        it('stays at atom when already there', () => {
            const store = buildStore();
            const before = store.getState().atom;

            store.dispatch(levelUp());

            expect(store.getState().atom).toEqual(before);
        });

        it('never triggers a solve (pure navigation, ruling R28)', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToShell(2));
            const profileBefore = store.getState().atom.profile;

            store.dispatch(levelUp());

            expect(store.getState().atom.profile).toBe(profileBefore);
        });
    });

    // LevelNav's breadcrumb for the whole atom carries no n/l/ml (unlike the
    // shell/subshell/orbital crumbs, which map straight onto drillToShell/
    // drillToSubshell/drillToOrbital), so there is no existing action that
    // can jump straight back to the atom level from anywhere deeper. This is
    // that action, generalised to jump to any of the three levels directly
    // rather than one step at a time, clearing whatever is now below it.
    describe('goToLevel', () => {
        it('jumps straight to atom from the orbital level, clearing every selection', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToOrbital(2, 1, 0));

            store.dispatch(goToLevel('atom'));

            const state = store.getState().atom;
            expect(state.level).toBe('atom');
            expect(state.selectedShell).toBeNull();
            expect(state.selectedSubshell).toBeNull();
            expect(state.selectedOrbital).toBeNull();
        });

        it('jumps back to shell from orbital, clearing only the orbital selection', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToOrbital(2, 1, 0));

            store.dispatch(goToLevel('shell'));

            const state = store.getState().atom;
            expect(state.level).toBe('shell');
            expect(state.selectedShell).toBe(2);
            expect(state.selectedSubshell).toEqual({ n: 2, l: 1 });
            expect(state.selectedOrbital).toBeNull();
        });

        it('is rejected for shell/orbital when nothing is selected at that level yet', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const before = store.getState().atom;

            store.dispatch(goToLevel('shell'));
            expect(store.getState().atom).toEqual(before);

            store.dispatch(goToLevel('orbital'));
            expect(store.getState().atom).toEqual(before);
        });

        it('never triggers a solve (pure navigation, ruling R28)', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToShell(2));
            const profileBefore = store.getState().atom.profile;

            store.dispatch(goToLevel('atom'));

            expect(store.getState().atom.profile).toBe(profileBefore);
            expect(store.getState().atom.isSolving).toBe(false);
        });
    });

    describe('setHoverRadius', () => {
        it('sets and clears the shared hover radius', () => {
            const store = buildStore();

            store.dispatch(setHoverRadius(1.75));
            expect(store.getState().atom.hoverRadius).toBe(1.75);

            store.dispatch(setHoverRadius(null));
            expect(store.getState().atom.hoverRadius).toBeNull();
        });
    });

    describe('setMode', () => {
        it('switches mode without touching level, selections or profile', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToShell(2));
            const before = store.getState().atom;

            store.dispatch(setMode('hydrogenic'));

            const state = store.getState().atom;
            expect(state.mode).toBe('hydrogenic');
            expect(state.level).toBe(before.level);
            expect(state.selectedShell).toBe(before.selectedShell);
            expect(state.profile).toBe(before.profile);
        });

        it('leaves the existing orbitalSlice in charge and does not clear its params', () => {
            const store = buildStore();
            const params: OrbitalParams = {
                n: 3, l: 1, ml: 0, Z: 7, resolution: 24, rMax: 20, enclosedFraction: 0.9,
            };
            store.dispatch(startOrbitalCalculation(params));
            expect(store.getState().orbital.currentParams).toEqual(params);

            store.dispatch(setMode('hydrogenic'));

            expect(store.getState().orbital.currentParams).toEqual(params);
        });
    });

    // Type-level check that the exported AtomState matches what the reducer
    // actually produces; if the interface drifts from the implementation this
    // line stops compiling.
    it('exposes AtomState matching the reducer output', () => {
        const store = buildStore();
        const state: AtomState = store.getState().atom;
        expect(state).toBeDefined();
    });
});
