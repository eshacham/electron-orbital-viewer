import { shellAtRadius, shellBandRadius, ShellPickProfile } from '../../src/atom/shell_pick';
import { solveAtom } from '../../src/atom/scf';
import { buildAtomProfile } from '../../src/atom/atom_profile';

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
        // The last grid point is r = 1; the whole grid is drawn.
        displayRadius: 2,
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
            displayRadius: 1,
        };
        expect(shellAtRadius(profile, rAt(profile, 3))).toBe(4);
    });
});

// Panel fixes P3: a shell chip points at its ring, so it needs one radius that is plainly inside the shell's band.
describe('shellBandRadius', () => {
    it('returns, for every shell, a radius that shellAtRadius maps back to that shell', () => {
        const profile = argonLikePick();
        for (const { n } of profile.shells) {
            const r = shellBandRadius(profile, n);
            expect(r).not.toBeNull();
            expect(shellAtRadius(profile, r as number)).toBe(n);
        }
    });

    // Final review I1: the middle in r, not on the log grid -- the cut face and the plot are both linear in r, and a
    // log-grid middle put K's radius at about 1e-4 a₀, a dot on the nucleus.
    it('is the arithmetic middle of the end radii of the band', () => {
        const profile = argonLikePick();
        // n = 2 owns grid points 3..5.
        expect(shellBandRadius(profile, 2)).toBeCloseTo((rAt(profile, 3) + rAt(profile, 5)) / 2, 12);
        // n = 1 owns 0..2, n = 3 owns 6..8.
        expect(shellBandRadius(profile, 1)).toBeCloseTo((rAt(profile, 0) + rAt(profile, 2)) / 2, 12);
        expect(shellBandRadius(profile, 3)).toBeCloseTo((rAt(profile, 6) + rAt(profile, 8)) / 2, 12);
    });

    it('takes the longer run when a shell owns two separate stretches (a merged tail), and still lands in it', () => {
        const profile: ShellPickProfile = {
            rMin: 0.01,
            dx: 0.3,
            size: 10,
            // n = 2 owns 1..2 (two points) and 5..8 (four points); n = 1 and n = 3 own the rest.
            shellIndexAtR: Float32Array.from([0, 1, 1, 0, 0, 1, 1, 1, 1, 2]),
            shells: [{ n: 1 }, { n: 2 }, { n: 3 }],
            displayRadius: 1,
        };
        const r = shellBandRadius(profile, 2) as number;
        // Final review I1: the arithmetic middle of the run (was the geometric one).
        expect(r).toBeCloseTo((rAt(profile, 5) + rAt(profile, 8)) / 2, 12);
        expect(shellAtRadius(profile, r)).toBe(2);
    });

    it('measures a run by its extent in r, not by its count of grid points', () => {
        const profile: ShellPickProfile = {
            rMin: 0.01,
            dx: 0.3,
            size: 10,
            // n = 2 owns 1..3 (three points, 0.011 a₀ wide) and 7..8 (two points, 0.029 a₀ wide on the log grid).
            shellIndexAtR: Float32Array.from([0, 1, 1, 1, 0, 0, 0, 1, 1, 2]),
            shells: [{ n: 1 }, { n: 2 }, { n: 3 }],
            displayRadius: 1,
        };
        expect(shellBandRadius(profile, 2)).toBeCloseTo((rAt(profile, 7) + rAt(profile, 8)) / 2, 12);
    });

    it('scans only the drawn extent: a run past displayRadius is off the cut face and does not count', () => {
        const profile = argonLikePick();
        // Drawn out to grid point 7 (r = 0.56): n = 3 keeps only 6..7.
        const drawn = { ...profile, displayRadius: rAt(profile, 7) * 1.01 };
        expect(shellBandRadius(drawn, 3)).toBeCloseTo((rAt(profile, 6) + rAt(profile, 7)) / 2, 12);
        // A shell whose every point is past the drawn extent has no ring to point at.
        expect(shellBandRadius({ ...profile, displayRadius: rAt(profile, 5) * 1.01 }, 3)).toBeNull();
    });

    it('lands inside the band for an even-length and an odd-length run alike', () => {
        for (const length of [1, 2, 3, 4, 5, 6]) {
            const index = new Float32Array(12).fill(0);
            for (let j = 4; j < 4 + length; j++) index[j] = 1;
            const profile: ShellPickProfile = { rMin: 0.02, dx: 0.17, size: 12, shellIndexAtR: index, shells: [{ n: 1 }, { n: 2 }], displayRadius: 1 };
            expect(shellAtRadius(profile, shellBandRadius(profile, 2) as number)).toBe(2);
        }
    });

    it('is null for a shell that owns no grid point, or that is not in the atom', () => {
        const profile = argonLikePick();
        expect(shellBandRadius(profile, 7)).toBeNull();
        // Listed in shells but never the dominant one anywhere.
        expect(shellBandRadius({ ...profile, shellIndexAtR: Float32Array.from([0, 0, 0, 0, 0, 0, 2, 2, 2]) }, 2)).toBeNull();
        expect(shellBandRadius({ ...profile, shells: [] }, 1)).toBeNull();
        expect(shellBandRadius({ ...profile, size: 0 }, 1)).toBeNull();
    });
});

// Final review I1: the synthetic profiles above end inside the picture, and real ones do not -- the solver's grid runs out
// to 9-183 a₀ while the atom is drawn at a few a₀. On a solved atom the outermost shell owns the whole tail past the cut
// face, and the K run starts at rMin ≈ 1e-6/Z. Sodium (three shells) and iron (four shells, three peaks, ruling R26).
describe('shellBandRadius on a solved atom', () => {
    const solved: Array<[string, ShellPickProfile]> = [];

    beforeAll(() => {
        for (const [name, Z] of [['Na', 11], ['Fe', 26]] as const) {
            const profile = buildAtomProfile(solveAtom(Z), 0.9);
            solved.push([name, {
                rMin: profile.grid.rMin, dx: profile.grid.dx, size: profile.grid.size,
                shellIndexAtR: profile.shellIndexAtR, shells: profile.shells, displayRadius: profile.displayRadius,
            }]);
        }
    });

    it('puts every shell\'s radius on the cut face, inside the drawn sphere, and maps it back to the shell', () => {
        for (const [name, profile] of solved) {
            for (const { n } of profile.shells) {
                const r = shellBandRadius(profile, n);
                expect([name, n, r !== null && r > 0 && r < profile.displayRadius]).toEqual([name, n, true]);
                expect([name, n, shellAtRadius(profile, r as number)]).toEqual([name, n, n]);
            }
        }
    });

    it('puts the K shell\'s radius at the middle of its ring, not on the nucleus', () => {
        for (const [name, profile] of solved) {
            // The K ring is drawn from the centre out to the last grid point it owns.
            let edge = 0;
            for (let j = 0; j < profile.size && shellAtRadius(profile, rAt(profile, j)) === 1; j++) edge = rAt(profile, j);
            const r = shellBandRadius(profile, 1) as number;
            // At least 40 % of the ring's drawn width out: its arithmetic middle is about 50 % (the run starts at
            // ~1e-6 a₀), where the log-grid middle sat at 0.1 % of it or less (Fe: 6e-5 a₀ in a K ring 0.088 a₀ wide).
            expect([name, r / edge >= 0.4]).toEqual([name, true]);
        }
    });
});
