// tests/info/bonds_info.test.ts -- Task 7a: Bonds' Info builder owns every sentence the Bonds panels used to print (the
// MO list's legend, the diagram's bond-order footer and α/β note, the density surface label, the Enclosed and Cut
// helpers, the Data tab's methods list and near-tie caveats, the potential curve's caption), written for the reader's
// level: plain words at Basics, E − E(atoms) and orbital energies (eV, then Ha) from Explore, the legend and the fixed-ρ
// note from Advanced, the absolute energy at Research, and every method under "How this was computed".
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render } from '@testing-library/react';
import { bondsInfo, FIXED_RHO_NOTE, MO_LEGEND, type BondsInfoState } from '../../src/info/bonds_info';
import InfoPanel from '../../src/info/InfoPanel';
import type { InfoContent } from '../../src/info/info_types';
import type { LearningLevel } from '../../src/levels/levels';
import { makeStore } from '../export/fixtures';
import { setMode } from '../../src/store/atomSlice';
import { selectBondsSystem, setBondsView, setH2PlusR, setScanPoint } from '../../src/store/bondsSlice';
import { finishOrbitalCalculation, setSurfaceStyle, startFieldCalculation } from '../../src/store/orbitalSlice';
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import { bondsCaptions, orbitalCaveats } from '../../src/bonds/captions';
import { bondAxisMinimumDensity } from '../../src/bonds/bond_density';
import type { BondsData } from '../../src/bonds/useBondsData';
import type { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../../src/molecules/types';

const fixture = (system: string, file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', system, file), 'utf8'));
/** The committed N₂ fixtures, generate.py's own output (the same ones bonds_panel.test.tsx reads). */
const n2Scan: MoleculeScan = fixture('n2', 'scan.json');
const n2Meta: MoleculeMeta = fixture('n2', 'meta.json');
const n2Basis: MoleculeBasis = { ...fixture('n2', 'basis.json'), id: 'n2@07' };
const o2Meta: MoleculeMeta = fixture('o2', 'meta.json');
const hfMeta: MoleculeMeta = fixture('hf', 'meta.json');

const NOTHING: BondsData = { scan: null, meta: null, basis: null, loading: false, error: null };
const n2Data: BondsData = { scan: n2Scan, meta: n2Meta, basis: n2Basis, loading: false, error: null };

/** Bonds mode on N₂ at its equilibrium point (index 7, as useBondsData snaps it), its density drawn. */
function n2Store() {
    const store = makeStore();
    store.dispatch(setMode('bonds'));
    store.dispatch(selectBondsSystem('n2'));
    store.dispatch(setScanPoint({ system: 'n2', index: 7, RBohr: n2Scan.points[7].RBohr }));
    return store;
}

/** H₂⁺ (Bonds' opening system) at R = 2 a₀, 1σg. */
function h2plusStore() {
    const store = makeStore();
    store.dispatch(setMode('bonds'));
    store.dispatch(selectBondsSystem('h2plus'));
    store.dispatch(setH2PlusR(2));
    return store;
}

const stateOf = (store: ReturnType<typeof makeStore>): BondsInfoState => store.getState();

/** No-break spaces (formulas, units) read as plain spaces in these checks. */
const flat = (text: string) => text.replace(/ /g, ' ');

function rendered(content: InfoContent, level: LearningLevel) {
    return render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level }));
}

/** What Info shows at `level`, outside the folded "How this was computed" (that is checked on its own). */
function shownAt(content: InfoContent, level: LearningLevel): string {
    const { container, unmount } = rendered(content, level);
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

/** A caption as Info prints it: R_e, D_e and E_el with a real <sub>, so their text reads Re, De, Eel. */
const typeset = (caption: string) => caption.replace(/_/g, '');

describe('bondsInfo (Task 7a)', () => {
    it('at Basics shows N₂ with no "CCSD(T)" and no "T1 diagnostic" outside the folded "How this was computed"', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'basics');
        const shown = shownAt(content, 'basics');
        expect(shown).not.toMatch(/CCSD\(T\)/);
        expect(shown).not.toMatch(/T1 diagnostic/);
        // Energies wait for Explore.
        expect(shown).not.toMatch(/\bHa\b|\beV\b/);
        // ...and every one of the methods is still there, folded.
        expect(computedText(content)).toMatch(/CCSD\(T\)/);
        expect(computedText(content)).toMatch(/T1 diagnostic 0\.0214/);
    });

    it('titles the view and, for the density, says what the surface is from the loaded basis, with no method', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'basics');
        const title = render(React.createElement('div', null, content.title)).container.textContent;
        expect(title).toBe('N₂ — total electron density');
        const shown = shownAt(content, 'basics');
        // Task 7b fix round 1 (M6): "occupied" -- the empty orbitals hold none of the density.
        expect(shown).toContain('N₂ has 14 electrons; the surface shows where they are likely to be found, all its occupied orbitals together.');
        // Fix round 1 (M3): plain words at Basics -- no ρ values, and the title's words are not repeated.
        expect(shown).not.toMatch(/e\/a₀³|Total electron density,/);
        expect(shown).toContain('Bond order3');
        // The density label that sat under the ρ buttons, without its method (that is under "How this was computed"),
        // is technical: from Advanced.
        const minOnAxis = bondAxisMinimumDensity(n2Basis)!;
        const advanced = shownAt(content, 'advanced');
        expect(advanced).toContain(`Total electron density, surface at ρ = 0.002 e/a₀³, the conventional molecular outline: one envelope around both nuclei here (ρ stays above ${minOnAxis.toPrecision(2)} e/a₀³ along the bond).`);
        expect(advanced).not.toMatch(/B3LYP/);
    });

    // Fix round 1 (M3): before the molecule's data lands, "they" has an antecedent.
    it('names the electrons before their count is known', () => {
        const content = bondsInfo(stateOf(n2Store()), NOTHING, 'basics');
        // Task 7b fix round 1 (M6): "occupied", as above.
        expect(shownAt(content, 'basics')).toContain('The surface shows where the electrons are likely to be found, all the occupied orbitals together.');
    });

    it('at Explore adds E − E(atoms), eV first with Ha in parentheses, and keeps the absolute energy for Research', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'explore');
        const explore = shownAt(content, 'explore');
        // Ruling (fix round 1): the facts come straight after the plain text, before the technical text.
        const advanced = shownAt(content, 'advanced');
        expect(advanced.indexOf('Bond order3')).toBeLessThan(advanced.indexOf(MO_LEGEND));
        expect(explore).toContain('Bond length R2.07 a₀ (1.098 Å)');
        expect(explore).toContain('E − E(atoms)−9.44 eV (−0.347 Ha)');
        expect(explore).not.toContain('Total energy');
        expect(shownAt(content, 'research')).toContain('Total energy−2976.40 eV (−109.38074 Ha)');
    });

    it('puts every method caption under "How this was computed", typeset, with the frontier orbitals eV first', () => {
        const meta = { ...n2Meta, orbitals: n2Meta.orbitals.map(o => (o.label === '3σu*'
            ? { ...o, nearTie: { minaoWeight: 0.3484, runnerUpMinaoWeight: 0.316, runnerUpEnergyHartree: 0.2243 } } : o)) };
        const content = bondsInfo(stateOf(n2Store()), { ...n2Data, meta }, 'research');
        const computed = computedText(content);
        bondsCaptions('n2', n2Scan).forEach(caption => expect(computed).toContain(typeset(caption)));
        orbitalCaveats(meta).forEach(caveat => expect(computed).toContain(caveat));
        // Fix round 1 (M8): one colon, a dash before the entries.
        expect(computed).toContain('Frontier orbitals — HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · LUMO 1πg*: ε = −0.91 eV (−0.033 Ha)');
        // The curve's caption, less what the captions above already say: its zero.
        expect(computed).toContain('Plot: E − E(separated atoms), in eV. Zero: N ⁴S + N ⁴S, UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core), the grey line.');
        // Said once: the energy method is not repeated by the curve's note.
        expect(computed.match(/CCSD\(T\)\/aug-cc-pVTZ \(frozen core\)/g)).toHaveLength(1);
    });

    // Task 8 fix round 1 (I1, M7): the captions are an export's plain text too, so Rₑ and Dₑ are written with Unicode's
    // subscript e (one string for both surfaces); the symmetry labels still take a real <sub>.
    it('never shows an underscore, writes Rₑ and Dₑ, and sets the orbital symmetry labels with a real subscript', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'research');
        const { container } = rendered(content, 'research');
        expect(container.textContent).not.toContain('_');
        expect(container.textContent).toContain('Rₑ = 2.086 a₀');
        expect(container.textContent).toContain('Dₑ = 9.44 eV');
        const subs = [...container.querySelectorAll('sub')].map(sub => sub.textContent);
        expect(subs).toEqual(expect.arrayContaining(['g']));
    });

    it('at Advanced reads the MO legend and the fixed-ρ note that sat beside Electron enclosed', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'advanced');
        const advanced = shownAt(content, 'advanced');
        expect(advanced).toContain(MO_LEGEND);
        expect(advanced).toContain(FIXED_RHO_NOTE);
        expect(FIXED_RHO_NOTE).not.toMatch(/beside|below|above/);
        expect(shownAt(content, 'explore')).not.toContain(FIXED_RHO_NOTE);
    });

    it('for one orbital, says what it is in plain words, its energy from Explore, and the enclosed fraction and iso value from Advanced', () => {
        const store = n2Store();
        store.dispatch(setBondsView({ kind: 'mo', label: '3σg', spin: 'restricted', component: 0 }));
        const asked = bondsFieldRequest(store.getState().bonds, n2Basis, 0.9, { probe: false })!;
        store.dispatch(startFieldCalculation(asked.request));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 2.5e-3 }));
        const content = bondsInfo(stateOf(store), n2Data, 'advanced');
        const { container } = render(React.createElement('div', null, content.title));
        expect(container.textContent).toBe('N₂ — 3σg orbital');
        expect(container.querySelector('sub')).toHaveTextContent('g');
        const basics = shownAt(content, 'basics');
        expect(basics).toContain('3σg is a bonding σ orbital of N₂');
        expect(basics).toContain('It holds 2 electrons.');
        expect(basics).toContain('It is the HOMO');
        expect(basics).not.toContain('Orbital energy');
        const advanced = shownAt(content, 'advanced');
        expect(advanced).toContain('Orbital energy−11.92 eV (−0.438 Ha)');
        // Fix round 1 (M10): a molecular orbital may hold two electrons; the surface encloses a share of its |ψ|².
        expect(advanced).toContain("Enclosed90 % of the orbital's |ψ|²");
        expect(advanced).toContain('Iso value|ψ|² = 2.50 × 10⁻³ a₀⁻³');
    });

    it('keeps the iso value out until the orbital asked for is the one drawn', () => {
        const store = n2Store();
        store.dispatch(setBondsView({ kind: 'mo', label: '3σg', spin: 'restricted', component: 0 }));
        const content = bondsInfo(stateOf(store), n2Data, 'research');
        expect(shownAt(content, 'research')).not.toContain('Iso value');
    });

    it('calls a starred orbital antibonding, and a core level a core orbital', () => {
        const store = n2Store();
        store.dispatch(setBondsView({ kind: 'mo', label: '1πg*', spin: 'restricted', component: 1 }));
        const lumo = shownAt(bondsInfo(stateOf(store), n2Data, 'basics'), 'basics');
        expect(lumo).toContain('1πg* is an antibonding π orbital of N₂');
        expect(lumo).toContain('It is empty.');
        expect(lumo).toContain('one of 2 with the same energy');
        expect(lumo).toContain('It is the LUMO');
        store.dispatch(setBondsView({ kind: 'mo', label: '1σg', spin: 'restricted', component: 0 }));
        expect(shownAt(bondsInfo(stateOf(store), n2Data, 'basics'), 'basics')).toContain('1σg is a core orbital of N₂');
    });

    it("says O₂'s levels are drawn at α energies, and which β pair swaps, from Advanced", () => {
        const store = makeStore();
        store.dispatch(setMode('bonds'));
        store.dispatch(selectBondsSystem('o2'));
        store.dispatch(setScanPoint({ system: 'o2', index: 0, RBohr: 2.28 }));
        const content = bondsInfo(stateOf(store), { ...NOTHING, meta: o2Meta }, 'advanced');
        expect(shownAt(content, 'advanced')).toMatch(/Levels drawn at α energies; in β — and in photoelectron spectra — 3σg lies below 1πu\./);
        expect(shownAt(content, 'explore')).not.toMatch(/α energies/);
    });

    it("states a heteronuclear molecule's bond order, and why g/u counting does not reach it, from Advanced", () => {
        const store = makeStore();
        store.dispatch(setMode('bonds'));
        store.dispatch(selectBondsSystem('hf'));
        const content = bondsInfo(stateOf(store), { ...NOTHING, meta: hfMeta }, 'advanced');
        const advanced = shownAt(content, 'advanced');
        expect(advanced).toContain('Bond order1');
        // Fix round 1 (M5): the fact gives the number; the technical text only the why.
        expect(advanced).toContain("Counted from the valence orbitals' bonding or antibonding character; g/u labels do not apply to a heteronuclear molecule.");
        expect(advanced.match(/Bond order/g)).toHaveLength(1);
    });

    // Ruling T4-d: C₂'s numbers are qualitative -- said plainly at every level, and in the method's words (bondsCaptions'
    // first caption) under "How this was computed".
    it('says plainly that a multireference molecule\'s energies are only a rough guide', () => {
        const store = makeStore();
        store.dispatch(setMode('bonds'));
        store.dispatch(selectBondsSystem('c2'));
        const c2Scan = { ...n2Scan, id: 'c2', formula: 'C₂', validity: { ...n2Scan.validity, multireference: true, t1AtRe: 0.0384, t1Limit: 0.0576 } } as MoleculeScan;
        const content = bondsInfo(stateOf(store), { ...NOTHING, scan: c2Scan }, 'basics');
        // Fix round 1 (M4): the energies, as T4-d's caption says.
        expect(shownAt(content, 'basics')).toContain('The computed energies for C₂ are only a rough guide: no single arrangement of its electrons describes it well, and the methods used here start from one.');
        expect(shownAt(content, 'basics')).not.toMatch(/CCSD|multireference/);
        // Task 8 fix round 1 (I1): Rₑ in Unicode, the export method line's own words.
        expect(computedText(content)).toContain('Strongly multireference: single-reference CCSD(T) is only qualitative here (T1 = 0.038 at Rₑ).');
    });

    // Fix round 1 (I1): Cut away is a Basics control, so what it removes is said from Basics, with its subject -- in
    // Orbitals' words (one function, cutAwaySentence).
    it('carries the cut helper that used to sit under Cut away, from Basics', () => {
        const store = n2Store();
        store.dispatch(setSurfaceStyle({ clipAxis: 'y', clipPosition: 0 }));
        expect(shownAt(bondsInfo(stateOf(store), n2Data, 'basics'), 'basics'))
            .toContain('The cut removes the part on the +y side of a plane perpendicular to the y axis.');
    });

    // Fix round 1 (I4): He₂'s no-bond sentence, said under the diagram to every level before, is Info's plain text now.
    describe('He₂', () => {
        const heScan = fixture('n2', 'scan.json') as MoleculeScan;
        const he2Scan = {
            ...heScan, id: 'he2', formula: 'He₂', energyMethod: 'FCI/aug-cc-pVTZ (no counterpoise correction)',
            fit: { ...heScan.fit, bound: false, DeHartree: 3.9e-5, DeEv: 0.00107,
                separatedAtomsMethod: 'He ¹S + He ¹S, FCI/aug-cc-pVTZ (no counterpoise correction)' },
            validity: { ...heScan.validity, stoppedAtRBohr: null, stopReason: null },
            note: null, reference: { ReAngstrom: null, source: null },
        } as MoleculeScan;
        const heMeta = {
            ...n2Meta, id: 'he2@01', bondOrder: 0,
            orbitals: [
                { index: 0, label: '1σg', energyHartree: -0.57, occupation: 2, spin: 'restricted' },
                { index: 1, label: '1σu*', energyHartree: -0.55, occupation: 2, spin: 'restricted', role: 'HOMO' }],
        } as unknown as MoleculeMeta;
        const he2 = () => {
            const store = makeStore();
            store.dispatch(setMode('bonds'));
            store.dispatch(selectBondsSystem('he2'));
            return bondsInfo(stateOf(store), { ...NOTHING, scan: he2Scan, meta: heMeta }, 'basics');
        };

        it('says at Basics that there is no bond, with a bond order of 0', () => {
            const shown = shownAt(he2(), 'basics');
            expect(shown).toContain('Bond order 0 — no bond: the antibonding electrons cancel the bonding ones.');
            expect(shown).not.toContain('..');
            expect(shown).toContain('Bond order0');
        });

        // Fix round 1 (M6): "no counterpoise correction" is said once in "How this was computed".
        it('says "no counterpoise correction" once', () => {
            expect(computedText(he2()).match(/counterpoise/g)).toHaveLength(1);
        });
    });

    describe('H₂⁺', () => {
        it('is exact: its captions, its energy relative to H + H⁺, and its bond order of ½', () => {
            const content = bondsInfo(stateOf(h2plusStore()), NOTHING, 'research');
            const title = render(React.createElement('div', null, content.title)).container.textContent;
            expect(title).toBe('H₂⁺ — 1σg orbital');
            const shown = shownAt(content, 'research');
            // Fix round 1 (M2): Born–Oppenheimer in plain words.
            expect(shown).toContain('H₂⁺ is two protons sharing one electron: the simplest chemical bond, and one solved exactly here for nuclei held in place.');
            expect(shown).toContain('E − E(H + H⁺)−2.79 eV (−0.103 Ha)');
            // Fix round 1 (I4): the panel's old "E = −0.60263 Ha", at Research, eV first.
            expect(shown).toContain('Total energy−16.40 eV (−0.60263 Ha)');
            expect(shown).toContain('Bond order½');
            // Fix round 1 (M5): the why, not the number again.
            expect(shown).toContain('One electron, so the energies are exact.');
            expect(shown.match(/Bond order/g)).toHaveLength(1);
            const computed = computedText(content);
            bondsCaptions('h2plus', null).forEach(caption => expect(computed).toContain(typeset(caption)));
            expect(computed).toContain('Plot: E − E(H + H⁺), in eV. Zero: H + H⁺ (−0.5 Ha), the grey line.');
            // H₂⁺'s levels carry no HOMO/LUMO role: no frontier line.
            expect(computed).not.toMatch(/HOMO|LUMO/);
        });

        it('says plainly that 1σu* is antibonding and does not bind', () => {
            const store = h2plusStore();
            store.dispatch(setBondsView({ kind: 'h2plus', state: '1sigma_u' }));
            // Fix round 1 (M1): the node is the wavefunction's.
            const shown = shownAt(bondsInfo(stateOf(store), NOTHING, 'basics'), 'basics');
            expect(shown).toContain('In 1σu*, the antibonding orbital, the wavefunction has a nodal plane midway between the nuclei, so the electron is kept out of the region between them, and this state does not hold them together.');
        });

        // Fix round 1 (I2): beside 1σu*'s own repulsive energy, the ½ is named as the ground state's.
        it('in the 1σu* view, names the ½ as the ground state\'s bond order and says this state has no bond', () => {
            const store = h2plusStore();
            store.dispatch(setBondsView({ kind: 'h2plus', state: '1sigma_u' }));
            const content = bondsInfo(stateOf(store), NOTHING, 'advanced');
            const shown = shownAt(content, 'advanced');
            expect(shown).toContain('Ground-state bond order½');
            expect(shown).toContain('In the ground state (electron in 1σg) the bond order is ½; with the electron in 1σu* there is no bond. One electron, so the energies are exact.');
            // Fix round 1 (M11): above the limit, with its sign.
            expect(shown).toMatch(/E − E\(H \+ H⁺\)\+\d+\.\d+ eV \(\+0\.\d+ Ha\)/);
        });

        it('at Basics has no energies and no method', () => {
            const shown = shownAt(bondsInfo(stateOf(h2plusStore()), NOTHING, 'basics'), 'basics');
            expect(shown).not.toMatch(/\bHa\b|\beV\b|Born–Oppenheimer/);
        });
    });
});
