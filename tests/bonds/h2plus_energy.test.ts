import {
    h2plusElectronicEnergy, h2plusTotalEnergy, h2plusEquilibrium, H2PLUS_R_RANGE,
} from '../../src/bonds/h2plus';

describe('exact H2+ energies', () => {
    // Bates, Ledsham & Stewart (1953); Madsen & Peek (1970).
    it('reproduces the published electronic energies at R = 2 a0', () => {
        expect(h2plusElectronicEnergy(2, '1sigma_g')).toBeCloseTo(-1.1026342145, 9);
        expect(h2plusElectronicEnergy(2, '1sigma_u')).toBeCloseTo(-0.6675343922, 9);
    });

    it('finds the equilibrium within the spec tolerance (R_e = 1.997 a0 ± 0.5 %, E = -0.6026 Ha ± 0.1 %)', () => {
        const { R, totalEnergy } = h2plusEquilibrium();
        expect(Math.abs(R - 1.997) / 1.997).toBeLessThan(0.005);
        expect(Math.abs(totalEnergy + 0.6026) / 0.6026).toBeLessThan(0.001);
        expect(R).toBeCloseTo(1.99719, 3);
        expect(totalEnergy).toBeCloseTo(-0.6026346, 6);
    });

    it('has no minimum in 1σu over the slider range', () => {
        let previous = Infinity;
        for (let R = H2PLUS_R_RANGE.min; R <= H2PLUS_R_RANGE.max + 1e-9; R += 0.25) {
            const energy = h2plusTotalEnergy(R, '1sigma_u');
            expect(energy).toBeLessThan(previous);
            previous = energy;
        }
    });

    it('separates into H + H+ at large R, bonding below antibonding', () => {
        const g = h2plusTotalEnergy(10, '1sigma_g');
        const u = h2plusTotalEnergy(10, '1sigma_u');
        expect(Math.abs(g + 0.5)).toBeLessThan(2e-3);
        expect(Math.abs(u + 0.5)).toBeLessThan(2e-3);
        expect(g).toBeLessThan(u);
    });

    // More of the 1σg curve, either side of the minimum: Madsen & Peek tables,
    // values as recalled (not checked against the table); they agree with this
    // solver to 1e-10 Ha. Rounded to 10 decimals.
    it.each([
        [1, -1.4517863134],
        [3, -0.9108961974],
        [4, -0.7960848837],
    ])('agrees with the recalled Madsen & Peek 1σg energy at R = %p a0', (R, published) => {
        expect(h2plusElectronicEnergy(R, '1sigma_g')).toBeCloseTo(published, 9);
    });

    // Doubling both expansions (48 Legendre terms, 80 Jaffé terms) moved no
    // energy by more than 5e-11 Ha over 0.01-100 a0 when this was written; the
    // limits below are what that convergence buys at either end.
    it('reaches the He+ united atom as R -> 0 (1s at -2 Ha, 2p at -0.5 Ha)', () => {
        expect(Math.abs(h2plusElectronicEnergy(1e-3, '1sigma_g') + 2)).toBeLessThan(1e-5);
        expect(Math.abs(h2plusElectronicEnergy(1e-3, '1sigma_u') + 0.5)).toBeLessThan(1e-6);
    });

    it('follows the H + H+ multipole limit -1/2 - 1/R - 9/(4R^4) at large R, both states', () => {
        for (const R of [30, 100]) {
            const asymptote = -0.5 - 1 / R - 9 / (4 * R ** 4);
            expect(Math.abs(h2plusElectronicEnergy(R, '1sigma_g') - asymptote)).toBeLessThan(2e-8);
            expect(Math.abs(h2plusElectronicEnergy(R, '1sigma_u') - asymptote)).toBeLessThan(2e-8);
        }
    });

    it('has the 1σu polarisation well (about 0.06 mHa deep) at 12.5 a0, past the slider', () => {
        const [before, bottom, after] = [12, 12.5, 13].map(R => h2plusTotalEnergy(R, '1sigma_u'));
        expect(bottom).toBeLessThan(before);
        expect(bottom).toBeLessThan(after);
        const depth = -0.5 - bottom;
        expect(depth).toBeGreaterThan(5e-5);
        expect(depth).toBeLessThan(7e-5);
    });

    it.each([0, -1, Number.NaN, Infinity, 1000])('refuses R = %p', R => {
        expect(() => h2plusElectronicEnergy(R, '1sigma_g')).toThrow(RangeError);
    });
});
