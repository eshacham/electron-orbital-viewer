import { shellComposition, isolateSubshell, ShellCompositionSubshell } from '../../src/atom/shell_composition';
import { CURVE_COLORS, orbitalShade } from '../../src/curve_colors';

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

/**
 * Addendum 2's readability follow-up: iron's five overlapping 3d orbitals
 * read as one gold blob. Isolation is a filter over the full composition,
 * never a different composition -- so colours (and therefore the link to
 * the radial plot's curves) survive it unchanged.
 */
describe('isolateSubshell', () => {
    /** Iron's M shell: 3s2 3p6 3d6 -- the case that motivated isolation. */
    const ironM: ShellCompositionSubshell[] = [
        { n: 3, l: 0, electrons: 2 },
        { n: 3, l: 1, electrons: 6 },
        { n: 3, l: 2, electrons: 6 },
    ];

    it('null leaves the full, overlapping shell -- the default view', () => {
        const all = shellComposition(ironM);
        expect(isolateSubshell(all, null)).toBe(all);
        expect(all).toHaveLength(1 + 3 + 5);
    });

    it('keeps only the chosen subshell\'s orbitals', () => {
        const isolated = isolateSubshell(shellComposition(ironM), 2);
        expect(isolated).toHaveLength(5);
        expect(isolated.every(c => c.l === 2)).toBe(true);
        expect(isolated.map(c => c.ml).sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    });

    it('carries colorIndex through unchanged, so an isolated subshell keeps the colour it had while overlapping', () => {
        const all = shellComposition(ironM);
        const isolated = isolateSubshell(all, 2);
        const overlappingD = all.filter(c => c.l === 2);
        expect(isolated.map(c => c.colorIndex)).toEqual(overlappingD.map(c => c.colorIndex));
        // 3d is the third subshell of the M shell, so index 2 -- the same
        // index App.tsx's atomCurves colours its curve with.
        expect(new Set(isolated.map(c => c.colorIndex))).toEqual(new Set([2]));
    });

    it('preserves occupancy: iron\'s 3d6 is still 6/10 filled when isolated', () => {
        const isolated = isolateSubshell(shellComposition(ironM), 2);
        for (const c of isolated) {
            expect(c.occupancyFraction).toBeCloseTo(0.6);
        }
    });

    it('an unoccupied l yields nothing rather than throwing', () => {
        expect(isolateSubshell(shellComposition(ironM), 3)).toEqual([]);
    });
});

/**
 * Addendum 2's readability follow-up, second half: isolating a subshell
 * removes the other subshells, but five 3d cloverleaves in one colour still
 * sum to one gold mass. Each member gets its own shade so they can be
 * counted -- and stays close enough to the subshell's own curve colour that
 * the link to the radial plot survives.
 */
describe('orbitalShade', () => {
    it('leaves a one-member subshell (any s) on its plain curve colour', () => {
        expect(orbitalShade('#ffd166', 0, 1)).toBe('#ffd166');
    });

    it('gives every member of a d subshell a distinct colour', () => {
        const shades = [0, 1, 2, 3, 4].map(i => orbitalShade('#ffd166', i, 5));
        expect(new Set(shades).size).toBe(5);
    });

    it('gives every member of an f subshell a distinct colour', () => {
        const shades = Array.from({ length: 7 }, (_, i) => orbitalShade('#06d6a0', i, 7));
        expect(new Set(shades).size).toBe(7);
    });

    it('keeps the middle member on the subshell\'s own hue, so the family still reads as one subshell', () => {
        // The spread is centred, so the central mL of an odd-sized subshell
        // is the base colour itself.
        expect(orbitalShade('#ffd166', 2, 5)).toBe('#ffd166');
    });

    it('emits well-formed six-digit hex for every member of every subshell size', () => {
        for (const base of CURVE_COLORS) {
            for (const count of [1, 3, 5, 7]) {
                for (let i = 0; i < count; i++) {
                    expect(orbitalShade(base, i, count)).toMatch(/^#[0-9a-f]{6}$/);
                }
            }
        }
    });
});
