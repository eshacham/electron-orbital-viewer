import { gridForAtom, interpolateOnGrid } from '../../src/atom/radial_grid';
import { hartreePotential, densityFromD, exchangePotential, exchangeEnergy, hartreeEnergy } from '../../src/atom/hartree';

/** D(r) for one hydrogen 1s electron. */
function hydrogen1sD(grid: { r: Float64Array; size: number }): Float64Array {
    const D = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const r = grid.r[j];
        D[j] = 4 * r * r * Math.exp(-2 * r);
    }
    return D;
}

describe('hartree potential', () => {
    // These read v at an exact target r via interpolateOnGrid rather than at
    // "the nearest grid point at or past r" (grid.r.findIndex(...)): on this
    // log grid the nearest point can sit up to a whole step past the target,
    // and V_H's slope over that step dwarfs the tolerances below, so the
    // comparison would really be testing grid alignment rather than the
    // potential itself.
    it('matches the exact 1s self-interaction potential', () => {
        const grid = gridForAtom(1);
        const v = hartreePotential(grid, hydrogen1sD(grid));
        for (const r of [0.1, 0.5, 1, 2, 5]) {
            const exact = 1 / r - Math.exp(-2 * r) * (1 + 1 / r);
            expect(interpolateOnGrid(grid, v, r)).toBeCloseTo(exact, 5);
        }
    });

    it('falls off as N/r far outside the charge', () => {
        // gridForAtom(1) (ruling R21) is sized for hydrogen's own occupied
        // shell, rMax=9, not for an arbitrary "far away" probe; r=8 is still
        // deep enough past the 1s charge (which has decayed to e^-16) to
        // exercise the same asymptotic check.
        const grid = gridForAtom(1);
        const v = hartreePotential(grid, hydrogen1sD(grid));
        const r = 8;
        expect(interpolateOnGrid(grid, v, r) * r).toBeCloseTo(1, 4);
    });

    it('is positive everywhere', () => {
        const grid = gridForAtom(1);
        const v = hartreePotential(grid, hydrogen1sD(grid));
        for (let j = 0; j < grid.size; j++) expect(v[j]).toBeGreaterThan(0);
    });
});

describe('exchange', () => {
    it('derives rho from D', () => {
        // Compared at the grid's own r[j] (not a rounded target value): this
        // is an elementwise-formula check on densityFromD, and comparing
        // against exp(-2*r)/pi evaluated at a nearby-but-not-equal target r
        // would fold in the grid-spacing error tested above instead of
        // isolating the division itself.
        const grid = gridForAtom(1);
        const density = densityFromD(grid, hydrogen1sD(grid));
        for (const r of [0.5, 1, 2]) {
            const j = grid.r.findIndex(value => value >= r);
            expect(density[j]).toBeCloseTo(Math.exp(-2 * grid.r[j]) / Math.PI, 8);
        }
    });

    it('gives a negative exchange potential scaling as rho^(1/3)', () => {
        const density = Float64Array.from([1, 8, 27]);
        const v = exchangePotential(density);
        expect(v[0]).toBeLessThan(0);
        expect(v[1] / v[0]).toBeCloseTo(2, 10);
        expect(v[2] / v[0]).toBeCloseTo(3, 10);
    });

    it('gives a negative exchange energy', () => {
        const grid = gridForAtom(1);
        const D = hydrogen1sD(grid);
        expect(exchangeEnergy(grid, D, densityFromD(grid, D))).toBeLessThan(0);
    });

    it('gives the 1s self-repulsion energy of 5/16 Hartree', () => {
        const grid = gridForAtom(1);
        const D = hydrogen1sD(grid);
        expect(hartreeEnergy(grid, D, hartreePotential(grid, D))).toBeCloseTo(5 / 16, 5);
    });
});
