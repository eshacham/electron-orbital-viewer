import { shellComposition, ShellCompositionSubshell } from '../../src/atom/shell_composition';
import { CURVE_COLORS } from '../../src/curve_colors';

/**
 * Addendum 2's occupancy model: an open subshell spreads its electrons
 * equally across every mₗ state (Unsöld / the spherically averaged
 * central-field model, spec §2), and every mₗ state of an occupied subshell
 * must appear in the composition -- never a subset, which would assert an
 * occupancy the model does not have.
 */
describe('shellComposition', () => {
    it('every mₗ state of an occupied subshell is present, not a subset', () => {
        // Carbon's L shell: 2s2 2p2.
        const subshells: ShellCompositionSubshell[] = [
            { n: 2, l: 0, electrons: 2 },
            { n: 2, l: 1, electrons: 2 },
        ];
        const components = shellComposition(subshells);

        expect(components).toHaveLength(1 + 3); // one 2s orbital, three 2p orbitals (ml = -1, 0, +1).
        const pOrbitals = components.filter(c => c.l === 1).map(c => c.ml).sort();
        expect(pOrbitals).toEqual([-1, 0, 1]);
    });

    it('gives a full 2s2 an occupancy fraction of 1', () => {
        const [s] = shellComposition([{ n: 2, l: 0, electrons: 2 }]);
        expect(s.occupancyFraction).toBeCloseTo(1);
    });

    it('carbon 2p2: each of the three p orbitals is 1/3 occupied', () => {
        const components = shellComposition([{ n: 2, l: 1, electrons: 2 }]);
        expect(components).toHaveLength(3);
        for (const c of components) {
            expect(c.occupancyFraction).toBeCloseTo(1 / 3);
        }
    });

    it('nitrogen 2p3: each of the three p orbitals is 1/2 occupied (one electron each, Hund\'s rule spread)', () => {
        const components = shellComposition([{ n: 2, l: 1, electrons: 3 }]);
        for (const c of components) {
            expect(c.occupancyFraction).toBeCloseTo(0.5);
        }
    });

    it('neon 2p6: every p orbital is fully occupied', () => {
        const components = shellComposition([{ n: 2, l: 1, electrons: 6 }]);
        for (const c of components) {
            expect(c.occupancyFraction).toBeCloseTo(1);
        }
    });

    it('iron 3d6: each of the five d orbitals is 6/10 occupied', () => {
        const components = shellComposition([{ n: 3, l: 2, electrons: 6 }]);
        expect(components).toHaveLength(5);
        for (const c of components) {
            expect(c.occupancyFraction).toBeCloseTo(0.6);
        }
    });

    it('never lets occupancyFraction exceed 1, even for a fully-filled subshell', () => {
        const components = shellComposition([{ n: 1, l: 0, electrons: 2 }, { n: 2, l: 1, electrons: 6 }]);
        for (const c of components) {
            expect(c.occupancyFraction).toBeLessThanOrEqual(1);
            expect(c.occupancyFraction).toBeGreaterThan(0);
        }
    });

    it('assigns colorIndex by the subshell\'s position in the given list, matching how the radial plot colours a shell\'s subshells (App.tsx\'s atomCurves)', () => {
        const subshells: ShellCompositionSubshell[] = [
            { n: 3, l: 0, electrons: 2 }, // index 0
            { n: 3, l: 1, electrons: 6 }, // index 1
            { n: 3, l: 2, electrons: 6 }, // index 2
        ];
        const components = shellComposition(subshells);
        expect(components.filter(c => c.l === 0).every(c => c.colorIndex === 0)).toBe(true);
        expect(components.filter(c => c.l === 1).every(c => c.colorIndex === 1)).toBe(true);
        expect(components.filter(c => c.l === 2).every(c => c.colorIndex === 2)).toBe(true);
    });

    it('every colorIndex resolves to one of the plot\'s own CURVE_COLORS', () => {
        const subshells: ShellCompositionSubshell[] = [
            { n: 4, l: 0, electrons: 2 },
            { n: 4, l: 1, electrons: 6 },
            { n: 4, l: 2, electrons: 10 },
            { n: 4, l: 3, electrons: 14 },
        ];
        const components = shellComposition(subshells);
        for (const c of components) {
            expect(CURVE_COLORS[c.colorIndex % CURVE_COLORS.length]).toBeDefined();
        }
    });
});
