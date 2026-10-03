import { findEigenvalue, StateNotFoundError } from '../../src/atom/eigenvalue_search';
import { makeRadialGrid } from '../../src/atom/radial_grid';
import { solveRadialState } from '../../src/atom/radial_solver';
import { solveDiracState } from '../../src/atom/relativistic_solver';

// How the eigenvalue search and the solvers built on it fail, kept apart
// from eigenvalue_search.test.ts, whose bit-for-bit pins stay as recorded.
function potentialOf(grid: { r: Float64Array; size: number }, v: (r: number) => number): Float64Array {
    const out = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) out[j] = v(grid.r[j]);
    return out;
}

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

describe('the Schrödinger solver refuses a state it did not find (ruling T7-b)', () => {
    // Task 4's follow-up: with no room for 5g on a 10 a0 grid the search
    // brackets nothing, and the solver used to hand back the widest
    // bracket's midpoint (-156.25 Ha) as if it were an eigenvalue.
    it('throws when the search bracketed no root, as the relativistic solver does', () => {
        const grid = makeRadialGrid(1e-6, 10, 2001);
        const solve = () => solveRadialState(grid, 5, 4, potentialOf(grid, r => -1 / r));
        expect(solve).toThrow(StateNotFoundError);
        expect(solve).toThrow('Radial grid (rMax=10) is too small to hold n=5, l=4, or the potential does not bind it: '
            + 'the outward and inward solutions match at no energy below zero.');
    });

    it('is the same error class the relativistic solver and the containment guard throw', () => {
        const grid = makeRadialGrid(1e-6, 10, 2001);
        const v = potentialOf(grid, r => -1 / r);
        expect(() => solveDiracState(grid, 5, -5, v, 1)).toThrow(StateNotFoundError);
        expect(() => solveRadialState(grid, 3, 0, v)).toThrow(StateNotFoundError);
    });
});
