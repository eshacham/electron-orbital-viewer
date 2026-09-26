import { VALIDATION, relativeErrorPercent } from '../../src/validation/references';

describe('validation table', () => {
    it('carries the atom-mode NIST LDA validations as phase 0', () => {
        const phase0 = VALIDATION.filter(row => row.phase === 0).map(row => `${row.system} ${row.quantity}`);
        expect(phase0).toEqual([
            'He total energy', 'Ne total energy', 'Ar total energy', 'Ar 2s eigenvalue', 'Ar 2p eigenvalue',
        ]);
    });

    it.each(VALIDATION.map(row => [`phase ${row.phase}: ${row.system} ${row.quantity}`, row] as const))(
        '%s agrees with its reference within the stated tolerance',
        (_name, row) => {
            expect(relativeErrorPercent(row)).toBeLessThanOrEqual(row.tolerancePercent);
        }
    );

    it('states a unit, a source and a method for every row, and names each quantity once', () => {
        for (const row of VALIDATION) {
            expect(row.unit.length).toBeGreaterThan(0);
            expect(row.referenceSource.length).toBeGreaterThan(0);
            expect(row.method.length).toBeGreaterThan(0);
            expect(row.reference).not.toBe(0);
            expect(row.tolerancePercent).toBeGreaterThan(0);
        }
        const keys = VALIDATION.map(row => `${row.phase}|${row.system}|${row.quantity}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('measures the error relative to the reference, whatever its sign', () => {
        expect(relativeErrorPercent({ ...VALIDATION[0], app: 101, reference: 100 })).toBeCloseTo(1, 12);
        expect(relativeErrorPercent({ ...VALIDATION[0], app: -99, reference: -100 })).toBeCloseTo(1, 12);
    });
});
