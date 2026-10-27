// tests/info/basic_info.test.ts -- Task 5: Orbitals' Info builder owns every sentence the Orbitals panels used to print
// (the Z = 1 caption, the combination and field captions, the enclosed and cut helpers), written for the reader's
// level: plain words and node counts at Basics, the energy from Explore, the iso value with its unit from Advanced, and
// the method under "How this was computed" -- exact for one orbital, first-order perturbation theory for a field.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { basicInfo, BASIC_ORBITALS_ABOUT } from '../../src/info/basic_info';
import InfoPanel from '../../src/info/InfoPanel';
import type { InfoContent } from '../../src/info/info_types';
import type { LearningLevel } from '../../src/levels/levels';
import { makeStore } from '../export/fixtures';
import { setMode } from '../../src/store/atomSlice';
import {
    finishOrbitalCalculation, setBasicSelection, setCombination, setSurfaceStyle, startOrbitalCalculation,
} from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import type { CombinationSelection } from '../../src/combinations';
import type { BasicSelection } from '../../src/store/orbitalSlice';

/** Orbitals mode with `selection` drawn (its iso value landed) and `combination` chosen. */
function orbitalsState(selection: BasicSelection = { n: 3, l: 2, ml: 0 }, combination?: CombinationSelection) {
    const store = makeStore();
    store.dispatch(setMode('hydrogenic'));
    store.dispatch(setBasicSelection(selection));
    store.dispatch(startOrbitalCalculation(basicOrbitalParams(selection.n, selection.l, selection.ml, 0.9)));
    store.dispatch(finishOrbitalCalculation({ isoLevel: 1.234e-3 }));
    if (combination) store.dispatch(setCombination(combination));
    return store;
}

/** No-break spaces (formulas, fix round 1) read as plain spaces in these checks; one test pins them on their own. */
const flat = (text: string) => text.replace(/\u00A0/g, ' ');

/** What Info shows at `level`, outside the folded "How this was computed" (that is checked on its own). */
function shownAt(content: InfoContent, level: LearningLevel): string {
    const { container, unmount } = render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level }));
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

describe('basicInfo (Task 5)', () => {
    it('titles one orbital "Hydrogen — <name> orbital" with a real subscript, never "3d_z²"', () => {
        const content = basicInfo(orbitalsState().getState(), 'explore');
        render(React.createElement('h3', null, content.title));
        const title = screen.getByRole('heading');
        expect(title).toHaveTextContent('Hydrogen — 3dz² orbital');
        expect(title.querySelector('sub')).toHaveTextContent('z²');
        expect(title.textContent).not.toContain('_');
    });

    it('at Basics says what the shape is and counts its nodes in words, with no energy in Ha', () => {
        const text = shownAt(basicInfo(orbitalsState().getState(), 'basics'), 'basics');
        expect(text).toContain('A dumbbell with a ring, shaped by its 2 nodes');
        expect(text).toContain('0 radial and 2 angular (two cones)');
        expect(text).toContain(BASIC_ORBITALS_ABOUT);
        expect(text).not.toMatch(/Ha\b/);
        expect(text).not.toContain('eV');
    });

    it('at Explore adds E = −1/(2n²) as −0.0556 Ha with −1.51 eV beside it, with true minus signs', () => {
        const text = shownAt(basicInfo(orbitalsState().getState(), 'explore'), 'explore');
        expect(text).toContain('−0.0556 Ha');
        expect(text).toContain('−1.51 eV');
        expect(text).not.toMatch(/-\d/);
        // The iso value waits for Advanced.
        expect(text).not.toContain('a₀⁻³');
    });

    it('at Advanced gives the iso value in scientific notation with its unit, a₀⁻³', () => {
        const text = shownAt(basicInfo(orbitalsState().getState(), 'advanced'), 'advanced');
        expect(text).toContain('|ψ|² = 1.23 × 10⁻³ a₀⁻³');
        expect(text).toContain('90 % of the electron');
        expect(text).not.toMatch(/\de-\d/);
    });

    it('keeps the iso value out while a new orbital is still computing (it would be the previous one\'s)', () => {
        const store = orbitalsState();
        store.dispatch(setBasicSelection({ n: 2, l: 1, ml: 0 }));
        const text = shownAt(basicInfo(store.getState(), 'research'), 'research');
        expect(text).toContain('Hydrogen — 2pz orbital');
        expect(text).not.toContain('a₀⁻³');
    });

    it('names a real orbital\'s complex ingredients only in the technical text', () => {
        const state = orbitalsState({ n: 2, l: 1, ml: 1 }).getState();
        expect(shownAt(basicInfo(state, 'explore'), 'explore')).not.toMatch(/complex/);
        expect(shownAt(basicInfo(state, 'advanced'), 'advanced')).toMatch(/complex states with mₗ = \+1 and mₗ = −1/);
    });

    it('has no nodes to count for 1s, and says so plainly', () => {
        const text = shownAt(basicInfo(orbitalsState({ n: 1, l: 0, ml: 0 }).getState(), 'basics'), 'basics');
        expect(text).toContain('A sphere, with no nodes');
    });

    it('states the method as the exact one-electron solution for one orbital', () => {
        expect(computedText(basicInfo(orbitalsState().getState(), 'research'))).toMatch(/exact one-electron solution, Z = 1/i);
    });

    it('carries the cut helper that used to sit under Cut away', () => {
        const store = orbitalsState();
        store.dispatch(setSurfaceStyle({ clipAxis: 'y' }));
        expect(shownAt(basicInfo(store.getState(), 'basics'), 'basics'))
            .toContain('The cut removes the part on the +y side of a plane perpendicular to the y axis.');
    });

    it('for a hybrid set, carries the basis-choice caption and the shared n = 2 energy', () => {
        const content = basicInfo(orbitalsState(undefined, { kind: 'hybrid', hybrid: 'sp3', member: 'all' }).getState(), 'explore');
        const text = shownAt(content, 'explore');
        expect(text).toContain('Hydrogen — sp³ hybrids — all 4');
        expect(text).toContain("Built from hydrogen's exact 2s and 2p (Z = 1).");
        expect(text).toContain("A basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state.");
        expect(text).toContain('−0.125 Ha');
        expect(computedText(content)).toMatch(/exact one-electron solution, Z = 1/i);
    });

    // The critique's "exact" contradiction: a field view is first-order perturbation theory, never exact.
    it('for combo=field (n = 1), states first-order perturbation theory and its validity, and never "exact one-electron"', () => {
        const content = basicInfo(orbitalsState(undefined, { kind: 'field', level: 1, field: 0.03, stark: 'lower' }).getState(), 'research');
        const computed = computedText(content);
        expect(computed).toContain('first-order');
        expect(computed).toContain('Dalgarno–Lewis');
        expect(computed).toContain('Valid for F ≪ 1 a.u.; ionisation by tunnelling is ignored.');
        expect(computed).toContain('about 4 %');
        const all = `${shownAt(content, 'research')} ${computed}`;
        expect(all).not.toMatch(/exact one-electron/i);
        expect(all).not.toContain(BASIC_ORBITALS_ABOUT);
        expect(all).toContain('Hydrogen (Z = 1) in a uniform field along +z, which pulls the electron towards −z.');
    });

    it('for combo=field (n = 2), gives the Stark shift the app computes, subscripted state names, and no "exact one-electron"', () => {
        const content = basicInfo(orbitalsState(undefined, { kind: 'field', level: 2, field: 0.0039, stark: 'lower' }).getState(), 'explore');
        const text = shownAt(content, 'explore');
        expect(text).toContain('−0.0117 Ha (−0.32 eV)');
        expect(text).toContain('−0.125 Ha (−3.40 eV)');
        expect(text).not.toContain('_');
        const computed = computedText(content);
        expect(computed).toContain('first-order');
        expect(`${text} ${computed}`).not.toMatch(/exact one-electron/i);
        // Review I2: the validity statement and n = 2's own limit moved here from the picker
        // (combination_controls.test.tsx); n = 1's 0.05 a.u. refusal is not n = 2's.
        expect(computed).toContain('Valid for F ≪ 1 a.u.; ionisation by tunnelling is ignored.');
        expect(computed).toMatch(/not bound/);
        expect(computed).not.toContain('0.05 a.u.');
    });

    // Fix round 1 (owner-delegated science ruling): for hydrogen a hybrid of the degenerate n = 2 states is still a
    // stationary state with E₂ -- not "a basis choice rather than a state of the free atom".
    it('calls a hydrogen hybrid a stationary state with E₂, chosen to describe bonding directions', () => {
        const computed = computedText(basicInfo(orbitalsState(undefined, { kind: 'hybrid', hybrid: 'sp', member: 'all' }).getState(), 'research'));
        expect(computed).toContain('for hydrogen still a stationary state with E₂');
        expect(computed).toContain("it is not the free atom's ground state");
        expect(computed).not.toMatch(/rather than a state of the free atom/);
    });

    it('builds sp from "2s and 2p", not "1 × 2p"', () => {
        const text = shownAt(basicInfo(orbitalsState(undefined, { kind: 'hybrid', hybrid: 'sp', member: 'all' }).getState(), 'explore'), 'explore');
        expect(text).toContain('Built from2s and 2p');
        expect(text).not.toContain('1 × 2p');
    });

    // Review wording fixes (fix round 1).
    it('says a sphere has its radial nodes, rather than is shaped by them', () => {
        const text = shownAt(basicInfo(orbitalsState({ n: 2, l: 0, ml: 0 }).getState(), 'basics'), 'basics');
        expect(text).toContain('A sphere, with 1 node — a surface where the electron is never found: 1 radial (a sphere) and 0 angular.');
    });

    it('writes cos φ, not cos 1φ, and gives the angular part its verb', () => {
        const text = shownAt(basicInfo(orbitalsState({ n: 2, l: 1, ml: 1 }).getState(), 'advanced'), 'advanced');
        expect(text).toContain('(cos φ)');
        expect(text).toContain('and the angular part has l = 1');
    });

    it('keeps formulas on one line with no-break spaces around their operators', () => {
        const content = basicInfo(orbitalsState().getState(), 'advanced');
        const { container } = render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level: 'advanced' }));
        const text = container.textContent ?? '';
        expect(text).toContain('n\u00A0−\u00A0l\u00A0−\u00A01\u00A0=\u00A00');
        expect(text).toContain('E\u00A0=\u00A0−1/(2n²)\u00A0Ha');
        expect(text).toContain('|ψ|²\u00A0=\u00A01.23\u00A0×\u00A010⁻³');
    });

    it('sets the quantum numbers in the fact labels in italics, so "Subshell l" never reads "Subshell I"', () => {
        const content = basicInfo(orbitalsState().getState(), 'basics');
        const { container } = render(React.createElement(InfoPanel, { content, topic: null, onClearTopic: () => {}, level: 'basics' }));
        const labels = Array.from(container.querySelectorAll('.info-fact dt'));
        expect(labels.map(label => label.textContent).slice(0, 3)).toEqual(['Shell n', 'Subshell l', 'Orbital mₗ']);
        expect(labels.slice(0, 3).map(label => label.querySelector('i')?.textContent)).toEqual(['n', 'l', 'mₗ']);
    });
});
