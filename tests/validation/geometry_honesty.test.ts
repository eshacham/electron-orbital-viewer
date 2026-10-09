import { METHOD_VALIDATION, VALIDATION } from '../../src/validation/references';
import { NOT_A_TEST, countsAsValidation, isExperimentalGeometry } from '../../src/validation/geometry_honesty';

// Phase 6D spec §5: a bond or angle of a geometry taken from experiment, compared with that experiment, is a
// transcription check; it says so and no "agrees with experiment" summary counts it.
describe('validation honesty', () => {
    const phase6 = VALIDATION.filter(row => row.phase === 6);
    it('every library row says where its geometry came from', () => {
        expect(phase6.length).toBeGreaterThan(0);
        for (const row of phase6) expect(row.geometrySource && row.geometrySource.length).toBeTruthy();
    });
    it('marks exactly the bond and angle rows of experimental geometries, in the spec\'s words', () => {
        expect(NOT_A_TEST).toBe('geometry from experiment (not a test of the method)');
        for (const row of phase6) {
            const geometryRow = /^(bond length|angle) /.test(row.quantity);
            const fromExperiment = row.geometrySource!.startsWith('experiment');
            expect([row.system, row.quantity, row.notATest ?? null]).toEqual([row.system, row.quantity, geometryRow && fromExperiment ? NOT_A_TEST : null]);
        }
    });
    it('leaves them out of the method\'s validation, and keeps the dipoles', () => {
        expect(METHOD_VALIDATION).toEqual(VALIDATION.filter(countsAsValidation));
        expect(METHOD_VALIDATION.some(row => row.notATest)).toBe(false);
        expect(METHOD_VALIDATION.filter(row => row.phase === 6 && row.quantity === 'dipole moment').length)
            .toBe(phase6.filter(row => row.quantity === 'dipole moment').length);
        expect(METHOD_VALIDATION.some(row => row.phase === 6 && /^bond length/.test(row.quantity))).toBe(true);   // the optimised seven's
    });
    // The panel decides from meta.geometrySource alone; it must agree with the rows build_library marks.
    it('reads an experimental geometry from its source text as the rows do', () => {
        expect(isExperimentalGeometry('experiment (CCCBDB)')).toBe(true);
        expect(isExperimentalGeometry('experimental R_e (Huber & Herzberg, Constants of Diatomic Molecules (1979))')).toBe(true);
        expect(isExperimentalGeometry('B3LYP-D3(BJ)/def2-TZVP optimised (PySCF + geomeTRIC)')).toBe(false);
        for (const row of phase6.filter(r => /^(bond length|angle) /.test(r.quantity))) {
            expect([row.system, row.quantity, isExperimentalGeometry(row.geometrySource!)]).toEqual([row.system, row.quantity, Boolean(row.notATest)]);
        }
    });
});
