import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SerialisedAtomProfile } from '../workers/atomWorker';

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
 * none of them clear or refetch `profile`. Only `setElement` starts one
 * (elsewhere, in the effect that owns the worker -- this slice only records
 * the request via `solveStarted`/`solveSucceeded`/`solveFailed`).
 */

export type ViewMode = 'atom' | 'hydrogenic';
export type ViewLevel = 'atom' | 'shell' | 'orbital';

export interface AtomState {
    mode: ViewMode;
    Z: number;
    level: ViewLevel;
    selectedShell: number | null;
    selectedSubshell: { n: number; l: number } | null;
    selectedOrbital: { n: number; l: number; ml: number } | null;
    profile: SerialisedAtomProfile | null;
    isSolving: boolean;
    error: string | null;
    /** Radius the pointer is currently over, shared by the plot and the cut face. */
    hoverRadius: number | null;
}

const initialState: AtomState = {
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

/** Whether the solved profile actually occupies shell n -- ruling R26: this reads `shells`, never `shellPeaks`, which is a display annotation only and does not line up 1:1 with real shells past Z≈26. */
function shellIsOccupied(profile: SerialisedAtomProfile | null, n: number): boolean {
    return profile !== null && profile.shells.some(shell => shell.n === n);
}

/** Whether the solved profile actually occupies subshell (n, l) -- same reasoning as shellIsOccupied, against `subshells` rather than any peak list. */
function subshellIsOccupied(profile: SerialisedAtomProfile | null, n: number, l: number): boolean {
    return profile !== null && profile.subshells.some(subshell => subshell.n === n && subshell.l === l);
}

const atomSlice = createSlice({
    name: 'atom',
    initialState,
    reducers: {
        setMode: (state, action: PayloadAction<ViewMode>) => {
            state.mode = action.payload;
        },

        // A new element invalidates every existing selection and the old
        // profile (it describes the wrong Z); this is the one action that is
        // *not* pure navigation -- it is what starts a solve (ruling R28).
        setElement: (state, action: PayloadAction<number>) => {
            state.Z = action.payload;
            state.level = 'atom';
            state.selectedShell = null;
            state.selectedSubshell = null;
            state.selectedOrbital = null;
            state.profile = null;
            state.error = null;
        },

        solveStarted: (state) => {
            state.isSolving = true;
            state.error = null;
        },

        solveSucceeded: (state, action: PayloadAction<SerialisedAtomProfile>) => {
            state.profile = action.payload;
            state.isSolving = false;
            state.error = null;
        },

        solveFailed: (state, action: PayloadAction<string>) => {
            state.isSolving = false;
            state.error = action.payload;
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
} = atomSlice.actions;

export const solveSucceeded = atomSlice.actions.solveSucceeded;
export const drillToShell = atomSlice.actions.drillToShell;
// drillToSubshell/drillToOrbital take a single object payload internally;
// wrapped here so callers pass positional arguments, matching the brief's
// `drillToSubshell(n, l)` / `drillToOrbital(n, l, ml)`.
export const drillToSubshell = (n: number, l: number) => atomSlice.actions.drillToSubshell({ n, l });
export const drillToOrbital = (n: number, l: number, ml: number) => atomSlice.actions.drillToOrbital({ n, l, ml });
export const levelUp = atomSlice.actions.levelUp;
export const setHoverRadius = atomSlice.actions.setHoverRadius;

export default atomSlice.reducer;
