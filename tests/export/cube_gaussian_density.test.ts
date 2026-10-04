// Isolated from cube.test.ts, which exercises fieldCubeGrid against a real
// evaluator (hydrogenicSource) -- mocking orbital_mesh here so the squaring
// rule (Task 13b carry: a 'gaussianDensity' recipe's cube must hold ρ, not
// the √ρ field_source.ts evaluates for the mesh's own contour search) is
// pinned without pulling in the Gaussian basis math gaussian_basis.test.ts
// already covers.
jest.mock('../../src/orbital_mesh', () => ({ sampleFieldSource: jest.fn() }));

import { sampleFieldSource } from '../../src/orbital_mesh';
import { fieldCubeGrid } from '../../src/export/cube';
import type { AnalyticFieldSource } from '../../src/field_source';

const mockSamples = (values: number[]) => {
    (sampleFieldSource as jest.Mock).mockReturnValue({ samples: Float32Array.from(values), side: 2, step: 1, origin: -1 });
};

describe('fieldCubeGrid: the gaussianDensity squaring rule', () => {
    it('squares a gaussianDensity recipe\'s samples (√ρ, field_source.ts\'s own convention) back into ρ', () => {
        mockSamples([0, 1, 2, 3]);
        const source: AnalyticFieldSource = { kind: 'analytic', id: 'd', recipe: { type: 'gaussianDensity', moleculeId: 'x' }, rMax: 1 };
        const grid = fieldCubeGrid(source, 1);
        expect(Array.from(grid.values)).toEqual([0, 1, 4, 9]);
    });

    it('leaves a gaussianMO recipe\'s samples untouched -- it is already ψ, not √ρ', () => {
        mockSamples([0, 1, 2, 3]);
        const source: AnalyticFieldSource = { kind: 'analytic', id: 'm', recipe: { type: 'gaussianMO', moleculeId: 'x', index: 0 }, rMax: 1 };
        const grid = fieldCubeGrid(source, 1);
        expect(Array.from(grid.values)).toEqual([0, 1, 2, 3]);
    });

    it('leaves a plain hydrogenic recipe\'s samples untouched', () => {
        mockSamples([-1, 0.5, -0.25]);
        const source: AnalyticFieldSource = { kind: 'analytic', id: 'h', recipe: { type: 'hydrogenic', n: 1, l: 0, ml: 0, Z: 1 }, rMax: 1 };
        const grid = fieldCubeGrid(source, 1);
        expect(Array.from(grid.values)).toEqual([-1, 0.5, -0.25]);
    });
});
