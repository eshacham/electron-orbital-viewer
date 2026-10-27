import { drillToOrbital, drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { setCombination } from '../../src/store/orbitalSlice';
import { viewTitle } from '../../src/shell/view_title';
import { selectMolecule, metaLoaded, setSurface, setRepresentation, setShowDipole } from '../../src/store/moleculeSlice';
import { previewCleared, previewResolved } from '../../src/store/jobsSlice';
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

    // Task 5 (critique P1): a field view is first-order perturbation theory, so its subtitle never says "exact".
    it('calls one orbital exact, and a field view first-order Stark, by its method', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        expect(viewTitle(store.getState()).subtitle).toBe('|ψ|² isosurface · 90 % enclosed · exact one-electron solution, Z = 1');
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        expect(viewTitle(store.getState()).subtitle).toBe('|ψ|² isosurface · 90 % enclosed · 1s + first-order Stark, Dalgarno–Lewis');
        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.003, stark: 'lower' }));
        expect(viewTitle(store.getState()).subtitle).toBe('|ψ|² isosurface · 90 % enclosed · n = 2 + first-order Stark, degenerate perturbation theory');
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
        // Ruling T13-M: with no structure either, the subtitle never says "Structure only" -- it names the
        // dipole arrow when that is what is left, and says nothing is drawn when nothing is.
        store.dispatch(setRepresentation('none'));
        expect(viewTitle(store.getState()).subtitle).toBe('Dipole arrow only · μ = 1.86 D (B3LYP/def2-TZVP) · experiment 1.855 D');
        store.dispatch(setShowDipole(false));
        expect(viewTitle(store.getState()).subtitle).toBe('Nothing drawn: no surface, structure or dipole arrow');
    });

    // Task 16 (ruling P12): while the request workspace's preview is on the canvas, the title names it as a
    // preview, never as the molecule chosen before it. Fix round 1 (T16-M4): the formula is the preview
    // response's own (what the resolved facts show), not one rebuilt from the atoms here.
    it('titles a request preview as a preview, not yet computed, and gives the molecule its title back', () => {
        const store = neonStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        const molecule = viewTitle(store.getState());
        store.dispatch(previewResolved({ atoms: [[8, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]], formula: 'C8H10N4O2' }));
        expect(viewTitle(store.getState())).toEqual({ title: 'Preview — C₈H₁₀N₄O₂', subtitle: 'resolved structure, not yet computed' });
        store.dispatch(previewCleared());
        expect(viewTitle(store.getState())).toEqual(molecule);
    });
});
