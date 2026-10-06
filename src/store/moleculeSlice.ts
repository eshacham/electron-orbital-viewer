import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MoleculeIndexEntry } from '../molecules/types';
import type { LibraryMoleculeMeta, MoleculePick } from '../molecules/library_types';

export type { MoleculePick };
export type MoleculeSurface = { kind: 'density' } | { kind: 'esp' } | { kind: 'mo'; index: number };

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
}

const initialState: MoleculeState = {
    index: null, indexError: null, selectedId: null, meta: null, isLoadingMeta: false, error: null,
    surface: { kind: 'density' }, showStructure: true, showDipole: true, pick: null, loadNonce: 0,
    renderLabel: null, renderError: null, isoLevel: null, espRange: null,
};

const hasOrbital = (meta: LibraryMoleculeMeta | null, index: number) => !!meta && meta.orbitals.some(o => o.index === index);

/** A URL id is attacker/typo territory -- never echoed back unbounded (ruling T12-a). */
const truncateId = (id: string) => (id.length > 40 ? `${id.slice(0, 40)}…` : id);

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
            state.error = `This link names no molecule in the library (“${truncateId(action.payload)}”)`;
        },
        metaFailed: (state, action: PayloadAction<{ id: string; message: string }>) => {
            if (action.payload.id !== state.selectedId) return;
            state.isLoadingMeta = false;
            state.error = `Could not load “${action.payload.id}”: ${action.payload.message}`;
        },
        setSurface: (state, action: PayloadAction<MoleculeSurface>) => {
            const surface = action.payload;
            if (surface.kind === 'mo' && !hasOrbital(state.meta, surface.index)) return;
            state.surface = surface;
            if (surface.kind !== 'esp') state.espRange = null;
        },
        setShowStructure: (state, action: PayloadAction<boolean>) => { state.showStructure = action.payload; if (!action.payload) state.pick = null; },
        setShowDipole: (state, action: PayloadAction<boolean>) => { state.showDipole = action.payload; },
        setPick: (state, action: PayloadAction<MoleculePick | null>) => { state.pick = action.payload; },
        renderStarted: (state, action: PayloadAction<string>) => { state.renderLabel = action.payload; state.renderError = null; },
        renderFinished: (state, action: PayloadAction<{ isoLevel: number; espRange?: [number, number] }>) => {
            state.renderLabel = null;
            state.isoLevel = action.payload.isoLevel;
            state.espRange = action.payload.espRange ?? null;
        },
        renderFailed: (state, action: PayloadAction<string>) => { state.renderLabel = null; state.renderError = action.payload; },
    },
});

export const {
    indexLoaded, indexFailed, selectMolecule, metaLoaded, metaFailed, linkRejected, setSurface, setShowStructure, setShowDipole,
    setPick, renderStarted, renderFinished, renderFailed,
} = moleculeSlice.actions;
export default moleculeSlice.reducer;
