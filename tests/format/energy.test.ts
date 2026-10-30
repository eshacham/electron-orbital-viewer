import { evText, totalEnergyPairText, totalEnergyText, orbitalEnergyText, hartreeText } from '../../src/format/energy';

// Science corrections S2: the last Ha-first energies read eV first, through the one shared formatter.
describe('evText', () => {
    it('is eV to three significant figures with a true minus', () => {
        expect(evText(-0.5)).toBe('−13.6 eV');
        expect(evText(-0.1988)).toBe('−5.41 eV');
        expect(evText(-1.3)).toBe('−35.4 eV');
        expect(evText(-9.3)).toBe('−253 eV');
        expect(evText(-0.12)).toBe('−3.27 eV');
    });
});

describe('totalEnergyText', () => {
    it('is eV to 2 decimals, then Ha to 6, a true minus', () => {
        expect(totalEnergyText(-76.358723)).toBe('−2077.83 eV (−76.358723 Ha)');
        expect(totalEnergyText(0.021134)).toBe('0.575 eV (0.021134 Ha)');
    });
    it('keeps a small eV value to three significant figures, never a rounded −0.00 eV', () => {
        expect(totalEnergyText(-0.000574)).toBe('−0.0156 eV (−0.000574 Ha)');
        expect(totalEnergyText(-0.00004)).toBe('−0.00109 eV (−0.000040 Ha)');
        expect(totalEnergyText(-0.00002)).toBe('−5.44 × 10⁻⁴ eV (−0.000020 Ha)');
        expect(totalEnergyText(0)).toBe('0 eV (0.000000 Ha)');
    });
    it('takes the Ha places the caller needs (H₂⁺ quotes four)', () => {
        expect(totalEnergyText(-0.6026342, 4)).toBe('−16.40 eV (−0.6026 Ha)');
    });
});

describe('totalEnergyPairText', () => {
    it('is the same two numbers joined by a comma, for a place that is itself in brackets', () => {
        expect(totalEnergyPairText(-0.5, 1)).toBe('−13.61 eV, −0.5 Ha');
    });
});

describe('the shared pieces stay put', () => {
    it('keeps the orbital energy texts as they were', () => {
        expect(orbitalEnergyText(-0.1988)).toBe('−5.41 eV (−0.199 Ha)');
        expect(hartreeText(-0.1988)).toBe('−0.199 Ha');
    });
});
