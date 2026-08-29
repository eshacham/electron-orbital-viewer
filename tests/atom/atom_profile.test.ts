import { solveAtom, AtomSolution } from '../../src/atom/scf';
import { integrateOnGrid, interpolateOnGrid } from '../../src/atom/radial_grid';
import { AtomProfile, buildAtomProfile, radialFunctionFor, resampleUniform } from '../../src/atom/atom_profile';

/**
 * solveAtom is expensive (neon ~1.2s), so each atom used here is solved
 * exactly once in beforeAll and reused by every assertion below, per the
 * task brief's ruling against calling it inside a loop or per-test.
 */
describe('atom profile', () => {
    let neon: AtomSolution;
    let argon: AtomSolution;
    let neonProfile: AtomProfile;
    let argonProfile: AtomProfile;

    beforeAll(() => {
        neon = solveAtom(10);
        argon = solveAtom(18);
        neonProfile = buildAtomProfile(neon, 0.9);
        argonProfile = buildAtomProfile(argon, 0.9);
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

    describe('resampleUniform', () => {
        it('returns exactly `samples` points', () => {
            const out = resampleUniform(neon.grid, neonProfile.total.values, neon.grid.rMax, 257);
            expect(out.length).toBe(257);
            expect(out).toBeInstanceOf(Float32Array);
        });

        it('preserves peak position and value to interpolation accuracy', () => {
            const rMax = neon.grid.rMax;
            const samples = 4001;
            const resampled = resampleUniform(neon.grid, neonProfile.total.values, rMax, samples);

            let peakIndex = 0;
            for (let i = 1; i < resampled.length; i++) {
                if (resampled[i] > resampled[peakIndex]) peakIndex = i;
            }
            const rPeak = (rMax * peakIndex) / (samples - 1);
            const expectedPeakR = neonProfile.shellPeaks[0];
            const expectedPeakValue = interpolateOnGrid(neon.grid, neonProfile.total.values, expectedPeakR);

            // Within one uniform sampling step of the true (log-grid) peak.
            expect(Math.abs(rPeak - expectedPeakR)).toBeLessThan((2 * rMax) / samples);
            // Float32 storage plus sampling-grid offset from the true peak:
            // a loose relative tolerance, not an exact match.
            expect(resampled[peakIndex]).toBeCloseTo(expectedPeakValue, 1);
        });

        it('does not normalise: raw magnitudes are preserved', () => {
            const resampled = resampleUniform(neon.grid, neonProfile.total.values, neon.grid.rMax, 501);
            const maxD = Math.max(...Array.from(neonProfile.total.values));
            const maxResampled = Math.max(...Array.from(resampled));
            // Interpolation can only ever sit at or below the true peak
            // (piecewise-linear interpolation of a concave-down peak), and
            // should come reasonably close to it on a fine sample grid.
            expect(maxResampled).toBeLessThanOrEqual(maxD * 1.0001);
            expect(maxResampled).toBeGreaterThan(maxD * 0.5);
        });
    });
});
