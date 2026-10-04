import { readFileSync } from 'fs';
import { join } from 'path';
import { PHASE_5_ROWS } from '../../src/validation/phase5';
import { VALIDATION, rowPasses } from '../../src/validation/references';

describe('phase 5 validation rows', () => {
    it('are in the shared table, each within its tolerance', () => {
        const names = PHASE_5_ROWS.map(row => `${row.system} ${row.quantity}`);
        expect(names).toEqual(expect.arrayContaining([
            'H₂⁺ E_el(1σg, R = 2 a₀)', 'H₂⁺ R_e', 'H₂⁺ E(R_e)', 'H₂ R_e', 'H₂ D_e',
            'N₂ R_e', 'O₂ R_e', 'F₂ R_e', 'CO R_e', 'HF R_e', 'O₂ E(closed-shell singlet) − E(triplet)',
        ]));
        for (const row of PHASE_5_ROWS) {
            expect(VALIDATION).toContain(row);
            expect(rowPasses(row)).toBe(true);
        }
    });

    // Final review M7: O₂'s triplet ground state is a sign check (a bound),
    // not a match to a measured gap -- the closed-shell determinant is no
    // spectroscopic state. 1.30 eV from the v1 spin check (UCCSD(T) triplet
    // vs CCSD(T) closed-shell singlet, aug-cc-pVTZ, R = 2.28 a₀).
    it("list O2's triplet below the closed-shell singlet as a bound", () => {
        const row = PHASE_5_ROWS.find(r => r.quantity === 'E(closed-shell singlet) − E(triplet)')!;
        expect(row).toMatchObject({ system: 'O₂', unit: 'eV', reference: 0, bound: 'above' });
        expect(row.app).toBeCloseTo(1.3, 2);
        expect(rowPasses(row)).toBe(true);
        expect(rowPasses({ ...row, app: -0.1 })).toBe(false);
    });

    // D17: data ships to S3 (public/molecules stays empty, spec §4.5); the
    // committed fixture is what this repo actually has to check against.
    it('carry the scans\' own numbers, not typed ones', () => {
        const scan = JSON.parse(readFileSync(join(__dirname, '../fixtures/molecules/n2/scan.json'), 'utf8'));
        const row = PHASE_5_ROWS.find(r => r.system === 'N₂')!;
        expect(row.app).toBeCloseTo(scan.fit.ReBohr * 0.529177210903, 10);
    });
});
