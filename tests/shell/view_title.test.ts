import { drillToOrbital, drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { setCombination } from '../../src/store/orbitalSlice';
import { viewCaption, viewTitle } from '../../src/shell/view_title';
import { selectBondsSystem, setBondsView } from '../../src/store/bondsSlice';
import { indexLoaded } from '../../src/store/moleculeSlice';
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

    // Task 5 (critique P1; fix round 1 ruling): a field view is first-order perturbation theory, so its subtitle never says "exact".
    it('calls one orbital exact, and a field view first-order perturbation theory, by its method', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        expect(viewTitle(store.getState()).subtitle).toBe('|ψ|² isosurface · 90 % enclosed · exact one-electron solution, Z = 1');
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        expect(viewTitle(store.getState()).subtitle).toBe('|ψ|² isosurface · 90 % enclosed · 1s polarised to first order in F, Dalgarno–Lewis');
        // Task 8 (addendum 3): the element is named once -- never "Hydrogen — H 1s in a field".
        expect(viewTitle(store.getState()).title).toBe('Hydrogen — 1s in a field, F = 0.030 a.u.');
        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.003, stark: 'lower' }));
        expect(viewTitle(store.getState()).subtitle).toBe('|ψ|² isosurface · 90 % enclosed · n = 2 Stark states, first-order degenerate perturbation theory');
    });

    // Ruling P8 (spec §9.4): show=none draws the structure alone; the subtitle says so. Task 8 (addendum 8): no longer
    // where its geometry came from -- Info owns the geometry source, so the view stated it twice.
    it('says a structure-only view is the structure, and leaves its geometry source to Info', () => {
        const store = neonStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        store.dispatch(setSurface({ kind: 'none' }));
        expect(viewTitle(store.getState())).toEqual({ title: 'Water (H₂O)', subtitle: 'Structure only' });
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

    // Task 8: the phone's caption under the header -- "<what is drawn> · <its one key qualifier>", in markup ("_" for an
    // orbital's subscript, MO labels as the data write them) that App typesets; the requested view while it loads.
    describe('viewCaption', () => {
        it('names an atom\'s view and its enclosed fraction, and the requested view while it loads', () => {
            const store = neonStore();
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Neon', qualifier: '90 % enclosed' });
            store.dispatch(drillToShell(2));
            expect(viewCaption(store.getState(), { loading: false }).name).toBe('Neon L shell');
            store.dispatch(drillToSubshell(2, 1));
            expect(viewCaption(store.getState(), { loading: false }).name).toBe('Neon 2p');
            store.dispatch(drillToOrbital(2, 1, 0));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Neon 2p_z', qualifier: '90 % enclosed' });
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Neon 2p_z', qualifier: 'loading…' });
        });

        it('names an ion as its species', () => {
            expect(viewCaption(sodiumIonStore().getState(), { loading: false }).name).toBe('Sodium ion Na⁺');
        });

        it('names a hydrogen orbital or combination once', () => {
            const store = neonStore();
            store.dispatch(setMode('hydrogenic'));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Hydrogen 3d_z²', qualifier: '90 % enclosed' });
            store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.003, stark: 'lower' }));
            expect(viewCaption(store.getState(), { loading: false }).name).toBe('Hydrogen n = 2 Stark state (2s + 2p_z)/√2');
            store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
            expect(viewCaption(store.getState(), { loading: false }).name).toBe('Hydrogen 1s in a field, F = 0.030 a.u.');
            // Spec §3.5: a refused selection draws nothing, and the caption says so.
            store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp', member: 5 }));
            expect(viewCaption(store.getState(), { loading: false }).qualifier).toBe('not drawn');
        });

        it('names the Bonds orbital asked for and its bond length, or says it is loading', () => {
            const store = neonStore();
            store.dispatch(setMode('bonds'));
            store.dispatch(selectBondsSystem('co'));
            store.dispatch(setBondsView({ kind: 'mo', label: '5σ', spin: 'restricted', component: 0 }));
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'CO 5σ', qualifier: 'loading…' });
            expect(viewCaption(store.getState(), { loading: false, failed: true })).toEqual({ name: 'CO 5σ', qualifier: 'not loaded' });
            store.dispatch(setBondsView({ kind: 'density' }));
            expect(viewCaption(store.getState(), { loading: true }).name).toBe('CO electron density');
        });

        it('names a molecule and its surface kind, an orbital by its label, and the requested molecule while it loads', () => {
            const store = neonStore();
            store.dispatch(setMode('molecule'));
            store.dispatch(indexLoaded([{ id: 'h2o', name: 'Water', formula: 'H2O', category: 'small' } as never]));
            store.dispatch(selectMolecule({ id: 'h2o' }));
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Water', qualifier: 'loading…' });
            store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Water', qualifier: 'electron density' });
            store.dispatch(setSurface({ kind: 'esp' }));
            expect(viewCaption(store.getState(), { loading: false }).qualifier).toBe('electrostatic potential');
            store.dispatch(setSurface({ kind: 'mo', index: 4 }));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Water 1b1', qualifier: 'HOMO, 90 % enclosed' });
            store.dispatch(setSurface({ kind: 'mo', index: 3 }));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Water 3a1', qualifier: '90 % enclosed' });
            store.dispatch(setSurface({ kind: 'none' }));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Water', qualifier: 'structure only' });
        });

        it('names a molecule it has no index entry for (a computed one) while it loads', () => {
            const store = neonStore();
            store.dispatch(setMode('molecule'));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Molecules', qualifier: 'choose a molecule' });
            store.dispatch(selectMolecule({ id: 'job-abc' }));
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Molecule', qualifier: 'loading…' });
        });

        it('names a request preview as a preview', () => {
            const store = neonStore();
            store.dispatch(setMode('molecule'));
            store.dispatch(previewResolved({ atoms: [[8, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]], formula: 'C8H10N4O2' }));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Preview C₈H₁₀N₄O₂', qualifier: 'not yet computed' });
        });
    });
});
