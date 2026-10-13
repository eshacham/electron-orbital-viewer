import { ATOMIC_WEIGHTS, ATOMIC_WEIGHT_SOURCE, atomicWeightLabel } from '../src/atomic_weights';

describe('standard atomic weights (spec §9.1)', () => {
    it('has all 118, pinned where the spec pins them', () => {
        expect(ATOMIC_WEIGHTS).toHaveLength(118);
        expect(atomicWeightLabel(6)).toBe('12.011');
        expect(atomicWeightLabel(26)).toBe('55.845');
        expect(atomicWeightLabel(43)).toBe('[98]');
        expect(atomicWeightLabel(118)).toBe('[294]');
    });
    it('is a decimal or a bracketed mass number, and names its source', () => {
        for (const weight of ATOMIC_WEIGHTS) expect(weight).toMatch(/^\d+\.\d+$|^\[\d+\]$/);
        expect(ATOMIC_WEIGHT_SOURCE).toMatch(/IUPAC CIAAW 2021/);
    });
});
