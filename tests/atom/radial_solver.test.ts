import { gridForAtom, makeRadialGrid, integrateOnGrid, interpolateOnGrid } from '../../src/atom/radial_grid';
import { solveRadialState } from '../../src/atom/radial_solver';
import { radialWaveFunction } from '../../src/quantum_functions';

/** V(r) = -Z/r on the grid: the one potential with an exact answer. */
function coulomb(grid: { r: Float64Array; size: number }, Z: number): Float64Array {
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) v[j] = -Z / grid.r[j];
    return v;
}

describe('radial solver against the analytic hydrogen-like solution', () => {
    const cases: Array<[number, number, number]> = [
        [1, 0, 1], [2, 0, 1], [2, 1, 1], [3, 0, 1], [3, 1, 1], [3, 2, 1],
        [4, 0, 1], [4, 3, 1], [1, 0, 6], [3, 2, 6], [2, 1, 26],
    ];

    it.each(cases)('reproduces E = -Z^2/2n^2 for n=%i l=%i Z=%i', (n, l, Z) => {
        const grid = gridForAtom(Z, n);
        const state = solveRadialState(grid, n, l, coulomb(grid, Z));
        const exact = -(Z * Z) / (2 * n * n);
        expect(state.energy).toBeCloseTo(exact, 6);
        expect(Math.abs((state.energy - exact) / exact)).toBeLessThan(1e-6);
    });

    it.each(cases)('reproduces R_nl(r) for n=%i l=%i Z=%i', (n, l, Z) => {
        const grid = gridForAtom(Z, n);
        const state = solveRadialState(grid, n, l, coulomb(grid, Z));
        // R spans about 1e-3 (Z=1, n=4) to about 130 (Z=26, n=1) across this case
        // list, so a fixed absolute tolerance (ruling R5) is meaningless: either
        // trivially satisfied or unattainable depending on the case. A pure
        // pointwise relative error is not right either: interpolateOnGrid is
        // linear, and near a radial node the wave function is small while its
        // curvature is not, so linear interpolation error there gets divided by
        // a small denominator and reads as a large relative error even though
        // the solver's own values, taken directly at grid points, agree with
        // the analytic solution to 1e-6 or better everywhere (checked directly
        // for n=3 l=0 Z=1, n=4 l=0 Z=1 and n=3 l=2 Z=6 during development).
        // Ruling R5 anticipates exactly this and allows comparing against the
        // orbital's own peak scale instead; that is what this does, using the
        // largest magnitude among this case's own sample points as the scale.
        const samples = [0.2, 0.5, 1.0, 1.5, 2.5].map(fraction => {
            const r = (fraction * n * n) / Z;
            return { expected: radialWaveFunction(n, l, r, Z), actual: interpolateOnGrid(grid, state.R, r) };
        });
        const peak = Math.max(...samples.map(s => Math.abs(s.expected)));
        for (const { expected, actual } of samples) {
            expect(Math.abs(actual - expected) / peak).toBeLessThan(1e-4);
        }
    });

    it('normalises u so that the integral of u^2 is 1', () => {
        const grid = gridForAtom(1, 3);
        const state = solveRadialState(grid, 3, 1, coulomb(grid, 1));
        const uSquared = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) uSquared[j] = state.u[j] * state.u[j];
        expect(integrateOnGrid(grid, uSquared)).toBeCloseTo(1, 6);
    });

    it('produces n - l - 1 radial nodes', () => {
        const grid = gridForAtom(1, 4);
        for (const [n, l] of [[1, 0], [2, 0], [3, 0], [3, 1], [4, 1]] as Array<[number, number]>) {
            const state = solveRadialState(grid, n, l, coulomb(grid, 1));
            let nodes = 0;
            let previous = 0;
            // Ignore the outermost tail, where the artificial outer boundary and
            // rounding noise live.
            for (let j = 0; j < grid.size - 50; j++) {
                const value = state.u[j];
                if (Math.abs(value) < 1e-12) continue;
                const sign = value > 0 ? 1 : -1;
                if (previous !== 0 && sign !== previous) nodes++;
                previous = sign;
            }
            expect(nodes).toBe(n - l - 1);
        }
    });

    it('takes R positive near the origin, matching the analytic convention', () => {
        const grid = gridForAtom(1, 3);
        for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2]] as Array<[number, number]>) {
            const state = solveRadialState(grid, n, l, coulomb(grid, 1));
            const near = state.R.findIndex(value => Math.abs(value) > 1e-8);
            expect(state.R[near]).toBeGreaterThan(0);
        }
    });

    it('rejects impossible quantum numbers', () => {
        const grid = gridForAtom(1);
        expect(() => solveRadialState(grid, 1, 1, coulomb(grid, 1))).toThrow();
        expect(() => solveRadialState(grid, 0, 0, coulomb(grid, 1))).toThrow();
    });
});

describe('grid extent (ruling R21)', () => {
    // Regression tests for the defect the brief's own case list (n up to 4)
    // could not see: gridForAtom's old Z-only extent formula silently
    // truncated diffuse states. Hydrogen 6s and 7s were wrong by 20% and 41%
    // before the fix; each of these must now reach the same order of accuracy
    // as the brief's own n <= 4 cases once the grid is sized for its own n.
    it.each([4, 5, 6, 7])('reproduces E = -1/2n^2 for hydrogen n=%i s once the grid is sized for it', (n) => {
        const grid = gridForAtom(1, n);
        const state = solveRadialState(grid, n, 0, coulomb(grid, 1));
        const exact = -1 / (2 * n * n);
        expect(Math.abs((state.energy - exact) / exact)).toBeLessThan(1e-5);
    });

    it('throws when the grid is too small for the requested state', () => {
        // Hydrogen 7s needs rMax ~150 (gridForAtom(1, 7) gives 183); 40 is not
        // remotely enough, so the containment guard must catch it rather than
        // silently returning the ~41% wrong energy the unguarded solver did.
        const grid = makeRadialGrid(1e-6, 40, 2001);
        expect(() => solveRadialState(grid, 7, 0, coulomb(grid, 1))).toThrow(/n=7/);
    });
});

describe('inward-integration rescale over a long classically-forbidden stretch (ruling R27)', () => {
    // Regression test for the guard task 6 added to integrateInward
    // (src/atom/radial_solver.ts) after it blew up to Infinity while running
    // the SCF loop on iron: a deeply bound 1s (turning point r ~ 0.08),
    // solved on a grid sized for iron's own outermost shell (4s, rMax = 71)
    // rather than for 1s itself, has to integrate backward across a
    // classically forbidden region far larger than 1s's own turning point
    // requires. That combination previously overflowed before the periodic
    // rescale-on-threshold guard was added to mirror the forward direction's
    // existing one.
    //
    // Every default (non-ATOM_SLOW_TESTS) test elsewhere in this suite uses
    // a grid sized for the state it actually solves, so none of them can
    // exercise this path -- only running the real SCF loop on a heavy atom
    // does, and that is gated behind ATOM_SLOW_TESTS. This reproduces the
    // same oversized-grid geometry directly with a bare Coulomb potential
    // (no SCF loop, no Hartree/exchange), so the guard has cheap, always-on
    // coverage instead of a regression here silently passing every default
    // `npx jest` run.
    it('stays finite when a deeply bound state is solved on a grid sized for a much more diffuse one', () => {
        const Z = 26; // iron's nuclear charge; not solving iron itself, just borrowing its numbers
        const grid = makeRadialGrid(1e-6 / Z, 71, 2001); // rMax = 71: iron's own 4s extent, per gridForAtom(26, 4)
        const state = solveRadialState(grid, 1, 0, coulomb(grid, Z));

        expect(Number.isFinite(state.energy)).toBe(true);
        for (const value of state.u) expect(Number.isFinite(value)).toBe(true);
        for (const value of state.R) expect(Number.isFinite(value)).toBe(true);

        // Finite is necessary but not sufficient -- confirm the guard didn't
        // just avoid Infinity by also corrupting the answer.
        const exact = -(Z * Z) / 2;
        expect(Math.abs((state.energy - exact) / exact)).toBeLessThan(1e-4);
    });
});
