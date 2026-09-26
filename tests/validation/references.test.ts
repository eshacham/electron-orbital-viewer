import { VALIDATION, relativeErrorPercent } from '../../src/validation/references';
import { solveAtom } from '../../src/atom/scf';
import * as fs from 'fs';
import * as path from 'path';

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

    it('guards against phase 0 app values going stale: recomputes from the real SCF solver', () => {
        // Precision is derived from the written value: e.g. −2.834829 has 6
        // decimals → max error 0.5e-6. This test ensures that if the SCF
        // engine drifts, the validation table is re-run and its hard-coded
        // values are updated. The source text is read to preserve trailing
        // zeros (−128.233250 would be −128.23325 at runtime).
        const srcPath = path.join(__dirname, '../../src/validation/references.ts');
        const srcText = fs.readFileSync(srcPath, 'utf8');

        // Extract the PHASE_0_ROWS array block from source to read app values as written.
        const phase0Match = srcText.match(/const PHASE_0_ROWS:.*?\];/s);
        if (!phase0Match) {
            throw new Error('Cannot find PHASE_0_ROWS declaration in references.ts');
        }
        const phase0Block = phase0Match[0];

        const getAppStringValue = (system: string, quantity: string): string => {
            // Look for a row object containing both system and quantity, then extract app.
            // Rows have fields in order: phase, quantity, system, app, reference, ... on a single line.
            // Match a single row: { phase: 0, quantity: '...', system: '...', app: -..., ... },
            const pattern = new RegExp(
                `quantity: '${quantity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^}]*system: '${system.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^}]*app: (-?[0-9.]+)`,
                's'
            );
            const match = phase0Block.match(pattern);
            if (!match) {
                throw new Error(
                    `Cannot find app value for phase 0 row: ${system} ${quantity} in references.ts`
                );
            }
            return match[1];
        };

        const countDecimals = (str: string): number => {
            // Count decimals from the string representation: "-2.834829" → 6
            const dotIndex = str.indexOf('.');
            return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
        };

        const maxErrorForStringValue = (str: string): number =>
            0.5 * Math.pow(10, -countDecimals(str));

        // He (Z=2): total energy
        const heAtom = solveAtom(2);
        const heRow = VALIDATION.find(r => r.phase === 0 && r.system === 'He' && r.quantity === 'total energy')!;
        const heAppStr = getAppStringValue('He', 'total energy');
        expect(Math.abs(heAtom.totalEnergy - heRow.app)).toBeLessThanOrEqual(
            maxErrorForStringValue(heAppStr)
        );

        // Ne (Z=10): total energy
        const neAtom = solveAtom(10);
        const neRow = VALIDATION.find(r => r.phase === 0 && r.system === 'Ne' && r.quantity === 'total energy')!;
        const neAppStr = getAppStringValue('Ne', 'total energy');
        expect(Math.abs(neAtom.totalEnergy - neRow.app)).toBeLessThanOrEqual(
            maxErrorForStringValue(neAppStr)
        );

        // Ar (Z=18): total energy
        const arAtom = solveAtom(18);
        const arEnergyRow = VALIDATION.find(r => r.phase === 0 && r.system === 'Ar' && r.quantity === 'total energy')!;
        const arEnergyAppStr = getAppStringValue('Ar', 'total energy');
        expect(Math.abs(arAtom.totalEnergy - arEnergyRow.app)).toBeLessThanOrEqual(
            maxErrorForStringValue(arEnergyAppStr)
        );

        // Ar (Z=18): 2s eigenvalue
        const ar2sState = arAtom.states.find(s => s.n === 2 && s.l === 0)!;
        const ar2sRow = VALIDATION.find(r => r.phase === 0 && r.system === 'Ar' && r.quantity === '2s eigenvalue')!;
        const ar2sAppStr = getAppStringValue('Ar', '2s eigenvalue');
        expect(Math.abs(ar2sState.energy - ar2sRow.app)).toBeLessThanOrEqual(
            maxErrorForStringValue(ar2sAppStr)
        );

        // Ar (Z=18): 2p eigenvalue
        const ar2pState = arAtom.states.find(s => s.n === 2 && s.l === 1)!;
        const ar2pRow = VALIDATION.find(r => r.phase === 0 && r.system === 'Ar' && r.quantity === '2p eigenvalue')!;
        const ar2pAppStr = getAppStringValue('Ar', '2p eigenvalue');
        expect(Math.abs(ar2pState.energy - ar2pRow.app)).toBeLessThanOrEqual(
            maxErrorForStringValue(ar2pAppStr)
        );
    });
});
