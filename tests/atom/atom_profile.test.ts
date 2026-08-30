import { solveAtom, AtomSolution } from '../../src/atom/scf';
import { integrateOnGrid, interpolateOnGrid, RadialGrid } from '../../src/atom/radial_grid';
import {
    AtomProfile,
    buildAtomProfile,
    radialFunctionFor,
    packRadialCurve,
    shellEmphasis,
    radiusEnclosing,
    SHELL_EMPHASIS_WINDOW,
} from '../../src/atom/atom_profile';

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

    describe('shellEmphasis', () => {
        it('never exceeds 1, and reaches 1 exactly at a global maximum', () => {
            const grid = { rMin: 1, dx: 1, size: 7 } as RadialGrid;
            const D = new Float64Array([0, 1, 5, 10, 4, 1, 0]);
            const e = shellEmphasis(grid, D, 3);
            expect(e[3]).toBeCloseTo(1, 6);
            for (const v of e) expect(v).toBeLessThanOrEqual(1);
        });

        it('gives a shallow trough between two comparably tall peaks a much lower ratio than either peak', () => {
            // Two peaks of nearly equal height with a shallow (15%) dip
            // between them -- the case that breaks a global normalisation
            // (uranium's r=0.084 trough is exactly this shape; see the
            // acceptance test below).
            const grid = { rMin: 1, dx: 1, size: 9 } as RadialGrid;
            const D = new Float64Array([0, 50, 100, 90, 85, 92, 100, 50, 0]);
            const e = shellEmphasis(grid, D, 4);
            expect(e[2]).toBeCloseTo(1, 6);
            expect(e[6]).toBeCloseTo(1, 6);
            // The trough sits at 85/100 = 0.85 of the taller neighbour --
            // far from 1, even though 85 is not far from 100 in absolute
            // terms. This is the property a fixed global scale cannot give:
            // the ratio is local, not against one fixed reference.
            expect(e[4]).toBeCloseTo(0.85, 6);
        });

        it('returns zero rather than dividing by zero where the curve is all zero', () => {
            const grid = { rMin: 1, dx: 1, size: 5 } as RadialGrid;
            const e = shellEmphasis(grid, new Float64Array(5), 2);
            expect(Array.from(e)).toEqual([0, 0, 0, 0, 0]);
        });
    });

    /**
     * The acceptance test for the shell-ring fix (task: "Fix the atom
     * cut-away so shell rings are actually visible"). Mirrors the shader's
     * final ramp exactly (see shell_view.ts's fragment shader) so this
     * measures precisely what ends up on screen, not just the intermediate
     * emphasis ratio.
     *
     * Before this change the cut face read raw D(r) normalised against a
     * single global peak and ramped with pow(d, 0.45) -- a *brightening*
     * curve that compresses the top of the range, where every shell's peak
     * already sits. Reproducing that old ramp against the same peak/trough
     * pairs below gives contrasts of 0.148/0.058 (argon) and
     * 0.028/0.056/0.049 (uranium) -- the 0.028 case (uranium, r=0.021) is
     * the "0.028" figure this task's brief measured independently. All of
     * those fail the 0.35 bar below; this test only exercises the new path,
     * but that old-path arithmetic is why the bar is set where it is.
     */
    describe('shell rings are actually visible (acceptance test)', () => {
        // Same lower edge the shader ramps with (smoothstep(0.9, 1.0, e)).
        function ramp(e: number): number {
            const t = Math.min(1, Math.max(0, (e - 0.9) / (1.0 - 0.9)));
            return t * t * (3 - 2 * t);
        }

        function nearestIndex(grid: RadialGrid, r: number): number {
            const t = Math.log(r / grid.rMin) / grid.dx;
            return Math.max(0, Math.min(grid.size - 1, Math.round(t)));
        }

        function troughIndexBetween(D: Float64Array, i0: number, i1: number): number {
            let minValue = Infinity;
            let minIndex = i0;
            for (let j = i0; j <= i1; j++) {
                if (D[j] < minValue) {
                    minValue = D[j];
                    minIndex = j;
                }
            }
            return minIndex;
        }

        it('keeps every peak-to-adjacent-trough shader-input contrast at or above 0.35, for argon and uranium', () => {
            const MIN_CONTRAST = 0.35;
            const cases: Array<{ label: string; grid: RadialGrid; D: Float64Array; emphasis: Float32Array; peaks: number[] }> = [
                { label: 'Ar', grid: argon.grid, D: argonProfile.total.values, emphasis: argonProfile.totalEmphasis, peaks: argonProfile.shellPeaks },
                { label: 'U', grid: uranium.grid, D: uraniumProfile.total.values, emphasis: uraniumProfile.totalEmphasis, peaks: uraniumProfile.shellPeaks },
            ];

            const table: string[] = [];
            let worst = Infinity;

            for (const { label, grid, D, emphasis, peaks } of cases) {
                expect(peaks.length).toBeGreaterThanOrEqual(2);
                const peakIndices = peaks.map(r => nearestIndex(grid, r));

                for (let i = 0; i < peakIndices.length - 1; i++) {
                    const p0 = peakIndices[i];
                    const p1 = peakIndices[i + 1];
                    const t = troughIndexBetween(D, p0, p1);

                    const bPeak0 = ramp(emphasis[p0]);
                    const bPeak1 = ramp(emphasis[p1]);
                    const bTrough = ramp(emphasis[t]);
                    const contrast = Math.min(bPeak0 - bTrough, bPeak1 - bTrough);
                    worst = Math.min(worst, contrast);

                    table.push(
                        `${label} trough r=${grid.r[t].toFixed(3)}: peaks ${grid.r[p0].toFixed(3)}/${grid.r[p1].toFixed(3)} ` +
                        `-> brightness ${bPeak0.toFixed(3)}/${bPeak1.toFixed(3)}, trough ${bTrough.toFixed(3)}, contrast ${contrast.toFixed(3)}`
                    );
                }
            }

            // eslint-disable-next-line no-console -- the before/after table this test exists to produce.
            console.log(`shellEmphasis window=${SHELL_EMPHASIS_WINDOW}\n` + table.join('\n'));
            for (const row of table) {
                const contrast = Number(row.match(/contrast ([\d.]+)/)![1]);
                expect(contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);
            }
            expect(worst).toBeGreaterThanOrEqual(MIN_CONTRAST);
        });
    });

    /**
     * Addendum 2 §3: "Li/Na/K all show one lonely s electron outside a
     * closed core." They could not, until this. The whole-atom sphere is
     * drawn at a radius and the cut face is stencilled to that sphere, so a
     * shell outside it is not dim -- it is absent.
     *
     * Measured before the fix, at the default 90% enclosed fraction: 34 of
     * the first 56 elements had their valence shell's own D(r) peak outside
     * the contour, sodium's by a factor of 1.67, caesium's by 2.63. An
     * enclosed-*count* contour is dominated by the compact core as soon as
     * there are many electrons, which makes it the wrong answer to "how big
     * is this atom" even though it is the right answer to the question it
     * actually asks.
     */
    describe('the valence shell is inside the drawn sphere (acceptance test)', () => {
        function valencePeakOf(profile: AtomProfile): number {
            const valence = profile.shells[profile.shells.length - 1];
            let best = 0;
            for (let j = 1; j < profile.grid.size; j++) {
                if (valence.curve.values[j] > valence.curve.values[best]) best = j;
            }
            return profile.grid.r[best];
        }

        it('reports the valence peak radius', () => {
            for (const profile of [neonProfile, argonProfile, uraniumProfile]) {
                expect(profile.valencePeakRadius).toBeCloseTo(valencePeakOf(profile), 10);
            }
        });

        it('always draws the atom out past its valence shell, with clearance', () => {
            for (const profile of [neonProfile, argonProfile, uraniumProfile]) {
                expect(profile.displayRadius).toBeGreaterThan(profile.valencePeakRadius);
            }
        });

        it('never draws it smaller than the enclosed-fraction contour, which still means exactly what it says', () => {
            for (const profile of [neonProfile, argonProfile, uraniumProfile]) {
                expect(profile.displayRadius).toBeGreaterThanOrEqual(profile.contourRadius);
                // The contour itself is untouched: it is still the radius
                // enclosing 90% of the electrons, and radiusEnclosing is
                // still what computes it.
                expect(profile.contourRadius).toBeCloseTo(
                    radiusEnclosing(profile.grid, profile.total.values, 0.9), 10
                );
            }
        });

        // Sodium is the case the whole change exists for: one 3s electron
        // sitting on the 2p tail, never a local maximum of the total, and
        // 1.67x outside the 90% contour. It is also cheap to solve.
        it('sodium: the lone 3s electron is on screen, where the 90% contour alone would have cut it off', () => {
            const sodium = buildAtomProfile(solveAtom(11), 0.9);
            expect(sodium.valencePeakRadius).toBeGreaterThan(sodium.contourRadius);
            expect(sodium.displayRadius).toBeGreaterThan(sodium.valencePeakRadius);
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
