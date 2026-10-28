import { drillToOrbital, drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { setCombination, setEnclosedFraction } from '../../src/store/orbitalSlice';
import { captionIsLoading, shellName, viewCaption, viewTitle } from '../../src/shell/view_title';
import { selectBondsSystem, setBondsView } from '../../src/store/bondsSlice';
import { indexLoaded } from '../../src/store/moleculeSlice';
import { selectMolecule, metaLoaded, setSurface, setRepresentation, setShowDipole, renderStarted, renderFinished } from '../../src/store/moleculeSlice';
import { previewCleared, previewResolved } from '../../src/store/jobsSlice';
import { bondsH2PlusStore, bondsMoleculeStore, neonStore, sodiumIonStore } from '../export/fixtures';
import { viewDescription } from '../../src/export/caption';
import { waterMeta } from '../molecules/fixtures';

describe('viewTitle (spec §9.1 "Viewport")', () => {
    it('names the species and the level, and states what is drawn and how', () => {
        const store = neonStore();
        // Task 9b: the subtitle is banded by level -- at Research the method, the share being Info's Enclosed fact's.
        expect(viewTitle(store.getState(), 'research')).toEqual({
            title: 'Neon — whole atom',
            subtitle: 'electron density · LDA, non-relativistic',
        });
        store.dispatch(drillToShell(2));
        expect(viewTitle(store.getState(), 'research').title).toBe('Neon — L shell');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewTitle(store.getState(), 'research').title).toBe('Neon — 2p');
        store.dispatch(drillToOrbital(2, 1, 0));
        expect(viewTitle(store.getState(), 'research')).toEqual({
            title: 'Neon — 2p_z orbital',
            subtitle: '|ψ|² isosurface · LDA, non-relativistic',
        });
    });

    it('names an ion as its species', () => {
        expect(viewTitle(sodiumIonStore().getState(), 'research').title).toBe('Sodium ion Na⁺ — whole atom');
    });

    it('titles Basic Orbitals and an empty Molecules view honestly', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        // The default Basic selection is 3d_z² (orbitalSlice DEFAULT_BASIC_SELECTION).
        expect(viewTitle(store.getState(), 'research').title).toBe('Hydrogen — 3d_z² orbital');
        store.dispatch(setMode('molecule'));
        // Task 9b review M8: subtitles are lower case, as the phone caption's "choose a molecule" is.
        expect(viewTitle(store.getState(), 'research')).toEqual({ title: 'Molecules', subtitle: 'choose a molecule' });
    });

    // Task 5 (critique P1; fix round 1 ruling): a field view is first-order perturbation theory, so its subtitle never says "exact".
    it('calls one orbital exact, and a field view first-order perturbation theory, by its method', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        // Task 9b: the method joins the subtitle from Advanced (below, it is Info's "How this was computed"'s).
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('|ψ|² isosurface · exact one-electron solution, Z = 1');
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('|ψ|² isosurface · 1s polarised to first order in F, Dalgarno–Lewis');
        // Task 8 (addendum 3): the element is named once -- never "Hydrogen — H 1s in a field".
        expect(viewTitle(store.getState(), 'research').title).toBe('Hydrogen — 1s in a field, F = 0.030 a.u.');
        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.003, stark: 'lower' }));
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('|ψ|² isosurface · n = 2 Stark states, first-order degenerate perturbation theory');
    });

    // Ruling P8 (spec §9.4): show=none draws the structure alone; the subtitle says so. Task 8 (addendum 8): no longer
    // where its geometry came from -- Info owns the geometry source, so the view stated it twice.
    it('says a structure-only view is the structure, and leaves its geometry source to Info', () => {
        const store = neonStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        store.dispatch(setSurface({ kind: 'none' }));
        // Task 9b review M8: lower case, as every other subtitle (a PNG's caption line keeps its capital).
        expect(viewTitle(store.getState(), 'research')).toEqual({ title: 'Water (H₂O)', subtitle: 'structure only' });
        // Ruling T13-M: with no structure either, the subtitle never says "Structure only" -- it names the
        // dipole arrow when that is what is left, and says nothing is drawn when nothing is.
        store.dispatch(setRepresentation('none'));
        // Task 9b: the dipole's numbers are Info's fact's; the subtitle says only what is drawn (a PNG's caption keeps them).
        expect(viewTitle(store.getState(), 'research').subtitle).toBe('dipole arrow only');
        store.dispatch(setShowDipole(false));
        expect(viewTitle(store.getState(), 'research').subtitle).toBe('nothing drawn: no surface, structure or dipole arrow');
    });

    // Task 16 (ruling P12): while the request workspace's preview is on the canvas, the title names it as a
    // preview, never as the molecule chosen before it. Fix round 1 (T16-M4): the formula is the preview
    // response's own (what the resolved facts show), not one rebuilt from the atoms here.
    it('titles a request preview as a preview, not yet computed, and gives the molecule its title back', () => {
        const store = neonStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        const molecule = viewTitle(store.getState(), 'research');
        store.dispatch(previewResolved({ atoms: [[8, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]], formula: 'C8H10N4O2' }));
        expect(viewTitle(store.getState(), 'research')).toEqual({ title: 'Preview — C₈H₁₀N₄O₂', subtitle: 'resolved structure, not yet computed' });
        store.dispatch(previewCleared());
        expect(viewTitle(store.getState(), 'research')).toEqual(molecule);
    });

    // Task 8: the phone's caption under the header -- "<what is drawn> · <its one key qualifier>", in markup ("_" for an
    // orbital's subscript, MO labels as the data write them) that App typesets; the requested view while it loads.
    describe('viewCaption', () => {
        it('names an atom\'s view and its enclosed fraction, and the requested view while it loads', () => {
            const store = neonStore();
            // Ruling M4 (fix round 1): the whole atom's caption says what is drawn of it, its electron density -- and keeps
            // saying so while it loads (M3).
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Neon', qualifier: 'electron density' });
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Neon', qualifier: 'electron density · loading…' });
            store.dispatch(drillToShell(2));
            expect(viewCaption(store.getState(), { loading: false }).name).toBe('Neon L shell');
            store.dispatch(drillToSubshell(2, 1));
            expect(viewCaption(store.getState(), { loading: false }).name).toBe('Neon 2p');
            store.dispatch(drillToOrbital(2, 1, 0));
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Neon 2p_z', qualifier: '90 % enclosed' });
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Neon 2p_z', qualifier: 'loading…' });
        });

        // Task 9 review M3: whether a caption waits for its view is the caption module's to say, not a match on its words
        // in App -- a qualifier that keeps its kind ("electron density · loading…") waits too; "not loaded" does not.
        it('says whether a caption is waiting for its view', () => {
            const store = neonStore();
            expect(captionIsLoading(viewCaption(store.getState(), { loading: true }))).toBe(true);
            expect(captionIsLoading(viewCaption(store.getState(), { loading: false }))).toBe(false);
            store.dispatch(setMode('molecule'));
            store.dispatch(indexLoaded([{ id: 'h2o', name: 'Water', formula: 'H2O', category: 'small' } as never]));
            store.dispatch(selectMolecule({ id: 'h2o' }));
            // A molecule whose meta has not landed waits, whatever the canvas says.
            expect(captionIsLoading(viewCaption(store.getState(), { loading: false }))).toBe(true);
            store.dispatch(setMode('bonds'));
            expect(captionIsLoading(viewCaption(store.getState(), { loading: false, failed: true }))).toBe(false);
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
            // Fix round 1 (M3): a kind of surface is kept while it loads, "loading…" after it.
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Water', qualifier: 'electron density · loading…' });
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Water', qualifier: 'electron density' });
            store.dispatch(setSurface({ kind: 'esp' }));
            expect(viewCaption(store.getState(), { loading: false }).qualifier).toBe('electrostatic potential');
            expect(viewCaption(store.getState(), { loading: true }).qualifier).toBe('electrostatic potential · loading…');
            store.dispatch(setSurface({ kind: 'mo', index: 4 }));
            // Fix round 1 (M2): the role names which orbital, so it goes with the name.
            expect(viewCaption(store.getState(), { loading: false })).toEqual({ name: 'Water 1b1 (HOMO)', qualifier: '90 % enclosed' });
            expect(viewCaption(store.getState(), { loading: true })).toEqual({ name: 'Water 1b1 (HOMO)', qualifier: 'loading…' });
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

// Task 9b (finish review, fixes 2 and 3): the canvas subtitle is one plain line, banded by level. Below Advanced it
// says what is drawn in plain words and its enclosed share; from Advanced the method may join, and the share is left
// to Info's Enclosed fact (one home per number). It never restates the title, nor a number Info states (Bonds' R and
// ρ, Molecules' ρ, energies and dipole). Export captions keep their full line (viewDescription), at every level.
describe('viewTitle banded by level (Task 9b)', () => {
    it('says an atom\'s drawing in plain words below Advanced, and adds the method from Advanced', () => {
        const store = neonStore();
        expect(viewTitle(store.getState(), 'basics').subtitle).toBe('electron density · 90 % enclosed');
        expect(viewTitle(store.getState(), 'explore').subtitle).toBe('electron density · 90 % enclosed');
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('electron density · LDA, non-relativistic');
        store.dispatch(drillToOrbital(2, 1, 0));
        expect(viewTitle(store.getState(), 'basics').subtitle).toBe('electron cloud · 90 % enclosed');
        expect(viewTitle(store.getState(), 'research').subtitle).toBe('|ψ|² isosurface · LDA, non-relativistic');
    });

    // Task 9b review M5 (ruling): a subshell draws each of its orbitals' own surfaces, and Info's Enclosed fact says "of
    // each orbital's probability" -- so its subtitle names an orbital's probability, as the orbital view's does, never
    // "electron density". A shell is still its electron density.
    it('names a subshell\'s surfaces as orbitals\' probability, not electron density', () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        expect(viewTitle(store.getState(), 'explore').subtitle).toBe('electron density · 90 % enclosed');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewTitle(store.getState(), 'explore').subtitle).toBe('electron cloud · 90 % enclosed');
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('|ψ|² isosurface · LDA, non-relativistic');
    });

    it('says a hydrogen orbital plainly below Advanced, and its method from Advanced', () => {
        const store = neonStore();
        store.dispatch(setMode('hydrogenic'));
        expect(viewTitle(store.getState(), 'explore').subtitle).toBe('electron cloud · 90 % enclosed');
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('|ψ|² isosurface · exact one-electron solution, Z = 1');
    });

    it('never puts a method, a contour value or a number Info states in a subtitle below Advanced', () => {
        for (const level of ['basics', 'explore'] as const) {
            const neon = neonStore();
            for (const subtitle of [viewTitle(neon.getState(), level).subtitle]) {
                expect(subtitle).not.toMatch(/LDA|ψ|isosurface|exact/);
            }
        }
    });

    it('names Bonds\' drawn view without R or ρ -- the slider, the key and Info hold those', () => {
        const density = bondsMoleculeStore({ kind: 'density' });
        for (const level of ['basics', 'explore', 'advanced', 'research'] as const) {
            const { title, subtitle } = viewTitle(density.getState(), level);
            expect(subtitle).toBe('electron density');
            expect(subtitle).not.toContain(title);
        }
        const orbital = bondsMoleculeStore();
        expect(viewTitle(orbital.getState(), 'explore').subtitle).toBe('3σg orbital · 90 % enclosed');
        expect(viewTitle(orbital.getState(), 'advanced').subtitle).toBe('3σg orbital · |ψ|² isosurface');
        for (const level of ['basics', 'explore', 'advanced', 'research'] as const) {
            expect(viewTitle(orbital.getState(), level).subtitle).not.toMatch(/R =|ρ|Å|a₀/);
        }
        expect(viewTitle(bondsH2PlusStore().getState(), 'basics').subtitle).toBe('1σg orbital · 90 % enclosed');
        // The share is the drawn picture's, not one the panel has asked for but not yet drawn.
        orbital.dispatch(setEnclosedFraction(0.5));
        expect(viewTitle(orbital.getState(), 'explore').subtitle).toBe('3σg orbital · 90 % enclosed');
    });

    it('names a molecule\'s drawn surface without the title, the ρ it was contoured at, or an energy', () => {
        const store = neonStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        const land = (surface: Parameters<typeof setSurface>[0]) => {
            store.dispatch(setSurface(surface));
            store.dispatch(renderStarted('Loading…'));
            store.dispatch(renderFinished({
                isoLevel: 0.0266, espRange: surface.kind === 'esp' ? [-0.061, 0.071] : undefined,
                drawn: { id: 'h2o', surface, enclosedFraction: store.getState().orbital.enclosedFraction },
            }));
        };
        land({ kind: 'density' });
        expect(viewTitle(store.getState(), 'basics')).toEqual({ title: 'Water (H₂O)', subtitle: 'electron density · 90 % enclosed' });
        expect(viewTitle(store.getState(), 'research').subtitle).toBe('electron density');
        land({ kind: 'esp' });
        expect(viewTitle(store.getState(), 'basics').subtitle).toBe('electrostatic potential');
        land({ kind: 'mo', index: 4 });
        expect(viewTitle(store.getState(), 'explore').subtitle).toBe('1b1 orbital (HOMO) · 90 % enclosed');
        expect(viewTitle(store.getState(), 'advanced').subtitle).toBe('1b1 orbital (HOMO) · |ψ|² isosurface');
        for (const level of ['basics', 'explore', 'advanced', 'research'] as const) {
            expect(viewTitle(store.getState(), level).subtitle).not.toMatch(/e-|ρ|eV|Ha\b|Water/);
        }
        // The dipole's numbers are Info's; the subtitle only says the arrow is what is drawn.
        store.dispatch(setSurface({ kind: 'none' }));
        store.dispatch(setRepresentation('none'));
        // Task 9b review M8: lower case.
        expect(viewTitle(store.getState(), 'research').subtitle).toBe('dipole arrow only');
    });

    it('leaves the export caption whole at every level', () => {
        expect(viewDescription(bondsMoleculeStore({ kind: 'density' }).getState()))
            .toBe('N₂ total density, surface at ρ = 0.002 e/a₀³, R = 2.07 a₀ (1.098 Å)');
    });
});

// Final review M2: one shellName -- "L shell" where the view is named, "L shell (n = 2)" (spaced, the typography rule)
// where the chips, the breadcrumb and Info's lead name a shell.
describe('shellName', () => {
    it('names a shell by its letter, with its number spaced as the rest of the app writes it', () => {
        expect(shellName(2)).toBe('L shell');
        expect(shellName(2, { withNumber: true })).toBe('L shell (n = 2)');
        expect(shellName(8, { withNumber: true })).toBe('n = 8 shell');
    });
});
