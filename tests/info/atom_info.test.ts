// tests/info/atom_info.test.ts -- Task 6: Atoms' Info builder owns every sentence the Atoms panels used to print (the
// valence note and click hints, the method line and "About this model", the j-level note, the ΔSCF method, NIST
// comparison and limitation note, the dashed-ring comparison, the relativity help and readout, the enclosed and cut
// helpers, the |R|² tab caption and the cut-face caption), written for the reader's level: plain words at Basics, the
// orbital energy (eV, then Ha) from Explore, the ΔSCF energy beside NIST and the relativity mode from Advanced, and the
// method under "How this was computed".
import React from 'react';
import { render } from '@testing-library/react';
import { atomInfo, CUT_FACE_NOTE, SCALAR_DEFAULT_NOTE, valencePlainWords, type AtomsInfoState } from '../../src/info/atom_info';
import InfoPanel from '../../src/info/InfoPanel';
import type { InfoContent } from '../../src/info/info_types';
import type { LearningLevel } from '../../src/levels/levels';
import { makeStore } from '../export/fixtures';
import type { AtomState } from '../../src/store/atomSlice';
import type { SerialisedAtomProfile, SerialisedSubshell } from '../../src/workers/atomWorker';
import { aboutModelText, aboutRelativitySentence, relativisticEnergiesSentence } from '../../src/atom/atom_text';
import { methodStatement } from '../../src/atom/relativity';
import { deltaScfMethod } from '../../src/atom/delta_scf';
import { IE_LIMITATION_NOTE } from '../../src/atom/ie_accuracy';
import { configurationFor } from '../../src/atom/configurations';
import { speciesConfiguration } from '../../src/atom/species';
import { LARGE_COMPONENT_NOTE, RADIAL_FACTOR_NOTE } from '../../src/atom/plot_tabs';

type OrbitalSlice = AtomsInfoState['orbital'];

/** The store's own initial slices with `atom` (and `orbital`) laid over them: Atoms mode by default. */
function atomsState(atom: Partial<AtomState>, orbital: Partial<OrbitalSlice> = {}): AtomsInfoState {
    const base = makeStore().getState();
    return { atom: { ...base.atom, mode: 'atom', ...atom }, orbital: { ...base.orbital, ...orbital } };
}

const grid = 9;
const sub = (n: number, l: number, electrons: number, energy: number, j?: number): SerialisedSubshell => ({
    n, l, ...(j === undefined ? {} : { j }), electrons, energy,
    curve: new Float64Array(grid), R: new Float64Array(grid), samplingRadius: 2, compositeSamplingRadius: 2,
});

/** A profile of `Z`'s shape: its shells and subshells, every number but the orbital energies made up. */
function profileOf(Z: number, subshells: SerialisedSubshell[], extra: Partial<SerialisedAtomProfile> = {}): SerialisedAtomProfile {
    const shellNs = [...new Set(subshells.map(s => s.n))];
    return {
        Z, converged: true, rMin: 1e-3, dx: 0.05, size: grid,
        total: new Float32Array(grid), totalEmphasis: new Float32Array(grid),
        contourRadius: 2, valencePeakRadius: 1, displayRadius: 2, shellPeaks: new Float64Array([1]),
        shellIndexAtR: new Float32Array(grid),
        shells: shellNs.map(n => ({
            n, electrons: subshells.filter(s => s.n === n).reduce((t, s) => t + s.electrons, 0),
            contourRadius: n, curve: new Float64Array(grid), emphasis: new Float32Array(grid),
        })),
        subshells,
        ...extra,
    };
}

const carbon = () => profileOf(6, [sub(1, 0, 2, -9.948), sub(2, 0, 2, -0.501), sub(2, 1, 2, -0.2)]);
/**
 * Protactinium as a link without rel opens it (ruling C1): non-relativistic, though its default is scalar. Only its
 * whole-atom view is read here.
 */
const protactinium = () => profileOf(91, [sub(7, 0, 2, -0.15)], { relativity: 'off' });
/**
 * Pa's live ΔSCF ionisation energy, 7.376 eV against NIST's 5.89 eV (docs/quantumlab/checks/6G-2/CHECKLIST.md, "Pa
 * configuration": the app's own value, read off the running app) -- +25.2 %.
 */
const paEnergies = { speciesKey: '91', status: 'done' as const, ionisation: { valueEv: 7.376, fromLabel: 'Pa', toLabel: 'Pa⁺' }, excitation: null, message: null };

/** No-break spaces (formulas) read as plain spaces in these checks. */
const flat = (text: string) => text.replace(/ /g, ' ');

/** What Info shows at `level`, outside the folded "How this was computed" (checked on its own). */
function shownAt(content: InfoContent, level: LearningLevel): string {
    const { container, unmount } = render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level }));
    container.querySelector('.info-computed')?.remove();
    const text = container.textContent ?? '';
    unmount();
    return flat(text);
}

function textOf(node: React.ReactNode): string {
    const { container, unmount } = render(React.createElement('div', null, node));
    const text = container.textContent ?? '';
    unmount();
    return flat(text);
}

describe('atomInfo (Task 6)', () => {
    // A link without rel: the URL decoder stores Pa's off as the user's own choice (scalar is its default).
    const pa = () => atomsState({ Z: 91, relativityOverride: 'off', profile: protactinium(), energies: paEnergies });

    it('for Pa at Research says the whole method -- method line, About, ΔSCF -- and the IE beside NIST at +25.2 %', () => {
        const content = atomInfo(pa(), 'research');
        const computed = textOf(content.computed);
        // The method line opens its own paragraph here, so it starts with a capital.
        expect(computed).toContain(`Central-field SCF${methodStatement('off').slice('central-field SCF'.length)}.`);
        expect(computed).toContain(aboutModelText('off', 'off', true));
        expect(computed).toContain(aboutRelativitySentence('off'));
        expect(computed).toContain(deltaScfMethod('off'));
        const shown = shownAt(content, 'research');
        expect(shown).toContain('Ionisation energy (Pa → Pa⁺)7.38 eV');
        // Fix round 1 (M10): NIST's 5.89 as tabulated, not "5.890".
        expect(shown).toContain('Measured (NIST)5.89 eV (calculated +25.2 %)');
        // The limitation note (ruling P15) with it: an open 5f and 6d. Fix round 1 (I3): it names its subject.
        expect(shown).toContain(`Its ionisation energy is ${IE_LIMITATION_NOTE}.`);
        // Opened without rel: drawn non-relativistic, and the heavy element's default is said (the critique's
        // researcher red flag).
        expect(shown).toContain('RelativitySchrödinger equation — no relativistic effects.');
        expect(shown).toContain(SCALAR_DEFAULT_NOTE);
    });

    it('for Pa drawn scalar-relativistic, as its default, says the relativistic About sentences and no red flag', () => {
        const content = atomInfo(atomsState({ Z: 91, profile: { ...protactinium(), relativity: 'scalar' }, energies: paEnergies }), 'research');
        const computed = textOf(content.computed);
        expect(computed).toContain(`Central-field SCF${methodStatement('scalar').slice('central-field SCF'.length)}.`);
        expect(computed).toContain(aboutRelativitySentence('scalar'));
        expect(computed).toContain(relativisticEnergiesSentence('scalar').trim());
        expect(computed).toContain(deltaScfMethod('scalar'));
        const shown = shownAt(content, 'research');
        expect(shown).toContain('RelativityScalar-relativistic (Koelling–Harmon): mass-velocity and Darwin terms, no spin–orbit. Default for this element.');
        expect(shown).not.toContain(SCALAR_DEFAULT_NOTE);
    });

    // Fix round 1 (M7): the technical band is short paragraphs, one idea each -- never one wall.
    it('writes the technical band as short paragraphs, one idea each', () => {
        const { container, unmount } = render(React.createElement(InfoPanel, {
            content: atomInfo(pa(), 'advanced'), topic: null, onClearTopic: () => {}, level: 'advanced',
        }));
        const paragraphs = [...container.querySelectorAll('.info-body > p.info-text')].map(p => flat(p.textContent ?? ''));
        expect(paragraphs).toContain('Valence 5f² 6d¹ 7s²: open 5f and 6d count as valence.');
        expect(paragraphs).toContain(`Its ionisation energy is ${IE_LIMITATION_NOTE}.`);
        unmount();
    });

    it('for Pa at Basics speaks plain words: no LDA, no ΔSCF, no Ha', () => {
        const shown = shownAt(atomInfo(pa(), 'basics'), 'basics');
        expect(shown).not.toContain('LDA');
        expect(shown).not.toContain('ΔSCF');
        expect(shown).not.toMatch(/\bHa\b/);
        expect(shown).toContain('Protactinium has 91 electrons in 7 shells. The cut face shows them as rings.');
        expect(shown).toContain('2 electrons in the outer shell and 3 in the open 5f and 6d');
        // Relativity is off, and the element's default is said at every level.
        expect(shown).toContain(SCALAR_DEFAULT_NOTE);
    });

    // Fix round 1 ruling: a neutral atom's IE value is a key number from Explore, its label carrying the (i) to the
    // glossary; NIST, the signed % and the relativity mode stay at Advanced.
    it('shows a neutral atom\'s IE from Explore, with its (i), and keeps NIST and the relativity mode for Advanced', () => {
        expect(shownAt(atomInfo(pa(), 'basics'), 'basics')).not.toContain('Ionisation energy');
        const content = atomInfo(pa(), 'explore');
        const explore = shownAt(content, 'explore');
        expect(explore).toContain('Ionisation energy (Pa → Pa⁺)7.38 eV');
        const { container, unmount } = render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level: 'explore' }));
        expect(container.querySelector('.info-fact dt button[aria-label="About Ionisation energy"]')).not.toBeNull();
        unmount();
        expect(explore).not.toContain('NIST');
        expect(explore).not.toContain('Koelling–Harmon');
        const advanced = shownAt(atomInfo(pa(), 'advanced'), 'advanced');
        expect(advanced).toContain('Ionisation energy');
        expect(advanced).toContain('RelativitySchrödinger equation — no relativistic effects.');
    });

    it('says the scalar default only for a heavy element drawn with relativity off', () => {
        // With spin–orbit chosen, a fuller treatment than the default: no flag.
        const spinOrbit = atomsState({ Z: 91, relativityOverride: 'spinOrbit', profile: { ...protactinium(), relativity: 'spinOrbit' } });
        expect(shownAt(atomInfo(spinOrbit, 'advanced'), 'advanced')).not.toContain(SCALAR_DEFAULT_NOTE);
        // A light element's default is off: no note either.
        expect(shownAt(atomInfo(atomsState({ Z: 6, profile: carbon() }), 'advanced'), 'advanced')).not.toContain(SCALAR_DEFAULT_NOTE);
    });

    it('compares with NIST only for a neutral atom', () => {
        const cation = atomsState({
            Z: 11, charge: 1, profile: profileOf(11, [sub(2, 1, 6, -1.8)], { speciesKey: '11+1' }),
            energies: { speciesKey: '11+1', status: 'done', ionisation: { valueEv: 47.1, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null, message: null },
        });
        const shown = shownAt(atomInfo(cation, 'research'), 'research');
        expect(shown).toContain('Ionisation energy (Na⁺ → Na²⁺)47.10 eV');
        expect(shown).not.toContain('NIST');
    });

    it('names a whole atom, its configuration and valence in plain words, and the hint on what to click', () => {
        const content = atomInfo(atomsState({ Z: 6, profile: carbon() }), 'explore');
        expect(textOf(content.title)).toBe('Carbon — whole atom');
        const shown = shownAt(content, 'explore');
        expect(shown).toContain('Configuration1s² 2s² 2p²');
        expect(shown).toContain('Valence4 electrons in the outer shell');
        expect(shown).toContain('Click a ring in the 3D view, or a shell chip, to open it.');
        // Ruling P14's note moved here from the valence line, in the technical band.
        expect(shown).not.toContain('everything inside is core');
        expect(shownAt(content, 'advanced')).toContain('Valence 2s² 2p²: everything inside is core.');
    });

    it('says which open d or f subshells count as valence', () => {
        expect(valencePlainWords(configurationFor(26))).toBe('2 electrons in the outer shell and 6 in the open 3d');
        expect(valencePlainWords(configurationFor(1))).toBe('1 electron in the outer shell');
        expect(shownAt(atomInfo(atomsState({ Z: 91, profile: protactinium() }), 'advanced'), 'advanced'))
            .toContain('Valence 5f² 6d¹ 7s²: open 5f and 6d count as valence.');
        // Hydrogen and helium have one shell, so no core at all; lithium has one (moved from level_nav.test).
        expect(shownAt(atomInfo(atomsState({ Z: 1, profile: profileOf(1, [sub(1, 0, 1, -0.23)]) }), 'research'), 'research')).not.toContain('core');
        expect(shownAt(atomInfo(atomsState({ Z: 2 }), 'research'), 'research')).not.toContain('inside is core');
        expect(shownAt(atomInfo(atomsState({ Z: 3 }), 'research'), 'research')).toContain('Valence 2s¹: everything inside is core.');
    });

    // Fix round 1 (I2): once a d-block cation (or Pd) has no s beyond its d, the outermost shell is a full s and p around
    // the d, and the d is what counts -- never "14 electrons in the outer shell" for Fe²⁺.
    it.each([
        [26, 2, '6 electrons in the open 3d, outside a full 3s and 3p'], // Fe²⁺
        [26, 3, '5 electrons in the open 3d, outside a full 3s and 3p'], // Fe³⁺
        [29, 1, '10 electrons in the full 3d, outside a full 3s and 3p'], // Cu⁺
        [30, 2, '10 electrons in the full 3d, outside a full 3s and 3p'], // Zn²⁺
        [46, 0, '10 electrons in the full 4d, outside a full 4s and 4p'], // Pd
        [22, 2, '2 electrons in the open 3d, outside a full 3s and 3p'], // Ti²⁺
        [26, 0, '2 electrons in the outer shell and 6 in the open 3d'], // Fe, a neutral transition metal
        [64, 0, '2 electrons in the outer shell and 8 in the open 4f and 5d'], // Gd, a lanthanide
        [11, 1, '8 electrons in the outer shell'], // Na⁺, a main-group ion
        // Fix round 3 (N1): an open inner f counts too (the app's configurations: Ce⁺ 4f¹ 5d², Gd²⁺ 4f⁷ 5d¹,
        // Th²⁺ 5f¹ 6d¹, Pa²⁺ 5f² 6d¹).
        [58, 1, '3 electrons in the open 4f and 5d, outside a full 5s and 5p'], // Ce⁺
        [64, 2, '8 electrons in the open 4f and 5d, outside a full 5s and 5p'], // Gd²⁺
        [90, 2, '2 electrons in the open 5f and 6d, outside a full 6s and 6p'], // Th²⁺
        [91, 2, '3 electrons in the open 5f and 6d, outside a full 6s and 6p'], // Pa²⁺
    ])('words Z = %i, charge %i\'s valence plainly', (Z, charge, words) => {
        expect(valencePlainWords(speciesConfiguration({ Z, charge, excitation: null }))).toBe(words);
    });

    it('says the cut-face caption once, for the shell views only', () => {
        const atom = shownAt(atomInfo(atomsState({ Z: 6, profile: carbon() }), 'explore'), 'explore');
        expect(atom.split(CUT_FACE_NOTE)).toHaveLength(2);
        const shell = shownAt(atomInfo(atomsState({ Z: 6, profile: carbon(), level: 'shell', selectedShell: 2 }), 'explore'), 'explore');
        expect(shell).toContain(CUT_FACE_NOTE);
        expect(shell).toContain('The L shell (n=2) holds 4 of Carbon\'s 6 electrons: 2s² 2p².');
        // Fix round 1 (M1): no "it" without a referent in Info.
        expect(shell).toContain('Showing the L shell (n=2) only — click its chip again, or the ✕ on the chip, for the whole atom. Click a subshell to show its orbitals on their own.');
        const orbital = shownAt(atomInfo(atomsState({
            Z: 6, profile: carbon(), level: 'orbital', selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 0 },
        }), 'research'), 'research');
        expect(orbital).not.toContain(CUT_FACE_NOTE);
    });

    it('moves the Cut away helper here, worded for a shell view or an orbital', () => {
        const cut = (axis: 'x' | 'none') => ({ surfaceStyle: { ...makeStore().getState().orbital.surfaceStyle, clipAxis: axis } });
        const shell = shownAt(atomInfo(atomsState({ Z: 6, profile: carbon() }, cut('x')), 'advanced'), 'advanced');
        expect(shell).toContain('Slices off the +x side to show the shells inside. The atom is round, so X, Y and Z give the same rings, facing a different way.');
        const orbitalState = { Z: 6, profile: carbon(), level: 'orbital' as const, selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 0 } };
        expect(shownAt(atomInfo(atomsState(orbitalState, cut('x')), 'advanced'), 'advanced'))
            .toContain('Removes the part on the +x side of a plane perpendicular to the x axis.');
        expect(shownAt(atomInfo(atomsState(orbitalState, cut('none')), 'advanced'), 'advanced')).not.toMatch(/Removes the part|Pick an axis/);
    });

    it('gives a subshell its orbital energy from Explore, eV first and then Ha, with true minus signs', () => {
        const state = atomsState({ Z: 6, profile: carbon(), level: 'shell', selectedShell: 2, selectedSubshell: { n: 2, l: 1 } });
        const content = atomInfo(state, 'explore');
        expect(textOf(content.title)).toBe('Carbon — 2p');
        expect(shownAt(content, 'basics')).not.toContain('Orbital energy');
        const explore = shownAt(content, 'explore');
        expect(explore).toContain('Orbital energy−5.44 eV (−0.200 Ha)');
        expect(explore).not.toMatch(/-\d/);
        expect(explore).toContain('2p holds 2 electrons, with room for 6.');
        expect(explore).toContain('Showing 2p alone — click its chip again for the whole shell.');
        const advanced = shownAt(content, 'advanced');
        // Never an ionisation energy (ruling R19); the |R|² tab's caption, said here.
        // Fix round 1 (M2): its own subject, and the picture's method.
        expect(advanced).toContain('The orbital energy is an eigenvalue of the non-relativistic LDA, not an ionisation energy.');
        expect(advanced).toContain(RADIAL_FACTOR_NOTE);
        expect(advanced).toContain("Enclosed90 % of each orbital's probability");
    });

    it('titles one orbital with a real subscript, never "2p_z", and gives its iso value once it is drawn', () => {
        const selection = { Z: 6, profile: carbon(), level: 'orbital' as const, selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 0 } };
        const drawn = {
            currentParams: { n: 2, l: 1, ml: 0, Z: 6, resolution: 64, rMax: 2, enclosedFraction: 0.9, radialSamples: { R: new Float64Array(grid), rMin: 1e-3, dx: 0.05, size: grid } },
            isoLevel: 1.234e-3, isLoading: false, renderFailed: false, enclosedFraction: 0.9,
        };
        const content = atomInfo(atomsState(selection, drawn), 'advanced');
        const { container, unmount } = render(React.createElement('h3', null, content.title));
        expect(container).toHaveTextContent('Carbon — 2pz orbital');
        expect(container.querySelector('sub')).toHaveTextContent('z');
        expect(container.textContent).not.toContain('_');
        unmount();
        const shown = shownAt(content, 'advanced');
        expect(shown).toContain('One of the 3 p orbitals of 2p, a dumbbell.');
        // Fix round 1 (M1): on a phone Back is a bare arrow, so the words say what it does.
        expect(shown).toContain('Showing one orbital of 2p — pick another of its orbitals, or go back for the whole subshell.');
        // Not described as a shell once an orbital is selected (moved from level_nav.test).
        expect(shown).not.toMatch(/for the whole atom/);
        expect(shown).toContain('Iso value|ψ|² = 1.23 × 10⁻³ a₀⁻³');
        expect(shown).toContain('Enclosed90 % of the electron');
        expect(shown).not.toContain('_');
        // Still computing: the iso value would be the previous orbital's.
        expect(shownAt(atomInfo(atomsState(selection, { ...drawn, isLoading: true }), 'advanced'), 'advanced')).not.toContain('Iso value');
        // Explore has no iso value (Advanced, with the Electron enclosed control).
        expect(shownAt(content, 'explore')).not.toContain('a₀⁻³');
    });

    it('says what changed in a relativistic picture, and that a re-solve is under way', () => {
        const change = { n: 6, label: '6s', nonRelativisticMeanRadius: 3.21, relativisticMeanRadius: 2.76, contractionPercent: 14.1 };
        const gold = profileOf(79, [sub(6, 0, 1, -0.3)], { relativity: 'scalar', valenceS: change });
        const shown = shownAt(atomInfo(atomsState({ Z: 79, profile: gold }), 'advanced'), 'advanced');
        expect(shown).toContain('What changed: 6s contracts by 14.1 % (mean radius ⟨r⟩ 3.21 → 2.76 a₀');
        const solving = atomInfo(atomsState({ Z: 79, relativityOverride: 'spinOrbit', isSolving: true, profile: gold }), 'research');
        expect(shownAt(solving, 'research')).toContain('Solving the picture with spin–orbit… the picture on screen is still scalar-relativistic.');
        expect(textOf(solving.computed)).toContain('The picture on screen is still scalar-relativistic; the one with spin–orbit is being solved.');
    });

    // Task 9 (live check item 6): the screen-reader pass found a relativity change unspoken -- Task 6 had moved the
    // readout out of its live region. Fix round 1: one line names the drawn picture's relativity, in the switch's own
    // words, from Advanced (where the switch is); it changes once, when the new picture lands, not while it solves.
    it('gives the drawn picture\'s relativity as the line to speak, from Advanced', () => {
        const change = { n: 6, label: '6s', nonRelativisticMeanRadius: 3.21, relativisticMeanRadius: 2.76, contractionPercent: 14.1 };
        const gold = profileOf(79, [sub(6, 0, 1, -0.3)], { relativity: 'scalar', valenceS: change });
        expect(atomInfo(atomsState({ Z: 79, profile: gold }), 'advanced').announce).toBe('Relativity: scalar relativistic');
        // Spin–orbit asked for, the scalar picture still drawn: nothing has changed yet.
        expect(atomInfo(atomsState({ Z: 79, relativityOverride: 'spinOrbit', isSolving: true, profile: gold }), 'research').announce)
            .toBe('Relativity: scalar relativistic');
        expect(atomInfo(atomsState({ Z: 79, profile: { ...gold, relativity: 'spinOrbit' } }), 'research').announce)
            .toBe('Relativity: with spin–orbit');
        expect(atomInfo(atomsState({ Z: 6, profile: profileOf(6, [sub(2, 1, 2, -0.2)]) }), 'research').announce).toBe('Relativity: off');
        expect(atomInfo(atomsState({ Z: 79, profile: gold }), 'explore').announce).toBeNull();
        expect(atomInfo(atomsState({ Z: 79 }), 'research').announce).toBeNull();
    });

    it('says the j-level basis caveat and the large-component caveat with spin–orbit', () => {
        const lead = profileOf(82, [sub(6, 0, 2, -0.5, 0.5), sub(6, 1, 0.67, -0.15, 0.5), sub(6, 1, 1.33, -0.12, 1.5)], { relativity: 'spinOrbit' });
        const shown = shownAt(atomInfo(atomsState({
            Z: 82, relativityOverride: 'spinOrbit', profile: lead, level: 'shell', selectedShell: 6, selectedSubshell: { n: 6, l: 1, j: 1.5 },
        }), 'advanced'), 'advanced');
        expect(shown).toContain('The lobes are the p orbitals\' shapes, sized by 6p³⁄₂\'s own radial function — a basis choice. '
            + 'A j-level mixes mₗ with spin, so its own states have other shapes (a p½ state is spherical).');
        expect(shown).toContain(LARGE_COMPONENT_NOTE);
        expect(shown).toContain('6p³⁄₂ holds 1.33 electrons, with room for 4.');
        // The hint names the j-level (moved from subshell_panel.test, fix round 1 M3).
        expect(shown).toContain('Showing 6p³⁄₂ alone — click its chip again for the whole shell.');
        // Its eigenvalue states the Dirac method (spec §3.1).
        expect(shown).toContain('The orbital energy is an eigenvalue of the Dirac LDA (MacDonald–Vosko exchange), not an ionisation energy.');
    });

    // Fix round 1 (M3): a j-level has 2j + 1 states, so its orbital is one of the l shapes, sized by the j-level.
    it('names a j-level orbital as one of the l shapes drawn with the j-level\'s radial function', () => {
        const lead = profileOf(82, [sub(6, 0, 2, -0.5, 0.5), sub(6, 1, 0.67, -0.15, 0.5), sub(6, 1, 1.33, -0.12, 1.5)], { relativity: 'spinOrbit' });
        const shown = shownAt(atomInfo(atomsState({
            Z: 82, relativityOverride: 'spinOrbit', profile: lead, level: 'orbital', selectedShell: 6,
            selectedSubshell: { n: 6, l: 1, j: 0.5 }, selectedOrbital: { n: 6, l: 1, ml: 0, j: 0.5 },
        }), 'advanced'), 'advanced');
        expect(shown).toContain('One of the 3 p orbital shapes, drawn with 6p½\'s own radial function, a dumbbell.');
        expect(shown).not.toContain('orbitals of 6p½');
        expect(shown).toContain('Showing one orbital of 6p½ — pick another of its orbitals, or go back for the whole subshell.');
    });

    it('compares an ion\'s drawn radius with the neutral atom\'s dashed ring, from Explore', () => {
        const ion = (displayRadius: number, referenceRadius: number, relativity: 'off' | 'spinOrbit' = 'off') => atomInfo(atomsState({
            Z: 11, charge: 1,
            profile: profileOf(11, [sub(2, 1, 6, -1.8)], { displayRadius, relativity, reference: { displayRadius: referenceRadius, contourRadius: 1.9, framingRadius: referenceRadius } }),
        }), 'explore');
        expect(shownAt(ion(1.6, 3.2), 'explore')).toContain('Dashed ringneutral Na, drawn radius 3.20 a₀ · Na⁺ 1.60 a₀ (−50 %)');
        // Fix round 1 (M8): a non-relativistic ring note ends at its size -- no "both …" method suffix (moved from
        // species_controls.test, "leaves a non-relativistic ring note as it was").
        const offRing = ion(1.6, 3.2).facts!.find(fact => fact.label === 'Dashed ring')!.value as string;
        expect(offRing).toMatch(/\(−50 %\)$/);
        expect(offRing).not.toMatch(/both /);
        // M11: a rounded zero reads as a typo; say the sizes are the same.
        const same = shownAt(ion(1.999, 2.0), 'explore');
        expect(same).toContain('≈ same size');
        expect(same).not.toMatch(/[−+]0 %/);
        expect(shownAt(ion(2.9, 3.1, 'spinOrbit'), 'explore')).toMatch(/both Dirac LDA \(MacDonald–Vosko exchange\)/);
        expect(shownAt(ion(1.6, 3.2), 'basics')).not.toContain('Dashed ring');
        // Final review M9: three significant figures, as the exports print the same ring (moved from species_controls.test).
        const excited = atomInfo(atomsState({
            Z: 55, excitation: { from: { n: 6, l: 0 }, to: { n: 6, l: 1 } },
            profile: profileOf(55, [sub(6, 1, 1, -0.1)], { displayRadius: 12.34, reference: { displayRadius: 19.96, contourRadius: 5, framingRadius: 19.96 } }),
        }), 'explore');
        expect(shownAt(excited, 'explore')).toContain('neutral Cs, drawn radius 20.0 a₀ · Cs* 12.3 a₀');
        // No ring: why, in the technical band.
        const why = 'No neutral reference ring: Scalar-relativistic SCF for Gold: did not converge.';
        const noRing = atomInfo(atomsState({ Z: 79, charge: 1, profile: profileOf(79, [sub(6, 0, 1, -0.3)], { reference: null, referenceUnavailable: why }) }), 'advanced');
        expect(shownAt(noRing, 'advanced')).toContain(why);
    });

    // Fix round 1 (M4): "—" means "no such energy"; a failed ΔSCF says it was not computed, and why, as the panel does.
    it('says why a failed ΔSCF has no energy', () => {
        const message = 'The spin-polarised SCF did not converge for Na.';
        const shown = shownAt(atomInfo(atomsState({
            Z: 11, profile: profileOf(11, [sub(3, 0, 1, -0.1)]),
            energies: { speciesKey: '11', status: 'failed', ionisation: null, excitation: null, message },
        }), 'explore'), 'explore');
        expect(shown).toContain(`Ionisation energy (Na → Na⁺)not computed — ${message}`);
    });

    it('gives an excited atom its excitation energy, not an ionisation energy', () => {
        const excitation = { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } };
        const shown = shownAt(atomInfo(atomsState({
            Z: 11, excitation, profile: profileOf(11, [sub(3, 1, 1, -0.1)], { speciesKey: '11:3s>3p' }),
            energies: { speciesKey: '11:3s>3p', status: 'computing', ionisation: null, excitation: null, message: null },
        }), 'advanced'), 'advanced');
        expect(shown).toContain('Excitation energy 3s → 3p');
        expect(shown).not.toContain('Ionisation energy');
        expect(shown).not.toContain('NIST');
    });

    it('says plainly when nothing is drawn', () => {
        const content = atomInfo(atomsState({ Z: 17, charge: -1, unbound: 'LDA does not bind this anion.' }), 'research');
        expect(textOf(content.title)).toBe('Chlorine ion Cl⁻ — whole atom — not drawn');
        const shown = shownAt(content, 'research');
        expect(shown).toContain('Nothing is drawn for this species, so there is no shell to open.');
        expect(shown).not.toContain(CUT_FACE_NOTE);
        expect(shown).not.toContain('Ionisation energy');
        expect(textOf(content.computed)).not.toMatch(/This picture/);
    });
});
