import { findEigenvalue } from '../../src/atom/eigenvalue_search';

// How the eigenvalue search and the solvers built on it fail, kept apart
// from eigenvalue_search.test.ts, whose bit-for-bit pins stay as recorded.
//
// A synthetic spectrum E_k = -1/2k^2 stands in for any equation: the search
// sees only a node count and a mismatch, and each mismatch below has its
// only root where the requested state is not.
const spectrum = (k: number) => -1 / (2 * k * k);
const nodesAt = (energy: number) => {
    let below = 0;
    for (let k = 1; k < 1000 && spectrum(k) < energy; k++) below++;
    return below;
};

describe('findEigenvalue Phase B stays with the requested state (ruling T7-c)', () => {
    // Pu and Am 7s -> 5f in scalar mode: a 5f bound by a few mHa gave no sign
    // change near its own root, so Phase B -- whose upper end is capped just
    // below zero -- only widened downward, until it took in the 4f root
    // (-16 Ha, no nodes) and bisected on that instead.
    it('does not walk down onto the state below', () => {
        const result = findEigenvalue({
            targetNodes: 1, eLow: -10, eHigh: -1e-12, nodesAt,
            mismatchAt: energy => energy - spectrum(1),
        });
        expect(result.bracketed).toBe(false);
        expect(result.energy).toBeGreaterThan(spectrum(1));
    });

    it('does not walk up onto the state above', () => {
        const result = findEigenvalue({
            targetNodes: 1, eLow: -10, eHigh: -1e-12, nodesAt,
            mismatchAt: energy => energy - spectrum(3),
        });
        expect(result.bracketed).toBe(false);
    });

    // The confinement must not cost the room Phase B's widening exists for:
    // the node count's transition sits a little off the true root (radial
    // solver's countNodesForBracketing), and Phase B has to reach it.
    it('still finds a root a little off the node count\'s transition, on either side', () => {
        for (const offset of [-0.02, 0.01]) {
            const root = spectrum(2) + offset;
            const result = findEigenvalue({
                targetNodes: 1, eLow: -10, eHigh: -1e-12, nodesAt,
                mismatchAt: energy => energy - root,
            });
            expect(result.bracketed).toBe(true);
            expect(result.energy).toBeCloseTo(root, 12);
        }
    });
});
