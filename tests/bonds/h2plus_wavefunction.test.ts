import { solveH2Plus, h2plusEvaluator, h2plusSource, h2plusSamplingRadius, H2PlusSolution, H2PlusState } from '../../src/bonds/h2plus';
import { makeFieldEvaluator } from '../../src/field_source';
import { generateFieldMesh } from '../../src/orbital_mesh';

const g = solveH2Plus(2, '1sigma_g');
const u = solveH2Plus(2, '1sigma_u');
const psiG = h2plusEvaluator(g);
const psiU = h2plusEvaluator(u);
const POINTS: Array<[number, number, number]> = [[0.4, 0.3, 0.6], [1.5, -0.7, 1.9], [-0.8, 0.2, -0.4]];

function localEnergy(psi: (x: number, y: number, z: number) => number, [x, y, z]: [number, number, number]): number {
    const h = 1e-3;
    const c = psi(x, y, z);
    const laplacian = (psi(x + h, y, z) + psi(x - h, y, z) + psi(x, y + h, z) + psi(x, y - h, z)
        + psi(x, y, z + h) + psi(x, y, z - h) - 6 * c) / (h * h);
    const potential = -1 / Math.hypot(x, y, z - 1) - 1 / Math.hypot(x, y, z + 1);
    return -0.5 * laplacian / c + potential;
}

/** ∫ψ² over the cube [−L, L]³ by the plain grid sum (n points per axis). */
function gridNorm(psi: (x: number, y: number, z: number) => number, L: number, n: number): number {
    const step = (2 * L) / (n - 1);
    let sum = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        sum += psi(-L + i * step, -L + j * step, -L + k * step) ** 2;
    }
    return sum * step ** 3;
}

/** M(+1): every normalised Legendre function there is √((2k + 1)/2). */
function angularAtPlusZ(s: H2PlusSolution): number {
    return s.degrees.reduce((sum, k, i) => sum + s.angular[i] * Math.sqrt((2 * k + 1) / 2), 0);
}

describe('the exact H2+ wavefunction', () => {
    it.each([['1σg', psiG, g.electronicEnergy], ['1σu', psiU, u.electronicEnergy]] as const)(
        '%s satisfies the Schrödinger equation pointwise', (_name, psi, energy) => {
            for (const point of POINTS) expect(Math.abs(localEnergy(psi, point) - energy)).toBeLessThan(1e-4);
        });

    it('is normalised', () => {
        for (const psi of [psiG, psiU]) expect(Math.abs(gridNorm(psi, 8, 81) - 1)).toBeLessThan(2e-3);
    });

    it('has the Kato cusp at each nucleus', () => {
        const h = 1e-4;
        for (const psi of [psiG, psiU]) {
            const at = psi(0, 0, 1);
            const slope = (dz: number) => (Math.log(Math.abs(psi(0, 0, 1 + dz))) - Math.log(Math.abs(at))) / h;
            expect((slope(h) + slope(-h)) / 2).toBeCloseTo(-1, 3);
        }
    });

    it('is gerade or ungerade, positive at the +z nucleus, and 1σu has its node on the midplane', () => {
        for (const [x, y, z] of POINTS) {
            expect(psiG(x, y, -z)).toBeCloseTo(psiG(x, y, z), 10);
            expect(psiU(x, y, -z)).toBeCloseTo(-psiU(x, y, z), 10);
        }
        expect(psiG(0, 0, 1)).toBeGreaterThan(0);
        expect(psiU(0, 0, 1)).toBeGreaterThan(0);
        expect(Math.abs(psiU(0.7, -0.3, 0))).toBeLessThan(1e-12);
        expect(psiG(0, 0, 0) / psiG(0, 0, 1)).toBeGreaterThan(0.6);
    });

    it('is the evaluator the h2plus recipe builds, and meshes through generateFieldMesh', () => {
        const source = h2plusSource(2, '1sigma_u');
        expect(source.id).toBe('h2plus:2.0000:1sigma_u');
        expect(source.recipe).toEqual({ type: 'h2plus', R: 2, state: '1sigma_u' });
        expect(makeFieldEvaluator(source.recipe)(0.4, 0.3, 0.6)).toBeCloseTo(psiU(0.4, 0.3, 0.6), 12);

        const bonding = generateFieldMesh(h2plusSource(2, '1sigma_g'), 40, 0.9);
        expect(new Set(bonding.psiSigns)).toEqual(new Set([1]));
        const antibonding = generateFieldMesh(source, 40, 0.9);
        antibonding.positions.forEach(([, , z], v) => {
            if (Math.abs(z) > 0.3) expect(antibonding.psiSigns[v]).toBe(z > 0 ? 1 : -1);
        });
    });
});

describe('the H2+ wavefunction across the slider', () => {
    const STATES: H2PlusState[] = ['1sigma_g', '1sigma_u'];
    const RS = [0.5, 1, 2, 3.5, 6, 10];

    // eigenvectorFor leaves each factor's sign to chance; were it not pinned,
    // dragging R could swap the two colours of 1σu from one frame to the next.
    it.each(STATES)('%s keeps one phase convention at every R: Λ > 0 at λ = 1, M > 0 at μ = +1', state => {
        for (const R of RS) {
            const s = solveH2Plus(R, state);
            expect(s.radial[0]).toBeGreaterThan(0);   // Λ(1) = 2^σ g₀
            expect(angularAtPlusZ(s)).toBeGreaterThan(0);
            const psi = h2plusEvaluator(s);
            expect(psi(0, 0, R / 2)).toBeGreaterThan(0);
            if (state === '1sigma_u') expect(psi(0, 0, -R / 2)).toBeLessThan(0);
        }
    });

    // Inverse iteration from an all-ones start happens to land on the positive
    // sign at every R tried, so the tests above would pass with no pin at all.
    // This one hands the solver eigenvectors of the opposite sign, which is
    // just as much an answer as the first.
    it.each(STATES)('%s pins each factor whatever sign the eigensolver hands back', state => {
        jest.isolateModules(() => {
            const actual = jest.requireActual('../../src/bonds/tridiagonal');
            const eigenvectorFor = (...args: Parameters<typeof actual.eigenvectorFor>) =>
                (actual.eigenvectorFor(...args) as Float64Array).map(v => -v);
            jest.doMock('../../src/bonds/tridiagonal', () => ({ ...actual, eigenvectorFor }));
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const flipped = require('../../src/bonds/h2plus') as typeof import('../../src/bonds/h2plus');
            for (const R of [0.5, 2, 10]) {
                const s = flipped.solveH2Plus(R, state);
                const reference = solveH2Plus(R, state);
                expect(Array.from(s.radial)).toEqual(Array.from(reference.radial));
                expect(Array.from(s.angular)).toEqual(Array.from(reference.angular));
                expect(flipped.h2plusEvaluator(s)(0, 0, R / 2)).toBeGreaterThan(0);
            }
        });
    });

    it('changes smoothly with R, never flipping sign between neighbouring frames', () => {
        for (const state of STATES) {
            for (let R = 0.5; R < 10; R += 0.5) {
                const a = h2plusEvaluator(solveH2Plus(R, state));
                const b = h2plusEvaluator(solveH2Plus(R + 0.01, state));
                for (const [x, y, z] of [[0.3, 0.2, 0.9], [-0.5, 0.1, -1.2]]) {
                    expect(Math.abs(b(x, y, z) - a(x, y, z))).toBeLessThan(0.05 * Math.abs(a(x, y, z)));
                }
            }
        }
    });

    it.each([[0.5, '1sigma_g'], [0.5, '1sigma_u'], [10, '1sigma_g'], [10, '1sigma_u']] as const)(
        'at R = %s a0, %s is normalised within its own sampling box', (R, state) => {
            const s = solveH2Plus(R, state);
            // A 61³ grid sum, the cusps' error being what the tolerance allows
            // for (it measured within 8 × 10⁻⁴ for all four); the box itself
            // leaves out a few millionths of the electron.
            expect(Math.abs(gridNorm(h2plusEvaluator(s), h2plusSamplingRadius(s), 61) - 1)).toBeLessThan(2e-3);
        });

    it('refuses an unknown state or an R the solver does not answer for', () => {
        expect(() => solveH2Plus(2, 'banana' as H2PlusState)).toThrow(/state/);
        expect(() => solveH2Plus(0, '1sigma_g')).toThrow(RangeError);
        expect(() => makeFieldEvaluator({ type: 'h2plus', R: Number.NaN, state: '1sigma_g' })).toThrow(RangeError);
    });
});
