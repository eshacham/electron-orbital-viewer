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
        expect(shown).toContain('N₂ has 14 electrons');
        // The density label that sat under the ρ buttons, without its method (that is under "How this was computed").
        const minOnAxis = bondAxisMinimumDensity(n2Basis)!;
        expect(shown).toContain(`Total electron density, surface at ρ = 0.002 e/a₀³, the conventional molecular outline: one envelope around both nuclei here (ρ stays above ${minOnAxis.toPrecision(2)} e/a₀³ along the bond).`);
        expect(shown).not.toMatch(/B3LYP/);
        expect(shown).toContain('Bond order3');
    });

    it('at Explore adds E − E(atoms), eV first with Ha in parentheses, and keeps the absolute energy for Research', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'explore');
        const explore = shownAt(content, 'explore');
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
        expect(computed).toContain('HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · LUMO 1πg*: ε = −0.91 eV (−0.033 Ha)');
        // The curve's caption, less what the captions above already say: its zero.
        expect(computed).toContain('Plot: E − E(separated atoms), in eV. Zero: N ⁴S + N ⁴S, UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core), the grey line.');
        // Said once: the energy method is not repeated by the curve's note.
        expect(computed.match(/CCSD\(T\)\/aug-cc-pVTZ \(frozen core\)/g)).toHaveLength(1);
    });

    it('never shows an underscore, and sets R_e, D_e and the orbital symmetry labels with a real subscript', () => {
        const content = bondsInfo(stateOf(n2Store()), n2Data, 'research');
        const { container } = rendered(content, 'research');
        expect(container.textContent).not.toContain('_');
        const subs = [...container.querySelectorAll('sub')].map(sub => sub.textContent);
        expect(subs).toEqual(expect.arrayContaining(['e', 'g']));
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
        expect(advanced).toContain('Enclosed90 % of the electron');
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
        expect(advanced).toContain("Bond order 1 — counted from the valence orbitals' bonding/antibonding character; g/u labels don't apply to a heteronuclear molecule.");
    });

    // Ruling T4-d: C₂'s numbers are qualitative -- said plainly at every level, and in the method's words (bondsCaptions'
    // first caption) under "How this was computed".
    it('says plainly that a multireference molecule\'s numbers are only qualitative', () => {
        const store = makeStore();
        store.dispatch(setMode('bonds'));
        store.dispatch(selectBondsSystem('c2'));
        const c2Scan = { ...n2Scan, id: 'c2', formula: 'C₂', validity: { ...n2Scan.validity, multireference: true, t1AtRe: 0.0384, t1Limit: 0.0576 } } as MoleculeScan;
        const content = bondsInfo(stateOf(store), { ...NOTHING, scan: c2Scan }, 'basics');
        expect(shownAt(content, 'basics')).toContain('The computed numbers for C₂ are only qualitative');
        expect(shownAt(content, 'basics')).not.toMatch(/CCSD|multireference/);
        expect(computedText(content)).toContain('Strongly multireference: single-reference CCSD(T) is only qualitative here (T1 = 0.038 at Re).');
    });

    it('carries the cut helper that used to sit under Cut away', () => {
        const store = n2Store();
        store.dispatch(setSurfaceStyle({ clipAxis: 'y', clipPosition: 0 }));
        expect(shownAt(bondsInfo(stateOf(store), n2Data, 'advanced'), 'advanced'))
            .toContain('Removes the part on the +y side of a plane perpendicular to the y axis.');
    });

    describe('H₂⁺', () => {
        it('is exact: its captions, its energy relative to H + H⁺, and its bond order of ½', () => {
            const content = bondsInfo(stateOf(h2plusStore()), NOTHING, 'research');
            const title = render(React.createElement('div', null, content.title)).container.textContent;
            expect(title).toBe('H₂⁺ — 1σg orbital');
            const shown = shownAt(content, 'research');
            expect(shown).toContain('H₂⁺ is two protons sharing one electron');
            expect(shown).toContain('E − E(H + H⁺)−2.79 eV (−0.103 Ha)');
            expect(shown).toContain('Bond order½');
            expect(shown).toContain('Bond order ½. One electron, exact energies.');
            const computed = computedText(content);
            bondsCaptions('h2plus', null).forEach(caption => expect(computed).toContain(typeset(caption)));
            expect(computed).toContain('Plot: E − E(H + H⁺), in eV. Zero: H + H⁺ (−0.5 Ha), the grey line.');
            // H₂⁺'s levels carry no HOMO/LUMO role: no frontier line.
            expect(computed).not.toMatch(/HOMO|LUMO/);
        });

        it('says plainly that 1σu* is antibonding and does not bind', () => {
            const store = h2plusStore();
            store.dispatch(setBondsView({ kind: 'h2plus', state: '1sigma_u' }));
            const shown = shownAt(bondsInfo(stateOf(store), NOTHING, 'basics'), 'basics');
            expect(shown).toContain('In 1σu*, the antibonding orbital, the electron has a node midway between the nuclei, and this state does not hold them together.');
        });

        it('at Basics has no energies and no method', () => {
            const shown = shownAt(bondsInfo(stateOf(h2plusStore()), NOTHING, 'basics'), 'basics');
            expect(shown).not.toMatch(/\bHa\b|\beV\b|Born–Oppenheimer/);
        });
    });
});
