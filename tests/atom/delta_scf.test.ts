// tests/atom/delta_scf.test.ts
import {
    ionisationEnergy, excitationEnergy, ionisedSpeciesOf, polarisedTotalEnergy,
    HARTREE_IN_EV, DELTA_SCF_LABEL, DELTA_SCF_METHOD, clearDeltaScfCacheForTests,
} from '../../src/atom/delta_scf';
import { NIST_FIRST_IONISATION_EV, NA_D_LINE_EV } from '../../src/atom/ionisation_references';
import { neutralGround } from '../../src/atom/species';
import * as spinScf from '../../src/atom/spin_scf';

jest.setTimeout(120000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const itSlow = SLOW ? it : it.skip;
const within = (value: number, reference: number, percent: number) =>
    expect(Math.abs(value - reference) / reference * 100).toBeLessThanOrEqual(percent);

beforeAll(clearDeltaScfCacheForTests);

describe('ΔSCF energies', () => {
    it('states its method', () => {
        expect(DELTA_SCF_LABEL).toBe('ΔSCF, LDA');
        expect(DELTA_SCF_METHOD).toMatch(/difference of two self-consistent total energies/);
        expect(DELTA_SCF_METHOD).toMatch(/spin-polarised/);
        // M5: the tooltip states both halves of the method split -- these
        // energies are spin-polarised (just asserted above), but the picture
        // on screen is a different, spin-restricted solve of the same LDA.
        // A reader who only ever hovers an energy must still be told the
        // picture is not what produced the number next to it.
        expect(DELTA_SCF_METHOD).toMatch(/spin-restricted/);
    });

    it('is exact for hydrogen and He+ (one-electron bypass)', () => {
        expect(ionisationEnergy(neutralGround(1))!.valueEv).toBeCloseTo(0.5 * HARTREE_IN_EV, 9);
        expect(ionisationEnergy({ Z: 2, charge: 1, excitation: null })!.valueEv).toBeCloseTo(2 * HARTREE_IN_EV, 9);
    });

    it('meets the spec for He and Li (fast cases of the H-Ar sweep)', () => {
        const he = ionisationEnergy(neutralGround(2))!;
        within(he.valueEv, NIST_FIRST_IONISATION_EV[2], 10);          // measured 22.72 eV, -7.6 %
        const li = ionisationEnergy(neutralGround(3))!;
        within(li.valueEv, NIST_FIRST_IONISATION_EV[3], 10);          // measured 5.473 eV, +1.5 %
        // And equal to NIST's own LSD ΔSCF, -7.142818 - (-7.343957) Ha, to 1e-3 eV.
        expect(li.valueEv).toBeCloseTo((-7.142818 + 7.343957) * HARTREE_IN_EV, 3);
        expect([li.fromLabel, li.toLabel]).toEqual(['Li', 'Li⁺']);
    });

    it('knows which species ionisation leads to', () => {
        expect(ionisedSpeciesOf(neutralGround(1))).toBe('bare nucleus');
        expect(ionisedSpeciesOf(neutralGround(11))).toEqual({ Z: 11, charge: 1, excitation: null });
        expect(ionisedSpeciesOf({ Z: 11, charge: 1, excitation: null })).toBeNull();   // Na2+ breaks the neon core
        expect(ionisedSpeciesOf({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } })).toBeNull();
        expect(excitationEnergy(neutralGround(11))).toBeNull();
    });

    it('gives the exact excitation of an excited hydrogen: 1s -> 2p = 3/8 Ha', () => {
        const h = excitationEnergy({ Z: 1, charge: 0, excitation: { from: { n: 1, l: 0 }, to: { n: 2, l: 1 } } })!;
        expect(h.valueEv).toBeCloseTo(0.375 * HARTREE_IN_EV, 9);
    });

    itSlow('meets the spec for Na 3s -> 3p: within 10 % of the D line', () => {
        const na = excitationEnergy({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } })!;
        within(na.valueEv, NA_D_LINE_EV, 10);                          // measured 2.185 eV, +3.8 %
    });

    it('throws a stated error when the spin-polarised solve did not converge (ruling C6)', () => {
        const spy = jest.spyOn(spinScf, 'solvePolarised').mockReturnValue({
            Z: 6, charge: 0, totalEnergy: NaN, converged: false, iterations: 200, highestEigenvalue: -1,
        });
        clearDeltaScfCacheForTests();
        try {
            expect(() => polarisedTotalEnergy(neutralGround(6))).toThrow(/did not converge/i);
        } finally {
            spy.mockRestore();
            clearDeltaScfCacheForTests();
        }
    });
});
