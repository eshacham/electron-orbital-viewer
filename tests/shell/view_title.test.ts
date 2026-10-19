import { drillToOrbital, drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { viewTitle } from '../../src/shell/view_title';
import { selectMolecule, metaLoaded, setSurface, setRepresentation } from '../../src/store/moleculeSlice';
import { neonStore, sodiumIonStore } from '../export/fixtures';
import { waterMeta } from '../molecules/fixtures';

describe('viewTitle (spec §9.1 "Viewport")', () => {
    it('names the species and the level, and states what is drawn and how', () => {
        const store = neonStore();
        expect(viewTitle(store.getState())).toEqual({
            title: 'Neon — whole atom',
            subtitle: '90 % of the electron density enclosed · LDA, non-relativistic',
        });
        store.dispatch(drillToShell(2));
        expect(viewTitle(store.getState()).title).toBe('Neon — L shell');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewTitle(store.getState()).title).toBe('Neon — 2p');
        store.dispatch(drillToOrbital(2, 1, 0));
        expect(viewTitle(store.getState())).toEqual({
            title: 'Neon — 2p_z orbital',
            subtitle: '|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic',
        });
    });

    it('names an ion as its species', () => {
        expect(viewTitle(sodiumIonStore().getState()).title).toBe('Sodium ion Na⁺ — whole atom');
    });

    it('titles Basic Orbitals and an empty Molecules view honestly', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        // The default Basic selection is 3d_z² (orbitalSlice DEFAULT_BASIC_SELECTION).
        expect(viewTitle(store.getState()).title).toBe('Hydrogen — 3d_z² orbital');
        store.dispatch(setMode('molecule'));
        expect(viewTitle(store.getState())).toEqual({ title: 'Molecules', subtitle: 'Choose a molecule' });
    });

    // Ruling P8 (spec §9.4): show=none draws the structure alone; the subtitle says so, with where its
    // geometry came from -- the one method a structure has.
    it('says a structure-only view is the structure, and where its geometry came from', () => {
        const store = neonStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        store.dispatch(setSurface({ kind: 'none' }));
        expect(viewTitle(store.getState())).toEqual({ title: 'Water (H₂O)', subtitle: 'Structure only · geometry: experiment (CCCBDB)' });
        store.dispatch(setRepresentation('none'));
        expect(viewTitle(store.getState()).subtitle).toBe('No surface or structure drawn');
    });
});
