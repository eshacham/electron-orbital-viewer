import { readFileSync } from 'fs';
import { join } from 'path';
import { PHASE_5_ROWS } from '../../src/validation/phase5';
import { VALIDATION, relativeErrorPercent } from '../../src/validation/references';

describe('phase 5 validation rows', () => {
    it('are in the shared table, each within its tolerance', () => {
        const names = PHASE_5_ROWS.map(row => `${row.system} ${row.quantity}`);
        expect(names).toEqual(expect.arrayContaining([
            'H₂⁺ E_el(1σg, R = 2 a₀)', 'H₂⁺ R_e', 'H₂⁺ E(R_e)', 'H₂ R_e', 'H₂ D_e',
            'N₂ R_e', 'O₂ R_e', 'F₂ R_e', 'CO R_e', 'HF R_e',
        ]));
        for (const row of PHASE_5_ROWS) {
            expect(VALIDATION).toContain(row);
            expect(relativeErrorPercent(row)).toBeLessThanOrEqual(row.tolerancePercent);
        }
    });

    // D17: data ships to S3 (public/molecules stays empty, spec §4.5); the
    // committed fixture is what this repo actually has to check against.
    it('carry the scans\' own numbers, not typed ones', () => {
        const scan = JSON.parse(readFileSync(join(__dirname, '../fixtures/molecules/n2/scan.json'), 'utf8'));
        const row = PHASE_5_ROWS.find(r => r.system === 'N₂')!;
        expect(row.app).toBeCloseTo(scan.fit.ReBohr * 0.529177210903, 10);
    });
});
