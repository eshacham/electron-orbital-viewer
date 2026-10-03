import { handleAtomWorkerRequest, solveFailureMessage, SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { UnboundElectronError } from '../../src/atom/scf_shared';
import * as scf from '../../src/atom/scf';
import { buildAtomProfile } from '../../src/atom/atom_profile';
import { AtomSpecies } from '../../src/atom/species';
import { NIST_FIRST_IONISATION_EV } from '../../src/atom/ionisation_references';
import { wholeAtomFramingRadius } from '../../src/atom/framing';
import * as deltaScf from '../../src/atom/delta_scf';

jest.setTimeout(120000);

describe('atom worker, species protocol', () => {
    it('solves Na+ and carries its key, charge and the neutral atom\'s radii for the reference ring', () => {
        const { response, transfer } = handleAtomWorkerRequest({ type: 'solve', Z: 11, charge: 1, excitation: null, enclosedFraction: 0.9, requestId: 7 });
        expect(response.type).toBe('success');
        if (response.type !== 'success') return;
        expect(response.requestId).toBe(7);
        expect(response.profile.speciesKey).toBe('11+1');
        expect(response.profile.charge).toBe(1);
        expect(response.profile.subshells.reduce((sum, s) => sum + s.electrons, 0)).toBe(10);
        expect(response.profile.reference!.displayRadius).toBeGreaterThan(response.profile.displayRadius);
        expect(transfer).toContain(response.profile.total.buffer);
    });

    // Ruling C12's fallback: the ion is framed on the neutral's own framing
    // radius, not its drawn radius, so a charge step leaves the camera put.
    it('carries the neutral atom\'s own framing radius in the reference', () => {
        const ion = handleAtomWorkerRequest({ type: 'solve', Z: 2, charge: 1, excitation: null, enclosedFraction: 0.9, requestId: 1 }).response;
        const neutral = handleAtomWorkerRequest({ type: 'solve', Z: 2, enclosedFraction: 0.9, requestId: 2 }).response;
        if (ion.type !== 'success' || neutral.type !== 'success') throw new Error('He or He+ did not solve');
        expect(ion.profile.reference!.framingRadius).toBe(wholeAtomFramingRadius(neutral.profile));
        expect(ion.profile.reference!.framingRadius).toBeLessThan(ion.profile.reference!.displayRadius);
    });

    it('carries no reference for a neutral ground state, and keeps its key as String(Z)', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 3, enclosedFraction: 0.9, requestId: 1 });
        if (response.type !== 'success') throw new Error(response.type);
        expect(response.profile.speciesKey).toBe('3');
        expect(response.profile.reference).toBeNull();
    });

    it('answers an unbound anion with an explicit unbound reply, not a profile', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 17, charge: -1, excitation: null, enclosedFraction: 0.9, requestId: 3 });
        expect(response).toEqual({ type: 'unbound', message: expect.stringMatching(/^LDA does not bind this anion: its 3p electron/), requestId: 3 });
    });

    it('computes ΔSCF energies on request', () => {
        const { response } = handleAtomWorkerRequest({ type: 'energies', Z: 3, charge: 0, excitation: null, requestId: 4 });
        if (response.type !== 'energies') throw new Error(response.type);
        expect(response.speciesKey).toBe('3');
        expect(Math.abs(response.ionisation!.valueEv - NIST_FIRST_IONISATION_EV[3]) / NIST_FIRST_IONISATION_EV[3]).toBeLessThan(0.1);
        expect(response.excitation).toBeNull();
    });

    it('reports a disallowed species as an error rather than throwing out of the worker', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 11, charge: 2, excitation: null, enclosedFraction: 0.9, requestId: 5 });
        expect(response).toEqual({ type: 'error', message: expect.stringMatching(/not offered/), requestId: 5 });
    });

    // Same disallowed-charge guard as the 'solve' test above, but through the
    // 'energies' branch's own catch -- both branches share one try/catch in
    // handleAtomWorkerRequest, but only a passing test on each pins that down.
    it('reports a disallowed species on the energies path as an error too', () => {
        const { response } = handleAtomWorkerRequest({ type: 'energies', Z: 11, charge: 2, excitation: null, requestId: 6 });
        expect(response).toEqual({ type: 'error', message: expect.stringMatching(/not offered/), requestId: 6 });
    });

    // Re-review of T7-f: the energies' spin-polarised LDA can fail to bind a
    // level the picture's restricted LDA binds (Tb 6s -> 4f); the reply says
    // which calculation, for which species, not the solver's bare sentence.
    it('names the species and the spin-polarised ΔSCF when the energies find a level unbound', () => {
        const spy = jest.spyOn(deltaScf, 'excitationEnergy').mockImplementation(() => { throw new UnboundElectronError(4, 3); });
        try {
            const excitation = { from: { n: 6, l: 0 }, to: { n: 4, l: 3 } };
            const { response } = handleAtomWorkerRequest({ type: 'energies', Z: 65, charge: 0, excitation, requestId: 9 });
            expect(response).toEqual({ type: 'error', requestId: 9, message: expect.stringMatching(/^Spin-polarised ΔSCF for Terbium, excited 6s → 4f: its 4f electron is not bound in the spin-polarised LDA/) });
        } finally {
            spy.mockRestore();
        }
    });

    // Ruling T7-f: a failure names the species and the method that failed,
    // not just whatever the solver said. Sm 6s -> 4f's promoted 4f is not
    // bound (ruling T7-b): an explained verdict like an unbound anion's, so
    // it is an 'unbound' reply too.
    it('reports a promoted electron LDA does not bind as unbound, naming the species and the method', () => {
        const excitation = { from: { n: 6, l: 0 }, to: { n: 4, l: 3 } };
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 62, charge: 0, excitation, enclosedFraction: 0.9, requestId: 8 });
        expect(response).toEqual({
            type: 'unbound',
            message: 'Non-relativistic SCF for Samarium, excited 6s → 4f: the promoted 4f electron is not bound (LDA binds it by less than 10⁻⁴ Ha).',
            requestId: 8,
        });
    });

    // Not tested here: an anion's energies request (e.g. Cl-, Z=17 charge=-1)
    // also reaches UnboundAnionError, via solvePolarised rather than
    // assertStatesBound's restricted-LDA path -- confirmed by hand to reply
    // 'unbound' with the same "its 3p electron" message, but the
    // spin-polarised SCF it requires takes several seconds, too slow for the
    // default suite's budget.
});

describe('solveFailureMessage (ruling T7-f)', () => {
    const samarium: AtomSpecies = { Z: 62, charge: 0, excitation: { from: { n: 6, l: 0 }, to: { n: 4, l: 3 } } };
    const ytterbium: AtomSpecies = { Z: 70, charge: 0, excitation: null };

    it('names the mode, the species and the promoted electron', () => {
        expect(solveFailureMessage(samarium, 'scalar', new UnboundElectronError(4, 3))).toBe(
            'Scalar-relativistic SCF for Samarium, excited 6s → 4f: the promoted 4f electron is not bound (LDA binds it by less than 10⁻⁴ Ha).');
    });

    it('names the j-level of a Dirac failure, and calls an electron that was not promoted just that', () => {
        expect(solveFailureMessage(ytterbium, 'spinOrbit', new UnboundElectronError(4, 3, 3.5))).toBe(
            'Dirac (spin–orbit) SCF for Ytterbium: the 4f⁷⁄₂ electron is not bound (LDA binds it by less than 10⁻⁴ Ha).');
    });

    it('keeps any other failure\'s own explanation after the species and mode', () => {
        expect(solveFailureMessage(ytterbium, 'off', new Error('Radial grid (rMax=140) is too small to hold n=4, l=3.'))).toBe(
            'Non-relativistic SCF for Ytterbium failed: Radial grid (rMax=140) is too small to hold n=4, l=3.');
    });
});

describe('atom worker, relativity', () => {
    it('solves in the requested mode and carries the same species\' non-relativistic comparison', () => {
        // Li+ rather than a heavier ion only for the default suite's time;
        // the j-split of a p shell is pinned in atom_worker_contract.
        const { response, transfer } = handleAtomWorkerRequest({ type: 'solve', Z: 3, charge: 1, excitation: null, enclosedFraction: 0.9, relativity: 'spinOrbit', requestId: 11 });
        if (response.type !== 'success') throw new Error(response.type);
        const { profile } = response;
        expect(profile.relativity).toBe('spinOrbit');
        // The cache key stays the species' own; the mode is carried beside it.
        expect(profile.speciesKey).toBe('3+1');
        expect(profile.subshells.map(s => [s.n, s.l, s.j])).toEqual([[1, 0, 0.5]]);
        // Ruling C5: Li+'s own non-relativistic solve -- 1s², no 2s -- not neutral lithium's.
        expect(profile.nonRelativistic!.subshells.map(s => [s.n, s.l, s.electrons])).toEqual([[1, 0, 2]]);
        expect(profile.valenceS!.label).toBe('1s½');
        expect(profile.reference).not.toBeNull();
        expect(profile.comparisonUnavailable).toBeNull();
        for (const curve of [...profile.nonRelativistic!.shells, ...profile.nonRelativistic!.subshells].map(c => c.curve)) {
            expect(transfer).toContain(curve.buffer);
        }
        // postMessage rejects a transfer list that names one buffer twice.
        expect(new Set(transfer).size).toBe(transfer.length);
    });

    // Fix round 1, I1 (ruling C14 for cations): off frames an ion on at
    // least the neutral's *off* framing, so a relativistic picture must too
    // -- floored on the scalar neutral and the ion's own off framing alone,
    // Au⁺ zoomed in 14 % on the switch. Li⁺ for the default suite's time:
    // its contraction is tiny, but any difference at all fails toBe.
    it('frames a cation identically off and relativistic', () => {
        const framing = (profile: SerialisedAtomProfile) => Math.max(
            wholeAtomFramingRadius(profile), profile.reference?.framingRadius ?? 0, profile.nonRelativistic?.framingRadius ?? 0);
        const solve = (relativity: 'off' | 'scalar' | 'spinOrbit', requestId: number) => {
            const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 3, charge: 1, excitation: null, enclosedFraction: 0.9, relativity, requestId });
            if (response.type !== 'success') throw new Error(response.type);
            return response.profile;
        };
        const off = framing(solve('off', 21));
        expect(framing(solve('scalar', 22))).toBe(off);
        expect(framing(solve('spinOrbit', 23))).toBe(off);
    });

    it('treats an absent mode as off, exactly as before', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 11, charge: 1, excitation: null, enclosedFraction: 0.9, requestId: 12 });
        if (response.type !== 'success') throw new Error(response.type);
        expect(response.profile.relativity).toBe('off');
        expect(response.profile.nonRelativistic).toBeNull();
        expect(response.profile.valenceS).toBeNull();
    });

    // Ruling C4: an ion's reference ring is the neutral atom solved in the
    // ion's own mode, cached per mode -- the off request first, so a key that
    // ignored the mode would serve the off radii to the scalar request.
    it('draws the reference ring from the neutral atom in the same mode', () => {
        const off = handleAtomWorkerRequest({ type: 'solve', Z: 3, charge: 1, excitation: null, enclosedFraction: 0.9, requestId: 13 }).response;
        const scalar = handleAtomWorkerRequest({ type: 'solve', Z: 3, charge: 1, excitation: null, enclosedFraction: 0.9, relativity: 'scalar', requestId: 14 }).response;
        if (off.type !== 'success' || scalar.type !== 'success') throw new Error('Li+ did not solve');
        const neutralScalar = buildAtomProfile(scf.solveAtom(3, 'scalar'), 0.9);
        expect(scalar.profile.reference!.contourRadius).toBe(neutralScalar.contourRadius);
        expect(scalar.profile.reference!.displayRadius).toBe(neutralScalar.displayRadius);
        expect(scalar.profile.reference!.framingRadius).toBe(wholeAtomFramingRadius(neutralScalar));
        expect(scalar.profile.reference!.contourRadius).not.toBe(off.profile.reference!.contourRadius);
    });

    // Fix round 1 (M2): the ring is an extra, so a neutral that fails in the
    // ion's mode costs the ring, never the ion's own picture -- and the
    // payload says why, naming the mode that failed.
    it('lands the ion without a ring when the neutral reference fails in its mode', () => {
        const spy = jest.spyOn(scf, 'solveAtom').mockImplementation(() => { throw new Error('boom'); });
        try {
            const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 2, charge: 1, excitation: null, enclosedFraction: 0.9, relativity: 'scalar', requestId: 18 });
            if (response.type !== 'success') throw new Error(response.type);
            expect(response.profile.reference).toBeNull();
            expect(response.profile.referenceUnavailable).toBe('No neutral reference ring: Scalar-relativistic SCF for Helium failed: boom');
        } finally {
            spy.mockRestore();
        }
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 2, charge: 1, excitation: null, enclosedFraction: 0.9, relativity: 'scalar', requestId: 19 });
        if (response.type !== 'success') throw new Error(response.type);
        expect(response.profile.reference).not.toBeNull();
        expect(response.profile.referenceUnavailable).toBeNull();
    });

    it('names the requested mode when the solve fails', () => {
        const spy = jest.spyOn(scf, 'solveSpecies').mockImplementation(() => { throw new UnboundElectronError(4, 3, 3.5); });
        try {
            const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 70, enclosedFraction: 0.9, relativity: 'spinOrbit', requestId: 15 });
            expect(response).toEqual({
                type: 'unbound',
                message: 'Dirac (spin–orbit) SCF for Ytterbium: the 4f⁷⁄₂ electron is not bound (LDA binds it by less than 10⁻⁴ Ha).',
                requestId: 15,
            });
        } finally {
            spy.mockRestore();
        }
    });

    // Ruling T7-b: for Pr-Eu 6s -> 4f the non-relativistic solve finds the
    // promoted 4f unbound while a relativistic mode may bind it. The
    // relativistic picture still lands, with no dashed curve and no "what
    // changed", and says why. Simulated on helium so it costs next to
    // nothing: the real solveSpecies answers the relativistic request, the
    // off one throws.
    it('lands the relativistic picture without a comparison when the non-relativistic solve finds a level unbound', () => {
        const real = scf.solveSpecies;
        const spy = jest.spyOn(scf, 'solveSpecies').mockImplementation((species, relativity = 'off') => {
            if (relativity === 'off') throw new UnboundElectronError(4, 3);
            return real(species, relativity);
        });
        try {
            const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 2, enclosedFraction: 0.9, relativity: 'scalar', requestId: 16 });
            if (response.type !== 'success') throw new Error(response.type);
            expect(response.profile.relativity).toBe('scalar');
            expect(response.profile.nonRelativistic).toBeNull();
            expect(response.profile.valenceS).toBeNull();
            expect(response.profile.comparisonUnavailable).toBe('No non-relativistic comparison: LDA does not bind the 4f without relativity.');
        } finally {
            spy.mockRestore();
        }
    });

    it('draws no comparison from a non-relativistic solve that did not converge', () => {
        const real = scf.solveSpecies;
        const spy = jest.spyOn(scf, 'solveSpecies').mockImplementation((species, relativity = 'off') =>
            relativity === 'off' ? { ...real(species, 'off'), converged: false } : real(species, relativity));
        try {
            const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 2, enclosedFraction: 0.9, relativity: 'scalar', requestId: 17 });
            if (response.type !== 'success') throw new Error(response.type);
            expect(response.profile.nonRelativistic).toBeNull();
            expect(response.profile.valenceS).toBeNull();
            expect(response.profile.comparisonUnavailable).toBe('No non-relativistic comparison: the non-relativistic SCF did not converge.');
        } finally {
            spy.mockRestore();
        }
    });
});
