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
        const grid = gridForAtom(1);
        const f = new Float64Array(grid.size);
        // D(r) = 4 r^2 exp(-2r) for 1s of hydrogen
        for (let j = 0; j < grid.size; j++) {
            const r = grid.r[j];
            f[j] = 4 * r * r * Math.exp(-2 * r);
        }
        expect(integrateOnGrid(grid, f)).toBeCloseTo(1, 6);
    });

    it('cumulative integral ends at the total', () => {
        const grid = gridForAtom(1);
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
});
