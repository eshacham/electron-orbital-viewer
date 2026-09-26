import { generateFieldMesh, generateOrbitalMesh, sampleFieldSource } from '../src/orbital_mesh';
import { hydrogenicSource, makeFieldEvaluator, GridFieldSource } from '../src/field_source';
import { OrbitalParams } from '../src/types/orbital';

const params: OrbitalParams = { n: 3, l: 2, ml: 1, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9 };

function centredGrid(side: number, halfWidth: number, value: (x: number, y: number, z: number) => number,
                     quantity: 'psi' | 'density'): GridFieldSource {
    const spacing = (2 * halfWidth) / (side - 1);
    const values = new Float32Array(side ** 3);
    let index = 0;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        values[index++] = value(-halfWidth + i * spacing, -halfWidth + j * spacing, -halfWidth + k * spacing);
    }
    return { kind: 'grid', id: 'test-grid', shape: [side, side, side], origin: [-halfWidth, -halfWidth, -halfWidth], spacing, quantity, values };
}

describe('generateFieldMesh', () => {
    it('is what generateOrbitalMesh draws, for the same orbital', () => {
        expect(generateOrbitalMesh(params)).toEqual(generateFieldMesh(hydrogenicSource(params), 32, 0.9));
    });

    it('samples z-fastest over [-rMax, rMax]^3', () => {
        const source = hydrogenicSource(params);
        const field = sampleFieldSource(source, 8);
        const evaluate = makeFieldEvaluator(source.recipe);
        expect(field.side).toBe(9);
        expect(field.step).toBeCloseTo(5, 12);
        expect(field.origin).toBe(-20);
        const [i, j, k] = [2, 7, 5];
        expect(field.samples[(i * 9 + j) * 9 + k]).toBeCloseTo(evaluate(-20 + 2 * 5, -20 + 7 * 5, -20 + 5 * 5), 7);
    });

    it('meshes a density grid at the radius that encloses the fraction asked for', () => {
        // rho ∝ e^(-r²): the share inside radius R is erf(R) - (2R/√π)e^(-R²), which is 1/2 at R = 1.0877.
        const source = centredGrid(65, 4, (x, y, z) => Math.exp(-(x * x + y * y + z * z)) / Math.PI ** 1.5, 'density');
        const mesh = generateFieldMesh(source, 64, 0.5);
        const radii = mesh.positions.map(([x, y, z]) => Math.hypot(x, y, z));
        const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
        expect(mean).toBeGreaterThan(1.0877 * 0.98);
        expect(mean).toBeLessThan(1.0877 * 1.02);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
        expect(mesh.densityMap.side).toBe(65);
        expect(mesh.densityMap.rMax).toBeCloseTo(4, 12);
    });

    it('phase-colours a psi grid by the interpolated sign at each vertex', () => {
        const source = centredGrid(33, 4, (x, y, z) => z * Math.exp(-(x * x + y * y + z * z) / 2), 'psi');
        const mesh = generateFieldMesh(source, 32, 0.9);
        mesh.positions.forEach(([, , z], index) => {
            if (Math.abs(z) > 0.2) expect(mesh.psiSigns[index]).toBe(z > 0 ? 1 : -1);
        });
    });

    it('refuses grids it cannot draw, saying why', () => {
        const good = centredGrid(9, 2, () => 1, 'density');
        expect(() => generateFieldMesh({ ...good, shape: [9, 9, 8] }, 8, 0.9)).toThrow(/centred cube/);
        expect(() => generateFieldMesh({ ...good, origin: [-1, -2, -2] }, 8, 0.9)).toThrow(/centred cube/);
        expect(() => generateFieldMesh({ ...good, values: new Float32Array(10) }, 8, 0.9)).toThrow(/expected 729 values/);
        expect(() => generateFieldMesh(good, 16, 0.9)).toThrow(/resolution must be 8/);
        expect(() => generateFieldMesh(good, 8, 1)).toThrow(/enclosedFraction/);
    });
});

import { generateFieldMeshes } from '../src/orbital_mesh';
import { AnalyticFieldSource, HydrogenicRecipe } from '../src/field_source';

const n2 = (l: number, ml: number): HydrogenicRecipe => ({ type: 'hydrogenic', n: 2, l, ml, Z: 1 });
const spHybrid = (sign: 1 | -1): AnalyticFieldSource => ({
    kind: 'analytic', id: `test-sp:${sign}`, rMax: 21,
    recipe: { type: 'combination', terms: [
        { coefficient: -Math.SQRT1_2, orbital: n2(0, 0) },
        { coefficient: sign * Math.SQRT1_2, orbital: n2(1, 0) },
    ] },
});

describe('generateFieldMeshes', () => {
    it('draws a combination as generateFieldMesh does, from shared basis samples', () => {
        const [batched] = generateFieldMeshes({ sources: [spHybrid(1)], colors: ['#ffffff'], resolution: 32, enclosedFraction: 0.9, label: 'test' });
        const direct = generateFieldMesh(spHybrid(1), 32, 0.9);
        expect(Math.abs(batched.isoLevel - direct.isoLevel) / direct.isoLevel).toBeLessThan(1e-4);
        expect(Math.abs(batched.positions.length - direct.positions.length)).toBeLessThanOrEqual(direct.positions.length * 0.01);
    });

    it('returns one mesh per source, in order', () => {
        const meshes = generateFieldMeshes({ sources: [spHybrid(1), spHybrid(-1)], colors: ['#ffffff', '#000000'], resolution: 32, enclosedFraction: 0.9, label: 'test' });
        const meanPositiveZ = (index: number) => {
            const zs = meshes[index].positions.filter((_, v) => meshes[index].psiSigns[v] === 1).map(([, , z]) => z);
            return zs.reduce((a, b) => a + b, 0) / zs.length;
        };
        expect(meshes).toHaveLength(2);
        expect(meanPositiveZ(0)).toBeGreaterThan(0);
        expect(meanPositiveZ(1)).toBeLessThan(0);
    });

    it('passes anything that is not a plain combination straight to generateFieldMesh', () => {
        const oneS = hydrogenicSource({ n: 1, l: 0, ml: 0, Z: 1, resolution: 24, rMax: 7.6, enclosedFraction: 0.9 });
        const polarised: AnalyticFieldSource = { kind: 'analytic', id: 'p', rMax: 7.6, recipe: { type: 'polarized1s', field: 0.03 } };
        const meshes = generateFieldMeshes({ sources: [oneS, polarised], colors: ['#fff', '#fff'], resolution: 24, enclosedFraction: 0.9, label: 'test' });
        expect(meshes[0]).toEqual(generateFieldMesh(oneS, 24, 0.9));
        expect(meshes[1]).toEqual(generateFieldMesh(polarised, 24, 0.9));
    });

    it('refuses an empty request', () => {
        expect(() => generateFieldMeshes({ sources: [], colors: [], resolution: 24, enclosedFraction: 0.9, label: 'x' })).toThrow(/no field sources/);
    });
});
