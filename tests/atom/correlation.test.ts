import { correlationEnergyDensity, correlationPotential, vwnEpsilonC, vwnEpsilonCDerivative } from '../../src/atom/correlation';

/**
 * Verified reference table (ruling R8 / vwn5-verified.md): computed from the
 * VWN5 formula there and cross-checked at rs=1 and rs=2 against the
 * published Ceperley-Alder uniform-electron-gas correlation energies.
 */
const VERIFIED_TABLE: ReadonlyArray<{ rs: number; epsC: number; vC: number }> = [
    { rs: 0.5, epsC: -0.07706331, vC: -0.08562449 },
    { rs: 1, epsC: -0.06001869, vC: -0.06781621 },
    { rs: 2, epsC: -0.04478279, vC: -0.05160382 },
    { rs: 5, epsC: -0.02813376, vC: -0.03338417 },
    { rs: 10, epsC: -0.01854453, vC: -0.02251833 },
    { rs: 20, epsC: -0.01154768, vC: -0.01433002 },
    { rs: 100, epsC: -0.00318465, vC: -0.00410382 },
];

/** rho that yields a given rs, inverting rs = (3/(4*pi*rho))^(1/3). */
function densityForRs(rs: number): number {
    return 3 / (4 * Math.PI * rs * rs * rs);
}

describe('VWN5 correlation', () => {
    it('reproduces eps_c for every verified (rs, eps_c) row to 8dp', () => {
        for (const { rs, epsC } of VERIFIED_TABLE) {
            expect(correlationEnergyDensity(densityForRs(rs))).toBeCloseTo(epsC, 8);
        }
    });

    it('reproduces V_c for every verified (rs, V_c) row to 8dp', () => {
        for (const { rs, vC } of VERIFIED_TABLE) {
            expect(correlationPotential(densityForRs(rs))).toBeCloseTo(vC, 8);
        }
    });

    it('matches a central difference of eps_c in x at rs = 0.5, 1, 5, 20 to 8 significant figures', () => {
        // Tests the analytic derivative directly, in x, rather than backing
        // it out of eps_c and V_c: that would only confirm the two are
        // internally consistent with each other, not that either is right.
        for (const rs of [0.5, 1, 5, 20]) {
            const x = Math.sqrt(rs);
            const h = x * 1e-6;
            const centralDifference = (vwnEpsilonC(x + h) - vwnEpsilonC(x - h)) / (2 * h);
            const relativeError = Math.abs((vwnEpsilonCDerivative(x) - centralDifference) / centralDifference);
            expect(relativeError).toBeLessThan(1e-8);
        }
    });

    it('is negative and monotonically increasing towards 0 as rs grows', () => {
        const rsValues = [0.1, 0.5, 1, 2, 5, 10, 20, 100, 1000];
        let previous = -Infinity;
        for (const rs of rsValues) {
            const epsC = correlationEnergyDensity(densityForRs(rs));
            expect(epsC).toBeLessThan(0);
            expect(epsC).toBeGreaterThan(previous);
            previous = epsC;
        }
    });

    it('vanishes as rs -> infinity', () => {
        expect(Math.abs(correlationEnergyDensity(densityForRs(1e6)))).toBeLessThan(1e-4);
    });

    it('makes V_c more negative than eps_c at every verified rs', () => {
        for (const { rs } of VERIFIED_TABLE) {
            const rho = densityForRs(rs);
            expect(correlationPotential(rho)).toBeLessThan(correlationEnergyDensity(rho));
        }
    });

    it('returns exactly 0 at rho = 0, rather than NaN from the rs -> infinity limit', () => {
        // rs = (3/(4*pi*rho))^(1/3) is literally Infinity at rho = 0, and the
        // VWN5 formula divides Infinity by Infinity there; a real atomic grid
        // can underflow to exactly rho = 0 at large r, so this has to be a
        // guarded special case, not just something that happens to work out.
        expect(correlationEnergyDensity(0)).toBe(0);
        expect(correlationPotential(0)).toBe(0);
        expect(correlationEnergyDensity(-1)).toBe(0);
        expect(correlationPotential(-1)).toBe(0);
    });
});
