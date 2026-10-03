// tests/atom/relativistic_solver.test.ts
import { gridForAtom, makeRadialGrid, integrateOnGrid } from '../../src/atom/radial_grid';
import { solveDiracState, solveScalarRelativisticState } from '../../src/atom/relativistic_solver';
import { diracHydrogenicEnergy, SPEED_OF_LIGHT } from '../../src/atom/relativity';

function coulomb(grid: { r: Float64Array; size: number }, Z: number): Float64Array {
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) v[j] = -Z / grid.r[j];
    return v;
}

function relativeError(actual: number, exact: number): number {
    return Math.abs((actual - exact) / exact);
}

describe('Dirac solver against the exact Dirac hydrogen spectrum', () => {
    // [n, kappa, Z] -- s, p½, p³⁄₂, d, f at light, heavy and superheavy Z.
    const cases: Array<[number, number, number]> = [
        [1, -1, 1], [2, 1, 1], [2, -2, 1], [3, -3, 1],
        [1, -1, 80], [2, -1, 80], [2, 1, 80], [2, -2, 80], [3, 2, 80], [3, -3, 80], [4, 3, 80], [4, -4, 80],
        [2, 1, 26], [6, -1, 79], [1, -1, 92], [1, -1, 118], [2, 1, 118],
    ];

    it.each(cases)('n=%i κ=%i Z=%i matches to 1e-6', (n, kappa, Z) => {
        const grid = gridForAtom(Z, n);
        const state = solveDiracState(grid, n, kappa, coulomb(grid, Z), Z);
        expect(relativeError(state.energy, diracHydrogenicEnergy(n, kappa, Z))).toBeLessThan(1e-6);
    });

    it('reproduces the 2s½ / 2p½ degeneracy of the Coulomb field', () => {
        const grid = gridForAtom(80, 2);
        const s = solveDiracState(grid, 2, -1, coulomb(grid, 80), 80).energy;
        const p = solveDiracState(grid, 2, 1, coulomb(grid, 80), 80).energy;
        expect(relativeError(p, s)).toBeLessThan(1e-8);
    });

    it('reports j and κ, and has n - l - 1 nodes in the large component', () => {
        const grid = gridForAtom(1, 4);
        for (const [n, kappa] of [[2, 1], [3, -1], [3, 2], [4, -3], [4, 3]] as Array<[number, number]>) {
            const state = solveDiracState(grid, n, kappa, coulomb(grid, 1), 1);
            const l = kappa < 0 ? -kappa - 1 : kappa;
            expect(state.kappa).toBe(kappa);
            expect(state.j).toBe(Math.abs(kappa) - 0.5);
            let nodes = 0;
            let previous = 0;
            for (let j = 0; j < grid.size - 50; j++) {
                if (Math.abs(state.u[j]) < 1e-12) continue;
                const sign = state.u[j] > 0 ? 1 : -1;
                if (previous !== 0 && sign !== previous) nodes++;
                previous = sign;
            }
            expect(nodes).toBe(n - l - 1);
        }
    });

    it('normalises G² + F² to one, with a small component that grows with Z', () => {
        const smallFraction = (Z: number, n: number, kappa: number) => {
            const grid = gridForAtom(Z, n);
            const state = solveDiracState(grid, n, kappa, coulomb(grid, Z), Z);
            const total = new Float64Array(grid.size);
            const small = new Float64Array(grid.size);
            for (let j = 0; j < grid.size; j++) {
                small[j] = state.Q![j] * state.Q![j];
                total[j] = state.u[j] * state.u[j] + small[j];
            }
            expect(integrateOnGrid(grid, total)).toBeCloseTo(1, 8);
            return integrateOnGrid(grid, small);
        };
        expect(smallFraction(1, 1, -1)).toBeLessThan(1e-4);     // measured 1.33e-5 = (Z/c)²/4
        expect(smallFraction(118, 2, 1)).toBeGreaterThan(0.03); // measured 0.066
    });

    it('starts as r^γ at the nucleus, γ = sqrt(κ² - (Z/c)²)', () => {
        const Z = 79;
        const grid = gridForAtom(Z, 6);
        const state = solveDiracState(grid, 6, -1, coulomb(grid, Z), Z);
        const slope = Math.log(state.u[10] / state.u[5]) / (5 * grid.dx);
        expect(slope).toBeCloseTo(Math.sqrt(1 - (Z / SPEED_OF_LIGHT) ** 2), 3);
        expect(state.R[5]).toBeGreaterThan(0);
    });

    it('refuses a grid too small to hold the state', () => {
        const grid = makeRadialGrid(1e-6, 40, 2001);
        expect(() => solveDiracState(grid, 7, -1, coulomb(grid, 1), 1)).toThrow(/too small/);
    });

    // Three guards, each with a case that only it catches. 5s fits its nodes
    // into 40 a0 but spills its probability into the edge (containment). 5g
    // has no room on 10 a0 at all: the search never brackets a root, and
    // without the check returns its widest bracket's midpoint (about -150 Ha).
    // 2s on 10 a0 brackets a root that is a different state, two nodes, not one.
    it.each([
        [40, 5, -1, /probability lies in the outermost 1%/],
        [10, 5, -5, /match at no energy below zero/],
        [10, 2, -1, /converged on a state with 2 nodes, not 1/],
    ])('refuses hydrogen on a %i a0 grid: n=%i κ=%i', (rMax, n, kappa, reason) => {
        const grid = makeRadialGrid(1e-6, rMax as number, 2001);
        const solve = () => solveDiracState(grid, n as number, kappa as number, coulomb(grid, 1), 1);
        expect(solve).toThrow(/too small/);
        expect(solve).toThrow(reason as RegExp);
    });

    it('names j and κ in a Dirac failure, so 5p½ and 5p³⁄₂ read differently', () => {
        const grid = makeRadialGrid(1e-6, 40, 2001);
        const v = coulomb(grid, 1);
        expect(() => solveDiracState(grid, 5, 1, v, 1)).toThrow('n=5, l=1, j=1/2 (κ = 1)');
        expect(() => solveDiracState(grid, 5, -2, v, 1)).toThrow('n=5, l=1, j=3/2 (κ = -2)');
        expect(() => solveScalarRelativisticState(grid, 5, 1, v, 1)).toThrow(/hold n=5, l=1[,:]/);
    });
});

describe('convergence order on the Dirac hydrogen oracle', () => {
    // End to end, rk4Step fed by midpointValues: halving dx should cut the
    // eigenvalue error sixteenfold. A lower-order midpoint (linear
    // interpolation, say) would drop the whole solver to second order however
    // good the step itself is. Measured: 15.99 and 16.00 for both cases,
    // errors from ~3e-7 down to ~5e-10, far above the bisection tolerance.
    // Hydrogen 1s at Z = 1 is not used: its error is dominated by the grid's
    // finite edge (a few 1e-8, independent of dx), not by the integrator.
    it.each([[2, 1, 80], [1, -1, 118]])('n=%i κ=%i Z=%i is fourth order', (n, kappa, Z) => {
        const base = gridForAtom(Z, n);
        const exact = diracHydrogenicEnergy(n, kappa, Z);
        const errors = [501, 1001, 2001].map(size => {
            const grid = makeRadialGrid(base.rMin, base.rMax, size);
            return Math.abs(solveDiracState(grid, n, kappa, coulomb(grid, Z), Z).energy - exact);
        });
        for (let i = 1; i < errors.length; i++) {
            const order = Math.log2(errors[i - 1] / errors[i]);
            expect(order).toBeGreaterThan(3.9);
            expect(order).toBeLessThan(4.1);
        }
    });
});

describe('Koelling–Harmon (scalar-relativistic) solver', () => {
    it('is exactly the Dirac κ = -1 problem for s states', () => {
        for (const n of [1, 2]) {
            const grid = gridForAtom(80, n);
            const v = coulomb(grid, 80);
            const scalar = solveScalarRelativisticState(grid, n, 0, v, 80).energy;
            const dirac = solveDiracState(grid, n, -1, v, 80).energy;
            expect(relativeError(scalar, dirac)).toBeLessThan(1e-12);
        }
    });

    it.each([[2, 1], [3, 2]])('puts n=%i l=%i between its j-levels, near their 2j+1 average', (n, l) => {
        const Z = 80;
        const grid = gridForAtom(Z, n);
        const scalar = solveScalarRelativisticState(grid, n, l, coulomb(grid, Z), Z);
        const lower = diracHydrogenicEnergy(n, l, Z);            // j = l - 1/2
        const upper = diracHydrogenicEnergy(n, -(l + 1), Z);     // j = l + 1/2
        const average = (2 * l * lower + (2 * l + 2) * upper) / (4 * l + 2);
        expect(scalar.energy).toBeGreaterThan(lower);
        expect(scalar.energy).toBeLessThan(upper);
        // Measured 0.069 (2p) and 0.014 (3d) of the splitting.
        expect(Math.abs(scalar.energy - average)).toBeLessThan(0.1 * (upper - lower));
        expect(scalar.j).toBeUndefined();
        expect(scalar.Q).toBeDefined();
    });
});
