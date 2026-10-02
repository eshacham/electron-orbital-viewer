// tests/atom/spin_scf.test.ts
import { spinOccupations, solvePolarised } from '../../src/atom/spin_scf';
import { solveAtom } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { configurationFor, parseConfiguration } from '../../src/atom/configurations';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';

jest.setTimeout(120000);

// NIST SRD 141 (Kotochigova et al., Phys. Rev. A 55, 191 (1997)), LSD column, retrieved 2026-09-25.
const NIST_LSD = { O: -74.527410, 'O+': -74.016721 };
const TOTAL_ENERGY_TOLERANCE = 1e-5;   // the same 0.001 % the restricted NIST benchmark uses

describe('spin-polarised SCF', () => {
    it('occupies open subshells by Hund\'s rule', () => {
        const byLabel = (c: ReturnType<typeof spinOccupations>) => c.map(s => `${s.n}${'spdf'[s.l]}:${s.up}/${s.down}`);
        expect(byLabel(spinOccupations(configurationFor(8)))).toEqual(['1s:1/1', '2s:1/1', '2p:3/1']);
        expect(byLabel(spinOccupations(configurationFor(7)))).toContain('2p:3/0');
        expect(byLabel(spinOccupations(parseConfiguration('[Ar] 3d6')))).toContain('3d:5/1');
    });

    it('equals the restricted energy for a closed shell (He)', () => {
        expect(solvePolarised(2, configurationFor(2)).totalEnergy).toBeCloseTo(solveAtom(2).totalEnergy, 7);
    });

    it('reproduces NIST LSD for O and O+ (the case restricted LDA gets 22 % wrong)', () => {
        const o = solvePolarised(8, configurationFor(8));
        const oPlus = solvePolarised(8, ionConfigurationFor(8, 1));
        expect(o.converged && oPlus.converged).toBe(true);
        expect(Math.abs((o.totalEnergy - NIST_LSD.O) / NIST_LSD.O)).toBeLessThan(TOTAL_ENERGY_TOLERANCE);
        expect(Math.abs((oPlus.totalEnergy - NIST_LSD['O+']) / NIST_LSD['O+'])).toBeLessThan(TOTAL_ENERGY_TOLERANCE);
    });

    it('is exact for one electron and zero for none', () => {
        expect(solvePolarised(1, configurationFor(1)).totalEnergy).toBeCloseTo(-0.5, 12);
        expect(solvePolarised(3, [{ n: 2, l: 1, electrons: 1 }]).totalEnergy).toBeCloseTo(-9 / 8, 12);
        expect(solvePolarised(1, []).totalEnergy).toBe(0);
    });

    it('reports an unbound anion the same way the restricted solver does', () => {
        expect(() => solvePolarised(17, ionConfigurationFor(17, -1))).toThrow(UnboundAnionError);
    });
});
