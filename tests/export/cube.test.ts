import {
    encodeCube, formatCubeValue, fieldCubeGrid, radialDensityCubeGrid, radiusEnclosing, asciiLine, CubeGrid,
} from '../../src/export/cube';
import { hydrogenicSource, makeFieldEvaluator } from '../../src/field_source';

/** Reads a cube file by the format's rules: 2 comments, counts and vectors in bohr, atoms, values. */
function parseCube(text: string) {
    const lines = text.split('\n');
    const numbers = (line: string) => line.trim().split(/\s+/).map(Number);
    const [natoms, ...origin] = numbers(lines[2]);
    const axes = [3, 4, 5].map(i => numbers(lines[i]));
    const atoms = lines.slice(6, 6 + natoms).map(numbers);
    const dataLines = lines.slice(6 + natoms).filter(line => line.trim() !== '');
    const tokens = dataLines.join(' ').trim().split(/\s+/);
    return { comments: lines.slice(0, 2), natoms, origin, axes, atoms, dataLines, tokens, values: tokens.map(Number) };
}

const tiny: CubeGrid = { shape: [2, 3, 7], origin: [-1, -2, -3], spacing: 0.5, values: Float32Array.from({ length: 42 }, (_, i) => (i - 20) * 1e-3) };

describe('Gaussian cube', () => {
    it('formats values in E13.5 with a two-digit exponent', () => {
        expect(formatCubeValue(1.2345e-3)).toBe('  1.23450E-03');
        expect(formatCubeValue(-0.5)).toBe(' -5.00000E-01');
        expect(formatCubeValue(0)).toBe('  0.00000E+00');
        expect(formatCubeValue(1e-120)).toBe('  0.00000E+00');
        expect(formatCubeValue(Number.NaN)).toBe('  0.00000E+00');
    });

    it('writes the header in bohr and the values x-slowest, six to a line', () => {
        const cube = parseCube(encodeCube(tiny, [{ Z: 26, position: [0, 0, 0] }], 'Iron 3d_z²', 'ψ, bohr^-3/2').join(''));
        expect(cube.comments).toEqual(['Iron 3d_z2', 'psi, bohr^-3/2']);
        expect(cube.natoms).toBe(1);   // positive: bohr
        expect(cube.origin).toEqual([-1, -2, -3]);
        expect(cube.axes).toEqual([[2, 0.5, 0, 0], [3, 0, 0.5, 0], [7, 0, 0, 0.5]]);
        expect(cube.atoms).toEqual([[26, 26, 0, 0, 0]]);
        expect(cube.values).toHaveLength(42);
        expect(cube.tokens.every(t => /^-?\d\.\d{5}E[+-]\d{2}$/.test(t))).toBe(true);
        expect(cube.dataLines.every(line => line.trim().split(/\s+/).length <= 6)).toBe(true);
        // Each z row starts a line: 2 x 3 rows of 7 values = 6 rows x 2 lines.
        expect(cube.dataLines).toHaveLength(12);
        cube.values.forEach((v, i) => expect(v).toBeCloseTo(tiny.values[i], 6));
    });

    it('samples a field source on the grid it was drawn on', () => {
        const source = hydrogenicSource({ n: 2, l: 1, ml: 0, Z: 1, resolution: 16, rMax: 10, enclosedFraction: 0.9 });
        const grid = fieldCubeGrid(source, 16);
        expect(grid.shape).toEqual([17, 17, 17]);
        expect(grid.origin).toEqual([-10, -10, -10]);
        expect(grid.spacing).toBeCloseTo(1.25, 12);
        const psi = makeFieldEvaluator(source.recipe);
        const at = (i: number, j: number, k: number) => grid.values[(i * 17 + j) * 17 + k];
        expect(at(8, 8, 12)).toBeCloseTo(psi(0, 0, 5), 6);
        expect(at(3, 11, 2)).toBeCloseTo(psi(-6.25, 3.75, -7.5), 6);
    });

    it('turns a radial distribution into a density that integrates to the electrons', () => {
        // Hydrogen 1s: D(r) = 4r²e^(-2r), so ρ = e^(-2r)/π, one electron.
        const size = 1201, rMin = 1e-4, dx = Math.log(40 / rMin) / (size - 1);
        const D = Float64Array.from({ length: size }, (_, j) => { const r = rMin * Math.exp(j * dx); return 4 * r * r * Math.exp(-2 * r); });
        const curve = { D, rMin, dx, size };
        const halfWidth = radiusEnclosing(curve, 0.999);
        // 1 - e^(-2R)(1 + 2R + 2R²) = 0.999 at R ≈ 5.6.
        expect(halfWidth).toBeGreaterThan(5.4);
        expect(halfWidth).toBeLessThan(5.8);
        const grid = radialDensityCubeGrid(curve, 64);
        const centre = grid.values[(32 * 65 + 32) * 65 + 32];
        expect(centre).toBeCloseTo(1 / Math.PI, 3);
        const electrons = grid.values.reduce((sum, v) => sum + v, 0) * grid.spacing ** 3;
        expect(electrons).toBeGreaterThan(0.98);
        expect(electrons).toBeLessThan(1.02);
    });

    it('keeps comment lines to printable ASCII on one line', () => {
        expect(asciiLine('ρ(r) − 4f_z³\nnext')).toBe('rho(r) - 4f_z3 next');
    });
});
