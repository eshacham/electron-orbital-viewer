/**
 * Every Phase 2/5/6 name Phase 6B-2 builds on. A failure means Phase 6
 * shipped a different name: fix the uses in this plan's later tasks, never
 * Phase 6.
 */
import type React from 'react';
import moleculeReducer, { selectMolecule, metaLoaded, metaFailed } from '../../src/store/moleculeSlice';
import type { MoleculeState, MoleculeSurface } from '../../src/store/moleculeSlice';
import { encodeMoleculeUrl, decodeMoleculeUrl, registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { LIBRARY_CATEGORIES, asLibraryMeta } from '../../src/molecules/library_types';
import type { LibraryMoleculeMeta, MoleculeAtom } from '../../src/molecules/library_types';
import { detectBonds, CPK_COLORS, COVALENT_RADII_ANGSTROM, BOHR_TO_ANGSTROM, ATOM_RADIUS_FACTOR } from '../../src/molecules/ball_and_stick';
import { filterMolecules, formatFormula, libraryEntries } from '../../src/molecules/catalogue';
import type MoleculePicker from '../../src/components/MoleculePicker';
import type MoleculeNav from '../../src/components/MoleculeNav';
import type { loadEspGrid } from '../../src/molecules/esp';
import type { getDensityGrid } from '../../src/molecules/grid_cache';
import { moleculePath, MOLECULES_BASE_URL, MoleculeLoadError, clearMoleculeCacheForTests } from '../../src/molecules/loader';
import type { loadMoleculeMeta } from '../../src/molecules/loader';
import type { MoleculeIndexEntry, MoleculeMeta } from '../../src/molecules/types';
import { registerUrlKeys, urlModeOf, applyStateTo, encodeStateOf, resetUrlKeysForTests } from '../../src/url_state';
import { setMode } from '../../src/store/atomSlice';
import type { ViewMode } from '../../src/store/atomSlice';
import { createAppStore } from '../../src/store';
import { waterMeta, waterAtoms, LIBRARY_INDEX } from '../molecules/fixtures';

/** Never called: its body is the contract, and tsc is the checker. */
function contracts(): void {
    const selected: MoleculeState['selectedId'] = null;
    const meta: MoleculeState['meta'] = null as LibraryMoleculeMeta | null;
    const surface: MoleculeSurface = { kind: 'esp' };
    const select = selectMolecule({ id: 'h2o', surface });
    const loaded = metaLoaded({ id: 'h2o', meta: waterMeta() });
    const failed = metaFailed({ id: 'h2o', message: 'HTTP 404' });
    const esp: (meta: LibraryMoleculeMeta, baseUrl?: string) => Promise<unknown> = null as unknown as typeof loadEspGrid;
    const density: (meta: LibraryMoleculeMeta) => Promise<unknown> = null as unknown as typeof getDensityGrid;
    const loadMeta: (id: string) => Promise<MoleculeMeta> = null as unknown as typeof loadMoleculeMeta;
    const picker: React.ComponentProps<typeof MoleculePicker> = {
        entries: LIBRARY_INDEX, error: null, selectedId: null, onSelect: (_id: string) => undefined,
    };
    const nav: React.ComponentProps<typeof MoleculeNav> = {
        variant: 'body', entries: LIBRARY_INDEX, indexError: null, meta: waterMeta(), selectedId: 'h2o', isLoading: false,
        surface, onSelectMolecule: (_id: string) => undefined, onSurfaceChange: (_surface: MoleculeSurface) => undefined,
    };
    const atoms: MoleculeAtom[] = waterAtoms();
    const entry: MoleculeIndexEntry = { id: 'h2o', name: 'Water', formula: 'H2O', category: 'first-examples', tags: [] };
    const mode: ViewMode = 'molecule';
    const register: typeof registerUrlKeys = registerUrlKeys;
    void [selected, meta, select, loaded, failed, esp, density, loadMeta, picker, nav, atoms, entry, mode, register, ATOM_RADIUS_FACTOR];
}

afterEach(() => { resetUrlKeysForTests(); clearMoleculeCacheForTests(); });

describe('Phase 6 contracts', () => {
    it('is type-checked by tsc; this only proves the file loads', () => {
        expect(typeof contracts).toBe('function');
    });

    it('names Molecules mode "molecule" in a link, and its keys round-trip', () => {
        resetUrlKeysForTests();
        registerMoleculeUrlKeys();
        const store = createAppStore();
        store.dispatch(setMode('molecule'));
        expect(urlModeOf(store.getState())).toBe('molecule');
        applyStateTo('#mode=molecule&id=h2o&show=esp', store.dispatch);
        expect(store.getState().molecule.selectedId).toBe('h2o');
        expect(store.getState().molecule.surface).toEqual({ kind: 'esp' });
        expect(new URLSearchParams(encodeStateOf(store.getState())).get('id')).toBe('h2o');
        expect(encodeMoleculeUrl(store.getState().molecule)).toEqual(expect.objectContaining({ id: 'h2o', show: 'esp' }));
        expect(decodeMoleculeUrl({ id: 'h2o' })).toEqual({ id: 'h2o' });
    });

    it('keeps the shapes of selection and loading', () => {
        let state = moleculeReducer(undefined, selectMolecule({ id: 'h2o' }));
        expect([state.selectedId, state.isLoadingMeta, state.meta]).toEqual(['h2o', true, null]);
        state = moleculeReducer(state, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(state.meta?.id).toBe('h2o');
        state = moleculeReducer(moleculeReducer(undefined, selectMolecule({ id: 'x' })), metaFailed({ id: 'x', message: 'HTTP 404' }));
        expect(state.error).toContain('HTTP 404');
        expect(asLibraryMeta(waterMeta() as unknown as MoleculeMeta).id).toBe('h2o');
    });

    it('filters the picker by category, and the library filter drops categories it does not know', () => {
        expect(LIBRARY_CATEGORIES.map(c => c.key)).toContain('polarity');
        expect(filterMolecules(LIBRARY_INDEX, 'water', null).map(e => e.id)).toEqual(['h2o']);
        expect(formatFormula('H2O')).toBe('H₂O');
        expect(libraryEntries([{ id: 'k', name: 'K', formula: 'H2O', category: 'computed', tags: [] }])).toEqual([]);
    });

    it('takes bonds, radii and colours from ball_and_stick', () => {
        expect(detectBonds(waterAtoms())).toHaveLength(2);
        expect(COVALENT_RADII_ANGSTROM[8]).toBeCloseTo(0.66, 9);
        expect(CPK_COLORS[8]).toBe('#ff0d0d');
        expect(BOHR_TO_ANGSTROM).toBeCloseTo(0.529177210903, 12);
    });

    it('names the versioned library path and the load error type', () => {
        expect(MOLECULES_BASE_URL).toMatch(/^\/molecules\/v\d+$/);
        expect(moleculePath('h2o')).toBe(`${MOLECULES_BASE_URL}/h2o`);
        expect(() => moleculePath('../x')).toThrow(MoleculeLoadError);
    });
});
