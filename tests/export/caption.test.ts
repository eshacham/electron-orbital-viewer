import { drillToShell, drillToSubshell, drillToOrbital, setMode } from '../../src/store/atomSlice';
import { setCombination, setEnclosedFraction, startOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { viewDescription, exportFileStem, methodStatement, referenceRingCaption, deltaScfCsvComment, ATOM_METHOD, BASIC_METHOD } from '../../src/export/caption';
import { energiesSucceeded } from '../../src/store/atomSlice';
import { DELTA_SCF_LABEL } from '../../src/atom/delta_scf';
import { MAX_FIELD_AU } from '../../src/field_source';
import { N2_MAX_FIELD_AU } from '../../src/stark';
import {
    makeStore, neonStore, sodiumIonStore, sodiumExcitedStore, goldStore, goldIonStore,
    bondsMoleculeStore, bondsH2PlusStore, bondsO2Store, bondsMismatchStore, N2_SCAN,
} from './fixtures';

describe('export captions', () => {
    it('names each atom level, with the method', () => {
        const store = neonStore();
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_atom');
        expect(methodStatement(store.getState())).toBe(ATOM_METHOD);
        store.dispatch(drillToShell(2));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), n = 2 shell, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_shell_n2');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), 2p subshell, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_subshell_n2_l1');
        store.dispatch(drillToOrbital(2, 1, 1));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), 2p_x, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_n2_l1_ml1');
    });

    it('names Basic Orbitals and its combinations, saying when a model is qualitative', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_H_basic_n3_l2_ml0');
        expect(methodStatement(store.getState())).toBe(BASIC_METHOD);
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        expect(methodStatement(store.getState())).toMatch(/first-order perturbation theory/);
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_H_field1');
    });

    // Fix round 1, I1: n = 2's Stark states are refused far below "F << 1
    // a.u." (see N2_MAX_FIELD_AU, the over-the-barrier field for E = -1/8
    // Ha), so its caption must not claim n = 1's much wider range.
    it('states each field level\'s own valid range and says tunnelling is ignored', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        const level1 = methodStatement(store.getState());
        expect(level1).toContain('tunnelling ignored');
        expect(level1).toContain(`up to F = ${MAX_FIELD_AU} a.u.`);
        expect(level1).toContain('F << 1 a.u.');

        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.001, stark: 'lower' }));
        const level2 = methodStatement(store.getState());
        expect(level2).toContain('tunnelling ignored');
        expect(level2).toContain(`${N2_MAX_FIELD_AU}`);
        expect(level2).not.toContain('F << 1 a.u.');
    });

    // Final review I1: in Basic Orbitals the fraction only takes effect on
    // Update Orbital, so until then the caption names the drawn contour, not
    // the panel's. Combinations redraw as the fraction changes, so they
    // follow the panel at once.
    it('names the contour drawn, not one the panel has not applied yet', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.9)));
        store.dispatch(setEnclosedFraction(0.5));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 90% contour');
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.5)));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 50% contour');

        store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }));
        store.dispatch(setEnclosedFraction(0.75));
        expect(viewDescription(store.getState())).toMatch(/, 75% contour$/);
    });

    // Task 12b: a neutral ground state's export caption and file name stay
    // byte-identical (pinned above); an ion or excited atom must instead
    // name the species and its configuration (spec §3.1).
    describe('an ion or excited atom names itself (ruling C4)', () => {
        it('names a cation with speciesTitle, its configuration, and an ASCII charge suffix on the file stem', () => {
            const store = sodiumIonStore();
            expect(viewDescription(store.getState())).toBe('Sodium ion Na⁺ (Z = 11), 1s² 2s² 2p⁶, whole atom, 90% contour');
            expect(exportFileStem(store.getState())).toBe('orbital-viewer_Na+1_atom');
        });

        it('names an excited neutral atom with its excitation, and an ASCII subshell suffix on the file stem', () => {
            const store = sodiumExcitedStore();
            expect(viewDescription(store.getState())).toBe('Sodium, excited 3s → 3p (Z = 11), 1s² 2s² 2p⁶ 3p¹, whole atom, 90% contour');
            expect(exportFileStem(store.getState())).toBe('orbital-viewer_Na_3s-3p_atom');
        });

        it('adds a dashed-ring caption line for a cation, naming the neutral comparison radius to 3 s.f.', () => {
            const store = sodiumIonStore();
            expect(referenceRingCaption(store.getState())).toBe('dashed ring: neutral Na drawn radius 1.28 a₀');
        });

        it('adds no ring line for an excited neutral atom (it is its own reference)', () => {
            expect(referenceRingCaption(sodiumExcitedStore().getState())).toBeNull();
        });

        it('adds no ring line for a neutral ground state', () => {
            expect(referenceRingCaption(neonStore().getState())).toBeNull();
        });

        // Optional per the brief: a CSV comment line, only once the species'
        // own ΔSCF energy (ruling C5) has actually landed -- never before,
        // and never another species' stale reply.
        it('carries a landed ΔSCF energy as a CSV comment, labelled ΔSCF, LDA', () => {
            const store = sodiumIonStore();
            expect(deltaScfCsvComment(store.getState())).toBeNull();
            store.dispatch(energiesSucceeded({
                speciesKey: '11+1',
                ionisation: { valueEv: 47.29, fromLabel: 'Na⁺', toLabel: 'Na²⁺' },
                excitation: null,
            }));
            const line = deltaScfCsvComment(store.getState());
            expect(line).toContain('Na⁺ → Na²⁺');
            expect(line).toContain('47.29 eV');
            expect(line).toContain(DELTA_SCF_LABEL);
        });

        // Final review M5: "Na → Na 3s → 3p" read as two transitions.
        it('names an excitation as one, not as an arrow into an arrow', () => {
            const store = sodiumExcitedStore();
            store.dispatch(energiesSucceeded({
                speciesKey: '11:3s>3p',
                ionisation: null,
                excitation: { valueEv: 2.185, fromLabel: 'Na', toLabel: 'Na 3s → 3p' },
            }));
            expect(deltaScfCsvComment(store.getState())).toMatch(/^Na 3s → 3p excitation: 2\.19 eV \(ΔSCF, LDA\); /);
        });

        // Ruling FR-1: the export says what the screen says about a negative one.
        it('notes a negative excitation energy in the CSV comment too', () => {
            const store = sodiumExcitedStore();
            store.dispatch(energiesSucceeded({
                speciesKey: '11:3s>3p',
                ionisation: null,
                excitation: { valueEv: -0.5, fromLabel: 'Na', toLabel: 'Na 3s → 3p' },
            }));
            expect(deltaScfCsvComment(store.getState()))
                .toMatch(/^Na 3s → 3p excitation: -0\.50 eV \(ΔSCF, LDA; below the ground configuration in LDA — a known LDA error for s→d transfer\); /);
        });
    });

    // Task 12b (ruling C7): every export states the DRAWN profile's own
    // relativistic treatment -- the profile's mode (ruling C9), never the
    // requested one -- and never ATOM_METHOD's "non-relativistic" wording
    // for a relativistic picture.
    describe('exports state the relativity of the picture they show (ruling C7)', () => {
        it('keeps off byte-identical, and gives scalar/spin–orbit their own method text', () => {
            expect(methodStatement(goldStore('off').getState())).toBe(ATOM_METHOD);

            const scalarMethod = methodStatement(goldStore('scalar').getState());
            expect(scalarMethod).not.toBe(ATOM_METHOD);
            expect(scalarMethod).toMatch(/scalar-relativistic/);
            expect(scalarMethod).not.toMatch(/non-relativistic/);

            const spinOrbitMethod = methodStatement(goldStore('spinOrbit').getState());
            expect(spinOrbitMethod).toMatch(/radial Dirac/);
            expect(spinOrbitMethod).not.toMatch(/non-relativistic/);
        });

        it('names the mode in viewDescription, after the usual level part', () => {
            expect(viewDescription(goldStore('off').getState())).toBe('Gold (Au, Z = 79), whole atom, 90% contour');
            expect(viewDescription(goldStore('scalar').getState())).toBe('Gold (Au, Z = 79), whole atom, scalar-relativistic, 90% contour');
            expect(viewDescription(goldStore('spinOrbit').getState())).toBe('Gold (Au, Z = 79), whole atom, with spin–orbit, 90% contour');
        });

        it('names a j-level subshell and its mode together', () => {
            const store = goldStore('spinOrbit', { j: true });
            store.dispatch(drillToSubshell(6, 1, 1.5));
            expect(viewDescription(store.getState())).toBe('Gold (Au, Z = 79), 6p³⁄₂ subshell, with spin–orbit, 90% contour');
        });

        it('names a j-level orbital as its l orbital, with its j-level crumb -- the angular shape is still the l orbital\'s', () => {
            const store = goldStore('spinOrbit', { j: true });
            store.dispatch(drillToOrbital(6, 1, 0, 1.5));
            expect(viewDescription(store.getState())).toBe('Gold (Au, Z = 79), 6p_z · 6p³⁄₂, with spin–orbit, 90% contour');
        });

        // Ruling C6: beside a relativistic picture the CSV's ΔSCF line says
        // the energies are not relativistic, not that the same LDA drew it.
        it('gives a relativistic picture\'s ΔSCF CSV line the mode-aware method', () => {
            const store = goldStore('scalar');
            store.dispatch(energiesSucceeded({
                speciesKey: '79',
                ionisation: { valueEv: 9.1, fromLabel: 'Au', toLabel: 'Au⁺' },
                excitation: null,
            }));
            const line = deltaScfCsvComment(store.getState());
            expect(line).toContain('the picture on screen is not');
            expect(line).not.toContain('the same LDA draws');
        });

        it('adds a scalar/spin–orbit suffix to the file stem, ASCII and after any j-level suffix', () => {
            expect(exportFileStem(goldStore('off').getState())).toBe('orbital-viewer_Au_atom');
            expect(exportFileStem(goldStore('scalar').getState())).toBe('orbital-viewer_Au_atom_scalar');

            const spinOrbit = goldStore('spinOrbit', { j: true });
            spinOrbit.dispatch(drillToSubshell(6, 1, 1.5));
            expect(exportFileStem(spinOrbit.getState())).toBe('orbital-viewer_Au_subshell_n6_l1_j3-2_so');

            spinOrbit.dispatch(drillToOrbital(6, 1, 0, 1.5));
            expect(exportFileStem(spinOrbit.getState())).toBe('orbital-viewer_Au_n6_l1_ml0_j3-2_so');
        });

        it('names the reference ring\'s own mode for a relativistic ion, and stays unchanged for off', () => {
            expect(referenceRingCaption(goldIonStore('off').getState())).toBe('dashed ring: neutral Au drawn radius 1.60 a₀');
            expect(referenceRingCaption(goldIonStore('scalar').getState())).toBe('dashed ring: neutral Au drawn radius 1.60 a₀, scalar-relativistic');
            expect(referenceRingCaption(goldIonStore('spinOrbit').getState())).toBe('dashed ring: neutral Au drawn radius 1.60 a₀, with spin–orbit');
        });
    });

    // Task 13b (ruling C5): Bonds names the system, R (a₀ and Å), what is
    // drawn, and the method -- reading the drawn request (currentField), not
    // the panel's selection, the same way atom mode reads the drawn profile.
    describe('Bonds mode names the system, R and the method (ruling C5)', () => {
        it('names H2+\'s state, R and the drawn contour, with the exact method, in an ASCII-unique file stem', () => {
            const store = bondsH2PlusStore();
            expect(viewDescription(store.getState())).toBe('H₂⁺ 1σg, R = 2.00 a₀ (1.058 Å), 90% contour');
            expect(methodStatement(store.getState())).toMatch(/^Exact within Born–Oppenheimer/);
            expect(exportFileStem(store.getState())).toBe('orbital-viewer_H2plus_R2.00_1sigmag');
        });

        it('names a diatomic\'s drawn orbital, R and the drawn contour from the basis actually drawn, not the panel\'s R', () => {
            const store = bondsMoleculeStore();
            expect(viewDescription(store.getState())).toBe('N₂ 3σg, R = 2.07 a₀ (1.098 Å), 90% contour');
            expect(exportFileStem(store.getState())).toBe('orbital-viewer_N2_R2.07_3sigmag');
            // Without the scan (not yet loaded), the method still names the
            // fixed, universal one -- just not the molecule-specific caveat.
            expect(methodStatement(store.getState())).toBe('diatomic molecular orbitals and density: B3LYP/def2-TZVP');
            // With the scan, the shipped method in bondsCaptions' own wording (fix round 1, M2).
            expect(methodStatement(store.getState(), N2_SCAN)).toBe(
                'Orbitals and density: B3LYP/def2-TZVP; energies: CCSD(T)/aug-cc-pVTZ (frozen core)',
            );
        });

        it('adds the multireference caveat (B₂/C₂) when the scan says so', () => {
            const store = bondsMoleculeStore();
            const multireferenceScan = { ...N2_SCAN, validity: { ...N2_SCAN.validity, multireference: true, t1AtRe: 0.05 } };
            expect(methodStatement(store.getState(), multireferenceScan)).toBe(
                'Orbitals and density: B3LYP/def2-TZVP; energies: CCSD(T)/aug-cc-pVTZ (frozen core); '
                + 'Strongly multireference: single-reference CCSD(T) is only qualitative here (T1 = 0.050 at R_e).',
            );
        });

        it('names a density surface by its ρ, with no contour fraction (it is drawn at a fixed ρ, not an enclosed fraction)', () => {
            const store = bondsMoleculeStore({ kind: 'density' });
            expect(viewDescription(store.getState())).toBe('N₂ total density, surface at ρ = 0.002 e/a₀³, R = 2.07 a₀ (1.098 Å)');
            expect(exportFileStem(store.getState())).toBe('orbital-viewer_N2_R2.07_density-0.002');
        });

        // Brief, requirement 3's own worked example: an unrestricted
        // molecule's spin-labelled orbital, Greek spelled out, star dropped.
        // O2_BASIS's 1πg* has only one orbital per spin (no degenerate
        // pair), so the stem carries no component suffix (see the dedicated
        // degenerate-pair test below for that case).
        it('matches the brief\'s own worked example exactly: O2, R = 2.29, 1pig alpha', () => {
            const store = bondsO2Store();
            expect(exportFileStem(store.getState())).toBe('orbital-viewer_O2_R2.29_1pig-alpha');
        });

        it('names an unrestricted orbital\'s spin and the drawn contour in viewDescription', () => {
            const store = bondsO2Store();
            expect(viewDescription(store.getState())).toBe('O₂ 1πg* (α), R = 2.29 a₀ (1.212 Å), 90% contour');
        });

        // Fix round 1 (M1): N2_BASIS's '1πg*' (restricted) has two entries
        // (index 1, 2) -- a genuine degenerate pair -- so exporting each
        // component separately must not produce the same name twice.
        describe('a degenerate π pair gets a distinguishing suffix (fix round 1, M1)', () => {
            it('names component 1 of 2, with a "-1" file-stem suffix', () => {
                const store = bondsMoleculeStore({ kind: 'mo', label: '1πg*', spin: 'restricted', component: 0 });
                expect(viewDescription(store.getState())).toContain('1πg* (component 1 of 2)');
                expect(exportFileStem(store.getState())).toBe('orbital-viewer_N2_R2.07_1pig-1');
            });

            it('names component 2 of 2, with a "-2" file-stem suffix', () => {
                const store = bondsMoleculeStore({ kind: 'mo', label: '1πg*', spin: 'restricted', component: 1 });
                expect(viewDescription(store.getState())).toContain('1πg* (component 2 of 2)');
                expect(exportFileStem(store.getState())).toBe('orbital-viewer_N2_R2.07_1pig-2');
            });

            it('adds no component note or suffix for a non-degenerate orbital (3σg, one match)', () => {
                const store = bondsMoleculeStore();
                expect(viewDescription(store.getState())).not.toContain('component');
                expect(exportFileStem(store.getState())).not.toMatch(/-\d$/);
            });
        });

        // Fix round 1 (I1): the reviewer's own probe. H₂⁺ is drawn; N₂ is
        // selected but has not rendered yet (bondsMismatchStore). Every
        // Bonds caption must still read the *drawn* H₂⁺ picture -- never
        // N₂'s scan, even when one is handed in, since it cannot possibly
        // belong to what is on screen.
        describe('reads the drawn picture, never the selection, while a new molecule is still loading (fix round 1, I1)', () => {
            it('viewDescription and exportFileStem stay H2+\'s, although N2 is selected', () => {
                const store = bondsMismatchStore();
                expect(store.getState().bonds.system).toBe('n2');
                expect(viewDescription(store.getState())).toMatch(/^H₂⁺ 1σg/);
                expect(exportFileStem(store.getState())).toBe('orbital-viewer_H2plus_R2.00_1sigmag');
            });

            it('methodStatement names H2+\'s own exact method, even when handed N2\'s scan', () => {
                const store = bondsMismatchStore();
                expect(methodStatement(store.getState(), N2_SCAN)).toMatch(/^Exact within Born–Oppenheimer/);
            });
        });
    });
});
