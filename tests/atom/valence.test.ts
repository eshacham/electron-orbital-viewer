import {
    valenceShellFor,
    valenceConfigurationLabel,
    valenceElectronsFor,
} from '../../src/atom/configurations';
import { MAX_ATOMIC_NUMBER } from '../../src/elements';

/**
 * Addendum 2, "core versus valence": an element's chemistry is almost
 * entirely its outermost shell, and making that visible renders the
 * periodic table's logic directly. These tests are the claim itself --
 * that members of a group share a valence configuration.
 */
describe('valence shell', () => {
    it('is the highest occupied n, for every element', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            const n = valenceShellFor(Z);
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(7);
        }
    });

    it('is the outermost shell, not the highest-energy subshell: iron\'s is N (4s), not M (3d)', () => {
        expect(valenceShellFor(26)).toBe(4);
        expect(valenceConfigurationLabel(26)).toBe('4s²');
    });

    it('gives the alkali metals one identical lonely s electron', () => {
        expect(valenceConfigurationLabel(3)).toBe('2s¹');   // Li
        expect(valenceConfigurationLabel(11)).toBe('3s¹');  // Na
        expect(valenceConfigurationLabel(19)).toBe('4s¹');  // K
        for (const Z of [3, 11, 19, 37, 55]) {
            expect(valenceElectronsFor(Z)).toBe(1);
        }
    });

    it('gives the halogens seven, one short of a filled s+p octet', () => {
        expect(valenceConfigurationLabel(9)).toBe('2s² 2p⁵');   // F
        expect(valenceConfigurationLabel(17)).toBe('3s² 3p⁵');  // Cl
        for (const Z of [9, 17, 35, 53]) {
            expect(valenceElectronsFor(Z)).toBe(7);
        }
    });

    it('gives the noble gases a sealed eight (helium excepted: there is no 1p)', () => {
        expect(valenceConfigurationLabel(10)).toBe('2s² 2p⁶');  // Ne
        expect(valenceConfigurationLabel(18)).toBe('3s² 3p⁶');  // Ar
        expect(valenceConfigurationLabel(2)).toBe('1s²');       // He
        for (const Z of [10, 18, 36, 54, 86]) {
            expect(valenceElectronsFor(Z)).toBe(8);
        }
    });

    it('never counts more electrons than the whole atom has', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            expect(valenceElectronsFor(Z)).toBeLessThanOrEqual(Z);
            expect(valenceElectronsFor(Z)).toBeGreaterThan(0);
        }
    });
});
