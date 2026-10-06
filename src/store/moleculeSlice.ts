import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { LibraryMoleculeMeta, MoleculePick } from '../molecules/library_types';
import { setMode } from './atomSlice';
import { isJobKey } from '../molecules/job_paths';
import { shortKey } from '../jobs/format';

export type { MoleculePick };
export type MoleculeSurface = { kind: 'density' } | { kind: 'esp' } | { kind: 'mo'; index: number };

/**
 * The surface on the canvas now, as the render that drew it asked for it
 * (Task 16b, ruling D5). `surface` and the orbital slice's enclosed fraction
 * are the *selection*, which runs ahead of the picture from the moment it
 * changes until the next render lands; an export must describe the picture,
 * so the render reports what it drew rather than the slice guessing from the
 * selection at landing time (a slow result can land after the selection has
 * already moved on, before the view's effect has superseded it).
 */
export interface MoleculeDrawn { id: string; surface: MoleculeSurface; enclosedFraction: number; }

/**
 * Molecules mode. Only JSON lives here -- the density and ESP grids are
 * megabytes of typed arrays and stay in grid_cache.ts. `loadNonce` is the
 * atomSlice.solveNonce lesson: re-picking the molecule already chosen must
 * reload, not leave "loading" on screen for ever.
 */
export interface MoleculeState {
    index: MoleculeIndexEntry[] | null;
    indexError: string | null;
    selectedId: string | null;
    meta: LibraryMoleculeMeta | null;
    isLoadingMeta: boolean;
    error: string | null;
    surface: MoleculeSurface;
    showStructure: boolean;
    showDipole: boolean;
    pick: MoleculePick | null;
    loadNonce: number;
    renderLabel: string | null;
    renderError: string | null;
    isoLevel: number | null;
    espRange: [number, number] | null;
    /** Null whenever the canvas is not showing a landed surface: before the first render, while one is in flight, after a failure or a cancel. */
    drawn: MoleculeDrawn | null;
}

const initialState: MoleculeState = {
    index: null, indexError: null, selectedId: null, meta: null, isLoadingMeta: false, error: null,
    surface: { kind: 'density' }, showStructure: true, showDipole: true, pick: null, loadNonce: 0,
    renderLabel: null, renderError: null, isoLevel: null, espRange: null, drawn: null,
};

const hasOrbital = (meta: LibraryMoleculeMeta | null, index: number) => !!meta && meta.orbitals.some(o => o.index === index);

/** A URL id is attacker/typo territory -- never echoed back unbounded (ruling T12-a). */
const truncateId = (id: string) => (id.length > 40 ? `${id.slice(0, 40)}…` : id);
/** A job key is 64 unbroken characters -- too long for a phone's alert, and its first ten tell it apart (m7). */
const displayId = (id: string) => (isJobKey(id) ? shortKey(id) : id);

const moleculeSlice = createSlice({
    name: 'molecule',
    initialState,
    reducers: {
        indexLoaded: (state, action: PayloadAction<MoleculeIndexEntry[]>) => { state.index = action.payload; state.indexError = null; },
        indexFailed: (state, action: PayloadAction<string>) => { state.indexError = action.payload; },
        selectMolecule: (state, action: PayloadAction<{ id: string; surface?: MoleculeSurface }>) => {
            state.selectedId = action.payload.id;
            state.meta = null;
            state.isLoadingMeta = true;
            state.error = null;
            state.renderError = null;
            state.pick = null;
            state.espRange = null;
            state.drawn = null;
            // The contour drawn belonged to the molecule being left (and the
            // view clears its surface until the new meta lands).
            state.isoLevel = null;
            state.loadNonce += 1;
            // An orbital index means nothing in another molecule; density and ESP carry over.
            state.surface = action.payload.surface ?? (state.surface.kind === 'mo' ? { kind: 'density' } : state.surface);
        },
        metaLoaded: (state, action: PayloadAction<{ id: string; meta: LibraryMoleculeMeta }>) => {
            if (action.payload.id !== state.selectedId) return;
            state.meta = action.payload.meta;
            state.isLoadingMeta = false;
            if (state.surface.kind === 'mo' && !hasOrbital(state.meta, state.surface.index)) state.surface = { kind: 'density' };
        },
        /**
         * A URL id that fails url_keys.ts's own id pattern (spec §3.5: a bad
         * URL id is an explicit message, never a stale or blank picture).
         * Unlike metaFailed, there is no molecule to leave selected -- the
         * link named nothing the library has, not a known id that failed to
         * load -- so this clears any stale selection outright.
         */
        linkRejected: (state, action: PayloadAction<string>) => {
            state.selectedId = null;
            state.meta = null;
            state.isLoadingMeta = false;
            state.drawn = null;
            state.error = `This link names no molecule in the library (“${truncateId(action.payload)}”)`;
        },
        /** A job= value that is not a job key (m7): a job link is not a library link, and is said as what it is. */
        jobLinkRejected: (state, action: PayloadAction<string>) => {
            state.selectedId = null;
            state.meta = null;
            state.isLoadingMeta = false;
            state.drawn = null;
            const value = action.payload.length > 10 ? shortKey(action.payload) : action.payload;
            state.error = `This link’s job key is not valid (“${value}”): a job key is 64 hexadecimal characters.`;
        },
        metaFailed: (state, action: PayloadAction<{ id: string; message: string }>) => {
            if (action.payload.id !== state.selectedId) return;
            state.isLoadingMeta = false;
            state.error = `Could not load “${displayId(action.payload.id)}”: ${action.payload.message}`;
        },
        setSurface: (state, action: PayloadAction<MoleculeSurface>) => {
            const surface = action.payload;
            if (surface.kind === 'mo' && !hasOrbital(state.meta, surface.index)) return;
            // The surface already chosen (re-clicking the selected orbital) is
            // not a new choice: a fresh object would restart the render, dim
            // the view and refuse exports until it landed (final review M4).
            if (surface.kind === state.surface.kind
                && (surface.kind !== 'mo' || state.surface.kind !== 'mo' || surface.index === state.surface.index)) return;
            state.surface = surface;
            if (surface.kind !== 'esp') state.espRange = null;
        },
        setShowStructure: (state, action: PayloadAction<boolean>) => { state.showStructure = action.payload; if (!action.payload) state.pick = null; },
        setShowDipole: (state, action: PayloadAction<boolean>) => { state.showDipole = action.payload; },
        setPick: (state, action: PayloadAction<MoleculePick | null>) => { state.pick = action.payload; },
        renderStarted: (state, action: PayloadAction<string>) => { state.renderLabel = action.payload; state.renderError = null; state.drawn = null; },
        /** `drawn` is what the landing render was asked for; a landing that does not say records nothing, so nothing can be exported off it. */
        renderFinished: (state, action: PayloadAction<{ isoLevel: number; espRange?: [number, number]; drawn?: MoleculeDrawn }>) => {
            state.renderLabel = null;
            state.isoLevel = action.payload.isoLevel;
            state.espRange = action.payload.espRange ?? null;
            state.drawn = action.payload.drawn ?? null;
        },
        renderFailed: (state, action: PayloadAction<string>) => { state.renderLabel = null; state.renderError = action.payload; state.drawn = null; },
        /**
         * A render abandoned before it landed (the mode left mid-mesh, ruling
         * D38): nothing is computing any more, so the busy label comes down;
         * the last result and any error stay as they were.
         */
        renderCancelled: (state) => { state.renderLabel = null; state.drawn = null; },
    },
    extraReducers: builder => {
        // Another mode takes the canvas; re-entering draws afresh (the view's
        // effect re-runs on `active`), so nothing drawn carries over. Setting
        // Molecules while in Molecules (a #mode=molecule link with no id) takes
        // nothing off the canvas, so the picture stays exportable (final review M1).
        builder.addCase(setMode, (state, action) => { if (action.payload !== 'molecule') state.drawn = null; });
    },
});

export const {
    indexLoaded, indexFailed, selectMolecule, metaLoaded, metaFailed, linkRejected, jobLinkRejected, setSurface, setShowStructure, setShowDipole,
    setPick, renderStarted, renderFinished, renderFailed, renderCancelled,
} = moleculeSlice.actions;
export default moleculeSlice.reducer;
