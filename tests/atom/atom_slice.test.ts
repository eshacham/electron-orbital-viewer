import { createAppStore } from '../../src/store';
import reducer, {
    setMode,
    setElement,
    solveStarted,
    solveSucceeded,
    solveFailed,
    drillToShell,
    drillToSubshell,
    drillToOrbital,
    clearSubshell,
    levelUp,
    goToLevel,
    setHoverRadius,
    requestAtomView,
    PendingAtomView,
    AtomState,
    setCharge,
    setExcitation,
    solveUnbound,
    energiesStarted,
    energiesSucceeded,
    energiesFailed,
    speciesOf,
    selectSpeciesEnergies,
    setRelativity,
    effectiveRelativity,
    pictureLanded,
} from '../../src/store/atomSlice';
import { startOrbitalCalculation } from '../../src/store/orbitalSlice';
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
        valencePeakRadius: 2,
        displayRadius: 3,
        shellPeaks: new Float64Array([0.5, 2]),
        shellIndexAtR: new Float32Array(5),
        shells: [
            { n: 1, electrons: 2, contourRadius: 0.5, curve: new Float64Array(5), emphasis: new Float32Array(5) },
            { n: 2, electrons: 8, contourRadius: 2.5, curve: new Float64Array(5), emphasis: new Float32Array(5) },
        ],
        subshells: [
            { n: 1, l: 0, electrons: 2, energy: -30, curve: new Float64Array(5), R: new Float64Array(5), samplingRadius: 0.5, compositeSamplingRadius: 0.5 },
            { n: 2, l: 0, electrons: 2, energy: -1.3, curve: new Float64Array(5), R: new Float64Array(5), samplingRadius: 2.5, compositeSamplingRadius: 2.5 },
            { n: 2, l: 1, electrons: 6, energy: -0.5, curve: new Float64Array(5), R: new Float64Array(5), samplingRadius: 2.5, compositeSamplingRadius: 2.5 },
        ],
    };
}

const buildStore = () => createAppStore();

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

    describe('solveNonce', () => {
        it('advances on every setElement, including one that re-picks the current element', () => {
            const store = buildStore();
            const start = store.getState().atom.solveNonce;

            store.dispatch(setElement(6));
            const afterFirst = store.getState().atom.solveNonce;
            expect(afterFirst).toBeGreaterThan(start);

            // The case that hung: same Z, so nothing else in the solver's
            // dependency list changes -- but the profile has been cleared.
            store.dispatch(setElement(6));
            expect(store.getState().atom.solveNonce).toBeGreaterThan(afterFirst);
            expect(store.getState().atom.profile).toBeNull();
        });

        it('is untouched by pure navigation', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            const nonce = store.getState().atom.solveNonce;

            store.dispatch(drillToShell(2));
            store.dispatch(drillToSubshell(2, 1));
            store.dispatch(clearSubshell());
            store.dispatch(levelUp());
            store.dispatch(goToLevel('atom'));

            expect(store.getState().atom.solveNonce).toBe(nonce);
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

    // Addendum 2's readability follow-up: selecting a subshell isolates its
    // orbitals in the composition view, so there must be a way back to the
    // overlapping view -- which stays the default, because the overlap is
    // the teaching point (spec §2).
    describe('clearSubshell', () => {
        it('clears the subshell selection but stays on the shell level', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToSubshell(2, 1));
            store.dispatch(clearSubshell());

            const state = store.getState().atom;
            expect(state.level).toBe('shell');
            expect(state.selectedShell).toBe(2);
            expect(state.selectedSubshell).toBeNull();
            expect(state.selectedOrbital).toBeNull();
        });

        it('is a no-op away from the shell level', () => {
            const store = buildStore();
            store.dispatch(solveSucceeded(neonLikeProfile()));
            store.dispatch(drillToOrbital(2, 1, 0));
            store.dispatch(clearSubshell());

            const state = store.getState().atom;
            expect(state.level).toBe('orbital');
            expect(state.selectedSubshell).toEqual({ n: 2, l: 1 });
            expect(state.selectedOrbital).toEqual({ n: 2, l: 1, ml: 0 });
        });

        it('never triggers a solve (pure navigation, ruling R28)', () => {
            const store = buildStore();
            const profile = neonLikeProfile();
            store.dispatch(solveSucceeded(profile));
            store.dispatch(drillToSubshell(2, 1));
            store.dispatch(clearSubshell());

            const state = store.getState().atom;
            expect(state.profile).toBe(profile);
            expect(state.isSolving).toBe(false);
            expect(state.error).toBeNull();
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

describe('a requested view lands with the solve', () => {
    const landOnNeon = (view: PendingAtomView) => {
        const store = buildStore();
        store.dispatch(setElement(10));
        store.dispatch(requestAtomView(view));
        store.dispatch(solveSucceeded(neonLikeProfile()));
        return store.getState().atom;
    };
    const orbital = (n: number, l: number, ml: number): PendingAtomView =>
        ({ level: 'orbital', shell: n, subshell: { n, l }, orbital: { n, l, ml } });

    it('opens the requested orbital once the profile arrives', () => {
        const atom = landOnNeon(orbital(2, 1, -1));
        expect(atom).toMatchObject({ level: 'orbital', selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: -1 }, pendingView: null });
    });

    it('stops at the subshell when mₗ is out of range', () => {
        expect(landOnNeon(orbital(2, 1, 2))).toMatchObject({ level: 'shell', selectedSubshell: { n: 2, l: 1 }, selectedOrbital: null });
    });

    // Review Focus 2: neon has no n = 3 shell.
    it('falls back to the whole atom for a shell the element does not have', () => {
        expect(landOnNeon(orbital(3, 2, 0))).toMatchObject({ level: 'atom', selectedShell: null, pendingView: null });
    });

    it('is cancelled by picking another element, and not re-applied by a later solve', () => {
        const store = buildStore();
        store.dispatch(setElement(10));
        store.dispatch(requestAtomView(orbital(2, 1, 0)));
        store.dispatch(setElement(10));
        expect(store.getState().atom.pendingView).toBeNull();
        store.dispatch(solveSucceeded(neonLikeProfile()));
        expect(store.getState().atom.level).toBe('atom');
    });

    // Review finding: a failed solve left pendingView set, so a later
    // successful solve for the same Z (e.g. useAtomSolver retrying after an
    // enclosed-fraction change) would silently jump to the old link's view.
    it('is cancelled by a failed solve, and not re-applied by a later success', () => {
        const store = buildStore();
        store.dispatch(setElement(10));
        store.dispatch(requestAtomView(orbital(2, 1, 0)));
        store.dispatch(solveFailed('did not converge'));
        expect(store.getState().atom.pendingView).toBeNull();
        store.dispatch(solveSucceeded(neonLikeProfile()));
        expect(store.getState().atom.level).toBe('atom');
    });
});

describe('species in the store', () => {
    const na3p = { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } };

    /** Na⁺ is neon-shaped: 1s² 2s² 2p⁶, no M shell (Review Focus 5). */
    const sodiumIonProfile = (): SerialisedAtomProfile => ({ ...neonLikeProfile(), Z: 11, charge: 1, speciesKey: '11+1' });

    it('starts neutral and in the ground state', () => {
        const atom = buildStore().getState().atom;
        expect([atom.charge, atom.excitation, atom.unbound]).toEqual([0, null, null]);
        expect(atom.energies).toEqual({ speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null });
    });

    it('setCharge accepts only an offered charge, resets the view and starts a solve', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(solveSucceeded(neonLikeProfile()));
        store.dispatch(drillToShell(2));
        const nonce = store.getState().atom.solveNonce;
        store.dispatch(setCharge(2));                        // Na2+ is not offered
        expect(store.getState().atom.charge).toBe(0);
        expect(store.getState().atom.solveNonce).toBe(nonce);
        store.dispatch(setCharge(1));
        const atom = store.getState().atom;
        expect([atom.charge, atom.level, atom.selectedShell, atom.profile]).toEqual([1, 'atom', null, null]);
        expect(atom.solveNonce).toBe(nonce + 1);
    });

    it('setCharge clears an unbound report and bumps the nonce, even to the same charge', () => {
        const store = buildStore();
        store.dispatch(setElement(17));
        store.dispatch(setCharge(-1));
        store.dispatch(solveUnbound('LDA does not bind this anion: its 3p electron is not bound by 10⁻⁴ Ha or more.'));
        expect(store.getState().atom.unbound).toMatch(/does not bind/);
        const nonce = store.getState().atom.solveNonce;
        store.dispatch(setCharge(0));
        expect(store.getState().atom.unbound).toBeNull();
        store.dispatch(setCharge(0));
        expect(store.getState().atom.solveNonce).toBe(nonce + 2);
    });

    it('solveUnbound ends the solve with no profile and no error', () => {
        const store = buildStore();
        store.dispatch(setElement(17));
        store.dispatch(setCharge(-1));
        store.dispatch(solveStarted());
        store.dispatch(solveUnbound('LDA does not bind this anion: …'));
        const atom = store.getState().atom;
        expect([atom.isSolving, atom.profile, atom.error, atom.unbound]).toEqual([false, null, null, 'LDA does not bind this anion: …']);
    });

    // Like solveFailed: a picture that never drew leaves no profile for a
    // link's view to land on, and a later species must not inherit it.
    it('solveUnbound cancels a pending link view', () => {
        const store = buildStore();
        store.dispatch(setElement(17));
        store.dispatch(setCharge(-1));
        store.dispatch(requestAtomView({ level: 'shell', shell: 3, subshell: null, orbital: null }));
        store.dispatch(solveUnbound('LDA does not bind this anion: its 3p electron is not bound by 10⁻⁴ Ha or more.'));
        expect(store.getState().atom.pendingView).toBeNull();
    });

    it('setExcitation accepts only an offered promotion and is cleared by a charge change', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(setExcitation({ from: { n: 2, l: 1 }, to: { n: 3, l: 1 } }));
        expect(store.getState().atom.excitation).toBeNull();
        store.dispatch(setExcitation(na3p));
        expect(store.getState().atom.excitation).toEqual(na3p);
        store.dispatch(setCharge(1));
        expect(store.getState().atom.excitation).toBeNull();
    });

    it('setExcitation starts a solve, and null returns to the ground state', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        const nonce = store.getState().atom.solveNonce;
        store.dispatch(setExcitation(na3p));
        expect(store.getState().atom.solveNonce).toBe(nonce + 1);
        store.dispatch(setExcitation(null));
        expect(speciesOf(store.getState().atom)).toEqual({ Z: 11, charge: 0, excitation: null });
        expect(store.getState().atom.solveNonce).toBe(nonce + 2);
    });

    // Review Focus 1: Fe²⁺ carried onto sodium would be a species that does not exist.
    it('setElement returns to the neutral ground state', () => {
        const store = buildStore();
        store.dispatch(setElement(26));
        store.dispatch(setCharge(2));
        store.dispatch(setElement(11));
        expect(speciesOf(store.getState().atom)).toEqual({ Z: 11, charge: 0, excitation: null });
    });

    // Review Focus 3: stepping Na -> Na⁺ -> Na quickly.
    it('drops an energies reply for a species no longer selected', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(energiesStarted('11'));
        store.dispatch(energiesSucceeded({ speciesKey: '11+1', ionisation: { valueEv: 47, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null }));
        expect(store.getState().atom.energies.status).toBe('computing');
        store.dispatch(energiesSucceeded({ speciesKey: '11', ionisation: { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null }));
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', ionisation: { valueEv: 5.37 } });
    });

    it('drops an energies failure for a species no longer selected, and records one for the current species', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(energiesStarted('11'));
        store.dispatch(energiesFailed({ speciesKey: '11+1', message: 'stale' }));
        expect(store.getState().atom.energies.status).toBe('computing');
        store.dispatch(energiesFailed({ speciesKey: '11', message: 'did not converge' }));
        expect(store.getState().atom.energies).toMatchObject({ speciesKey: '11', status: 'failed', message: 'did not converge' });
    });

    // Ruling C5: the shared reset clears energies, and a reader only ever sees the selected species' energies.
    it('a species change clears energies, and selectSpeciesEnergies shows only the selected species', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(energiesStarted('11'));
        store.dispatch(energiesSucceeded({ speciesKey: '11', ionisation: { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null }));
        expect(selectSpeciesEnergies(store.getState())).toMatchObject({ status: 'done', speciesKey: '11' });

        store.dispatch(setCharge(1));
        expect(store.getState().atom.energies).toMatchObject({ speciesKey: null, status: 'idle', ionisation: null });
        // Started for a species that has since been left: present in the store, never shown.
        store.dispatch(energiesStarted('11'));
        expect(selectSpeciesEnergies(store.getState())).toBeNull();
    });

    // Ruling C1: a link's view is cancelled by any species change.
    it('setCharge and setExcitation cancel a pending link view', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(requestAtomView({ level: 'shell', shell: 2, subshell: null, orbital: null }));
        store.dispatch(setCharge(1));
        expect(store.getState().atom.pendingView).toBeNull();

        store.dispatch(setCharge(0));
        store.dispatch(requestAtomView({ level: 'shell', shell: 2, subshell: null, orbital: null }));
        store.dispatch(setExcitation(na3p));
        expect(store.getState().atom.pendingView).toBeNull();
    });

    // Ruling C1: a link's view never lands on the wrong species.
    it('a pending view lands only on a profile of the selected species', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(setCharge(1));
        store.dispatch(requestAtomView({ level: 'shell', shell: 2, subshell: null, orbital: null }));
        // A neutral sodium profile (key '11') is not Na⁺'s.
        store.dispatch(solveSucceeded({ ...neonLikeProfile(), Z: 11, speciesKey: '11' }));
        expect(store.getState().atom).toMatchObject({ level: 'atom', pendingView: { shell: 2 } });

        store.dispatch(solveSucceeded(sodiumIonProfile()));
        expect(store.getState().atom).toMatchObject({ level: 'shell', selectedShell: 2, pendingView: null });
    });

    // Review Focus 5, ruling C10: Na⁺ has no M shell, though neutral sodium does.
    it('drillToShell refuses a shell the ion does not occupy', () => {
        const store = buildStore();
        store.dispatch(setElement(11));
        store.dispatch(setCharge(1));
        store.dispatch(solveSucceeded(sodiumIonProfile()));
        store.dispatch(drillToShell(3));
        expect(store.getState().atom.level).toBe('atom');
        store.dispatch(drillToShell(2));
        expect(store.getState().atom).toMatchObject({ level: 'shell', selectedShell: 2 });
    });
});

/** Neon with spin–orbit: 1s½ 2s½ 2p½² 2p³⁄₂⁴, the shape the worker sends in that mode. */
function spinOrbitNeon(): SerialisedAtomProfile {
    const base = neonLikeProfile();
    const p = base.subshells.find(s => s.l === 1)!;
    return {
        ...base,
        relativity: 'spinOrbit',
        subshells: [
            ...base.subshells.filter(s => s.l === 0).map(s => ({ ...s, j: 0.5 })),
            { ...p, j: 0.5, electrons: 2 },
            { ...p, j: 1.5, electrons: 4 },
        ],
    };
}

describe('relativity in the atom slice', () => {
    it('follows the element\'s default until the user chooses, then keeps the choice across elements', () => {
        let state = reducer(undefined, setElement(79));
        expect(effectiveRelativity(state)).toBe('scalar');
        state = reducer(state, setElement(6));
        expect(effectiveRelativity(state)).toBe('off');
        state = reducer(state, setRelativity('spinOrbit'));
        state = reducer(state, setElement(79));
        expect(effectiveRelativity(state)).toBe('spinOrbit');
        state = reducer(state, setRelativity(null));
        expect(effectiveRelativity(state)).toBe('scalar');
    });

    it('starts a new solve when the effective mode changes, and only then', () => {
        let state = reducer(undefined, setElement(79));
        const nonce = state.solveNonce;
        state = reducer(state, setRelativity('scalar'));     // same as the default: nothing to solve
        expect(state.solveNonce).toBe(nonce);
        state = reducer(state, setRelativity('spinOrbit'));
        expect(state.solveNonce).toBe(nonce + 1);
    });

    it('setRelativity drops a selection the new mode cannot name', () => {
        let state = reducer(undefined, solveSucceeded(neonLikeProfile()));
        state = reducer(state, drillToOrbital(2, 1, 0));
        expect(state.level).toBe('orbital');
        state = reducer(state, setRelativity('spinOrbit'));
        expect(state.level).toBe('shell');
        expect(state.selectedShell).toBe(2);
        expect(state.selectedSubshell).toBeNull();
        expect(state.selectedOrbital).toBeNull();
    });

    // Off <-> scalar is the comparison the switch exists for (the 6s
    // contracting under the same eye): (n, l) names the same subshell in both.
    it('keeps the selection between off and scalar, where (n, l) still names the subshell', () => {
        let state = reducer(undefined, solveSucceeded(neonLikeProfile()));
        state = reducer(state, drillToOrbital(2, 1, -1));
        state = reducer(state, setRelativity('scalar'));
        expect(state).toMatchObject({ level: 'orbital', selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: -1 } });
    });

    it('drills into a j-level only when j matches an occupied one', () => {
        let state = reducer(undefined, solveSucceeded(spinOrbitNeon()));
        state = reducer(state, drillToSubshell(2, 1));            // no j: names nothing in a spin–orbit profile
        expect(state.selectedSubshell).toBeNull();
        state = reducer(state, drillToSubshell(2, 1, 1.5));
        expect(state.selectedSubshell).toEqual({ n: 2, l: 1, j: 1.5 });
        state = reducer(state, drillToOrbital(2, 1, -1, 1.5));
        expect(state.selectedOrbital).toEqual({ n: 2, l: 1, ml: -1, j: 1.5 });
        state = reducer(state, drillToSubshell(2, 1, 2.5));
        expect(state.selectedSubshell).toEqual({ n: 2, l: 1, j: 1.5 });   // unchanged
    });

    it('keeps the old selection shape for non-relativistic profiles', () => {
        let state = reducer(undefined, solveSucceeded(neonLikeProfile()));
        state = reducer(state, drillToSubshell(2, 1));
        expect(state.selectedSubshell).toStrictEqual({ n: 2, l: 1 });
        state = reducer(state, drillToSubshell(2, 1, 1.5));               // a j the profile does not have
        expect(state.selectedSubshell).toStrictEqual({ n: 2, l: 1 });
    });

    // Ruling C9: the picture of the other mode is not this mode's picture.
    it('counts a picture as landed only in the mode the switch shows', () => {
        let state = reducer(undefined, setElement(10));
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        expect(pictureLanded(state)).toBe(true);
        state = reducer(state, setRelativity('spinOrbit'));
        expect(pictureLanded(state)).toBe(false);
        state = reducer(state, solveSucceeded(spinOrbitNeon()));
        expect(pictureLanded(state)).toBe(true);
        // Gold defaults to scalar: an unlabelled (non-relativistic) profile is not its picture.
        state = reducer(state, setRelativity(null));
        state = reducer(state, setElement(79));
        state = reducer(state, solveSucceeded({ ...neonLikeProfile(), Z: 79 }));
        expect(pictureLanded(state)).toBe(false);
        state = reducer(state, solveSucceeded({ ...neonLikeProfile(), Z: 79, relativity: 'scalar' }));
        expect(pictureLanded(state)).toBe(true);
    });

    // Ruling C9: the old picture stays while the new mode solves, but never
    // outlives a failure -- it would stand under a switch that says otherwise.
    it('keeps the old picture while re-solving, and clears it when the new mode fails or is unbound', () => {
        const switched = () => {
            let state = reducer(undefined, setElement(10));
            state = reducer(state, solveSucceeded(neonLikeProfile()));
            state = reducer(state, setRelativity('scalar'));
            return reducer(state, solveStarted());
        };
        expect(switched().profile).not.toBeNull();
        expect(reducer(switched(), solveFailed('Scalar-relativistic SCF for Neon did not converge.'))).toMatchObject({ profile: null, isSolving: false });
        expect(reducer(switched(), solveUnbound('LDA does not bind …'))).toMatchObject({ profile: null, isSolving: false });
    });

    it('keeps the picture when a solve of the same species and mode fails (a fraction change)', () => {
        let state = reducer(undefined, setElement(10));
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        state = reducer(state, solveFailed('boom'));
        expect(state.profile).not.toBeNull();
    });

    // Review Focus 1: a subshell picked on the old picture while the new
    // mode solves names nothing once the spin–orbit profile lands.
    it('steps back to the shell when the landed profile cannot name the selection', () => {
        let state = reducer(undefined, setElement(10));
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        state = reducer(state, setRelativity('spinOrbit'));
        state = reducer(state, drillToOrbital(2, 1, 0));        // on the old, non-relativistic picture
        state = reducer(state, solveSucceeded(spinOrbitNeon()));
        expect(state).toMatchObject({ level: 'shell', selectedShell: 2, selectedSubshell: null, selectedOrbital: null });
    });

    // Ruling C8: a link's view lands only on a matching j.
    it('lands a linked j-level only on a spin–orbit profile with that j', () => {
        const view: PendingAtomView = { level: 'orbital', shell: 2, subshell: { n: 2, l: 1, j: 1.5 }, orbital: { n: 2, l: 1, ml: 1, j: 1.5 } };
        let state = reducer(undefined, setElement(10));
        state = reducer(state, setRelativity('spinOrbit'));
        state = reducer(state, requestAtomView(view));
        // A non-relativistic picture of neon is not the link's.
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        expect(state.pendingView).not.toBeNull();
        state = reducer(state, solveSucceeded(spinOrbitNeon()));
        expect(state).toMatchObject({ level: 'orbital', selectedSubshell: { n: 2, l: 1, j: 1.5 }, selectedOrbital: { n: 2, l: 1, ml: 1, j: 1.5 }, pendingView: null });
    });

    it('falls back to the shell when a link\'s j does not fit the mode it lands in', () => {
        const withJ: PendingAtomView = { level: 'shell', shell: 2, subshell: { n: 2, l: 1, j: 0.5 }, orbital: null };
        let state = reducer(undefined, setElement(10));
        state = reducer(state, requestAtomView(withJ));
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        expect(state).toMatchObject({ level: 'shell', selectedShell: 2, selectedSubshell: null });

        const withoutJ: PendingAtomView = { level: 'shell', shell: 2, subshell: { n: 2, l: 1 }, orbital: null };
        state = reducer(undefined, setElement(10));
        state = reducer(state, setRelativity('spinOrbit'));
        state = reducer(state, requestAtomView(withoutJ));
        state = reducer(state, solveSucceeded(spinOrbitNeon()));
        expect(state).toMatchObject({ level: 'shell', selectedShell: 2, selectedSubshell: null });
    });

    it('a mode switch before a link lands trims its view to the shell, as it does the selection', () => {
        let state = reducer(undefined, setElement(10));
        state = reducer(state, requestAtomView({ level: 'orbital', shell: 2, subshell: { n: 2, l: 1 }, orbital: { n: 2, l: 1, ml: 0 } }));
        state = reducer(state, setRelativity('spinOrbit'));
        expect(state.pendingView).toEqual({ level: 'shell', shell: 2, subshell: null, orbital: null });
    });

    // Ruling C6: ΔSCF energies stay non-relativistic, so a mode switch keeps them.
    it('keeps the species\' energies across a mode switch', () => {
        let state = reducer(undefined, setElement(11));
        state = reducer(state, energiesStarted('11'));
        state = reducer(state, energiesSucceeded({ speciesKey: '11', ionisation: { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null }));
        state = reducer(state, setRelativity('scalar'));
        expect(selectSpeciesEnergies({ atom: state })).toMatchObject({ status: 'done' });
    });

    // A failed or unbound mode switch takes the picture away, and the
    // energies hook with it; energies still computing must not stay so.
    it('drops energies still computing when a mode switch fails or is unbound, and keeps finished ones', () => {
        const computing = () => {
            let state = reducer(undefined, setElement(11));
            state = reducer(state, solveSucceeded({ ...neonLikeProfile(), Z: 11 }));
            state = reducer(state, energiesStarted('11'));
            return reducer(state, setRelativity('scalar'));
        };
        expect(reducer(computing(), solveFailed('boom')).energies.status).toBe('idle');
        expect(reducer(computing(), solveUnbound('LDA does not bind …')).energies.status).toBe('idle');

        let done = reducer(undefined, setElement(11));
        done = reducer(done, energiesSucceeded({ speciesKey: '11', ionisation: { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null }));
        done = reducer(done, setRelativity('scalar'));
        expect(reducer(done, solveFailed('boom')).energies.status).toBe('done');
    });

    it('a failed mode switch keeps the level and selection, which return with the old mode', () => {
        let state = reducer(undefined, setElement(10));
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        state = reducer(state, drillToShell(2));
        state = reducer(state, setRelativity('scalar'));
        state = reducer(state, solveFailed('boom'));
        expect(state).toMatchObject({ profile: null, level: 'shell', selectedShell: 2 });
        state = reducer(state, setRelativity(null));
        state = reducer(state, solveSucceeded(neonLikeProfile()));
        expect(state).toMatchObject({ level: 'shell', selectedShell: 2 });
    });
});
