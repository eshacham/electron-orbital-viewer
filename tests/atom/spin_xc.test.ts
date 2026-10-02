import {
    spinCorrelation, correlationEnergyDensity, correlationPotential,
    vwnG, FERROMAGNETIC, SPIN_STIFFNESS,
} from '../../src/atom/correlation';
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

    it('returns exactly zero, never NaN, at zero or underflowing density', () => {
        for (const [u, d] of [[0, 0], [1e-320, 0], [0, 1e-320]]) {
            expect(spinCorrelation(u, d)).toEqual({ epsilon: 0, vUp: 0, vDown: 0 });
        }
    });

    it('reduces to the restricted functional bit for bit at zeta = 0', () => {
        for (let k = -12; k <= 4; k += 0.25) {
            const rho = Math.pow(10, k);
            const c = spinCorrelation(rho / 2, rho / 2);
            expect(c.epsilon).toBe(correlationEnergyDensity(rho));
            expect(c.vUp).toBe(correlationPotential(rho));
            expect(c.vDown).toBe(correlationPotential(rho));
        }
    });

    it('gives the minority spin the derivative of the energy near full polarisation', () => {
        // d(eps_c)/d(zeta) carries f'(zeta) ~ (1 - zeta)^(1/3) terms, so a
        // one-sided difference from the fully polarised side converges only
        // like h^(1/3); hence the small step and loose tolerance.
        const up = 0.4, down = 1e-9, h = 1e-9;
        const energy = (u: number, d: number) => (u + d) * spinCorrelation(u, d).epsilon;
        const oneSided = (energy(up, down + h) - energy(up, down)) / h;
        expect(Math.abs(spinCorrelation(up, down).vDown - oneSided)).toBeLessThan(2e-4);
    });

    it('keeps the ferromagnetic and spin-stiffness parameter sets as published', () => {
        // Regression pins, computed from these constants at rs = 1 (x = 1), so
        // a typo in either set fails here; the sets themselves are validated
        // end to end by Task 5 reproducing NIST SRD 141's LSD total energies.
        expect(vwnG(1, FERROMAGNETIC)).toBeCloseTo(-0.0315280613, 9);
        expect(vwnG(1, SPIN_STIFFNESS)).toBeCloseTo(0.0396957894, 9);
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
