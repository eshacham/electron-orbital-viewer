import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { ionisationEnergy, excitationEnergy, polarisedTotalEnergy } from '../../src/atom/delta_scf';
import { NIST_FIRST_IONISATION_EV, NA_D_LINE_EV } from '../../src/atom/ionisation_references';
import { neutralGround, speciesSymbol } from '../../src/atom/species';
import recorded from '../../src/validation/ion_results.json';
import type { IonResultEntry } from '../../src/validation/ion_rows';

// 36 spin-polarised solves of light atoms plus sodium's excited state: about three minutes.
jest.setTimeout(1800000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const WRITE = process.env.WRITE_VALIDATION === '1';
if (WRITE && !SLOW) throw new Error('WRITE_VALIDATION=1 needs ATOM_SLOW_TESTS=1: the results file must cover every entry.');
const describeSlow = SLOW ? describe : describe.skip;

// NIST SRD 141 LSD column (Kotochigova et al. 1997), Etot in Ha, retrieved 2026-09-25: [neutral, +1 ion].
const NIST_LSD: Record<number, [number, number | null]> = {
    2: [-2.834836, null], 3: [-7.343957, -7.142818], 4: [-14.447209, -14.115512], 5: [-24.353614, -24.038275],
    6: [-37.470031, -37.037413], 7: [-54.136799, -53.585407], 8: [-74.527410, -74.016721], 9: [-99.114192, -98.450427],
    10: [-128.233481, -127.418114], 11: [-161.447625, -161.250340], 12: [-199.139406, -198.855669],
    13: [-241.321156, -241.100595], 14: [-288.222945, -287.918773], 15: [-340.005794, -339.618451],
    16: [-396.743948, -396.356540], 17: [-458.671463, -458.184562], 18: [-525.946195, -525.360439],
};
const NA_3P = { Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } };
const entries: IonResultEntry[] = [];
const percentOff = (app: number, reference: number) => Math.abs(app - reference) / Math.abs(reference) * 100;

function recompute(entry: IonResultEntry): number {
    if (entry.kind === 'ionisation') return ionisationEnergy(neutralGround(entry.Z))!.valueEv;
    if (entry.kind === 'excitation') return excitationEnergy(NA_3P)!.valueEv;
    return polarisedTotalEnergy({ Z: entry.Z, charge: entry.charge, excitation: null });
}

describe('committed results stay current (fast subset)', () => {
    it('He and Li match a fresh computation to 1e-6', () => {
        const cheap = (recorded.entries as IonResultEntry[]).filter(e => e.Z <= 3);
        for (const entry of cheap) expect(Math.abs((recompute(entry) - entry.app) / entry.app)).toBeLessThan(1e-6);
    });
});

describeSlow('Phase 3 validation (spec §5: H-Ar ΔSCF IE within 10 %, Na 3s→3p within 10 %)', () => {
    for (let Z = 1; Z <= 18; Z++) {
        it(`Z=${Z}: first ionisation energy and LSD totals`, () => {
            const app = ionisationEnergy(neutralGround(Z))!.valueEv;
            const reference = NIST_FIRST_IONISATION_EV[Z];
            entries.push({ kind: 'ionisation', Z, charge: 0, system: speciesSymbol(neutralGround(Z)), app, reference });
            expect(percentOff(app, reference)).toBeLessThanOrEqual(10);
            const lsd = NIST_LSD[Z];
            if (!lsd) return;   // hydrogen: one electron, exact by the bypass
            for (const [charge, value] of [[0, lsd[0]], [1, lsd[1]]] as const) {
                if (value === null) continue;   // He+: one electron
                const species = { Z, charge, excitation: null };
                const total = polarisedTotalEnergy(species);
                entries.push({ kind: 'lsdTotal', Z, charge, system: speciesSymbol(species), app: total, reference: value });
                expect(percentOff(total, value)).toBeLessThanOrEqual(0.001);
            }
        });
    }

    it('Na 3s -> 3p against the D line', () => {
        const app = excitationEnergy(NA_3P)!.valueEv;
        entries.push({ kind: 'excitation', Z: 11, charge: 0, system: 'Na', app, reference: NA_D_LINE_EV });
        expect(percentOff(app, NA_D_LINE_EV)).toBeLessThanOrEqual(10);
    });

    (WRITE ? it.skip : it)('every committed result matches a fresh computation to 1e-6', () => {
        const committed = recorded.entries as IonResultEntry[];
        expect(committed.length).toBe(18 + 33 + 1);
        for (const entry of committed) expect(Math.abs((recompute(entry) - entry.app) / entry.app)).toBeLessThan(1e-6);
    });

    afterAll(() => {
        if (!WRITE) return;
        writeFileSync(resolve(__dirname, '../../src/validation/ion_results.json'), `${JSON.stringify({
            generator: 'tests/atom/delta_scf_nist.test.ts with ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1',
            generatedOn: new Date().toISOString().slice(0, 10),
            entries,
        }, null, 2)}\n`);
    });
});
