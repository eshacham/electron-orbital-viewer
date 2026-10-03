import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SerialisedAtomProfile } from '../workers/atomWorker';
import { AtomSpecies, Excitation, isValidExcitation, speciesKey } from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import type { EnergyReading } from '../atom/delta_scf';
import { RelativityMode, defaultRelativityFor } from '../atom/relativity';

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
 * `setElement`, `setCharge`, `setExcitation` -- or a change of the
 * relativistic treatment (`setRelativity`) starts one (elsewhere, in the
 * effect that owns the worker -- this slice only records the request via
 * `solveStarted`/`solveSucceeded`/`solveFailed`/`solveUnbound`), plus the
 * enclosed fraction, which is not state here at all.
 */

export type ViewMode = 'atom' | 'hydrogenic';
export type ViewLevel = 'atom' | 'shell' | 'orbital';

/**
 * A subshell, or with spin–orbit one of its j-levels. `j` is absent exactly
 * when the profile it was picked from has none, so a non-relativistic
 * selection keeps the shape (and the equality) it always had.
 */
export interface SubshellSelection { n: number; l: number; j?: number; }
export interface OrbitalSelection { n: number; l: number; ml: number; j?: number; }

/**
 * A view asked for before it can be shown: a shared link names a shell or
 * an orbital, but occupancy is only known once the SCF lands. Applied by
 * solveSucceeded, as deep as the profile allows -- and a subshell only on a
 * profile with the same j-levels (ruling C8): a link's 6p³⁄₂ names nothing
 * in a scalar picture, nor a link's 6p in a spin–orbit one.
 */
export interface PendingAtomView {
    level: ViewLevel;
    shell: number | null;
    subshell: SubshellSelection | null;
    orbital: OrbitalSelection | null;
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
    /**
     * The user's Relativity choice, or null to follow the element's default
     * (scalar from Cs, off before -- spec §5 Phase 4). Kept across element
     * changes: someone comparing heavy atoms with spin–orbit on expects it
     * to stay on. Read it through `effectiveRelativity`, never directly.
     */
    relativityOverride: RelativityMode | null;
    level: ViewLevel;
    selectedShell: number | null;
    selectedSubshell: SubshellSelection | null;
    selectedOrbital: OrbitalSelection | null;
    /**
     * The picture on screen. Normally the selected species' own in the
     * selected mode (`pictureLanded`), but after a mode switch it is the old
     * mode's until the new one lands (ruling C9) -- anything that describes
     * the picture reads the mode from here (`profile.relativity`), not from
     * the switch.
     */
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
     * selected -- e.g. Cl⁻ reported unbound, then Cl⁻ picked again -- and by
     * a `setRelativity` that changes the effective mode.
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
    solveNonce: 0,
};

/** Whether the solved profile actually occupies shell n -- ruling R26: this reads `shells`, never `shellPeaks`, which is a display annotation only and does not line up 1:1 with real shells past Z≈26. */
function shellIsOccupied(profile: SerialisedAtomProfile | null, n: number): boolean {
    return profile !== null && profile.shells.some(shell => shell.n === n);
}

/**
 * Whether the solved profile actually occupies subshell (n, l), or its
 * j-level (n, l, j) -- same reasoning as shellIsOccupied, against
 * `subshells` rather than any peak list. j must match exactly, absent
 * included: in a spin–orbit profile (n, l) alone names no subshell (it is
 * two j-levels), and in any other profile no subshell has a j.
 */
function subshellIsOccupied(profile: SerialisedAtomProfile | null, n: number, l: number, j?: number): boolean {
    return profile !== null && profile.subshells.some(subshell => subshell.n === n && subshell.l === l && subshell.j === j);
}

/** j only when there is one, so a non-relativistic selection is exactly `{ n, l }` as it always was. */
function subshellSelection(n: number, l: number, j: number | undefined): SubshellSelection {
    return j === undefined ? { n, l } : { n, l, j };
}

function orbitalSelection(n: number, l: number, ml: number, j: number | undefined): OrbitalSelection {
    return j === undefined ? { n, l, ml } : { n, l, ml, j };
}

/** The mode the switch shows: the user's choice, or the element's default when they have not made one. */
export function effectiveRelativity(state: Pick<AtomState, 'Z' | 'relativityOverride'>): RelativityMode {
    return state.relativityOverride ?? defaultRelativityFor(state.Z);
}

/**
 * Which radial equation drew a profile; hand-built fixtures and every
 * pre-Phase-4 profile carry none, and were non-relativistic. The one
 * reading of `profile.relativity` -- the store and the solver hook's
 * failure message both go through it.
 */
export function profileRelativity(profile: SerialisedAtomProfile): RelativityMode {
    return profile.relativity ?? 'off';
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

/**
 * Whether the profile on screen is the selected species' own picture in the
 * selected mode, not one left over from before a species change or a mode
 * switch (ruling C9). A pending link view and the ΔSCF energies both wait
 * for this.
 */
export function pictureLanded(state: AtomState): boolean {
    return speciesPictureLanded(state) && profileRelativity(state.profile!) === effectiveRelativity(state);
}

/**
 * Whether a picture of the selected species is on screen in any mode. What
 * the ΔSCF energies wait for (ruling C15): they are non-relativistic
 * whatever the switch says (ruling C6), so a mode switch, which keeps the
 * old mode's picture up while the new one solves (C9), must not stop them.
 */
export function speciesPictureLanded(state: AtomState): boolean {
    return state.profile !== null && profileSpeciesKey(state.profile) === speciesKey(speciesOf(state));
}

/**
 * The energies hook stops when the species' picture goes (a failed or
 * unbound mode switch takes it away), so a computation it was running must
 * not be left reading "computing" for good; finished energies stay, since
 * they hold for every mode.
 */
function dropEnergiesInFlightWithThePicture(state: AtomState): void {
    if (state.profile === null && state.energies.status === 'computing') state.energies = NO_ENERGIES;
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
 * has -- and only on the selected species' own profile in the selected mode
 * (rulings C1, C9): Na⁺ and Na share a Z but not an M shell, and a scalar
 * gold and a spin–orbit one share no p subshell. The subshell must match j
 * too (ruling C8), so a link's j-level lands only on a profile that has it;
 * otherwise the view stops at the shell, as for any subshell the profile
 * lacks.
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
    if (!subshell || subshell.n !== view.shell || !subshellIsOccupied(profile, subshell.n, subshell.l, subshell.j)) return;
    state.selectedSubshell = subshellSelection(subshell.n, subshell.l, subshell.j);
    const orbital = view.orbital;
    if (view.level !== 'orbital' || !orbital || orbital.n !== subshell.n || orbital.l !== subshell.l || orbital.j !== subshell.j
        || orbital.ml < -subshell.l || orbital.ml > subshell.l) return;
    state.level = 'orbital';
    state.selectedOrbital = orbitalSelection(orbital.n, orbital.l, orbital.ml, orbital.j);
}

/**
 * Steps the selection back to what a newly landed profile can name. Only a
 * mode switch can leave one it cannot: the old mode's picture stays on
 * screen while the new one solves (ruling C9), and a subshell picked on a
 * scalar picture names nothing once the spin–orbit one lands (Review Focus
 * 1). Every other re-solve is the same species in the same mode, whose
 * profile names everything the selection does, so this changes nothing.
 */
function dropSelectionTheProfileCannotName(state: AtomState): void {
    const profile = state.profile;
    if (state.selectedShell !== null && !shellIsOccupied(profile, state.selectedShell)) {
        state.level = 'atom';
        state.selectedShell = null;
        state.selectedSubshell = null;
        state.selectedOrbital = null;
        return;
    }
    const subshell = state.selectedSubshell;
    if (subshell && !subshellIsOccupied(profile, subshell.n, subshell.l, subshell.j)) {
        state.selectedSubshell = null;
        state.selectedOrbital = null;
        if (state.level === 'orbital') state.level = 'shell';
    }
}

/** Whether a mode switch changes what names a subshell: only crossing into or out of spin–orbit does ((6, 1) vs 6p½/6p³⁄₂). */
function changesSubshellNames(before: RelativityMode, after: RelativityMode): boolean {
    return (before === 'spinOrbit') !== (after === 'spinOrbit');
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
            dropSelectionTheProfileCannotName(state);
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
            dropEnergiesInFlightWithThePicture(state);
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
            // Ruling C9: after a mode switch the old mode's picture stays up
            // while the new one solves, but it must not outlive a failure --
            // it would stand under a switch that names another mode. A
            // failed re-solve of the same species and mode (a fraction
            // change) keeps its picture, as it always has.
            //
            // The level and selection are kept (as solveUnbound keeps them):
            // switching back to the mode that drew them restores the same
            // view, usually from the profile cache. Nothing on screen shows
            // them meanwhile, so the Share link writes the whole atom while
            // there is no picture (url_state's encodeAtomKeys) rather than a
            // shell nobody can see.
            if (!pictureLanded(state)) state.profile = null;
            dropEnergiesInFlightWithThePicture(state);
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
        // With spin–orbit it is a j-level: j must name one the profile has.
        drillToSubshell: (state, action: PayloadAction<SubshellSelection>) => {
            const { n, l, j } = action.payload;
            if (!subshellIsOccupied(state.profile, n, l, j)) return;

            state.level = 'shell';
            state.selectedShell = n;
            state.selectedSubshell = subshellSelection(n, l, j);
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

        drillToOrbital: (state, action: PayloadAction<OrbitalSelection>) => {
            const { n, l, ml, j } = action.payload;
            if (!subshellIsOccupied(state.profile, n, l, j)) return;
            if (ml < -l || ml > l) return;

            state.level = 'orbital';
            state.selectedShell = n;
            state.selectedSubshell = subshellSelection(n, l, j);
            state.selectedOrbital = orbitalSelection(n, l, ml, j);
        },

        // Not pure navigation: a different mode is a different solve, so a
        // change of the effective mode bumps solveNonce like a species
        // change. Unlike one, it keeps the element, its energies (ΔSCF stays
        // non-relativistic, ruling C6) and the picture on screen until the
        // new mode's lands (ruling C9), and with them the open shell -- the
        // thing being compared. Crossing into or out of spin–orbit drops the
        // subshell and orbital (and trims a link's view still waiting to
        // land), because (6, 1) and 6p½/6p³⁄₂ do not name each other (Review
        // Focus 1); off <-> scalar keeps them, since (n, l) names the same
        // subshell in both and watching it contract is the point.
        setRelativity: (state, action: PayloadAction<RelativityMode | null>) => {
            const before = effectiveRelativity(state);
            state.relativityOverride = action.payload;
            const after = effectiveRelativity(state);
            if (after === before) return;
            state.solveNonce += 1;
            state.error = null;
            if (!changesSubshellNames(before, after)) return;
            state.selectedSubshell = null;
            state.selectedOrbital = null;
            if (state.level === 'orbital') state.level = state.selectedShell !== null ? 'shell' : 'atom';
            const view = state.pendingView;
            if (view && view.subshell) {
                state.pendingView = view.shell === null
                    ? { level: 'atom', shell: null, subshell: null, orbital: null }
                    : { level: 'shell', shell: view.shell, subshell: null, orbital: null };
            }
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
// `drillToSubshell(n, l)` / `drillToOrbital(n, l, ml)`. `j` names a
// spin–orbit j-level and is left out of the payload when absent, so a
// non-relativistic action is exactly what it always was.
export const drillToSubshell = (n: number, l: number, j?: number) => atomSlice.actions.drillToSubshell(subshellSelection(n, l, j));
export const drillToOrbital = (n: number, l: number, ml: number, j?: number) => atomSlice.actions.drillToOrbital(orbitalSelection(n, l, ml, j));
export const setRelativity = atomSlice.actions.setRelativity;
export const clearSubshell = atomSlice.actions.clearSubshell;
export const levelUp = atomSlice.actions.levelUp;
export const goToLevel = atomSlice.actions.goToLevel;
export const setHoverRadius = atomSlice.actions.setHoverRadius;

export default atomSlice.reducer;
