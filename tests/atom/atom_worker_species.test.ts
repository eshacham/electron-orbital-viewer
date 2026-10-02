import { handleAtomWorkerRequest } from '../../src/workers/atomWorker';
import { NIST_FIRST_IONISATION_EV } from '../../src/atom/ionisation_references';

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

    it('carries no reference for a neutral ground state, and keeps its key as String(Z)', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 3, enclosedFraction: 0.9, requestId: 1 });
        if (response.type !== 'success') throw new Error(response.type);
        expect(response.profile.speciesKey).toBe('3');
        expect(response.profile.reference).toBeNull();
    });

    it('answers an unbound anion with an explicit unbound reply, not a profile', () => {
        const { response } = handleAtomWorkerRequest({ type: 'solve', Z: 17, charge: -1, excitation: null, enclosedFraction: 0.9, requestId: 3 });
        expect(response).toEqual({ type: 'unbound', message: expect.stringMatching(/^LDA does not bind this anion/), requestId: 3 });
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
});
