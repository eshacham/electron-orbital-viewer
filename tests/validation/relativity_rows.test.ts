import srlda from '../atom/fixtures/nist_srlda.json';
import rlda from '../atom/fixtures/nist_rlda.json';
import { RELATIVITY_VALIDATION_ROWS, orbitalQuantityLabel, NIST_SOURCE } from '../../src/validation/relativity_rows';
import { VALIDATION } from '../../src/validation/references';
import { methodStatement } from '../../src/atom/relativity';

type Fixture = { atoms: Array<{ Z: number; symbol: string; Etot: number; eigenvalues: Record<string, number> }> };

function expectedCount(fixture: Fixture): number {
    return fixture.atoms.reduce((sum, atom) => sum + 1 + Object.keys(atom.eigenvalues).length, 0);
}

describe('Phase 4 validation rows', () => {
    it('has one row per NIST quantity in both columns', () => {
        expect(RELATIVITY_VALIDATION_ROWS).toHaveLength(expectedCount(srlda as Fixture) + expectedCount(rlda as Fixture));
    });

    it('copies every reference value from the fixtures, not from anywhere else', () => {
        for (const [fixture, column, method] of [
            [srlda, 'ScRLDA', methodStatement('scalar')],
            [rlda, 'RLDA', methodStatement('spinOrbit')],
        ] as const) {
            for (const atom of (fixture as Fixture).atoms) {
                const rows = RELATIVITY_VALIDATION_ROWS.filter(row => row.system === atom.symbol && row.method === method);
                expect(rows.find(row => row.quantity === `total energy (${column})`)!.reference).toBe(atom.Etot);
                for (const [key, value] of Object.entries(atom.eigenvalues)) {
                    const row = rows.find(r => r.quantity === `${orbitalQuantityLabel(key)} orbital eigenvalue (${column})`);
                    expect(row!.reference).toBe(value);
                }
            }
        }
    });

    it('states phase, unit, source and the spec\'s tolerances', () => {
        for (const row of RELATIVITY_VALIDATION_ROWS) {
            expect(row.phase).toBe(4);
            expect(row.unit).toBe('Ha');
            expect(row.referenceSource).toBe(NIST_SOURCE);
            expect(row.tolerancePercent).toBe(['Ne', 'Ar'].includes(row.system) ? 0.1 : 1);
            expect(Math.abs((row.app - row.reference) / row.reference) * 100).toBeLessThanOrEqual(row.tolerancePercent);
        }
    });

    it('labels j-split orbitals the way the UI does', () => {
        expect(orbitalQuantityLabel('6s')).toBe('6s');
        expect(orbitalQuantityLabel('2p-')).toBe('2p½');
        expect(orbitalQuantityLabel('5f+')).toBe('5f⁷⁄₂');
    });

    it('is part of the shared VALIDATION table', () => {
        for (const row of RELATIVITY_VALIDATION_ROWS) expect(VALIDATION).toContain(row);
    });

    it('names each quantity once per system, even across ScRLDA and RLDA (preflight D2)', () => {
        const keys = RELATIVITY_VALIDATION_ROWS.map(row => `${row.phase}|${row.system}|${row.quantity}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
