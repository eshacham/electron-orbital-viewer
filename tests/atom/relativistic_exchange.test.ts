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
        // D1 (preflight): the next term in Ψ's expansion is +0.8β⁴ = 8.0e-13 at
        // β = 1e-3, which is itself above toBeCloseTo(12)'s 5e-13 threshold, so
        // that precision fails by construction, not because of a bug. Precision
        // 11 (and thus a 5e-12 threshold) comfortably clears the 8.0e-13 term
        // while still catching a wrong leading coefficient.
        expect(macDonaldVoskoPotentialFactor(b)).toBeCloseTo(1 - b * b, 11);
    });

    it('matches independently computed values at β = 1', () => {
        expect(macDonaldVoskoEnergyFactor(1)).toBeCloseTo(0.5741223409978391, 12);
        expect(macDonaldVoskoPotentialFactor(1)).toBeCloseTo(0.43483786021034565, 12);
    });

    it('is continuous across the series switch-over at β = 1e-2', () => {
        expect(macDonaldVoskoEnergyFactor(0.00999)).toBeCloseTo(0.9999334705837514, 11);
        expect(macDonaldVoskoEnergyFactor(0.01001)).toBeCloseTo(macDonaldVoskoEnergyFactor(0.00999), 5);
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
        expect(exchangeEnergy(grid, D, density)).toBe(exchangeEnergy(grid, D, density, false));
        expect(exchangeEnergy(grid, D, density, true)).toBeGreaterThan(exchangeEnergy(grid, D, density));
    });
});
