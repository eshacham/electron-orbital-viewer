import { ION_VALIDATION_ROWS } from '../../src/validation/ion_rows';
import { VALIDATION } from '../../src/validation/references';
import { NIST_FIRST_IONISATION_EV } from '../../src/atom/ionisation_references';

describe('Phase 3 validation rows', () => {
    const ionisation = ION_VALIDATION_ROWS.filter(r => r.quantity === 'first ionisation energy (ΔSCF)');

    it('has one ΔSCF ionisation row per element H-Ar, against NIST ASD, within 10 %', () => {
        expect(ionisation.map(r => r.system)).toEqual(
            ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar']);
        ionisation.forEach((row, i) => {
            expect(row.reference).toBe(NIST_FIRST_IONISATION_EV[i + 1]);
            expect(row.unit).toBe('eV');
            expect(row.tolerancePercent).toBe(10);
        });
    });

    it('has the Na 3s -> 3p row against 2.104 eV within 10 %', () => {
        const row = ION_VALIDATION_ROWS.find(r => r.quantity === '3s → 3p excitation energy (ΔSCF)')!;
        expect([row.system, row.reference, row.tolerancePercent]).toEqual(['Na', 2.104, 10]);
    });

    it('has the LSD total-energy rows that validate the spin-polarised solver itself', () => {
        const lsd = ION_VALIDATION_ROWS.filter(r => r.quantity === 'total energy (LSD)');
        expect(lsd).toHaveLength(33);    // He..Ar neutral (17) and Li+..Ar+ (16)
        for (const row of lsd) expect([row.unit, row.tolerancePercent]).toEqual(['Ha', 0.001]);
    });

    it('is phase 3, within tolerance, and part of the shared table', () => {
        for (const row of ION_VALIDATION_ROWS) {
            expect(row.phase).toBe(3);
            expect(Math.abs(row.app - row.reference) / Math.abs(row.reference) * 100).toBeLessThanOrEqual(row.tolerancePercent);
            expect(VALIDATION).toContain(row);
        }
    });
});
