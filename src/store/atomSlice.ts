import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SerialisedAtomProfile } from '../workers/atomWorker';
import { AtomSpecies, Excitation, isValidExcitation, speciesKey } from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import type { EnergyReading } from '../atom/delta_scf';

/**
 * State for the three-level multi-electron drill-down (whole atom -> shell
 * -> orbital), kept deliberately separate from `orbitalSlice`: that slice
 * still owns level 3's hydrogenic `OrbitalParams` unchanged (ruling R2/the
 * spec's `mode` split), and this slice never reaches into it. `setMode`
 * below only flips which mode is active; it does not touch `orbitalSlice`'s
 * state at all; there is nothing here that could clear it.
 *
 * Ruling R28 governs every navigation action in this file: `solveAtom` costs
 * up to ~8.6s (uranium), and there is no caching upstream of this slice other
 * than `solveAtom`'s own memoisation by Z. So `drillToShell`, `drillToSubshell`,
 * `drillToOrbital` and `levelUp` are pure, synchronous navigation over the
 * `profile` this slice already holds -- none of them dispatch a solve, and
 * none of them clear or refetch `profile`. Only a species change --
 * `setElement`, `setCharge`, `setExcitation` -- starts one (elsewhere, in the
 * effect that owns the worker -- this slice only records the request via
 * `solveStarted`/`solveSucceeded`/`solveFailed`/`solveUnbound`), plus the
 * enclosed fraction, which is not state here at all.
 */

export type ViewMode = 'atom' | 'hydrogenic';
export type ViewLevel = 'atom' | 'shell' | 'orbital';

/**
 * A view asked for before it can be shown: a shared link names a shell or
 * an orbital, but occupancy is only known once the SCF lands. Applied by
 * solveSucceeded, as deep as the profile allows.
 */
export interface PendingAtomView {
    level: ViewLevel;
    shell: number | null;
    subshell: { n: number; l: number } | null;
    orbital: { n: number; l: number; ml: number } | null;
}

/**
 * ΔSCF results for `speciesKey` only. Computed in a second worker after the
 * picture lands (useDeltaScfEnergies); a reader must check `speciesKey`
 * against the selected species -- `selectSpeciesEnergies` does -- because a
 * reply can be in flight across a species change.
 */
export interface EnergiesState {
    speciesKey: string | null;
    status: 'idle' | 'computing' | 'done' | 'failed';
    ionisation: EnergyReading | null;
    excitation: EnergyReading | null;
    message: string | null;
}

export interface AtomState {
    mode: ViewMode;
    Z: number;
    /** What to solve alongside Z: always one `allowedCharges(Z)` offers; 0 after every setElement. */
    charge: number;
    /** What to solve alongside Z: one promoted electron `isValidExcitation` accepts, or the ground state. */
    excitation: Excitation | null;
    /**
     * The worker's "LDA does not bind …" verdict (spec §3.5: shown, not
     * drawn) -- for an anion whose extra electron is not bound, or, since
     * ruling T7-b, an excited species whose promoted electron is not (Sm
     * 6s → 4f). Set instead of `profile` and instead of `error`: an
     * explained physical outcome, not a failure of the solver.
     */
    unbound: string | null;
    /** ΔSCF results for `energies.speciesKey` only -- see EnergiesState. */
    energies: EnergiesState;
    level: ViewLevel;
    selectedShell: number | null;
    selectedSubshell: { n: number; l: number } | null;
    selectedOrbital: { n: number; l: number; ml: number } | null;
    profile: SerialisedAtomProfile | null;
    isSolving: boolean;
    error: string | null;
    /** A view named by a shared link, applied by solveSucceeded once the profile lands. */
    pendingView: PendingAtomView | null;
    /** Radius the pointer is currently over, shared by the plot and the cut face. */
    hoverRadius: number | null;
    /**
     * Bumped by every species change (`setElement`, `setCharge`,
     * `setExcitation`), including one that picks the species already
     * selected -- e.g. Cl⁻ reported unbound, then Cl⁻ picked again.
     *
     * Bug fix, found live: `setElement` clears `profile` unconditionally,
     * but the effect that actually starts a solve is keyed on
     * `[mode, Z, enclosedFraction]`. Re-picking the current element cleared
     * the profile without changing any of those three, so the effect never
     * re-ran and the app sat in "solving" forever with nothing on screen.
     * This is the dependency that makes "solve what setElement just asked
     * for" true regardless of whether Z changed; the profile cache makes
     * the repeat case immediate.
     */
    solveNonce: number;
}

const NO_ENERGIES: EnergiesState = { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null };

const initialState: AtomState = {
    mode: 'atom',
    Z: 1,
    charge: 0,
    excitation: null,
    unbound: null,
    energies: NO_ENERGIES,
    level: 'atom',
    selectedShell: null,
    selectedSubshell: null,
    selectedOrbital: null,
    profile: null,
    isSolving: false,
    error: null,
    pendingView: null,
    hoverRadius: null,
    solveNonce: 0,
};

/** Whether the solved profile actually occupies shell n -- ruling R26: this reads `shells`, never `shellPeaks`, which is a display annotation only and does not line up 1:1 with real shells past Z≈26. */
function shellIsOccupied(profile: SerialisedAtomProfile | null, n: number): boolean {
    return profile !== null && profile.shells.some(shell => shell.n === n);
}

/** Whether the solved profile actually occupies subshell (n, l) -- same reasoning as shellIsOccupied, against `subshells` rather than any peak list. */
function subshellIsOccupied(profile: SerialisedAtomProfile | null, n: number, l: number): boolean {
    return profile !== null && profile.subshells.some(subshell => subshell.n === n && subshell.l === l);
}

export function speciesOf(state: Pick<AtomState, 'Z' | 'charge' | 'excitation'>): AtomSpecies {
    return { Z: state.Z, charge: state.charge, excitation: state.excitation };
}

/**
 * The species a profile was solved for. Hand-built fixtures (and anything
 * serialised before ions existed) carry no `speciesKey`; they can only have
 * been a neutral ground state, whose key is String(Z).
 */
function profileSpeciesKey(profile: SerialisedAtomProfile): string {
    return profile.speciesKey ?? String(profile.Z);
}

/** Whether the profile on screen is the selected species' own picture, not one left over from before a species change. */
export function pictureLanded(state: AtomState): boolean {
    return state.profile !== null && profileSpeciesKey(state.profile) === speciesKey(speciesOf(state));
}

/**
 * The selected species' energies, or null when what the store holds belongs
 * to some other species (ruling C5: Na⁺'s ionisation energy must never be
 * shown under Na, however quickly the charge is stepped).
 */
export function selectSpeciesEnergies(state: { atom: AtomState }): EnergiesState | null {
    const { energies } = state.atom;
    return energies.speciesKey === speciesKey(speciesOf(state.atom)) ? energies : null;
}

/**
 * What every species change does: the reset setElement always did, plus the
 * unbound report and the energies, which both describe the old species.
 * Clears pendingView too (ruling C1): a shared link's view names shells of
 * the species it was decoded with, and is re-requested after the species
 * actions when a link is restored.
 */
function resetForNewSpecies(state: AtomState): void {
    state.solveNonce += 1;
    state.level = 'atom';
    state.selectedShell = null;
    state.selectedSubshell = null;
    state.selectedOrbital = null;
    state.profile = null;
    state.error = null;
    state.unbound = null;
    state.pendingView = null;
    state.energies = NO_ENERGIES;
}

/**
 * Opens a pending view to the deepest level the solved profile actually
 * has -- and only on the selected species' own profile (ruling C1): Na⁺ and
 * Na share a Z but not an M shell.
 */
function applyPendingView(state: AtomState): void {
    const view = state.pendingView;
    if (!view || !pictureLanded(state)) return;
    const profile = state.profile!;
    state.pendingView = null;
    state.level = 'atom';
    state.selectedShell = null;
    state.selectedSubshell = null;
    state.selectedOrbital = null;
    if (view.level === 'atom' || view.shell === null || !shellIsOccupied(profile, view.shell)) return;
    state.level = 'shell';
    state.selectedShell = view.shell;
    const subshell = view.subshell;
    if (!subshell || subshell.n !== view.shell || !subshellIsOccupied(profile, subshell.n, subshell.l)) return;
    state.selectedSubshell = { n: subshell.n, l: subshell.l };
    const orbital = view.orbital;
    if (view.level !== 'orbital' || !orbital || orbital.n !== subshell.n || orbital.l !== subshell.l
        || orbital.ml < -subshell.l || orbital.ml > subshell.l) return;
    state.level = 'orbital';
    state.selectedOrbital = { n: orbital.n, l: orbital.l, ml: orbital.ml };
}

const atomSlice = createSlice({
    name: 'atom',
    initialState,
    reducers: {
        setMode: (state, action: PayloadAction<ViewMode>) => {
            state.mode = action.payload;
        },

        // A new element invalidates every existing selection and the old
        // profile (it describes the wrong Z); with setCharge/setExcitation
        // below, the actions that are *not* pure navigation -- they are what
        // start a solve (ruling R28). Always the neutral ground state (Review
        // Focus 1): Fe²⁺ carried onto sodium would be a species that does
        // not exist, and the element's own offered charges differ anyway.
        setElement: (state, action: PayloadAction<number>) => {
            state.Z = action.payload;
            state.charge = 0;
            state.excitation = null;
            resetForNewSpecies(state);
        },

        // An unoffered charge is ignored rather than clamped: every caller
        // (the stepper, a URL) offers only allowedCharges, so anything else is
        // a stale or hand-edited request, and solving it would throw in the
        // worker. The excitation is cleared because which promotions exist
        // depends on the charge (Na 3s -> 3p has no Na⁺ counterpart).
        setCharge: (state, action: PayloadAction<number>) => {
            if (!allowedCharges(state.Z).includes(action.payload)) return;
            state.charge = action.payload;
            state.excitation = null;
            resetForNewSpecies(state);
        },

        setExcitation: (state, action: PayloadAction<Excitation | null>) => {
            const excitation = action.payload;
            if (excitation && !isValidExcitation(state.Z, state.charge, excitation)) return;
            state.excitation = excitation;
            resetForNewSpecies(state);
        },

        solveStarted: (state) => {
            state.isSolving = true;
            state.error = null;
            state.unbound = null;
        },

        solveSucceeded: (state, action: PayloadAction<SerialisedAtomProfile>) => {
            state.profile = action.payload;
            state.isSolving = false;
            state.error = null;
            state.unbound = null;
            applyPendingView(state);
        },

        // Spec §3.5: an anion whose extra electron LDA cannot bind is shown
        // as such and not drawn -- no profile, and not an error either. Like
        // solveFailed it drops a link's pending view: there is no picture for
        // it to land on, and neither the Share link nor the next species
        // should inherit it (orbitalSlice drops the link's cut the same way).
        solveUnbound: (state, action: PayloadAction<string>) => {
            state.isSolving = false;
            state.profile = null;
            state.error = null;
            state.unbound = action.payload;
            state.pendingView = null;
        },

        energiesStarted: (state, action: PayloadAction<string>) => {
            state.energies = { speciesKey: action.payload, status: 'computing', ionisation: null, excitation: null, message: null };
        },

        // Both results are dropped unless they are for the species selected
        // now (Review Focus 3): the energies worker is terminated on a
        // species change, but a reply already posted can still arrive.
        energiesSucceeded: (state, action: PayloadAction<{ speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null }>) => {
            const { speciesKey: key, ionisation, excitation } = action.payload;
            if (key !== speciesKey(speciesOf(state))) return;
            state.energies = { speciesKey: key, status: 'done', ionisation, excitation, message: null };
        },

        energiesFailed: (state, action: PayloadAction<{ speciesKey: string; message: string }>) => {
            const { speciesKey: key, message } = action.payload;
            if (key !== speciesKey(speciesOf(state))) return;
            state.energies = { speciesKey: key, status: 'failed', ionisation: null, excitation: null, message };
        },

        // A shared link's view, held until solveSucceeded can tell how deep
        // the solved profile actually goes.
        requestAtomView: (state, action: PayloadAction<PendingAtomView>) => {
            state.pendingView = action.payload;
        },

        solveFailed: (state, action: PayloadAction<string>) => {
            state.isSolving = false;
            state.error = action.payload;
            // A failed solve leaves no profile to apply the link against, and
            // this Z's solve may be retried later (e.g. useAtomSolver re-runs
            // on an enclosed-fraction change) -- without this, a later
            // success would silently jump to a view nobody just asked for.
            state.pendingView = null;
        },

        // Pure navigation (ruling R28): reads the existing profile, never
        // dispatches or implies a solve, never touches profile/isSolving/error.
        drillToShell: (state, action: PayloadAction<number>) => {
            const n = action.payload;
            if (!shellIsOccupied(state.profile, n)) return;

            state.level = 'shell';
            state.selectedShell = n;
            state.selectedSubshell = null;
            state.selectedOrbital = null;
        },

        // Selecting a subshell refines the shell level (e.g. highlighting one
        // subshell's curve within the shell's radial plot); it does not by
        // itself descend to the orbital level -- drillToOrbital does that.
        drillToSubshell: (state, action: PayloadAction<{ n: number; l: number }>) => {
            const { n, l } = action.payload;
            if (!subshellIsOccupied(state.profile, n, l)) return;

            state.level = 'shell';
            state.selectedShell = n;
            state.selectedSubshell = { n, l };
            state.selectedOrbital = null;
        },

        // Addendum 2's "is there a way to unselect one?", at the subshell
        // level: the inverse of drillToSubshell, staying at the shell level
        // rather than stepping out of it (levelUp does that). Selecting a
        // subshell isolates its orbitals in the composition view, so there
        // has to be a way back to the overlapping view that is the default
        // -- the overlap is the teaching point (spec §2), isolation is only
        // how you read it. Pure navigation (ruling R28).
        clearSubshell: (state) => {
            if (state.level !== 'shell') return;
            state.selectedSubshell = null;
            state.selectedOrbital = null;
        },

        drillToOrbital: (state, action: PayloadAction<{ n: number; l: number; ml: number }>) => {
            const { n, l, ml } = action.payload;
            if (!subshellIsOccupied(state.profile, n, l)) return;
            if (ml < -l || ml > l) return;

            state.level = 'orbital';
            state.selectedShell = n;
            state.selectedSubshell = { n, l };
            state.selectedOrbital = { n, l, ml };
        },

        // Reverses exactly one level, clearing that level's own selection --
        // symmetric with the drillTo* actions above, and equally pure.
        levelUp: (state) => {
            if (state.level === 'orbital') {
                state.level = 'shell';
                state.selectedOrbital = null;
            } else if (state.level === 'shell') {
                state.level = 'atom';
                state.selectedShell = null;
                state.selectedSubshell = null;
            }
        },

        // Jumps straight to a level rather than stepping one at a time
        // (levelUp above). Needed because LevelNav's breadcrumb segment for
        // the whole atom carries no n/l/ml the way its shell/subshell/orbital
        // segments do -- those already map onto drillToShell/drillToSubshell/
        // drillToOrbital, which both validate occupancy *and* select the
        // target, but "back to the whole atom" (or "back to the shell/orbital
        // I already had selected") has nothing to validate against except
        // what is already selected. Pure navigation like levelUp (ruling
        // R28): never touches profile/isSolving/error.
        goToLevel: (state, action: PayloadAction<ViewLevel>) => {
            const target = action.payload;
            if (target === 'atom') {
                state.level = 'atom';
                state.selectedShell = null;
                state.selectedSubshell = null;
                state.selectedOrbital = null;
            } else if (target === 'shell') {
                // Nothing to jump back to if a shell was never selected.
                if (state.selectedShell === null) return;
                state.level = 'shell';
                state.selectedOrbital = null;
            } else if (target === 'orbital') {
                if (state.selectedOrbital === null) return;
                state.level = 'orbital';
            }
        },

        setHoverRadius: (state, action: PayloadAction<number | null>) => {
            state.hoverRadius = action.payload;
        },
    },
});

export const {
    setMode,
    setElement,
    solveStarted,
    solveFailed,
    requestAtomView,
    setCharge,
    setExcitation,
    solveUnbound,
    energiesStarted,
    energiesSucceeded,
    energiesFailed,
} = atomSlice.actions;

export const solveSucceeded = atomSlice.actions.solveSucceeded;
export const drillToShell = atomSlice.actions.drillToShell;
// drillToSubshell/drillToOrbital take a single object payload internally;
// wrapped here so callers pass positional arguments, matching the brief's
// `drillToSubshell(n, l)` / `drillToOrbital(n, l, ml)`.
export const drillToSubshell = (n: number, l: number) => atomSlice.actions.drillToSubshell({ n, l });
export const drillToOrbital = (n: number, l: number, ml: number) => atomSlice.actions.drillToOrbital({ n, l, ml });
export const clearSubshell = atomSlice.actions.clearSubshell;
export const levelUp = atomSlice.actions.levelUp;
export const goToLevel = atomSlice.actions.goToLevel;
export const setHoverRadius = atomSlice.actions.setHoverRadius;

export default atomSlice.reducer;
