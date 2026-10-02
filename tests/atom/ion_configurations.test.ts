import fixture from './fixtures/nist_ion_ground_configurations.json';
import { configurationFor, parseConfiguration, SubshellOccupancy } from '../../src/atom/configurations';
import {
    allowedCharges, ionConfigurationFor, maxCationCharge, minAnionCharge, MIN_CHARGE, MAX_CHARGE,
} from '../../src/atom/ion_configurations';

const LETTERS = 'spdf';
const token = (t: string) => {
    const m = /^(\d+)([spdf])(\d*)$/.exec(t);
    if (!m) throw new Error(`bad NIST token ${t}`);
    return `${m[1]}${m[2]}${m[3] === '' ? 1 : Number(m[3])}`;
};
// NIST writes cores as [He]..[Rn] and also [Cd] and [Hg]; expand all of them.
const CORES: Record<string, string[]> = {};
CORES.He = ['1s2'];
CORES.Ne = [...CORES.He, '2s2', '2p6'];
CORES.Ar = [...CORES.Ne, '3s2', '3p6'];
CORES.Kr = [...CORES.Ar, '3d10', '4s2', '4p6'];
CORES.Cd = [...CORES.Kr, '4d10', '5s2'];
CORES.Xe = [...CORES.Cd, '5p6'];
CORES.Hg = [...CORES.Xe, '4f14', '5d10', '6s2'];
CORES.Rn = [...CORES.Hg, '6p6'];

const order = (t: string) => { const m = /^(\d+)([spdf])/.exec(t)!; return Number(m[1]) * 10 + LETTERS.indexOf(m[2]); };
function expandNist(shells: string): string {
    const tokens: string[] = [];
    for (const part of shells.split('.')) {
        const core = /^\[(\w+)\]$/.exec(part);
        if (core) tokens.push(...CORES[core[1]]);
        else tokens.push(token(part));
    }
    return tokens.sort((a, b) => order(a) - order(b)).join(' ');
}
const format = (c: SubshellOccupancy[]) => c.map(s => `${s.n}${LETTERS[s.l]}${s.electrons}`).join(' ');
const nist = (Z: number, charge: number) => {
    const entry = fixture.entries.find(e => e.Z === Z && e.charge === charge);
    if (!entry) throw new Error(`fixture has no Z=${Z} charge=${charge}`);
    return expandNist(entry.groundShells);
};

describe('ion configurations', () => {
    it('parses the repository notation, cores included', () => {
        expect(format(parseConfiguration('[Ar] 3d6'))).toBe('1s2 2s2 2p6 3s2 3p6 3d6');
        expect(format(parseConfiguration('[Xe]'))).toBe(format(configurationFor(54)));
        expect(format(parseConfiguration('1s1'))).toBe('1s1');
    });

    it('agrees with NIST ASD for every neutral atom Z <= 108', () => {
        for (let Z = 1; Z <= 108; Z++) expect([Z, format(configurationFor(Z))]).toEqual([Z, nist(Z, 0)]);
    });

    it('agrees with NIST ASD for every cation it offers', () => {
        let checked = 0;
        for (let Z = 1; Z <= 108; Z++) {
            for (let charge = 1; charge <= maxCationCharge(Z); charge++) {
                expect([Z, charge, format(ionConfigurationFor(Z, charge))]).toEqual([Z, charge, nist(Z, charge)]);
                checked++;
            }
        }
        expect(checked).toBe(301);
    });

    it('lets transition metals lose ns before (n-1)d', () => {
        expect(format(ionConfigurationFor(26, 2))).toBe('1s2 2s2 2p6 3s2 3p6 3d6');    // Fe2+ = [Ar] 3d6
        expect(format(ionConfigurationFor(29, 1))).toBe('1s2 2s2 2p6 3s2 3p6 3d10');   // Cu+ = [Ar] 3d10
    });

    it('fills the valence p subshell for anions, and 1s for hydride', () => {
        expect(format(ionConfigurationFor(17, -1))).toBe(format(configurationFor(18)));   // Cl- is argon-like
        expect(format(ionConfigurationFor(8, -2))).toBe(format(configurationFor(10)));    // O2- is neon-like
        expect(format(ionConfigurationFor(1, -1))).toBe('1s2');
        expect(format(ionConfigurationFor(82, -1))).toBe(format(configurationFor(82)).replace('6p2', '6p3'));
    });

    it('offers only physically sensible charges', () => {
        expect(allowedCharges(1)).toEqual([-1, 0]);
        expect(allowedCharges(2)).toEqual([0, 1]);
        expect(allowedCharges(7)).toEqual([0, 1, 2, 3]);          // N: negative electron affinity
        expect(allowedCharges(8)).toEqual([-2, -1, 0, 1, 2, 3]);
        expect(allowedCharges(11)).toEqual([0, 1]);
        expect(allowedCharges(12)).toEqual([0, 1, 2]);
        expect(allowedCharges(17)).toEqual([-1, 0, 1, 2, 3]);
        expect(allowedCharges(108)).toEqual([0, 1, 2, 3]);
        expect(allowedCharges(109)).toEqual([0]);
        expect(allowedCharges(118)).toEqual([0]);
        for (let Z = 1; Z <= 118; Z++) {
            for (const q of allowedCharges(Z)) { expect(q).toBeGreaterThanOrEqual(MIN_CHARGE); expect(q).toBeLessThanOrEqual(MAX_CHARGE); }
            expect(minAnionCharge(Z)).toBeLessThanOrEqual(0);
        }
    });

    it('keeps Z - charge electrons in every offered species', () => {
        for (let Z = 1; Z <= 118; Z++) {
            for (const q of allowedCharges(Z)) {
                expect(ionConfigurationFor(Z, q).reduce((sum, s) => sum + s.electrons, 0)).toBe(Z - q);
            }
        }
    });

    it('refuses a charge it does not offer', () => {
        expect(() => ionConfigurationFor(11, 2)).toThrow(/not offered/);
        expect(() => ionConfigurationFor(7, -1)).toThrow(/not offered/);
    });
});
