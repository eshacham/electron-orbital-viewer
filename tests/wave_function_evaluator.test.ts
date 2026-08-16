import {
    makeWaveFunctionEvaluator,
    atomicOrbitalProbabilityDensity,
} from '../src/quantum_functions';

/**
 * The fast evaluator precomputes the polynomial coefficients once per orbital
 * instead of rebuilding them at every sample point. It must agree with the
 * straightforward reference implementation everywhere.
 */
describe('makeWaveFunctionEvaluator', () => {
    const orbitals: Array<[number, number, number, number]> = [
        // n, l, ml, Z
        [1, 0, 0, 1],
        [2, 1, 0, 1],
        [2, 1, 1, 1],
        [2, 1, -1, 1],
        [3, 2, 0, 1],
        [3, 2, -2, 1],
        [4, 3, 2, 1],
        [7, 3, 0, 1],
        [9, 8, 8, 1],
        [3, 1, 1, 6],
    ];

    it.each(orbitals)('matches the reference for n=%i l=%i ml=%i Z=%i', (n, l, ml, Z) => {
        const evaluate = makeWaveFunctionEvaluator(n, l, ml, Z);

        // A scatter of points, including the origin and the axes.
        const coords = [-13.5, -7, -1.25, 0, 0.5, 3, 11, 24];
        for (const x of coords) {
            for (const y of coords) {
                for (const z of coords) {
                    const r = Math.hypot(x, y, z);
                    const theta = Math.acos(r === 0 ? 0 : Math.min(1, Math.max(-1, z / r)));
                    const phi = Math.atan2(y, x);
                    const expected = atomicOrbitalProbabilityDensity(
                        n, l, ml, r, theta, phi, Z
                    ).waveFunctionValue;

                    const actual = evaluate(x, y, z);

                    // Mixed tolerance. The reference reaches cos(theta) via
                    // acos(z / r), and that round trip turns an exact zero into
                    // ~6e-17; the evaluator uses z / r directly and returns a
                    // true zero. The absolute floor covers that difference while
                    // staying far below any real disagreement in shape or sign.
                    const tolerance = 1e-9 * Math.abs(expected) + 1e-15;
                    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
                }
            }
        }
    });

    it('stays finite across a wide radial range', () => {
        for (const [n, l, ml, Z] of orbitals) {
            const evaluate = makeWaveFunctionEvaluator(n, l, ml, Z);
            for (const r of [0, 1e-9, 0.5, 5, 50, 200, 400]) {
                expect(Number.isFinite(evaluate(r, r * 0.3, -r * 0.7))).toBe(true);
            }
        }
    });
});
