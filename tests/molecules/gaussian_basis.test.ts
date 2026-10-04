import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { makeAOEvaluator, moEvaluator, densityEvaluator, densityOnGrid, moOnGrid, solidHarmonics } from '../../src/molecules/gaussian_basis';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { AnalyticFieldSource, makeFieldEvaluator } from '../../src/field_source';
import { generateFieldMesh, generateIsoValueMesh, meshFromSamples, sampleEvaluator, sampleFieldSource } from '../../src/orbital_mesh';
import { MoleculeBasis, MoleculeMeta } from '../../src/molecules/types';

/**
 * The committed fixtures (tools/molecules/generate.py --fixtures, ruling D4)
 * are the published files, reduced, plus PySCF's own values at ten points:
 * `aos[point][ao]` from mol.eval_gto('GTOval_sph'), each shipped orbital as
 * those AOs times its shipped coefficients, and ρ = Σ occ ψ² over them.
 * N₂ and O₂ have s, p, d and f shells (def2-TZVP); O₂ is unrestricted (α
 * and β orbitals); HF is heteronuclear.
 */
const FIXTURES = join(__dirname, '../fixtures/molecules');
const json = <T>(path: string): T => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8')) as T;
interface Fixture { points: number[][]; aos: number[][]; orbitals: Array<{ index: number; values: number[] }>; density: number[] }

/**
 * 1e-10 relative, with a 1e-13 floor for values that are zero by symmetry
 * or deep in a tail: the screening below skips only terms under 1e-14 each
 * (see makeAOEvaluator), and AOs and orbitals are of order 1.
 */
const close = (ours: number, theirs: number) => {
    const tolerance = 1e-13 + 1e-10 * Math.abs(theirs);
    if (!(Math.abs(ours - theirs) <= tolerance)) throw new Error(`${ours} differs from PySCF's ${theirs} by more than ${tolerance}`);
};

describe.each(['n2', 'o2', 'hf'])('%s against PySCF', id => {
    const basis = json<MoleculeBasis>(`${id}/basis.json`);
    const fixture = json<Fixture>(`${id}.json`);

    it('evaluates every AO as eval_gto does, in PySCF order', () => {
        const aos = makeAOEvaluator(basis);
        const chi = new Float64Array(aos.nao);
        expect(fixture.aos[0]).toHaveLength(basis.nao);
        fixture.points.forEach(([x, y, z], p) => {
            aos.evaluate(x, y, z, chi);
            chi.forEach((value, mu) => close(value, fixture.aos[p][mu]));
        });
    });

    it('evaluates every shipped orbital as PySCF does', () => {
        expect(fixture.orbitals.map(o => o.index)).toEqual(basis.orbitals.map(o => o.index));
        for (const { index, values } of fixture.orbitals) {
            const psi = moEvaluator(basis, index);
            fixture.points.forEach(([x, y, z], p) => close(psi(x, y, z), values[p]));
        }
    });

    it('evaluates the density as PySCF does', () => {
        const rho = densityEvaluator(basis);
        fixture.points.forEach(([x, y, z], p) => close(rho(x, y, z), fixture.density[p]));
    });
});

describe('solidHarmonics', () => {
    it('stops at f, as the exported bases do', () => {
        expect(() => solidHarmonics(4, 0, 0, 1, new Float64Array(9), 0)).toThrow('l = 4: the Gaussian evaluator stops at f');
    });
});

describe('densityOnGrid', () => {
    it('reproduces the shipped N2 density grid, index for index', () => {
        // The fixture grid is outputs.density_on_grid on a 41³ cube (meta.grid
        // says so): the same ρ = Σ occ ψ² in float64, stored as float32, with
        // values under 1e-12 written as zero.
        const meta = json<MoleculeMeta>('n2/meta.json');
        const basis = json<MoleculeBasis>('n2/basis.json');
        const raw = gunzipSync(readFileSync(join(FIXTURES, 'n2/density.bin.gz')));
        const shipped = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
        const ours = densityOnGrid(basis, meta.grid!);
        expect(ours).toHaveLength(shipped.length);
        let worst = 0;
        for (let n = 0; n < shipped.length; n++) {
            // Float32 rounding of each side is 6e-8 relative; both round the same float64 value.
            const allowed = 2e-7 * shipped[n] + 1e-12;
            worst = Math.max(worst, Math.abs(ours[n] - shipped[n]) / allowed);
        }
        expect(worst).toBeLessThanOrEqual(1);

        const rho = densityEvaluator(basis);
        const tiny = densityOnGrid(basis, { shape: [3, 3, 3], origin: [-1, -1, -1], spacing: 1 });
        expect(tiny[(1 * 3 + 1) * 3 + 2]).toBeCloseTo(rho(0, 0, 1), 5);
        expect(tiny[(2 * 3 + 0) * 3 + 1]).toBeCloseTo(rho(1, -1, 0), 5);
    });
});

describe('the grid route', () => {
    // Off-centre and a different length on every axis, so a transposed index shows.
    const grid = { shape: [5, 4, 3] as [number, number, number], origin: [-1.3, 0.2, -2] as [number, number, number], spacing: 0.7 };
    const at = (n: number): [number, number, number] => {
        const i = Math.floor(n / 12), j = Math.floor(n / 3) % 4, k = n % 3;
        return [grid.origin[0] + i * grid.spacing, grid.origin[1] + j * grid.spacing, grid.origin[2] + k * grid.spacing];
    };
    // Float32 storage: 6e-8 relative; the floor covers ψ through zero.
    const agrees = (stored: number, exact: number) => expect(Math.abs(stored - exact)).toBeLessThanOrEqual(1e-7 * Math.abs(exact) + 1e-13);

    it.each(['n2', 'o2', 'hf'])('gives %s the point evaluators\' values, orbital by orbital and for ρ and √ρ', id => {
        const basis = json<MoleculeBasis>(`${id}/basis.json`);
        for (const { index } of basis.orbitals) {
            const psi = moEvaluator(basis, index);
            moOnGrid(basis, index, grid).forEach((value, n) => agrees(value, psi(...at(n))));
        }
        const rho = densityEvaluator(basis);
        densityOnGrid(basis, grid).forEach((value, n) => agrees(value, rho(...at(n))));
        densityOnGrid(basis, grid, { root: true }).forEach((value, n) => agrees(value, Math.sqrt(rho(...at(n)))));
    });

    it('is the route a molecule source is sampled and meshed by', () => {
        const basis = json<MoleculeBasis>('o2/basis.json');
        registerMoleculeBasis(basis);
        const rMax = 7.5, side = 17;
        const cube = { shape: [side, side, side] as [number, number, number], origin: [-rMax, -rMax, -rMax] as [number, number, number], spacing: (2 * rMax) / (side - 1) };
        const homo: AnalyticFieldSource = { kind: 'analytic', id: 'o2 homo', rMax, recipe: { type: 'gaussianMO', moleculeId: basis.id, index: 8 } };
        const density: AnalyticFieldSource = { kind: 'analytic', id: 'o2 rho', rMax, recipe: { type: 'gaussianDensity', moleculeId: basis.id } };
        const sampled = sampleFieldSource(homo, side - 1);
        expect(sampled.samples).toEqual(moOnGrid(basis, 8, cube));
        expect(sampleFieldSource(density, side - 1).samples).toEqual(densityOnGrid(basis, cube, { root: true }));
        // The same samples point by point would have given, to float32 storage.
        const pointwise = sampleEvaluator(makeFieldEvaluator(homo.recipe), rMax, side - 1).samples;
        pointwise.forEach((value, n) => agrees(sampled.samples[n], value));
        // generateFieldMesh takes the grid route too; vertices are still coloured point by point.
        expect(generateFieldMesh(homo, side - 1, 0.9)).toEqual(meshFromSamples(sampled, 0.9, makeFieldEvaluator(homo.recipe)));
    });
});

describe('recipes and meshing', () => {
    // One normalised s Gaussian, occupation 2: ρ = 2 (2α/π)^(3/2) e^(−2αr²).
    const alpha = 0.8;
    const c = (2 * alpha / Math.PI) ** 0.75 / 0.28209479177387814;
    const toy: MoleculeBasis = {
        id: 'toy@00', spherical: true, convention: 'test', atoms: [[0, 0, 0]], nao: 1,
        shells: [{ atom: 0, l: 0, exponents: [alpha], coefficients: [c] }],
        orbitals: [{ index: 0, label: '1σg', energyHartree: -0.5, occupation: 2, spin: 'restricted', coefficients: [1] }],
    };
    const densitySource: AnalyticFieldSource = { kind: 'analytic', id: 't', rMax: 4, recipe: { type: 'gaussianDensity', moleculeId: 'toy@00' } };

    it('refuses a basis whose shells do not add up to nao', () => {
        expect(() => makeAOEvaluator({ ...toy, nao: 2 })).toThrow('Basis toy@00: shells describe 1 AOs, file says 2');
    });

    it('refuses an orbital whose coefficients do not match the basis', () => {
        const short = { ...toy, orbitals: [{ ...toy.orbitals[0], coefficients: [] }] };
        expect(() => moEvaluator(short, 0)).toThrow('Basis toy@00: orbital 0 has 0 coefficients for 1 AOs');
        expect(() => densityEvaluator(short)).toThrow('Basis toy@00: orbital 0 has 0 coefficients for 1 AOs');
    });

    it('builds MO and √ρ evaluators from a registered basis, and says when one is missing', () => {
        registerMoleculeBasis(toy);
        const psi = makeFieldEvaluator({ type: 'gaussianMO', moleculeId: 'toy@00', index: 0 });
        const root = makeFieldEvaluator({ type: 'gaussianDensity', moleculeId: 'toy@00' });
        expect(psi(0, 0, 0)).toBeCloseTo((2 * alpha / Math.PI) ** 0.75, 12);
        expect(root(0.3, 0, 0) ** 2).toBeCloseTo(2 * psi(0.3, 0, 0) ** 2, 12);
        expect(() => makeFieldEvaluator({ type: 'gaussianMO', moleculeId: 'nope@01', index: 0 })).toThrow(/No basis registered for nope@01/);
        expect(() => makeFieldEvaluator({ type: 'gaussianMO', moleculeId: 'toy@00', index: 3 })).toThrow(/has no orbital 3/);
    });

    it('draws a density at the value asked for, not at an enclosed fraction', () => {
        registerMoleculeBasis(toy);
        const iso = 0.05;
        const peak = 2 * (2 * alpha / Math.PI) ** 1.5;
        const radius = Math.sqrt(Math.log(peak / iso) / (2 * alpha));
        const mesh = generateIsoValueMesh(densitySource, 64, iso);
        const radii = mesh.positions.map(([x, y, z]) => Math.hypot(x, y, z));
        const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
        // Linear interpolation along a 0.125 a₀ cell edge: well under 1 % here.
        expect(Math.abs(mean - radius) / radius).toBeLessThan(0.01);
        expect(mesh.isoLevel).toBe(iso);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
    });

    it('says when nothing reaches the value, and refuses anything but a density', () => {
        registerMoleculeBasis(toy);
        expect(() => generateIsoValueMesh(densitySource, 16, 1e3)).toThrow(/No part of this density reaches ρ = 1000/);
        expect(() => generateIsoValueMesh(densitySource, 16, 0)).toThrow('Invalid parameters: isoValue must be positive');
        const orbital: AnalyticFieldSource = { ...densitySource, recipe: { type: 'gaussianMO', moleculeId: 'toy@00', index: 0 } };
        expect(() => generateIsoValueMesh(orbital, 16, 0.05)).toThrow(/only for a 'gaussianDensity' source; t is 'gaussianMO'/);
    });
});
