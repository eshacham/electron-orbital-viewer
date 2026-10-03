import { CoefficientFn, midpointValues, rk4Step } from '../../src/atom/coupled_rk4';

/** Integrates from t = 0 to t = 1 in `steps` steps, with v(t) supplied at grid points and midpoints. */
function integrate(fill: CoefficientFn, steps: number, vOf: (t: number) => number, G0: number, F0: number): [number, number] {
    const h = 1 / steps;
    const out = new Float64Array(2);
    let G = G0;
    let F = F0;
    for (let i = 0; i < steps; i++) {
        const t0 = i * h;
        rk4Step(fill, h, t0, vOf(t0), t0 + h / 2, vOf(t0 + h / 2), t0 + h, vOf(t0 + h), G, F, out);
        G = out[0];
        F = out[1];
    }
    return [G, F];
}

describe('rk4Step', () => {
    // G' = F, F' = -G from (1, 0): G = cos t, F = -sin t.
    const rotation: CoefficientFn = (_r, _v, out) => { out[0] = 0; out[1] = 1; out[2] = -1; out[3] = 0; };

    it('is fourth order: halving the step cuts the error about sixteenfold', () => {
        const error = (steps: number) => Math.abs(integrate(rotation, steps, () => 0, 1, 0)[0] - Math.cos(1));
        const ratio = error(10) / error(20);
        expect(ratio).toBeGreaterThan(12);
        expect(ratio).toBeLessThan(20);
        expect(error(100)).toBeLessThan(1e-9);
    });

    it('uses the supplied midpoint potential, not an endpoint one', () => {
        // G' = v G with v = t: G = exp(t²/2). Feeding v through the potential
        // slot is what distinguishes a correct midpoint evaluation from one
        // that reuses v0 -- the latter is only first-order accurate here.
        const growth: CoefficientFn = (_r, v, out) => { out[0] = v; out[1] = 0; out[2] = 0; out[3] = 0; };
        const [G] = integrate(growth, 50, t => t, 1, 0);
        expect(Math.abs(G - Math.exp(0.5))).toBeLessThan(1e-8);
    });

    it('integrates backwards with a negative step', () => {
        const out = new Float64Array(2);
        let G = Math.cos(1);
        let F = -Math.sin(1);
        const h = -0.01;
        for (let i = 0; i < 100; i++) {
            rk4Step(rotation, h, 0, 0, 0, 0, 0, 0, G, F, out);
            G = out[0];
            F = out[1];
        }
        expect(G).toBeCloseTo(1, 9);
        expect(F).toBeCloseTo(0, 9);
    });
});

describe('midpointValues', () => {
    it('is exact for a cubic in the interior and a quadratic at both ends', () => {
        const cubic = (x: number) => 2 * x ** 3 - x ** 2 + 3 * x - 5;
        const quadratic = (x: number) => 3 * x ** 2 - 2 * x + 1;
        const size = 12;
        const cubicValues = Float64Array.from({ length: size }, (_, j) => cubic(j));
        const quadraticValues = Float64Array.from({ length: size }, (_, j) => quadratic(j));
        const cubicMid = midpointValues(cubicValues);
        const quadraticMid = midpointValues(quadraticValues);
        expect(cubicMid).toHaveLength(size - 1);
        for (let j = 1; j < size - 2; j++) expect(cubicMid[j]).toBeCloseTo(cubic(j + 0.5), 10);
        for (const j of [0, size - 2]) expect(quadraticMid[j]).toBeCloseTo(quadratic(j + 0.5), 10);
    });
});
