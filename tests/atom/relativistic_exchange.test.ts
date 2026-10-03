import {
    relativisticBeta, macDonaldVoskoEnergyFactor, macDonaldVoskoPotentialFactor,
    exchangePotential, exchangeEnergy,
} from '../../src/atom/hartree';
import { makeRadialGrid } from '../../src/atom/radial_grid';

const EXCHANGE_COEFFICIENT = Math.cbrt(3 / Math.PI);

/** ρ ε_x^R(ρ), the exchange energy per unit volume. */
function energyDensity(rho: number): number {
    return -0.75 * EXCHANGE_COEFFICIENT * Math.cbrt(rho) * rho * macDonaldVoskoEnergyFactor(relativisticBeta(rho));
}

describe('MacDonald–Vosko relativistic exchange', () => {
    it('reduces to non-relativistic exchange as β -> 0, with the right leading corrections', () => {
        expect(macDonaldVoskoEnergyFactor(0)).toBe(1);
        expect(macDonaldVoskoPotentialFactor(0)).toBe(1);
        const b = 1e-3;
        expect(macDonaldVoskoEnergyFactor(b)).toBeCloseTo(1 - (2 / 3) * b * b, 12);
        // D1 (preflight): Ψ's next expansion term is +0.8β⁴ = 8.0e-13 at β = 1e-3,
        // which is itself above toBeCloseTo(12)'s 5e-13 threshold, so comparing
        // against the truncated 1 - β² fails by construction at 12 digits. Pinning
        // the β⁴ coefficient directly, instead of loosening the tolerance against
        // the truncated form, keeps this a tight check on Ψ rather than a looser one.
        expect(macDonaldVoskoPotentialFactor(b)).toBeCloseTo(1 - b * b + 0.8 * b ** 4, 12);
    });

    it('matches independently computed values at β = 1', () => {
        expect(macDonaldVoskoEnergyFactor(1)).toBeCloseTo(0.5741223409978391, 12);
        expect(macDonaldVoskoPotentialFactor(1)).toBeCloseTo(0.43483786021034565, 12);
    });

    it('is continuous across the series switch-over at β = 1e-2', () => {
        expect(macDonaldVoskoEnergyFactor(0.00999)).toBeCloseTo(0.9999334705837514, 11);
        // Direct comparison of the two branches at the switch-over itself: 1e-2 is
        // not < 1e-2, so macDonaldVoskoEnergyFactor(beta) takes the closed form.
        // Mirror hartree.ts's series here (same coefficients) and check it agrees
        // with the closed form to far better than the series's next omitted term
        // (O(β⁷), ~3e-13 relative at this β — comfortably inside 1e-12).
        const beta = 1e-2;
        const seriesBracket = (2 / 3) * beta - beta ** 3 / 5 + (3 / 28) * beta ** 5;
        const seriesValue = 1 - 1.5 * seriesBracket * seriesBracket;
        const closedFormValue = macDonaldVoskoEnergyFactor(beta);
        expect(Math.abs((seriesValue - closedFormValue) / closedFormValue)).toBeLessThan(1e-12);
    });

    it.each([1e-2, 1, 1e3, 1e5, 1e6])('potential is the functional derivative of the energy at ρ = %p', rho => {
        const h = rho * 1e-5;
        const derivative = (energyDensity(rho + h) - energyDensity(rho - h)) / (2 * h);
        const potential = exchangePotential(Float64Array.of(rho), true)[0];
        expect(Math.abs((derivative - potential) / potential)).toBeLessThan(1e-8);
    });

    it('leaves the non-relativistic path untouched by default', () => {
        const density = Float64Array.of(0.1, 10, 1e4);
        const plain = exchangePotential(density);
        for (let j = 0; j < density.length; j++) {
            expect(plain[j]).toBe(-EXCHANGE_COEFFICIENT * Math.cbrt(density[j]));
        }
        const grid = makeRadialGrid(1e-3, 10, 3);
        const D = Float64Array.of(1, 2, 3);
        // Pinned against the value this exact call returned before the relativistic
        // flag was added (the non-relativistic formula itself is untouched by this
        // task). Comparing default-argument to explicit-false, as this did before,
        // is tautological — false is the default, so the two calls are the same
        // code path by construction and can never disagree.
        expect(exchangeEnergy(grid, D, density)).toBe(-734.7184796343604);
        expect(exchangeEnergy(grid, D, density, true)).toBeGreaterThan(exchangeEnergy(grid, D, density));
    });
});
