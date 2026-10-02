import { spinCorrelation, correlationEnergyDensity, correlationPotential } from '../../src/atom/correlation';
import { spinExchangePotential, spinExchangeEnergyDensity, exchangePotential } from '../../src/atom/hartree';

describe('spin-polarised exchange-correlation', () => {
    it.each([1e-4, 0.03, 1, 40])('reduces to the unpolarised VWN5 at zeta = 0 (rho = %p)', rho => {
        const c = spinCorrelation(rho / 2, rho / 2);
        expect(c.epsilon).toBeCloseTo(correlationEnergyDensity(rho), 12);
        expect(c.vUp).toBeCloseTo(correlationPotential(rho), 10);
        expect(c.vDown).toBeCloseTo(correlationPotential(rho), 10);
    });

    it.each([[0.3, 0.1], [0.02, 0.005], [5, 1], [0.4, 0]])('its potentials are the derivatives of its energy (%p, %p)', (up, down) => {
        const energy = (u: number, d: number) => (u + d) * spinCorrelation(u, d).epsilon;
        const h = 1e-6 * (up + down);
        const c = spinCorrelation(up, down);
        expect(c.vUp).toBeCloseTo((energy(up + h, down) - energy(up - h, down)) / (2 * h), 6);
        if (down > h) expect(c.vDown).toBeCloseTo((energy(up, down + h) - energy(up, down - h)) / (2 * h), 6);
    });

    it('treats the two spins symmetrically and polarisation as costing correlation energy', () => {
        const a = spinCorrelation(0.2, 0.05);
        const b = spinCorrelation(0.05, 0.2);
        expect(a.epsilon).toBeCloseTo(b.epsilon, 14);
        expect(a.vUp).toBeCloseTo(b.vDown, 14);
        expect(spinCorrelation(0.25, 0).epsilon).toBeGreaterThan(spinCorrelation(0.125, 0.125).epsilon);
    });

    it('returns zeros, never NaN, at zero or underflowing density', () => {
        for (const [u, d] of [[0, 0], [1e-320, 0], [0, 1e-320]]) {
            const c = spinCorrelation(u, d);
            expect([c.epsilon, c.vUp, c.vDown].every(Number.isFinite)).toBe(true);
        }
    });

    it('spin exchange of half the density equals unpolarised exchange of the whole', () => {
        const rho = Float64Array.from([1e-6, 0.01, 1, 100]);
        const half = rho.map(v => v / 2);
        const vs = spinExchangePotential(half);
        const v = exchangePotential(rho);
        for (let j = 0; j < rho.length; j++) expect(vs[j]).toBeCloseTo(v[j], 12);
        const eps = spinExchangeEnergyDensity(half);
        for (let j = 0; j < rho.length; j++) expect(eps[j]).toBeCloseTo(0.75 * v[j], 12);
    });
});
