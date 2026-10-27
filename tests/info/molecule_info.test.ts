// tests/info/molecule_info.test.ts -- Task 7b: Molecules' Info builder owns every sentence the Molecules panels used to
// print (the geometry/method caption under the surface switch, the orbital list's gap note, key and caption wall, the
// view options' structure, labels and dipole notes, the readout's geometry line, the Properties card's captions, the ESP
// key's notes, the Enclosed and Cut helpers) and, under "How this was computed", the former provenance panel -- written
// for the reader's level: plain words at Basics, the gap and orbital energies (eV, then Ha) and the Kohn–Sham caveat,
// stated once, from Explore, the iso value and the labels from Advanced, and the method and references open at Research.
import React from 'react';
import { render } from '@testing-library/react';
import { moleculeInfo, type MoleculeInfoState } from '../../src/info/molecule_info';
import InfoPanel from '../../src/info/InfoPanel';
import type { InfoContent } from '../../src/info/info_types';
import type { LearningLevel } from '../../src/levels/levels';
import { makeStore } from '../export/fixtures';
import { setMode } from '../../src/store/atomSlice';
import {
    metaLoaded, renderFinished, renderStarted, selectMolecule, setRepresentation, setShowDipole, setSurface,
} from '../../src/store/moleculeSlice';
import { setSurfaceStyle } from '../../src/store/orbitalSlice';
import { jobUpdated } from '../../src/store/jobsSlice';
import { ownerJobRecordOf } from '../../src/jobs/owner_job_record';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';
import type { MoleculeProvenance } from '../../src/molecules/types';
import { labelsSentence, LVMO_NOTE } from '../../src/molecules/orbital_display';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { resetBuildEnv } from '../jobs/build_env_stub';
import { waterMeta } from '../molecules/fixtures';
import { jobFixture } from '../jobs/api_fixtures';

/** Molecules mode with `meta` loaded (water by default), then whatever `steps` dispatch. */
function moleculeState(meta: LibraryMoleculeMeta = waterMeta(), ...steps: Array<(store: ReturnType<typeof makeStore>) => void>) {
    const store = makeStore();
    store.dispatch(setMode('molecule'));
    store.dispatch(selectMolecule({ id: meta.id }));
    store.dispatch(metaLoaded({ id: meta.id, meta }));
    steps.forEach(step => step(store));
    return store.getState();
}

const infoOf = (state: MoleculeInfoState, level: LearningLevel): InfoContent => moleculeInfo(state, state.molecule.meta, level);

/** No-break spaces (formulas, units) read as plain spaces in these checks. */
const flat = (text: string) => text.replace(/ /g, ' ');

function rendered(content: InfoContent, level: LearningLevel) {
    return render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level }));
}

/** What Info shows at `level`, outside the folded "How this was computed" (that is checked on its own). */
function shownAt(state: MoleculeInfoState, level: LearningLevel): string {
    const { container, unmount } = rendered(infoOf(state, level), level);
    container.querySelector('.info-computed')?.remove();
    const text = container.textContent ?? '';
    unmount();
    return flat(text);
}

function computedText(content: InfoContent): string {
    const { container, unmount } = render(React.createElement('div', null, content.computed));
    const text = container.textContent ?? '';
    unmount();
    return flat(text);
}

const count = (text: string, pattern: RegExp) => (text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)) ?? []).length;

/** What the 6B-1 worker records for a single point on a PubChem conformer (provenance_panel.test.tsx's own). */
const KEY = jobFixture('get_done').key;
const PROVENANCE: MoleculeProvenance = {
    jobKey: KEY, computeVersion: 1, recipe: 'single',
    geometrySource: { kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' },
    caveats: ["The geometry is not optimised: it is PubChem's computed 3D conformer or as pasted."],
    generatorCommit: 'abc1234def567', imageDigest: 'local', pyscfVersion: '2.8.0', sizingVersion: 1, size: 'S',
    capacity: 'local', wallSeconds: 70.2, costUsd: null,
};
const computedWater = () => waterMeta({
    id: KEY, tier: 'computed', provenance: PROVENANCE, references: [], geometrySource: 'PubChem CID 962 (not optimised)',
});

describe('moleculeInfo (Task 7b)', () => {
    afterEach(() => resetBuildEnv());

    it('titles water by moleculeTitle and the surface, and says plainly what the density shows', () => {
        const state = moleculeState();
        const content = infoOf(state, 'basics');
        const { container, unmount } = rendered(content, 'basics');
        expect(container.querySelector('.info-title')).toHaveTextContent('Water (H₂O) — electron density');
        unmount();
        expect(shownAt(state, 'basics')).toContain('Water has 10 electrons; the surface shows where they are likely to be found, all orbitals together.');
    });

    it('gives the formula, the typed point group, the electrons and the dipole at every level, the gap from Explore, eV first', () => {
        const state = moleculeState();
        const basics = shownAt(state, 'basics');
        expect(basics).toContain('FormulaH₂O');
        expect(basics).toContain('Electrons10');
        // Computed against experiment, both in debye, with the measurement's source.
        expect(basics).toContain('Dipole μ1.86 D computed · 1.855 D experiment (CRC Handbook, via CCCBDB)');
        expect(basics).not.toMatch(/gap/);
        expect(basics).not.toMatch(/eV|Ha\b/);
        const explore = shownAt(state, 'explore');
        expect(explore).toContain('HOMO–LUMO gap8.71 eV (0.320 Ha)');
        // The point group is typeset: everything past its first letter in a real <sub>.
        const { container, unmount } = rendered(infoOf(state, 'explore'), 'explore');
        const pointGroup = [...container.querySelectorAll('.info-fact')].find(row => row.textContent?.startsWith('Point group'))!;
        expect(pointGroup.querySelector('sub')).toHaveTextContent('2v');
        unmount();
    });

    it('opens "How this was computed" at Research with the method and the references list', () => {
        const state = moleculeState();
        const { container, unmount } = rendered(infoOf(state, 'research'), 'research');
        const computed = container.querySelector('details.info-computed') as HTMLDetailsElement;
        expect(computed.open).toBe(true);
        expect(computed).toHaveTextContent('Method: B3LYP/def2-TZVP, PySCF 2.6.0.');
        const references = computed.querySelector('ul') as HTMLElement;
        expect(references.querySelectorAll('li')).toHaveLength(1);
        expect(references).toHaveTextContent('dipole: 1.855 D — CRC Handbook, via CCCBDB');
        expect(computed).toHaveTextContent('Generated by tools/molecules/build_library.py at commit abc1234.');
        unmount();
        // Folded below Research.
        const folded = rendered(infoOf(state, 'advanced'), 'advanced');
        expect((folded.container.querySelector('details.info-computed') as HTMLDetailsElement).open).toBe(false);
        folded.unmount();
    });

    it('typesets a reference quantity such as R_e, and an angle in degrees', () => {
        const meta = waterMeta({ references: [
            { quantity: 'R_e', value: 1.098, unit: 'Å', source: 'Huber & Herzberg' },
            { quantity: 'angle', value: 104.5, unit: 'deg', source: 'experiment (CCCBDB)', tolerance: 1 }] });
        const { container, unmount } = render(React.createElement('div', null, infoOf(moleculeState(meta), 'research').computed));
        const items = [...container.querySelectorAll('li')];
        expect(flat(items[0].textContent ?? '')).toBe('Re: 1.098 Å — Huber & Herzberg');
        expect(items[0].querySelector('sub')).toHaveTextContent('e');
        expect(items[1]).toHaveTextContent('angle: 104.5° — experiment (CCCBDB)');
        unmount();
    });

    it('leaves the geometry source to the Properties row: Info does not repeat it', () => {
        const state = moleculeState();
        const { container, unmount } = rendered(infoOf(state, 'research'), 'research');
        expect(container.textContent).not.toContain('experiment (CCCBDB)');
        unmount();
    });

    it('states the Kohn–Sham caveat once, from Explore, with the energies it qualifies', () => {
        const state = moleculeState(waterMeta(), store => store.dispatch(setSurface({ kind: 'mo', index: 4 })));
        const { container, unmount } = rendered(infoOf(state, 'research'), 'research');
        const text = flat(container.textContent ?? '');
        unmount();
        expect(count(text, /ionisation energ/i)).toBe(1);
        expect(count(text, /neither the optical gap/)).toBe(1);
        expect(text).toContain('Orbital energies here are Kohn–Sham eigenvalues, not ionisation energies. '
            + 'The HOMO–LUMO gap is a Kohn–Sham orbital gap — neither the optical gap (absorption) nor the fundamental gap (IP − EA).');
        expect(shownAt(state, 'basics')).not.toMatch(/Kohn–Sham|ionisation/);
    });

    // The lead says what is drawn and the facts follow it at once; the caveats and view notes come after the facts
    // (InfoContent.notes), so the numbers stay above Info's fold (the live Explore shot had them pushed below it).
    it('puts the facts straight after the lead, and the Kohn–Sham caveat and view notes after the facts', () => {
        const state = moleculeState(waterMeta(), store => store.dispatch(setSurface({ kind: 'mo', index: 4 })));
        const { container, unmount } = rendered(infoOf(state, 'explore'), 'explore');
        const [lead, notes] = [...container.querySelectorAll('.info-body > p.info-text')] as HTMLElement[];
        const facts = container.querySelector('.info-facts') as HTMLElement;
        expect(lead.textContent).toMatch(/^1b1 is one of H₂O's molecular orbitals\./);
        expect(lead.textContent).not.toMatch(/Kohn–Sham|Sticks/);
        expect(lead.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(facts.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(notes.textContent).toMatch(/^Orbital energies here are Kohn–Sham eigenvalues/);
        expect(notes.textContent).toContain('Sticks show connectivity, not bond order.');
        unmount();
    });

    it('says what an orbital is, its energy eV first from Explore, and its enclosed fraction and iso value from Advanced', () => {
        const state = moleculeState(waterMeta(), store => {
            store.dispatch(setSurface({ kind: 'mo', index: 4 }));
            store.dispatch(renderFinished({ isoLevel: 0.0005 }));
        });
        const { container, unmount } = rendered(infoOf(state, 'basics'), 'basics');
        expect(container.querySelector('.info-title')).toHaveTextContent('Water (H₂O) — 1b1 orbital');
        unmount();
        const basics = shownAt(state, 'basics');
        expect(basics).toContain('1b1 is one of H₂O\'s molecular orbitals. It holds 2 electrons. It is the HOMO: the highest level that holds electrons.');
        expect(basics).not.toContain('Orbital energy');
        expect(shownAt(state, 'explore')).toContain('Orbital energy−8.44 eV (−0.310 Ha)');
        expect(shownAt(state, 'explore')).not.toContain('Iso value');
        const advanced = shownAt(state, 'advanced');
        expect(advanced).toContain("Enclosed90 % of the orbital's |ψ|²");
        expect(advanced).toContain('Iso value|ψ|² = 5.00 × 10⁻⁴ a₀⁻³');
    });

    it('gives no iso value while the next surface is still computing', () => {
        const state = moleculeState(waterMeta(), store => {
            store.dispatch(renderFinished({ isoLevel: 0.00234 }));
            store.dispatch(setSurface({ kind: 'mo', index: 4 }));
            store.dispatch(renderStarted('Computing 1b1…'));
        });
        expect(shownAt(state, 'research')).not.toContain('Iso value');
        const density = moleculeState(waterMeta(), store => store.dispatch(renderFinished({ isoLevel: 0.00234 })));
        expect(shownAt(density, 'advanced')).toContain('Iso valueρ = 2.34 × 10⁻³ e/a₀³');
        expect(shownAt(density, 'advanced')).toContain('Enclosed90 % of the electron density');
    });

    it('explains the ESP map: red electron-rich, blue electron-poor, on a fixed ρ surface, not an enclosed fraction', () => {
        const state = moleculeState(waterMeta(), store => {
            store.dispatch(setSurface({ kind: 'esp' }));
            store.dispatch(renderFinished({ isoLevel: 0.001, espRange: [-0.061, 0.071] }));
        });
        const basics = shownAt(state, 'basics');
        expect(basics).toContain('red where it is negative (electron-rich), blue where it is positive (electron-poor)');
        expect(basics).toContain('±0.05 Ha/e (±31 kcal/mol)');
        expect(basics).not.toContain('Enclosed');
        const explore = shownAt(state, 'explore');
        expect(explore).toContain('Potential range−0.061 to +0.071 Ha/e');
        expect(explore).toContain('beyond the scale');
        const advanced = shownAt(state, 'advanced');
        expect(advanced).toContain('ρ = 0.001 e/a₀³');
        expect(advanced).toContain('not at an enclosed fraction, so Electron enclosed does not apply to it');
        expect(advanced).not.toContain('Iso value');
        expect(advanced).not.toMatch(/Enclosed\d/);
    });

    it('keeps ozone\'s caveat beside its dipole (T7-O3)', () => {
        const caveat = 'Ozone has strong multireference character.';
        const state = moleculeState(waterMeta({ id: 'o3', name: 'Ozone', formula: 'O3', caveat }));
        expect(shownAt(state, 'basics')).toContain(`Dipole μ1.86 D computed · 1.855 D experiment (CRC Handbook, via CCCBDB) — ${caveat}`);
    });

    it('says the arrow\'s sign convention while the arrow is drawn, at every level (ruling T2-I2)', () => {
        const convention = 'The arrow points from − to + (the physics convention), 1 a₀ per debye; many chemistry texts draw it the other way.';
        expect(shownAt(moleculeState(), 'basics')).toContain(convention);
        expect(shownAt(moleculeState(waterMeta(), store => store.dispatch(setShowDipole(false))), 'research')).not.toContain(convention);
    });

    it('says a symmetric molecule\'s dipole is zero by symmetry', () => {
        const methane = waterMeta({ id: 'ch4', name: 'Methane', formula: 'CH4', dipoleVectorDebye: [0.0004, 0, 0],
            references: [{ quantity: 'dipole', value: 0, unit: 'D', source: 'zero by symmetry', tolerance: 0.01 }] });
        expect(shownAt(moleculeState(methane), 'basics')).toContain('Dipole μ0 D by symmetry (computed 0.00 D)');
    });

    it('says what the structure shows, and what the structure options cannot do', () => {
        expect(shownAt(moleculeState(), 'basics')).toContain('Sticks show connectivity, not bond order.');
        const space = moleculeState(waterMeta(), store => store.dispatch(setRepresentation('space-filling')));
        const text = shownAt({ ...space, moleculeLabels: true }, 'explore');
        expect(text).toContain('The spheres are van der Waals spheres (Bondi 1964 / Mantina 2009).');
        expect(text).toContain('The spheres can hide the surface inside them.');
        expect(text).toContain('Space filling draws no bonds, so only angles are labelled.');
        expect(text).not.toContain('Sticks');
        const none = moleculeState(waterMeta(), store => store.dispatch(setRepresentation('none')));
        expect(shownAt(none, 'explore')).toContain('No structure is drawn, so there is nothing to label.');
        // The bond-label switch is Explore's: at Basics there is nothing to say about it.
        expect(shownAt(none, 'basics')).not.toContain('nothing to label');
        const iron = waterMeta({ name: 'Iron dihydride', formula: 'FeH2', atoms: waterMeta().atoms.map((a, i) => (i === 0 ? { ...a, Z: 26 } : a)) });
        expect(shownAt(moleculeState(iron), 'explore'))
            .toContain('Space filling is unavailable: no van der Waals radius tabulated for Fe (Bondi 1964 / Mantina 2009)');
    });

    it('says what a cut removes', () => {
        const state = moleculeState(waterMeta(), store => store.dispatch(setSurfaceStyle({ clipAxis: 'y' })));
        expect(shownAt(state, 'basics')).toContain('The cut removes the part on the +y side of a plane perpendicular to the y axis.');
    });

    it('keys the list\'s marks and explains the labels and the virtuals, once each, while the list is shown', () => {
        const orbitals = [
            { index: 0, label: '1πg', energyHartree: -0.30, occupation: 2, role: 'HOMO' },
            { index: 1, label: '5σg', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.4, class: 'diffuse' },
            { index: 2, label: '2πu', energyHartree: 0.20, occupation: 0, role: 'LVMO', valenceCharacter: 0.97, class: 'valence' },
            { index: 3, label: 'a1', energyHartree: 0.31, occupation: 0, valenceCharacter: 0.2, class: 'diffuse' },
        ];
        const symmetry = { pointGroup: 'Dooh', labelGroup: 'Dooh', labels: 'full-group' as const };
        const meta = waterMeta({ orbitals, symmetry });
        const state = moleculeState(meta, store => store.dispatch(setSurface({ kind: 'mo', index: 1 })));
        const explore = shownAt(state, 'explore');
        expect(explore).toContain('5σg is partly diffuse (40 % valence): its shape depends on the basis.');
        expect(explore).toContain('◌ marks a partly diffuse virtual (under 75 % valence): its shape depends on the basis.');
        const advanced = shownAt(state, 'advanced');
        expect(advanced).toContain(labelsSentence(symmetry));
        expect(advanced).toContain('Those at positive energy are unbound, basis-set dependent states, not bound orbitals.');
        expect(advanced).toContain(`LVMO: ${LVMO_NOTE}.`);
        // Not while the density is drawn: the list is not on screen.
        expect(shownAt(moleculeState(meta), 'advanced')).not.toContain('Labels:');
        // Two gaps, one caveat sentence for both.
        expect(shownAt(state, 'explore')).toContain('The HOMO–LUMO and HOMO–LVMO gaps are Kohn–Sham orbital gaps — neither the optical gap');
        // No "_" outside the file names of "How this was computed", and the g/u of σ and π are real subscripts.
        expect(shownAt(state, 'research')).not.toContain('_');
        const { container, unmount } = rendered(infoOf(state, 'research'), 'research');
        expect(container.querySelector('.info-title sub')).toHaveTextContent('g');
        unmount();
    });

    describe('an on-demand computed molecule', () => {
        it('states its provenance, and says what it lacks: no reference values, no measured dipole', () => {
            const state = moleculeState(computedWater());
            expect(shownAt(state, 'basics')).toContain('Dipole μ1.86 D computed · no measured value listed');
            const content = infoOf(state, 'research');
            const computed = computedText(content);
            expect(computed).toContain('Method: B3LYP/def2-TZVP, PySCF 2.8.0.');
            expect(computed).toContain('its computed 3D conformer, retrieved 2026-10-10, not optimised.');
            expect(computed).toContain(PROVENANCE.caveats[0]);
            expect(computed).toContain('No reference values are listed for this molecule, so nothing here is checked against experiment.');
            const { container, unmount } = render(React.createElement('div', null, content.computed));
            for (const name of ['input.py', 'output.log', 'geometry.xyz', 'job.json']) {
                expect([...container.querySelectorAll('a')].find(a => a.textContent === name)).toHaveAttribute('href', `/molecules/jobs/${KEY}/${name}`);
            }
            unmount();
            expect(computed).not.toMatch(/Owner only|Cost:/);
        });

        // App selects the owner's record (ownerJobRecordOf) and passes it in; for anyone else it is absent.
        it('gives the owner its time and cost', () => {
            BUILD_ENV.dev = true;
            const state = moleculeState(computedWater(), store => store.dispatch(jobUpdated(jobFixture('get_done'), 'local')));
            const owned = { ...state, ...ownerJobRecordOf(state) };
            expect(owned.ownerJob).not.toBeNull();
            expect(computedText(infoOf(owned, 'research'))).toMatch(/Owner only: 1 min 10 s of wall time.*Cost: spent \$0\.00 \(This Mac\)\./);
            expect(computedText(infoOf(state, 'research'))).not.toMatch(/Owner only/);
        });
    });

    it('says a molecule is loading, before its meta lands', () => {
        const store = makeStore();
        store.dispatch(setMode('molecule'));
        store.dispatch(selectMolecule({ id: 'h2o' }));
        const content = moleculeInfo(store.getState(), null, 'explore');
        const { container, unmount } = rendered(content, 'explore');
        expect(container).toHaveTextContent('Loading the molecule…');
        expect(container.querySelector('details.info-computed')).toBeNull();
        unmount();
    });
});
