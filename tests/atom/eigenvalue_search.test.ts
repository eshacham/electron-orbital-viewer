import { gridForAtom, makeRadialGrid } from '../../src/atom/radial_grid';
import { solveRadialState, hasBoundState } from '../../src/atom/radial_solver';
import { findEigenvalue } from '../../src/atom/eigenvalue_search';

function potentialOf(grid: { r: Float64Array; size: number }, v: (r: number) => number): Float64Array {
    const out = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) out[j] = v(grid.r[j]);
    return out;
}

/** A position-weighted sum: any change to any point of u changes it. */
function checksum(u: Float64Array): number {
    let sum = 0;
    for (let j = 0; j < u.length; j++) sum += u[j] * (j + 1);
    return sum;
}

// The eigenvalue search was extracted from radial_solver.ts so the
// relativistic solver could share it, under the rule that relativity 'off'
// stays today's app byte for byte. These values were recorded from the
// solver *before* the extraction and are compared exactly (toBe, not
// toBeCloseTo): a refactor that perturbs a single bit of any energy or any
// point of u fails here. The full pre/post comparison (457 states, bound-state
// checks and five complete SCF atoms) is in Phase 4 Task 4's report.
// The pins are exact doubles, so they also pin V8's Math.exp/pow/log: if they
// fail right after a Node/V8 upgrade and nothing in src/atom changed, re-record
// them -- that is the runtime's libm moving, not a solver bug.
describe('radial_solver is bit-for-bit unchanged by the extraction', () => {
    const hydrogen = (r: number) => -1 / r;
    const iron = (r: number) => -26 / r;
    const screenedGold = (r: number) => -(1 + 78 * Math.exp(-r / 0.4)) / r;
    const cases: Array<[string, number, number, number, number, number, number, (r: number) => number]> = [
        ['H', 1, 6, 1, 0, -0.5000000000284348, 301228.31575349765, hydrogen],
        ['H', 1, 6, 4, 0, -0.03125000011713436, -7579.398281874958, hydrogen],
        ['H', 1, 6, 6, 5, -0.013888888894900805, 39900.034421063065, hydrogen],
        ['Fe', 26, 3, 3, 2, -37.555555565986005, 361721.37824252894, iron],
        ['screened Au', 79, 6, 6, 0, -1.277760099028355, -84304.46504073695, screenedGold],
        ['screened Au', 79, 6, 5, 2, -10.430728743921602, 191779.18068416382, screenedGold],
        ['screened Au', 79, 6, 4, 3, -47.95968117048257, 359550.3154366248, screenedGold],
    ];

    it.each(cases)('%s (Z=%i, grid to n=%i): n=%i l=%i', (_name, Z, highestN, n, l, energy, uChecksum, v) => {
        const grid = gridForAtom(Z, highestN);
        const state = solveRadialState(grid, n, l, potentialOf(grid, v));
        expect(state.energy).toBe(energy);
        expect(checksum(state.u)).toBe(uChecksum);
    });

    it('hasBoundState gives the same verdicts', () => {
        const fluorineLike = gridForAtom(9, 3);
        const short = potentialOf(fluorineLike, r => -(9 * Math.exp(-2 * r)) / r);
        expect(hasBoundState(fluorineLike, 1, 0, short, -0.3)).toBe(true);
        expect(hasBoundState(fluorineLike, 2, 0, short, -0.3)).toBe(true);
        expect(hasBoundState(fluorineLike, 2, 1, short)).toBe(false);
        const grid = gridForAtom(1, 6);
        const coulomb = potentialOf(grid, r => -1 / r);
        expect(hasBoundState(grid, 6, 5, coulomb, -0.01)).toBe(true);
        expect(hasBoundState(grid, 6, 5, coulomb, -0.3)).toBe(false);
    });

    // n=5, not the n=7 this was first recorded with: on this grid the old
    // search answered a request for 7s with the 4-node 5s (Phase B walked
    // down onto it -- ruling T7-c), and 14.8 % was that 5s's spill. 5s itself
    // produced the identical message before the fix and still does.
    it('the containment guard throws the same message', () => {
        const grid = makeRadialGrid(1e-6, 40, 2001);
        expect(() => solveRadialState(grid, 5, 0, potentialOf(grid, r => -1 / r))).toThrow(
            "Radial grid (rMax=40) is too small to hold n=5, l=0: 14.8% of the electron's probability lies "
            + 'in the outermost 1% of the grid. Use a grid sized for this n.'
        );
    });
});

describe('findEigenvalue', () => {
    // A synthetic spectrum E_k = -1/2k^2 stands in for any equation: the
    // search sees only a node count and a mismatch.
    const spectrum = (k: number) => -1 / (2 * k * k);
    const nodesAt = (energy: number) => {
        let below = 0;
        for (let k = 1; k < 1000 && spectrum(k) < energy; k++) below++;
        return below;
    };

    it('finds the state with the requested node count, and says it bracketed it', () => {
        const result = findEigenvalue({
            targetNodes: 2, eLow: -10, eHigh: -1e-12, nodesAt,
            mismatchAt: energy => energy - spectrum(3),
        });
        expect(result.bracketed).toBe(true);
        expect(result.energy).toBeCloseTo(spectrum(3), 12);
    });

    it('reports a search that never found a sign change', () => {
        const result = findEigenvalue({ targetNodes: 0, eLow: -10, eHigh: -1e-12, nodesAt, mismatchAt: () => 1 });
        expect(result.bracketed).toBe(false);
    });
});
