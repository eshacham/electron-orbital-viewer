/**
 * Ruling P15 (R-accuracy): every calculated ionisation energy shows its
 * NIST value, the signed percent difference, and -- for a d/f-block element
 * or a large error -- the one-line limitation note. Pa is the owner's own
 * observation (tests/atom/delta_scf_heavy.test.ts, ATOM_SLOW_TESTS=1):
 * 7.38 eV calculated vs 5.89 eV measured, +25 %.
 *
 * Task 6: the comparison and the note moved from the panel's energy line to
 * Info (atomInfo), which shows them from Advanced, as the line is; the
 * panel keeps the labelled value (tests/atom/species_controls.test.tsx).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { atomInfo, type AtomsInfoState } from '../../src/info/atom_info';
import InfoPanel from '../../src/info/InfoPanel';
import { makeStore } from '../export/fixtures';
import type { AtomState, EnergiesState } from '../../src/store/atomSlice';
import { DELTA_SCF_METHOD, deltaScfMethod } from '../../src/atom/delta_scf';

/** What Info shows at Research for `atom`, "How this was computed" included. */
function infoText(atom: Partial<AtomState>): string {
    const base = makeStore().getState();
    const state: AtomsInfoState = { atom: { ...base.atom, mode: 'atom', ...atom }, orbital: base.orbital };
    const { container, unmount } = render(React.createElement(InfoPanel, { content: atomInfo(state, 'research'), topic: null, onClearTopic: () => {}, level: 'research' }));
    // No-break spaces (a value held to its unit) read as plain spaces here.
    const text = (container.textContent ?? '').replace(/\u00A0/g, ' ');
    unmount();
    return text;
}

const done = (key: string, valueEv: number, from: string, to: string): EnergiesState =>
    ({ speciesKey: key, status: 'done', ionisation: { valueEv, fromLabel: from, toLabel: to }, excitation: null, message: null });

describe('Info: energy accuracy (ruling P15, Task 6)', () => {
    it('shows protactinium\'s measured value, its +25.3 % and the limitation note', () => {
        const text = infoText({ Z: 91, energies: done('91', 7.38, 'Pa', 'Pa⁺') });
        // Fix round 1 (M10): NIST's 5.89 as tabulated, not "5.890".
        expect(text).toContain('Measured (NIST)5.89 eV (calculated +25.3 %)');
        expect(text).toMatch(/open shells; expect larger errors/);
    });

    it('shows sodium\'s measured value and +3.1 %, with no limitation note', () => {
        const text = infoText({ Z: 11, energies: done('11', 5.3, 'Na', 'Na⁺') });
        expect(text).toContain('Measured (NIST)5.139 eV (calculated +3.1 %)');
        expect(text).not.toMatch(/open shells; expect larger errors/);
    });

    it('shows no measured value and no percentage for a +1 ion', () => {
        const text = infoText({ Z: 11, charge: 1, energies: done('11+1', 47.3, 'Na⁺', 'Na²⁺') });
        expect(text).toContain('Ionisation energy (Na⁺ → Na²⁺)47.30 eV');
        expect(text).not.toContain('NIST');
        expect(text).not.toMatch(/open shells; expect larger errors/);
    });

    // D6 (preflight): P15 overrides C15's old Z ≤ 18 gate. K (no open d/f) gets the comparison and no note; Fe (open
    // 3d) gets the note even though its own error is small.
    it('compares past Z = 18, with the note for a d-block element even at a small error', () => {
        const potassium = infoText({ Z: 19, energies: done('19', 4.34, 'K', 'K⁺') });
        expect(potassium).toContain('Measured (NIST)4.341 eV (calculated 0.0 %)');
        expect(potassium).not.toMatch(/open shells; expect larger errors/);
        expect(infoText({ Z: 26, energies: done('26', 8.042, 'Fe', 'Fe⁺') })).toMatch(/open shells; expect larger errors/);
    });

    // Ruling C6 / final review M4: the full ΔSCF method, as text (no longer a tooltip), worded for the picture.
    it('states the full ΔSCF method for the picture on screen', () => {
        expect(infoText({ Z: 11, energies: done('11', 5.37, 'Na', 'Na⁺') })).toContain(DELTA_SCF_METHOD);
        expect(infoText({
            Z: 79, energies: done('79', 9.1, 'Au', 'Au⁺'),
            profile: { ...makeStoreProfile(), Z: 79, relativity: 'scalar' },
        })).toContain(deltaScfMethod('scalar'));
    });
});

/** A minimal drawn profile (the method sentences read only its relativity). */
function makeStoreProfile(): NonNullable<AtomState['profile']> {
    const grid = 4;
    return {
        Z: 11, converged: true, rMin: 1e-3, dx: 0.05, size: grid, total: new Float32Array(grid), totalEmphasis: new Float32Array(grid),
        contourRadius: 2, valencePeakRadius: 1, displayRadius: 2, shellPeaks: new Float64Array([1]), shellIndexAtR: new Float32Array(grid),
        shells: [], subshells: [],
    };
}
