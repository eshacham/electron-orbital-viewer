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
import { validatedLine } from '../../src/validation/geometry_honesty';
import { resetBuildEnv } from '../jobs/build_env_stub';
import { waterMeta } from '../molecules/fixtures';
import { jobFixture } from '../jobs/api_fixtures';
import { seenText } from '../seen_text';

/** Molecules mode with `meta` loaded (water by default), then whatever `steps` dispatch. */
function moleculeState(meta: LibraryMoleculeMeta = waterMeta(), ...steps: Array<(store: ReturnType<typeof makeStore>) => void>) {
    const store = makeStore();
    store.dispatch(setMode('molecule'));
    store.dispatch(selectMolecule({ id: meta.id }));
    store.dispatch(metaLoaded({ id: meta.id, meta }));
    steps.forEach(step => step(store));
    return store.getState();
}

// Final review M9: MoleculeInfoState's slice no longer carries the meta (a parameter of its own), so these helpers take
// the builder's state with the meta beside it, as the full store state has it.
type InfoState = MoleculeInfoState & { molecule: { meta: LibraryMoleculeMeta | null } };
const infoOf = (state: InfoState, level: LearningLevel): InfoContent => moleculeInfo(state, state.molecule.meta, level);

/** No-break spaces (formulas, units) read as plain spaces in these checks. */
const flat = (text: string) => text.replace(/ /g, ' ');

function rendered(content: InfoContent, level: LearningLevel) {
    return render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level }));
}

/** What Info shows at `level`, outside the folded "How this was computed" (that is checked on its own). */
function shownAt(state: InfoState, level: LearningLevel): string {
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
/** Real water's references, as the shipped library data has them (tests/fixtures/molecules/h2o/meta.json). */
const REAL_WATER_REFERENCES = [
    { quantity: 'bond', value: 0.958, unit: 'Å', source: 'experiment (CCCBDB)', tolerance: 0.01, atoms: [0, 1], label: 'O–H' },
    { quantity: 'angle', value: 104.5, unit: 'deg', source: 'experiment (CCCBDB)', tolerance: 1.0, atoms: [1, 0, 2], label: 'H–O–H' },
    { quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 },
];
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
        // Task 9b (finish review, fix 5): the lead keeps to three lines; "all its occupied orbitals together" is technical
        // (the sum of |ψ|² over the occupied orbitals; Task 9b review I3).
        expect(shownAt(state, 'basics')).toContain('Water has 10 electrons; the surface shows where they are likely to be found.');
    });

    // Fix round 1 (ruling on concern 4): Info is each number's one home; no Formula fact, the title has it.
    it('gives the electrons and the dipole at every level, the gap from Explore, eV first, the typed point group -- no Formula fact', () => {
        const state = moleculeState();
        const basics = shownAt(state, 'basics');
        expect(basics).not.toContain('Formula');
        expect(basics).toContain('Electrons10');
        // Task 9b (fix 1): below Research the dipole is its value with units; computed against experiment, with the
        // measurement's source, is Research's (checked in 'the level bands (Task 9b)').
        expect(basics).toContain('Dipole μ1.86 D');
        expect(basics).not.toMatch(/gap/);
        expect(basics).not.toMatch(/eV|Ha\b/);
        const explore = shownAt(state, 'explore');
        expect(explore).toContain('HOMO–LUMO gap8.71 eV (0.320 Ha)');
        // The point group is typeset: everything past its first letter in a real <sub>. Task 9b (fix 1): it shows from
        // Advanced, a scientific term with its (i).
        const { container, unmount } = rendered(infoOf(state, 'advanced'), 'advanced');
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

    // Fix round 1 (I1): with an optimised geometry, an angle is a test and keeps its own source; R_e is typeset.
    it('typesets a reference quantity such as R_e, and an angle in degrees', () => {
        const meta = waterMeta({ geometrySource: 'B3LYP-D3(BJ)/def2-TZVP optimised (PySCF + geomeTRIC)', references: [
            { quantity: 'R_e', value: 1.098, unit: 'Å', source: 'Huber & Herzberg' },
            { quantity: 'angle', value: 104.5, unit: 'deg', source: 'experiment (CCCBDB)', tolerance: 1 }] });
        const { container, unmount } = render(React.createElement('div', null, infoOf(moleculeState(meta), 'research').computed));
        const items = [...container.querySelectorAll('li')];
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        expect(flat(seenText(items[0]))).toBe('Re: 1.098 Å — Huber & Herzberg');
        expect(items[0].querySelector('sub')).toHaveTextContent('e');
        expect(items[1]).toHaveTextContent('angle: 104.5° — experiment (CCCBDB)');
        unmount();
    });

    // Fix round 1 (I1): real water's references (tests/fixtures/molecules/h2o/meta.json). Its geometry is experiment's,
    // so its own bond and angle are one item that names neither the source nor "geometry from experiment" again -- the
    // Properties row and the tier line say those; the dipole keeps its source.
    it('gathers an experimental geometry\'s own bond and angle into one item, with no source', () => {
        const state = moleculeState(waterMeta({ references: REAL_WATER_REFERENCES }));
        const computed = computedText(infoOf(state, 'research'));
        expect(computed).toContain('Checked against published values:');
        // Fix round 2 (N4): each named by the data's own label.
        expect(computed).toContain('O–H 0.958 Å, H–O–H 104.5°: the experimental geometry itself, so no test of the method');
        expect(computed).toContain('dipole: 1.855 D — CRC Handbook, via CCCBDB');
        expect(computed).not.toContain('experiment (CCCBDB)');
        expect(computed).not.toContain('geometry from experiment');
    });

    // Fix round 1 (I2): the header follows the tier line's own rule (geometry_honesty countsAsCheck). Ethane's own data
    // (tests/fixtures/molecules/c2h6/meta.json): an experimental geometry and a dipole zero by symmetry -- nothing counts,
    // as its tier line says ("no property checked against experiment yet").
    it('heads a list in which nothing tests the method as such (ethane)', () => {
        const ethane = waterMeta({ id: 'c2h6', name: 'Ethane', formula: 'C2H6', dipoleVectorDebye: [0, 0, 0], references: [
            { quantity: 'bond', value: 1.535, unit: 'Å', source: 'experiment (CCCBDB)', tolerance: 0.01, atoms: [0, 1], label: 'C–C' },
            { quantity: 'bond', value: 1.094, unit: 'Å', source: 'experiment (CCCBDB)', tolerance: 0.01, atoms: [0, 2], label: 'C–H' },
            { quantity: 'angle', value: 111.2, unit: 'deg', source: 'experiment (CCCBDB)', tolerance: 1, atoms: [2, 0, 1], label: 'H–C–C' },
            { quantity: 'dipole', value: 0, unit: 'D', source: 'zero by symmetry', tolerance: 0.01 }] });
        expect(validatedLine(ethane)).toBe('Curated; geometry from experiment; no property checked against experiment yet.');
        const computed = computedText(infoOf(moleculeState(ethane), 'research'));
        expect(computed).toContain('Reference values (none of them tests the method yet):');
        expect(computed).not.toContain('Checked against');
        // Fix round 2 (N4): which bond is which, by the data's own labels.
        expect(computed).toContain('C–C 1.535 Å, C–H 1.094 Å, H–C–C 111.2°: the experimental geometry itself, so no test of the method');
        expect(computed).toContain('dipole: 0 D — zero by symmetry');
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
        // Task 9b (fix 5): the caveat is one sentence now, its two clauses joined.
        // Task 9b review M1: "These" -- the caveat is about these numbers, not every orbital energy.
        expect(text).toContain('These orbital energies are Kohn–Sham eigenvalues, not ionisation energies, '
            + 'and the HOMO–LUMO gap is a Kohn–Sham orbital gap — neither the optical gap (absorption) nor the fundamental gap (IP − EA).');
        expect(shownAt(state, 'basics')).not.toMatch(/Kohn–Sham|ionisation/);
    });

    // The lead says what is drawn and the facts follow it at once; the caveats and view notes come after the facts
    // (InfoContent.notes), so the numbers stay above Info's fold (the live Explore shot had them pushed below it).
    it('puts the facts straight after the lead, and the Kohn–Sham caveat and view notes after the facts', () => {
        const state = moleculeState(waterMeta(), store => store.dispatch(setSurface({ kind: 'mo', index: 4 })));
        const { container, unmount } = rendered(infoOf(state, 'explore'), 'explore');
        const [lead, ...notes] = [...container.querySelectorAll('.info-body > p.info-text')] as HTMLElement[];
        const facts = container.querySelector('.info-facts') as HTMLElement;
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        expect(seenText(lead)).toMatch(/^1b1 is one of H₂O's molecular orbitals\./);
        expect(lead.textContent).not.toMatch(/Kohn–Sham|Sticks/);
        expect(lead.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(facts.compareDocumentPosition(notes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // Fix round 1 (I6): one idea a paragraph -- the caveat, what the sticks show, the arrow's convention.
        // Task 9b: the caveat's first words lost "here" in its merge into one sentence, and the orbital's electrons and
        // role, out of the lead, come first.
        expect(notes.map(note => note.textContent?.slice(0, 24))).toEqual([
            // Task 9b review M1: the caveat opens "These orbital energies".
            'It holds 2 electrons. It', 'These orbital energies a', 'Sticks show connectivity', 'The arrow points from − ']);
        unmount();
    });

    it('says what an orbital is, its energy eV first from Explore, and its enclosed fraction and iso value from Advanced', () => {
        const state = moleculeState(waterMeta(), store => {
            store.dispatch(setSurface({ kind: 'mo', index: 4 }));
            store.dispatch(renderFinished({ isoLevel: 0.0005 }));
        });
        const { container, unmount } = rendered(infoOf(state, 'basics'), 'basics');
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(container.querySelector('.info-title')).toHaveSeenText('Water (H₂O) — 1b1 orbital');
        unmount();
        const basics = shownAt(state, 'basics');
        // Fix round 1 (I3): "orbital", as the homoLumo glossary says. Task 9b (fix 5): the lead says what it is; its electrons
        // and role are the first note, after the facts.
        expect(basics).toContain('1b1 is one of H₂O\'s molecular orbitals.');
        expect(basics).toContain('It holds 2 electrons. It is the HOMO: the highest orbital that holds electrons.');
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
        // Task 9b (fix 5): the lead keeps to three lines -- the colours' meaning; the shared scale is technical.
        expect(basics).toContain('Red where the potential is negative (electron-rich), blue where it is positive (electron-poor).');
        expect(shownAt(state, 'advanced')).toContain('±0.05 Ha/e (±31 kcal/mol)');
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
        expect(shownAt(state, 'research')).toContain(`Dipole μ1.86 D computed · 1.855 D experiment (CRC Handbook, via CCCBDB) — ${caveat}`);
        // Task 9b (fix 1): below Research the value stands alone with its units -- the caveat still beside it.
        expect(shownAt(state, 'basics')).toContain(`Dipole μ1.86 D — ${caveat}`);
    });

    // Task 9b (fix 1) narrows ruling T2-I2: from Explore, where the arrow's switch is (never below it, where the pointer
    // says the dipole arrow appears at Explore).
    it('says the arrow\'s sign convention while the arrow is drawn, from Explore (ruling T2-I2, Task 9b)', () => {
        const convention = 'The arrow points from − to + (the physics convention), 1 a₀ per debye; many chemistry texts draw it the other way.';
        expect(shownAt(moleculeState(), 'explore')).toContain(convention);
        expect(shownAt(moleculeState(waterMeta(), store => store.dispatch(setShowDipole(false))), 'research')).not.toContain(convention);
    });

    it('says a symmetric molecule\'s dipole is zero by symmetry', () => {
        const methane = waterMeta({ id: 'ch4', name: 'Methane', formula: 'CH4', dipoleVectorDebye: [0.0004, 0, 0],
            references: [{ quantity: 'dipole', value: 0, unit: 'D', source: 'zero by symmetry', tolerance: 0.01 }] });
        expect(shownAt(moleculeState(methane), 'research')).toContain('Dipole μ0 D by symmetry (computed 0.00 D)');
        // Task 9b (fix 1): below Research, the value alone -- cut from the same line.
        expect(shownAt(moleculeState(methane), 'basics')).toContain('Dipole μ0 D by symmetry');
        expect(shownAt(moleculeState(methane), 'basics')).not.toContain('computed');
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
        // Fix round 1 (M2): the key says only what a mark means; "its shape depends on the basis" is the lead's, once.
        expect(explore).toContain('◌ marks a partly diffuse virtual (under 75 % valence).');
        expect(explore.match(/its shape depends on the basis/g)).toHaveLength(1);
        const advanced = shownAt(state, 'advanced');
        expect(advanced).toContain(labelsSentence(symmetry));
        // Fix round 1 (M3): the labels sentence's point group is typed, as the fact beside it.
        expect(advanced).toContain('irreducible representations of D∞h');
        // Fix round 1 (M1): its own subject, now that the diffuse key it followed is a note.
        expect(advanced).toContain('Diffuse virtuals at positive energy are unbound, basis-set dependent states, not bound orbitals.');
        expect(advanced).toContain(`LVMO: ${LVMO_NOTE}.`);
        expect(advanced.match(/its shape depends on the basis/g)).toHaveLength(1);
        // Not while the density is drawn: the list is not on screen.
        expect(shownAt(moleculeState(meta), 'advanced')).not.toContain('Labels:');
        // Two gaps, one caveat sentence for both (Task 9b: one sentence with the energies' clause too).
        expect(shownAt(state, 'explore')).toContain('and the HOMO–LUMO and HOMO–LVMO gaps are Kohn–Sham orbital gaps — neither the optical gap');
        // No "_" outside the file names of "How this was computed", and the g/u of σ and π are real subscripts.
        expect(shownAt(state, 'research')).not.toContain('_');
        const { container, unmount } = rendered(infoOf(state, 'research'), 'research');
        expect(container.querySelector('.info-title sub')).toHaveTextContent('g');
        unmount();
    });

    // Fix round 1 (M2): what the lead says of the drawn orbital (the LVMO, constructed) is not said again in technical.
    // Task 9b (fix 5): said in the lead and the first note after the facts, which the lead now hands it to.
    it('says a constructed LVMO\'s note once, in the lead and its first note, when it is drawn', () => {
        const orbitals = [
            { index: 0, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
            { index: 1, label: '4a1', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.55, class: 'diffuse' },
            { index: 2, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', valenceCharacter: 1, class: 'valence',
                kind: 'valence-virtual', constructed: true, energyApproximate: true },
        ];
        const state = moleculeState(waterMeta({ orbitals, symmetry: { pointGroup: 'C2v', labelGroup: 'C2v', labels: 'full-group' } }),
            store => store.dispatch(setSurface({ kind: 'mo', index: 2 })));
        const research = shownAt(state, 'research');
        expect(research.match(/constructed from the valence part of the virtual space/g)).toHaveLength(1);
        expect(research.match(/the lowest empty valence orbital/g)).toHaveLength(1);
        expect(research).toContain('◇ marks a constructed LVMO, not an orbital of this calculation.');
        // Its energy: eV first, an upper estimate (orbital_display's orbitalEnergyWithEstimate, M8).
        expect(research).toContain('Orbital energy5.17 eV (0.190 Ha), upper estimate');
    });

    // S4: Info's "one of N" follows the same groups as the orbital list: a label's set is "degenerate orbitals", an
    // unlabelled set is still "with the same energy", and a near-tie across two labels is no set at all.
    describe('"one of N" follows the symmetry groups', () => {
        const lead = (orbitals: unknown[], index: number) => flat(shownAt(
            moleculeState(waterMeta({ orbitals }), store => store.dispatch(setSurface({ kind: 'mo', index }))), 'basics'));
        const orbitals = [
            { index: 0, label: '1b2', energyHartree: -19.24555, occupation: 2 },
            { index: 1, label: '1a1', energyHartree: -19.24553, occupation: 2 },
            { index: 2, label: '1e', energyHartree: -0.5, occupation: 2 },
            { index: 3, label: '1e', energyHartree: -0.5, occupation: 2, role: 'HOMO' },
            { index: 4, label: '?', energyHartree: 0.1, occupation: 0, role: 'LUMO' },
            { index: 5, label: '?', energyHartree: 0.1 + 1e-5, occupation: 0 },
        ];
        it('says "degenerate orbitals" for a labelled pair', () => {
            expect(lead(orbitals, 2)).toContain('1e is one of H₂O\'s molecular orbitals, one of 2 degenerate orbitals.');
        });
        it('names no set for two labels that tie in energy', () => {
            expect(lead(orbitals, 0)).toContain('1b2 is one of H₂O\'s molecular orbitals.');
            expect(lead(orbitals, 0)).not.toContain('one of 2');
        });
        it('keeps "with the same energy" for an unlabelled pair, grouped by its energy', () => {
            expect(lead(orbitals, 4)).toContain('one of 2 with the same energy');
        });
    });

    // Fix round 1 (I3): real NO₂ (tests/fixtures/molecules/no2/meta.json) -- its SOMO 6a1 (−0.230 Ha) lies above its
    // doubly occupied HOMO 4b2 (−0.377 Ha), so the HOMO is not "the highest that holds electrons".
    describe('an open shell whose SOMO lies above its HOMO (NO₂)', () => {
        const no2 = waterMeta({ id: 'no2', name: 'Nitrogen dioxide', formula: 'NO2', multiplicity: 2, orbitals: [
            { index: 10, label: '4b2', energyHartree: -0.376611437839857, occupation: 2, role: 'HOMO' },
            { index: 11, label: '6a1', energyHartree: -0.22981787731206157, occupation: 1, role: 'SOMO' },
            { index: 12, label: '2b1', energyHartree: -0.0937485104125987, occupation: 0, role: 'LUMO' },
        ] });
        it('calls the HOMO the highest doubly occupied orbital, below the SOMO', () => {
            const state = moleculeState(no2, store => store.dispatch(setSurface({ kind: 'mo', index: 10 })));
            // Task 9b (fix 5): the lead, then (after the facts) its electrons and role.
            expect(shownAt(state, 'basics')).toContain('4b2 is one of NO₂\'s molecular orbitals.');
            expect(shownAt(state, 'basics')).toContain('It holds 2 electrons. '
                + 'It is the HOMO: the highest doubly occupied orbital; the singly occupied SOMO lies above it.');
        });
        it('says the SOMO\'s one electron once, as its role', () => {
            const state = moleculeState(no2, store => store.dispatch(setSurface({ kind: 'mo', index: 11 })));
            const basics = shownAt(state, 'basics');
            // Task 9b (fix 5): the role is the first note now, after the facts.
            expect(basics).toContain('6a1 is one of NO₂\'s molecular orbitals.');
            expect(basics).toContain('It is a SOMO: a singly occupied orbital, the highest that holds electrons.');
            expect(basics).not.toContain('It holds 1 electron');
        });
        // Re-homed from properties_card.test.tsx (ruling on concern 4): an open shell's gap is named from its SOMO.
        it('names the gap from the SOMO', () => {
            expect(shownAt(moleculeState(no2), 'explore')).toContain('SOMO–LUMO gap3.70 eV (0.136 Ha)');
        });
    });

    // Fix round 2 (N1): an owner-computed triplet -- any multiplicity can be requested, and every singly occupied ROKS
    // orbital is marked SOMO -- with two non-degenerate SOMOs above its HOMO. The clauses follow the energies.
    describe('a triplet with two SOMOs above its HOMO (synthetic)', () => {
        const triplet = waterMeta({ id: 'trip', name: 'Triplet', formula: 'XY', multiplicity: 3, orbitals: [
            { index: 0, label: '1a', energyHartree: -0.50, occupation: 2, role: 'HOMO' },
            { index: 1, label: '2a', energyHartree: -0.30, occupation: 1, role: 'SOMO' },
            { index: 2, label: '3a', energyHartree: -0.25, occupation: 1, role: 'SOMO' },
            { index: 3, label: '4a', energyHartree: 0.05, occupation: 0, role: 'LUMO' },
        ] });
        const lead = (index: number) => shownAt(moleculeState(triplet, store => store.dispatch(setSurface({ kind: 'mo', index }))), 'basics');
        it('says how many SOMOs lie above the HOMO', () => {
            expect(lead(0)).toContain('It is the HOMO: the highest doubly occupied orbital; 2 singly occupied SOMOs lie above it.');
        });
        it('calls only the upper SOMO the highest that holds electrons', () => {
            expect(lead(1)).toContain('It is a SOMO: a singly occupied orbital.');
            expect(lead(1)).not.toContain('the highest that holds electrons');
            expect(lead(2)).toContain('It is a SOMO: a singly occupied orbital, the highest that holds electrons.');
        });
        // ROKS energies need not put a SOMO above the HOMO: then the HOMO is the highest, and says so.
        it('calls a HOMO above every SOMO the highest orbital that holds electrons', () => {
            const below = waterMeta({ ...triplet, orbitals: triplet.orbitals.map(o => (o.role === 'HOMO' ? { ...o, energyHartree: -0.20 } : o)) });
            const text = shownAt(moleculeState(below, store => store.dispatch(setSurface({ kind: 'mo', index: 0 }))), 'basics');
            expect(text).toContain('It is the HOMO: the highest orbital that holds electrons.');
            expect(text).not.toContain('SOMO');
        });
    });

    // Re-homed from properties_card.test.tsx (ruling on concern 4): the gaps' one home is Info.
    it('gives the HOMO–LVMO gap too where the LVMO is the calculation\'s own, and none to a constructed LVMO', () => {
        const own = waterMeta({ orbitals: [
            { index: 0, label: '1πg', energyHartree: -0.30, occupation: 2, role: 'HOMO' },
            { index: 1, label: '5σg', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.4, class: 'diffuse' },
            { index: 2, label: '2πu', energyHartree: 0.20, occupation: 0, role: 'LVMO', valenceCharacter: 0.97, class: 'valence' }] });
        const explore = shownAt(moleculeState(own), 'explore');
        expect(explore).toContain('HOMO–LUMO gap7.89 eV (0.290 Ha)');
        expect(explore).toContain('HOMO–LVMO gap13.61 eV (0.500 Ha)');
        const constructed = waterMeta({ orbitals: [...waterMeta().orbitals,
            { index: 6, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', kind: 'valence-virtual', constructed: true, energyApproximate: true }] });
        expect(shownAt(moleculeState(constructed), 'explore')).not.toContain('HOMO–LVMO');
        const occupiedOnly = waterMeta({ orbitals: waterMeta().orbitals.filter(o => o.occupation > 0) });
        expect(shownAt(moleculeState(occupiedOnly), 'research')).not.toMatch(/gap\d/);
    });

    // Fix round 1 (M7): re-homed from esp_legend.test.tsx -- a weakly polar molecule's map is not called saturated.
    it('does not call a weakly polar molecule\'s map saturated', () => {
        const state = moleculeState(waterMeta(), store => {
            store.dispatch(setSurface({ kind: 'esp' }));
            store.dispatch(renderFinished({ isoLevel: 0.001, espRange: [-0.02, 0.019] }));
        });
        const explore = shownAt(state, 'explore');
        expect(explore).toContain('Potential range−0.020 to +0.019 Ha/e');
        expect(explore).not.toContain('beyond the scale');
    });

    // Fix round 1 (ruling on concern 5): on a phone the tier chip is compact, so Info states the tier line -- its own
    // builder's words -- as its last note, at every level; App sets tierLineShown on phones only.
    it('states the tier line as the last note when asked (a phone), at every level, and not otherwise', () => {
        const state = { ...moleculeState(waterMeta({ references: REAL_WATER_REFERENCES })), tierLineShown: true };
        for (const level of ['basics', 'research'] as const) {
            const { container, unmount } = rendered(infoOf(state, level), level);
            const notes = [...container.querySelectorAll('.info-notes')];
            expect(notes[notes.length - 1]).toHaveTextContent('Library: Curated; geometry from experiment; dipole checked against published values.');
            unmount();
        }
        expect(shownAt({ ...state, tierLineShown: false }, 'research')).not.toContain('Curated;');
        const computed = { ...moleculeState(computedWater()), tierLineShown: true };
        // Fix round 2 (N2): the computed line already names the tier, so it stands alone -- never "Computed: Computed …".
        expect(shownAt(computed, 'basics')).toContain('Computed on request by the same method; not benchmarked against experiment.');
        expect(shownAt(computed, 'basics')).not.toContain('Computed: Computed');
    });

    describe('an on-demand computed molecule', () => {
        it('states its provenance, and says what it lacks: no reference values, no measured dipole', () => {
            const state = moleculeState(computedWater());
            // Task 9b (fix 1): what it lacks against experiment is Research's, with the references.
            expect(shownAt(state, 'research')).toContain('Dipole μ1.86 D computed · no measured value listed');
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

    // Task 9b (finish review, fix 1): the Basics band leaked a scientific term with its (i) and a reference.
    describe('the level bands (Task 9b)', () => {
        it('shows the point group, a scientific term with an (i), from Advanced only', () => {
            const state = moleculeState();
            expect(shownAt(state, 'basics')).not.toContain('Point group');
            expect(shownAt(state, 'explore')).not.toContain('Point group');
            expect(shownAt(state, 'advanced')).toContain('Point group');
        });

        // Task 9c ruling: the experiment is a key validity number, shown from Advanced; its reference is Research's (the
        // level table puts references at Research).
        it('gives the dipole as its value with units below Advanced, the experiment from Advanced, and its reference at Research', () => {
            const state = moleculeState();
            for (const level of ['basics', 'explore'] as const) {
                const shown = shownAt(state, level);
                expect(shown).toContain('Dipole μ1.86 D');
                expect(shown).not.toMatch(/CRC Handbook|CCCBDB|experiment|computed/);
            }
            const advanced = shownAt(state, 'advanced');
            expect(advanced).toContain('Dipole μ1.86 D computed · 1.855 D experiment');
            expect(advanced).not.toMatch(/CRC Handbook|CCCBDB/);
            expect(shownAt(state, 'research')).toContain('Dipole μ1.86 D computed · 1.855 D experiment (CRC Handbook, via CCCBDB)');
        });

        // Task 9c ruling (flips 9b's "never below Explore"): the arrow is still drawn at Basics -- lowering the level never
        // changes what is drawn -- so Info says its convention whenever it is drawn; the panel's held-value note names it.
        it('says the arrow\'s convention whenever the arrow is drawn, at every level', () => {
            const convention = 'The arrow points from − to +';
            expect(shownAt(moleculeState(), 'basics')).toContain(convention);
            expect(shownAt(moleculeState(), 'explore')).toContain(convention);
            expect(shownAt(moleculeState(waterMeta(), store => store.dispatch(setShowDipole(false))), 'basics')).not.toContain(convention);
        });

        it('states the Kohn–Sham caveat as one sentence', () => {
            const state = moleculeState(waterMeta(), store => store.dispatch(setSurface({ kind: 'mo', index: 4 })));
            const { container, unmount } = rendered(infoOf(state, 'explore'), 'explore');
            const caveat = [...container.querySelectorAll('.info-notes')].map(note => flat(note.textContent ?? '')).find(text => /Kohn–Sham/.test(text))!;
            unmount();
            // Task 9b review M1: "These", so the claim stays about these numbers.
            expect(caveat).toBe('These orbital energies are Kohn–Sham eigenvalues, not ionisation energies, and the HOMO–LUMO gap is a '
                + 'Kohn–Sham orbital gap — neither the optical gap (absorption) nor the fundamental gap (IP − EA).');
            expect(caveat.match(/\. /g)).toBeNull();
        });

        it('keeps the ESP lead to what the colours mean; the shared scale is technical', () => {
            const state = moleculeState(waterMeta(), store => store.dispatch(setSurface({ kind: 'esp' })));
            const { container, unmount } = rendered(infoOf(state, 'explore'), 'explore');
            expect(flat(container.querySelector('.info-body > p.info-text')?.textContent ?? ''))
                .toBe('Red where the potential is negative (electron-rich), blue where it is positive (electron-poor).');
            unmount();
            expect(shownAt(state, 'explore')).not.toContain('same scale');
            expect(shownAt(state, 'advanced')).toContain('Every molecule is drawn on the same scale, ±0.05 Ha/e (±31 kcal/mol), so maps can be compared.');
        });

        // A strip tile at Basics (HOMO, LUMO, LVMO) opens an orbital whose lead ran to ten lines (a constructed LVMO). The
        // lead says what the orbital is; how full it is, its role and what its data flag follow the facts, first.
        it('keeps an orbital\'s lead to what it is; its electrons, role and flags are the first note', () => {
            const orbitals = [
                { index: 0, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
                { index: 1, label: '4a1', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.55, class: 'diffuse' },
                { index: 2, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', valenceCharacter: 1, class: 'valence',
                    kind: 'valence-virtual', constructed: true, energyApproximate: true },
            ];
            const meta = waterMeta({ orbitals, symmetry: { pointGroup: 'C2v', labelGroup: 'C2v', labels: 'full-group' } });
            const parts = (index: number) => {
                const state = moleculeState(meta, store => store.dispatch(setSurface({ kind: 'mo', index })));
                const { container, unmount } = rendered(infoOf(state, 'basics'), 'basics');
                // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
                const lead = flat(seenText(container.querySelector('.info-body > p.info-text')));
                const note = flat(seenText(container.querySelector('.info-notes')));
                unmount();
                return { lead, note };
            };
            expect(parts(0)).toEqual({ lead: '1b1 is one of H₂O\'s molecular orbitals.',
                note: 'It holds 2 electrons. It is the HOMO: the highest orbital that holds electrons.' });
            expect(parts(1).lead).toBe('4a1 is one of H₂O\'s molecular orbitals.');
            expect(parts(1).note).toMatch(/^It is empty\. It is the LUMO: the lowest empty orbital\. 4a1 is partly diffuse/);
            expect(parts(2).lead).toBe('a1 is not one of H₂O\'s computed orbitals.');
            expect(parts(2).note).toMatch(/^It is constructed from the valence part of the virtual space — not an orbital of this calculation; /);
        });

        it('keeps the density lead to what the surface shows; the occupied orbitals are the glossary\'s', () => {
            const state = moleculeState();
            const { container, unmount } = rendered(infoOf(state, 'explore'), 'explore');
            expect(flat(container.querySelector('.info-body > p.info-text')?.textContent ?? ''))
                .toBe('Water has 10 electrons; the surface shows where they are likely to be found.');
            unmount();
        });

        // Task 9b review I3: no (i) opens the density glossary entry, so the cut clause needs a home a reader can reach --
        // one technical sentence, the same in Bonds, beside the tiles of the orbitals it sums.
        it('says the density is all the occupied orbitals together, in the technical band', () => {
            const sentence = 'The density is all the occupied orbitals together: the sum of their |ψ|², each weighted by how many electrons it holds.';
            expect(shownAt(moleculeState(), 'explore')).not.toContain(sentence);
            expect(shownAt(moleculeState(), 'advanced')).toContain(sentence);
            expect(shownAt(moleculeState(waterMeta(), store => store.dispatch(setSurface({ kind: 'esp' }))), 'research')).not.toContain(sentence);
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
        // Task 9 fix round 1: until the meta lands, the title is the index name -- a stand-in Info does not announce,
        // so the molecule is said once, by its real title (the SR pass heard "Info: Water", then "Info: Water (H₂O) — …").
        expect(content.provisional).toBe(true);
        expect(moleculeInfo(moleculeState(), moleculeState().molecule.meta, 'explore').provisional).toBeFalsy();
    });
});
