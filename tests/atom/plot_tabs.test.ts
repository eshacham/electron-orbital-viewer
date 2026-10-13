import { solveAtom } from '../../src/atom/scf';
import { buildSerialisedAtomProfile } from '../../src/workers/atomWorker';
import { plotTabsFor, resolvePlotTab, tabCurves } from '../../src/atom/plot_tabs';

const gridOf = (p: { rMin: number; dx: number; size: number }) => Array.from({ length: p.size }, (_, j) => p.rMin * Math.exp(j * p.dx));
const trapezoid = (r: number[], f: (j: number) => number) => {
    let sum = 0;
    for (let j = 1; j < r.length; j++) sum += 0.5 * (f(j) + f(j - 1)) * (r[j] - r[j - 1]);
    return sum;
};

describe('the inspector\'s plot tabs (spec §9.1, ruling R2)', () => {
    it('offers R, |R|² and the radial distribution for an orbital or one subshell; ρ and the distribution otherwise', () => {
        expect(plotTabsFor('orbital', true, false).map(t => t.id)).toEqual(['wave', 'density', 'distribution']);
        expect(plotTabsFor('shell', true, false).map(t => t.id)).toEqual(['wave', 'density', 'distribution']);
        expect(plotTabsFor('shell', false, false).map(t => t.id)).toEqual(['rho', 'distribution']);
        expect(plotTabsFor('atom', false, false).map(t => t.id)).toEqual(['rho', 'distribution']);
    });

    it('titles each with exactly which function it is, and keeps today\'s distribution title', () => {
        const [wave, density, distribution] = plotTabsFor('orbital', true, false);
        expect(wave.title).toBe('Wave function R(r) (a₀⁻³ᐟ²)');
        expect(density.title).toBe('Probability density |R(r)|² (a₀⁻³)');
        expect(density.caption).toBe('radial factor of |ψ|²');
        expect(distribution.title).toBe('Radial distribution D(r) = 4πr²ρ(r)');
        expect(distribution.csvQuantity).toBeNull();
        expect(plotTabsFor('orbital', true, true)[0].title).toBe('Wave function R(r), large component (a₀⁻³ᐟ²)');
        expect(plotTabsFor('atom', false, false)[0].title).toBe('Density ρ(r) = D(r)/4πr² (e/a₀³)');
    });

    it('falls back to the radial distribution when the stored tab is not offered here', () => {
        expect(resolvePlotTab(plotTabsFor('atom', false, false), 'wave').id).toBe('distribution');
        expect(resolvePlotTab(plotTabsFor('orbital', true, false), 'density').id).toBe('density');
    });

    it('plots the solved R(r) itself: hydrogen 1s is normalised, ∫R²r²dr = 1, and |R|² is its square', () => {
        const profile = buildSerialisedAtomProfile(solveAtom(1), 0.9);
        const rGrid = gridOf(profile);
        const inputs = { profile, selectedSubshell: { n: 1, l: 0 }, rGrid, distribution: [{ label: '1s', color: '#4da3ff', points: [] }] };
        const [wave] = tabCurves('wave', inputs);
        const [density] = tabCurves('density', inputs);
        expect(wave.label).toBe('1s · R(r)');
        expect(wave.points.map(p => p.value)).toEqual(Array.from(profile.subshells[0].R));
        expect(density.points[10].value).toBeCloseTo(wave.points[10].value ** 2, 12);
        expect(trapezoid(rGrid, j => wave.points[j].value ** 2 * rGrid[j] ** 2)).toBeCloseTo(1, 3);
        expect(wave.color).toBe('#4da3ff');
    });

    it('gives ρ(r) = D(r)/4πr², which integrates back to the electron count', () => {
        const profile = buildSerialisedAtomProfile(solveAtom(2), 0.9);
        const rGrid = gridOf(profile);
        const distribution = profile.shells.map(shell => ({ label: `n=${shell.n}`, color: '#4da3ff', points: rGrid.map((r, j) => ({ r, value: shell.curve[j] })) }));
        const [rho] = tabCurves('rho', { profile, selectedSubshell: null, rGrid, distribution });
        expect(rho.label).toBe('n=1 · ρ(r)');
        expect(trapezoid(rGrid, j => 4 * Math.PI * rGrid[j] ** 2 * rho.points[j].value)).toBeCloseTo(2, 2);
    });

    it('leaves the distribution tab\'s curves exactly as given (the exported number equals the plotted one)', () => {
        const profile = buildSerialisedAtomProfile(solveAtom(1), 0.9);
        const distribution = [{ label: '1s', color: '#4da3ff', points: [{ r: 1, value: 2 }] }];
        expect(tabCurves('distribution', { profile, selectedSubshell: null, rGrid: [], distribution })).toBe(distribution);
    });
});
