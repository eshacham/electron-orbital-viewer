import { solveAtom } from '../../src/atom/scf';
import { buildSerialisedAtomProfile } from '../../src/workers/atomWorker';
import { plotTabsFor, resolvePlotTab, tabCurves, hydrogenicTabCurves, BASIC_PLOT_TABS, LARGE_COMPONENT_NOTE, RADIAL_FACTOR_NOTE } from '../../src/atom/plot_tabs';
import { radialProfile, PLOT_SAMPLE_COUNT } from '../../src/radial_distribution';

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
        // Task 6: the caption ("radial factor of |ψ|²") is Info's now (RADIAL_FACTOR_NOTE); the tab carries none.
        expect(density).not.toHaveProperty('caption');
        expect(distribution.title).toBe('Radial distribution D(r) = 4πr²ρ(r)');
        expect(distribution.csvQuantity).toBeNull();
        expect(plotTabsFor('orbital', true, true)[0].title).toBe('Wave function R(r), large component (a₀⁻³ᐟ²)');
        expect(plotTabsFor('atom', false, false)[0].title).toBe('Density ρ(r) = D(r)/4πr² (e/a₀³)');
    });

    // Ruling T13-relR2: under relativity |R|² is the large component's square too, not the radial factor of |ψ|².
    // Task 6: the caption moved to Info, word for word (LARGE_COMPONENT_NOTE vs RADIAL_FACTOR_NOTE).
    it('says "large component" on the |R|² tab under relativity, in its title and CSV quantity, and Info says why', () => {
        const density = plotTabsFor('orbital', true, true)[1];
        expect(density.id).toBe('density');
        expect(density.title).toBe('Probability density |R(r)|², large component (a₀⁻³)');
        expect(LARGE_COMPONENT_NOTE).toContain('large component only, not the whole |ψ|²');
        expect(LARGE_COMPONENT_NOTE).not.toContain('radial factor');
        expect(density.csvQuantity).toContain('large component');
        expect(RADIAL_FACTOR_NOTE).toContain('radial factor of |ψ|²');
    });

    // Ruling T13-tablabels: symbols on the tabs so the row fits one line; each name contains its label (WCAG 2.5.3).
    it('labels the tabs with the curve symbols and names them in words', () => {
        expect(plotTabsFor('orbital', true, false).map(t => [t.label, t.name])).toEqual([
            ['R(r)', 'Wave function R(r)'], ['|R|²', 'Probability density |R|²'], ['D(r)', 'Radial distribution D(r)'],
        ]);
        expect(plotTabsFor('atom', false, false).map(t => [t.label, t.name])).toEqual([['ρ(r)', 'Density ρ(r)'], ['D(r)', 'Radial distribution D(r)']]);
        for (const tab of [...plotTabsFor('orbital', true, true), ...plotTabsFor('shell', false, false)]) expect(tab.name).toContain(tab.label);
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

describe('hydrogenicTabCurves (Basic Orbitals, spec §9.2: "Plot tabs as §9.1")', () => {
    it('offers the same three tabs as an atom orbital\'s, never relativistic', () => {
        expect(BASIC_PLOT_TABS.map(t => t.id)).toEqual(['wave', 'density', 'distribution']);
        expect(BASIC_PLOT_TABS.map(t => [t.label, t.name])).toEqual([
            ['R(r)', 'Wave function R(r)'], ['|R|²', 'Probability density |R|²'], ['D(r)', 'Radial distribution D(r)'],
        ]);
    });

    it('plots R(r) itself: 1s at r = 0 is positive and 2 for Z = 1', () => {
        const [wave] = hydrogenicTabCurves('wave', { n: 1, l: 0, Z: 1, rMax: 5, colour: '#4da3ff' });
        expect(wave.points[0].r).toBe(0);
        expect(wave.points[0].value).toBeCloseTo(2, 10);
        expect(wave.color).toBe('#4da3ff');
    });

    it('gives |R|² as R(r)\'s own square, pointwise', () => {
        const inputs = { n: 2, l: 1, Z: 1 as const, rMax: 20, colour: '#ff6b6b' };
        const [wave] = hydrogenicTabCurves('wave', inputs);
        const [density] = hydrogenicTabCurves('density', inputs);
        expect(density.points.length).toBe(wave.points.length);
        for (let i = 0; i < wave.points.length; i++) {
            expect(density.points[i].value).toBeCloseTo(wave.points[i].value ** 2, 10);
        }
    });

    it('leaves the distribution tab exactly what RadialPlot already plots for n/l/Z (ruling R2)', () => {
        const profile = radialProfile(3, 2, 1, 40, PLOT_SAMPLE_COUNT);
        const [distribution] = hydrogenicTabCurves('distribution', { n: 3, l: 2, Z: 1, rMax: 40, colour: '#06d6a0' });
        expect(distribution.points).toEqual(profile.map(p => ({ r: p.r, value: p.probability })));
    });

    it('2s changes sign exactly once, at its radial node', () => {
        const [wave] = hydrogenicTabCurves('wave', { n: 2, l: 0, Z: 1, rMax: 20, colour: '#4da3ff' });
        // One sample lands exactly on the node (r = 2a0, 20/240 divides it evenly) and is
        // exactly 0 -- neither sign, so it is dropped before counting the sign changes either side of it.
        const nonZero = wave.points.map(p => p.value).filter(v => v !== 0);
        let signChanges = 0;
        for (let i = 1; i < nonZero.length; i++) {
            if (Math.sign(nonZero[i]) !== Math.sign(nonZero[i - 1])) signChanges++;
        }
        expect(signChanges).toBe(1);
    });
});
