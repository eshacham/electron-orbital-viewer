import { makeRadialGrid, gridForAtom, integrateOnGrid, cumulativeIntegral, interpolateOnGrid } from '../../src/atom/radial_grid';

describe('radial grid', () => {
    it('spaces points geometrically', () => {
        const grid = makeRadialGrid(1e-4, 40, 501);
        expect(grid.r[0]).toBeCloseTo(1e-4, 12);
        expect(grid.r[grid.size - 1]).toBeCloseTo(40, 8);
        const ratio = grid.r[1] / grid.r[0];
        expect(grid.r[301] / grid.r[300]).toBeCloseTo(ratio, 12);
    });

    it('integrates exp(-r) to 1 over a wide range', () => {
        const grid = makeRadialGrid(1e-6, 60, 2001);
        const f = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) f[j] = Math.exp(-grid.r[j]);
        // integral of exp(-r) from rMin to rMax ~ 1 (rMin is negligible)
        expect(integrateOnGrid(grid, f)).toBeCloseTo(1, 5);
    });

    it('integrates the hydrogen 1s radial distribution to 1', () => {
        // A generic Simpson's-rule accuracy check, not a statement about any
        // particular atom's occupation, so it asks makeRadialGrid directly for
        // a domain wide enough that the 1s tail beyond it is negligible to
        // machine precision (ruling R21 sized gridForAtom(1)'s own default to
        // just past n=1's 99.99% radius, which is not wide enough for that:
        // the true integral to r=9 alone is short of 1 by about 2.8e-6).
        const grid = makeRadialGrid(1e-6, 65, 2001);
        const f = new Float64Array(grid.size);
        // D(r) = 4 r^2 exp(-2r) for 1s of hydrogen
        for (let j = 0; j < grid.size; j++) {
            const r = grid.r[j];
            f[j] = 4 * r * r * Math.exp(-2 * r);
        }
        expect(integrateOnGrid(grid, f)).toBeCloseTo(1, 8);
    });

    it('cumulative integral ends at the total', () => {
        // Same reasoning as above: an explicit wide domain, not gridForAtom's
        // atom-sized default.
        const grid = makeRadialGrid(1e-6, 65, 2001);
        const f = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) {
            const r = grid.r[j];
            f[j] = 4 * r * r * Math.exp(-2 * r);
        }
        const cumulative = cumulativeIntegral(grid, f);
        expect(cumulative[0]).toBeCloseTo(0, 10);
        expect(cumulative[grid.size - 1]).toBeCloseTo(1, 6);
    });

    it('interpolates a known function between grid points', () => {
        const grid = makeRadialGrid(1e-4, 20, 1001);
        const values = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) values[j] = Math.exp(-grid.r[j]);
        expect(interpolateOnGrid(grid, values, 1.234)).toBeCloseTo(Math.exp(-1.234), 5);
    });

    it('is exact at grid points', () => {
        const grid = makeRadialGrid(1e-4, 20, 1001);
        const values = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) values[j] = Math.exp(-grid.r[j]);
        for (const j of [0, 1, 250, 500, 999, 1000]) {
            expect(interpolateOnGrid(grid, values, grid.r[j])).toBeCloseTo(values[j], 15);
        }
    });

    it('interpolation clamps outside the grid', () => {
        const grid = makeRadialGrid(1e-4, 20, 1001);
        const values = new Float64Array(grid.size);
        values.fill(3);
        expect(interpolateOnGrid(grid, values, 1e6)).toBe(3);
        expect(interpolateOnGrid(grid, values, 0)).toBe(3);
    });

    it('scales the inner cutoff with nuclear charge', () => {
        expect(gridForAtom(92).rMin).toBeLessThan(gridForAtom(1).rMin);
    });

    it('rejects an even point count, which would break Simpson\'s rule', () => {
        expect(() => makeRadialGrid(1e-4, 20, 1000)).toThrow();
        expect(() => makeRadialGrid(1e-4, 20, 1001)).not.toThrow();
    });

    it('sizes rMax from the highest occupied n of the atom\'s period (ruling R21)', () => {
        // Period boundaries by highest occupied n: 1-2 -> 1, 3-10 -> 2, 11-18 -> 3,
        // 19-36 -> 4, 37-54 -> 5, 55-86 -> 6, 87-118 -> 7. Values are the
        // documented RMAX_FOR_HIGHEST_N margins in radial_grid.ts.
        const expectedRMax: Array<[number, number]> = [
            [1, 9], [6, 24], [20, 71], [47, 103], [87, 183], [118, 183],
        ];
        for (const [Z, rMax] of expectedRMax) {
            expect(gridForAtom(Z).rMax).toBeGreaterThanOrEqual(rMax);
        }
    });

    it('accepts an explicit highest-n override for states above an atom\'s own occupation', () => {
        // Hydrogen only occupies n=1, but a caller solving its n=6 excited state
        // needs a grid sized for n=6, not for hydrogen's default period.
        expect(gridForAtom(1).rMax).toBeCloseTo(9, 6);
        expect(gridForAtom(1, 6).rMax).toBeCloseTo(140, 6);
    });
});
