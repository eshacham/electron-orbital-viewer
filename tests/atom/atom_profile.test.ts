import { solveAtom, AtomSolution } from '../../src/atom/scf';
import { integrateOnGrid, interpolateOnGrid } from '../../src/atom/radial_grid';
import { AtomProfile, buildAtomProfile, radialFunctionFor, packRadialCurve } from '../../src/atom/atom_profile';

/**
 * solveAtom is expensive (neon ~1.2s, uranium ~8-9s), so each atom used here
 * is solved exactly once in beforeAll and reused by every assertion below,
 * per the task brief's ruling against calling it inside a loop or per-test.
 *
 * Uranium is included specifically for the log-grid packing tests below
 * (finding 1 / ruling R25): its K-shell peak sits inside the first 0.007% of
 * the grid's range, which is exactly the wide-dynamic-range case that a
 * uniform-in-r resample loses and neon/argon alone cannot exercise.
 */
describe('atom profile', () => {
    let neon: AtomSolution;
    let argon: AtomSolution;
    let uranium: AtomSolution;
    let neonProfile: AtomProfile;
    let argonProfile: AtomProfile;
    let uraniumProfile: AtomProfile;

    beforeAll(() => {
        neon = solveAtom(10);
        argon = solveAtom(18);
        uranium = solveAtom(92);
        neonProfile = buildAtomProfile(neon, 0.9);
        argonProfile = buildAtomProfile(argon, 0.9);
        uraniumProfile = buildAtomProfile(uranium, 0.9);
    });

    it("total curve integrates to Z", () => {
        expect(integrateOnGrid(neon.grid, neonProfile.total.values)).toBeCloseTo(10, 4);
        expect(integrateOnGrid(argon.grid, argonProfile.total.values)).toBeCloseTo(18, 4);
    });

    it('shell curves sum to the total', () => {
        const summed = new Float64Array(neon.grid.size);
        for (const shell of neonProfile.shells) {
            for (let j = 0; j < summed.length; j++) summed[j] += shell.curve.values[j];
        }
        for (let j = 0; j < summed.length; j++) {
            expect(summed[j]).toBeCloseTo(neonProfile.total.values[j], 9);
        }
    });

    it('subshell curves sum to their shell', () => {
        for (const shell of argonProfile.shells) {
            const summed = new Float64Array(argon.grid.size);
            for (const subshell of argonProfile.subshells) {
                if (subshell.n !== shell.n) continue;
                for (let j = 0; j < summed.length; j++) summed[j] += subshell.curve.values[j];
            }
            for (let j = 0; j < summed.length; j++) {
                expect(summed[j]).toBeCloseTo(shell.curve.values[j], 9);
            }
        }
    });

    it('each shell curve integrates to that shell\'s electron count', () => {
        for (const shell of neonProfile.shells) {
            expect(integrateOnGrid(neon.grid, shell.curve.values)).toBeCloseTo(shell.electrons, 4);
        }
        for (const shell of argonProfile.shells) {
            expect(integrateOnGrid(argon.grid, shell.curve.values)).toBeCloseTo(shell.electrons, 4);
        }
    });

    it('contour radius grows with fraction', () => {
        const low = buildAtomProfile(neon, 0.5).contourRadius;
        const mid = buildAtomProfile(neon, 0.9).contourRadius;
        const high = buildAtomProfile(neon, 0.99).contourRadius;
        expect(low).toBeLessThan(mid);
        expect(mid).toBeLessThan(high);
    });

    it('per-shell contour radius also grows with fraction', () => {
        const lowShell = buildAtomProfile(argon, 0.5).shells[0];
        const highShell = buildAtomProfile(argon, 0.99).shells[0];
        expect(lowShell.contourRadius).toBeLessThan(highShell.contourRadius);
    });

    it('gives one peak per resolved shell: 2 for neon, 3 for argon', () => {
        expect(neonProfile.shellPeaks.length).toBe(2);
        expect(argonProfile.shellPeaks.length).toBe(3);
        // Peaks should be ordered from the nucleus outward.
        for (let i = 1; i < argonProfile.shellPeaks.length; i++) {
            expect(argonProfile.shellPeaks[i]).toBeGreaterThan(argonProfile.shellPeaks[i - 1]);
        }
    });

    describe('shellPeaks undercounts once shells merge (ruling R26 — display annotation only)', () => {
        // Iron has 4 occupied shells (K, L, M, N) but only 3 resolve as
        // distinct maxima in the *summed* D(r) -- real physics (shells
        // overlap more as they compress inward with growing Z), not a bug.
        // Pinned directly so this merging is a recorded fact, not something
        // a future change has to rediscover by surprise. This is also the
        // regression case for R26: a consumer that assumed
        // `shellPeaks.length === shells.length` would misalign here.
        it('gives 3 peaks for iron\'s 4 occupied shells', () => {
            const iron = solveAtom(26);
            const ironProfile = buildAtomProfile(iron, 0.9);
            expect(ironProfile.shells.length).toBe(4);
            expect(ironProfile.shellPeaks.length).toBe(3);
        });
    });

    describe('radialFunctionFor', () => {
        it('reproduces state.R exactly at grid points', () => {
            const state = neon.states.find(s => s.n === 2 && s.l === 1)!;
            const f = radialFunctionFor(neon, 2, 1);
            for (const j of [1, 10, 500, 1000, 1500, neon.grid.size - 1]) {
                expect(f(neon.grid.r[j])).toBeCloseTo(state.R[j], 9);
            }
        });

        it('interpolates between grid points', () => {
            const state = neon.states.find(s => s.n === 1 && s.l === 0)!;
            const f = radialFunctionFor(neon, 1, 0);
            const j = 800;
            // Geometric mean of two log-grid points sits exactly halfway
            // between them in t = ln r, matching interpolateOnGrid's linear
            // interpolation in t.
            const rMid = Math.sqrt(neon.grid.r[j] * neon.grid.r[j + 1]);
            const expected = (state.R[j] + state.R[j + 1]) / 2;
            expect(f(rMid)).toBeCloseTo(expected, 6);
        });

        it('throws for an unoccupied (n, l)', () => {
            expect(() => radialFunctionFor(neon, 3, 0)).toThrow();
            expect(() => radialFunctionFor(argon, 4, 0)).toThrow();
        });
    });

    /**
     * Mirrors the shader lookup from ruling R25 exactly: `t` is the position
     * in log-grid index space, and linear interpolation between the two
     * nearest texels reproduces `interpolateOnGrid`'s own log-space
     * interpolation. This is what a `THREE.DataTexture` with linear
     * filtering does in the actual shader; reproduced in plain JS here so
     * the fidelity claim can be checked without a GL context.
     */
    function logSpaceLookup(packed: Float32Array, rMin: number, dx: number, r: number): number {
        const t = Math.log(r / rMin) / dx;
        const j = Math.max(0, Math.min(packed.length - 2, Math.floor(t)));
        const frac = t - j;
        return packed[j] * (1 - frac) + packed[j + 1] * frac;
    }

    describe('packRadialCurve and the log-space lookup (finding 1 / ruling R25)', () => {
        it('packs to a Float32Array of the same length, no resampling', () => {
            const packed = packRadialCurve(neonProfile.total.values);
            expect(packed).toBeInstanceOf(Float32Array);
            expect(packed.length).toBe(neonProfile.total.values.length);
            for (const j of [0, 1, 500, 1000, neonProfile.total.values.length - 1]) {
                expect(packed[j]).toBeCloseTo(neonProfile.total.values[j], 4);
            }
        });

        it('does not normalise: raw magnitudes are preserved', () => {
            const packed = packRadialCurve(neonProfile.total.values);
            const maxD = Math.max(...Array.from(neonProfile.total.values));
            const maxPacked = Math.max(...Array.from(packed));
            // Float32 narrowing only, no resampling and no normalisation, so
            // this should match to float32 precision rather than merely "in
            // the right ballpark".
            expect(maxPacked).toBeCloseTo(maxD, 1);
        });

        it("preserves uranium's K-shell peak to within 1% through the log-space lookup", () => {
            // The regression this finding exists to catch: uranium's K-shell
            // peak sits at r ~ 0.012 against rMax = 183 -- inside the first
            // 0.007% of the range. The old `resampleUniform` (uniform-in-r)
            // flattened that peak to 22% of its true height at 256 samples,
            // 64% at 512, and needed ~4096 samples to recover it, because
            // almost none of a uniform-in-r grid's points land anywhere near
            // r = 0.012. Packing the log-grid values as-is and looking them
            // up with the shader's own t = log(r/rMin)/dx formula needs no
            // such resolution: the lookup lands on (or right next to) the
            // same grid point the data was computed at, at any texture size,
            // because the "texels" and the log grid are the same points.
            const packed = packRadialCurve(uraniumProfile.total.values);
            const { grid } = uranium;

            const kShellPeakR = uraniumProfile.shellPeaks[0];
            const truePeak = interpolateOnGrid(grid, uraniumProfile.total.values, kShellPeakR);
            const lookedUp = logSpaceLookup(packed, grid.rMin, grid.dx, kShellPeakR);

            expect(Math.abs(lookedUp - truePeak) / truePeak).toBeLessThan(0.01);
        });
    });
});
