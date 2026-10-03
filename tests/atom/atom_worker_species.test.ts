import { handleAtomWorkerRequest, solveFailureMessage } from '../../src/workers/atomWorker';
import { UnboundElectronError } from '../../src/atom/scf_shared';
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
