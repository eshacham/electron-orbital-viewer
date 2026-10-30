import { nb } from '../../src/format/text';
import { evText, evTickText, totalEnergyPairText, totalEnergyText, orbitalEnergyText, orbitalEnergyTableParts, orbitalEnergyParts, hartreeText, wellDepthText, energyInUnitText, evHaPairText } from '../../src/format/energy';

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

// Final polish F4 (ruled): the Atoms table's Ha column is 3 places below 100 Ha and 1 place from 100 Ha up.
describe('orbitalEnergyTableParts', () => {
    it('keeps three places in Ha below 100 Ha, with eV unchanged', () => {
        expect(orbitalEnergyTableParts(-0.1988)).toEqual({ ev: '−5.41', ha: '−0.199' });
        expect(orbitalEnergyTableParts(-99.4567).ha).toBe('−99.457');
        expect(orbitalEnergyTableParts(-0.5).ev).toBe(orbitalEnergyParts(-0.5).ev);
    });
    it('gives one place from 100 Ha up (uranium 1s, 2s, 4f), with a true minus', () => {
        expect(orbitalEnergyTableParts(-3689.7189).ha).toBe('−3689.7');
        expect(orbitalEnergyTableParts(-157.4691).ha).toBe('−157.5');
        expect(orbitalEnergyTableParts(-100).ha).toBe('−100.0');
        expect(orbitalEnergyTableParts(-157.4691).ev).toBe('−4285');
    });
    // The 100 Ha boundary is tested on the rounded value: what rounds up to 100.000 at three places reads 100.0.
    it('switches to one place where three places round up to 100 Ha, and not before', () => {
        expect(orbitalEnergyTableParts(-99.9996).ha).toBe('−100.0');
        expect(orbitalEnergyTableParts(-99.9994).ha).toBe('−99.999');
    });
    // eV: a whole number from 1000 eV up, two places below (both sides of the boundary; 1000 eV = 36.7493 Ha).
    it('gives eV whole from 1000 eV up and two places below', () => {
        expect(orbitalEnergyTableParts(-3689.7189).ev).toBe('−100402');
        expect(orbitalEnergyTableParts(-1000 / 27.211386245988).ev).toBe('−1000');
        expect(orbitalEnergyTableParts(-999.9 / 27.211386245988).ev).toBe('−999.90');
        expect(orbitalEnergyTableParts(-999.999 / 27.211386245988).ev).toBe('−1000');
        expect(orbitalEnergyTableParts(-0.1988).ev).toBe('−5.41');
        expect(orbitalEnergyTableParts(0.5).ev).toBe('13.61');
    });
    it('changes nothing for the other Ha displays', () => {
        expect(hartreeText(-3689.7189)).toBe('−3689.719 Ha');
        expect(orbitalEnergyText(-157.4691)).toBe(`${orbitalEnergyParts(-157.4691).ev} eV (−157.469 Ha)`);
    });
});

// Science corrections S1: the MO diagram's axis labels -- whole eV, a true minus, no unit (the axis names it once).
describe('evTickText', () => {
    it('is a whole number of eV with a true minus, and zero unsigned', () => {
        expect(evTickText(-10)).toBe('−10');
        expect(evTickText(5)).toBe('5');
        expect(evTickText(0)).toBe('0');
        expect(evTickText(-0)).toBe('0');
        expect(evTickText(-30.0000000001)).toBe('−30');
    });
});

describe('totalEnergyText', () => {
    it('is eV to 2 decimals, then Ha to 6, a true minus', () => {
        expect(totalEnergyText(-76.358723)).toBe(nb('−2077.83 eV (−76.358723 Ha)'));
        expect(totalEnergyText(0.021134)).toBe(nb('0.575 eV (0.021134 Ha)'));
    });
    it('holds its number and unit on one line (no-break spaces)', () => {
        expect(totalEnergyText(-76.358723)).not.toMatch(/ /);
    });
    it('keeps a small eV value to three significant figures, never a rounded −0.00 eV', () => {
        expect(totalEnergyText(-0.000574)).toBe(nb('−0.0156 eV (−0.000574 Ha)'));
        expect(totalEnergyText(-0.00004)).toBe(nb('−0.00109 eV (−0.000040 Ha)'));
        expect(totalEnergyText(-0.00002)).toBe(nb('−5.44 × 10⁻⁴ eV (−0.000020 Ha)'));
        expect(totalEnergyText(0)).toBe(nb('0 eV (0.000000 Ha)'));
    });
    it('takes the Ha places the caller needs (H₂⁺ quotes four)', () => {
        expect(totalEnergyText(-0.6026342, 4)).toBe(nb('−16.40 eV (−0.6026 Ha)'));
    });
});

describe('evText at core energies', () => {
    it('is a whole number from 1000 eV up, never × 10³ (Mg 1s, −49.2 Ha)', () => {
        expect(evText(-49.2)).toBe('−1339 eV');
        expect(evText(-36.7)).toBe('−999 eV'); // still three significant figures below 1000 eV
        // T1 re-review N1: 999.5–999.99 eV rounds to 1000 at three significant figures, so it reads whole too.
        expect(evText(-36.74)).toBe('−1000 eV');
        expect(evText(-37)).toBe('−1007 eV');
        expect(evText(-9.3)).toBe('−253 eV');
    });
});

describe('totalEnergyPairText', () => {
    it('is the same two numbers joined by a comma, for a place that is itself in brackets', () => {
        expect(totalEnergyPairText(-0.5, 1)).toBe(nb('−13.61 eV, −0.5 Ha'));
    });
});

describe('the shared pieces stay put', () => {
    it('keeps the orbital energy texts as they were', () => {
        expect(orbitalEnergyText(-0.1988)).toBe('−5.41 eV (−0.199 Ha)');
        expect(hartreeText(-0.1988)).toBe('−0.199 Ha');
    });
});

// Final review M2: He₂'s van der Waals well, a few hundredths of a mHa: eV first, mHa beside it.
describe('wellDepthText', () => {
    it('is eV to 3 significant figures, then mHa to 2 places, held on one line', () => {
        expect(wellDepthText(3.9e-5)).toBe(nb('1.06 × 10⁻³ eV, 0.04 mHa'));
        expect(wellDepthText(0.0004)).toBe(nb('1.09 × 10⁻² eV, 0.40 mHa'));
    });
});

// Final polish F7: the curve plot's and the Bonds captions' local formatters live here, their strings unchanged.
describe('energyInUnitText', () => {
    it('states the energy in its own unit with the other beside it, a true minus', () => {
        expect(energyInUnitText(-0.5, 'Ha')).toBe('−0.5000 Ha (−13.61 eV)');
        expect(energyInUnitText(-13.6057, 'eV')).toBe('−13.61 eV (−0.5000 Ha)');
        expect(energyInUnitText(0.25, 'Ha')).toBe('0.2500 Ha (6.80 eV)');
    });
    it('shows an unrecognised unit bare', () => {
        expect(energyInUnitText(3, 'kJ')).toBe('3 kJ');
    });
});

describe('evHaPairText', () => {
    it('is eV to two places and Ha to four', () => {
        expect(evHaPairText(9.4412, 0.34697)).toBe('9.44 eV (0.3470 Ha)');
    });
});
