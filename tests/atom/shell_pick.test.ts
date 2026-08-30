import { shellAtRadius, ShellPickProfile } from '../../src/atom/shell_pick';

/**
 * A three-shell profile on a short log grid: shell 0 (n=1) owns the inner
 * third, shell 1 (n=2) the middle, shell 2 (n=3) the outer. Deliberately
 * built from `shellIndexAtR` alone, which is what the rings are coloured by
 * -- the point of picking off this array is that the click lands on the
 * shell the user can see.
 */
function argonLikePick(): ShellPickProfile {
    const size = 9;
    return {
        rMin: 0.01,
        dx: Math.log(10) / 4, // four points per decade
        size,
        shellIndexAtR: Float32Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]),
        shells: [{ n: 1 }, { n: 2 }, { n: 3 }],
    };
}

const rAt = (p: ShellPickProfile, j: number) => p.rMin * Math.exp(p.dx * j);

describe('shellAtRadius', () => {
    it('returns the shell that owns each grid point', () => {
        const profile = argonLikePick();
        expect(shellAtRadius(profile, rAt(profile, 0))).toBe(1);
        expect(shellAtRadius(profile, rAt(profile, 2))).toBe(1);
        expect(shellAtRadius(profile, rAt(profile, 4))).toBe(2);
        expect(shellAtRadius(profile, rAt(profile, 8))).toBe(3);
    });

    it('snaps to the nearest grid point rather than interpolating between two shells', () => {
        // Categorical data: halfway between a point owned by shell 1 and one
        // owned by shell 2 must read as one of them, never something else.
        const profile = argonLikePick();
        const between = Math.sqrt(rAt(profile, 2) * rAt(profile, 3));
        expect([1, 2]).toContain(shellAtRadius(profile, between));
    });

    it('clamps a radius past the grid to the outermost shell -- a click a pixel outside the atom is aimed at its valence shell', () => {
        const profile = argonLikePick();
        expect(shellAtRadius(profile, rAt(profile, 8) * 100)).toBe(3);
    });

    it('clamps a radius inside the grid\'s first point to the innermost shell', () => {
        const profile = argonLikePick();
        expect(shellAtRadius(profile, profile.rMin / 1000)).toBe(1);
    });

    it('returns null when there is nothing to pick', () => {
        const profile = argonLikePick();
        expect(shellAtRadius(profile, 0)).toBeNull();
        expect(shellAtRadius(profile, -1)).toBeNull();
        expect(shellAtRadius({ ...profile, shells: [] }, 1)).toBeNull();
    });

    // Ruling R26: shells and resolved peaks stop lining up from about Z = 26,
    // so picking must come from the configuration-derived shell list, never
    // from a nearest-peak search. Iron has four occupied shells; a profile
    // whose shellIndexAtR names all four must be able to return all four.
    it('can return a shell that has no resolved peak of its own (iron: 4 shells, 3 peaks)', () => {
        const profile: ShellPickProfile = {
            rMin: 0.01,
            dx: 0.2,
            size: 4,
            shellIndexAtR: Float32Array.from([0, 1, 2, 3]),
            shells: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
        };
        expect(shellAtRadius(profile, rAt(profile, 3))).toBe(4);
    });
});
