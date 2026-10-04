import { buildComparisonCurves, ComparisonCurvesInput, radialPlotRange } from '../../src/atom/comparison_curves';
import { CURVE_COLORS } from '../../src/curve_colors';

const RGRID = [0, 1, 2];

function curve(values: number[]): Float64Array {
    return Float64Array.from(values);
}

describe('buildComparisonCurves', () => {
    it('returns nothing when there is no non-relativistic baseline (off mode, or comparisonUnavailable)', () => {
        const input: ComparisonCurvesInput = {
            profile: { shells: [], subshells: [], nonRelativistic: null },
            level: 'atom',
            selectedShell: null,
            selectedSubshell: null,
            rGrid: RGRID,
        };
        expect(buildComparisonCurves(input)).toEqual({ curves: [], note: null });
        expect(buildComparisonCurves({ ...input, profile: undefined })).toEqual({ curves: [], note: null });
        expect(buildComparisonCurves({ ...input, profile: { shells: [], subshells: [], nonRelativistic: undefined } }))
            .toEqual({ curves: [], note: null });
    });

    it('matches shells by n at the atom level, un-scaled, coloured like their solid twin', () => {
        const input: ComparisonCurvesInput = {
            profile: {
                shells: [{ n: 1 }, { n: 2 }] as any,
                subshells: [],
                nonRelativistic: {
                    framingRadius: 1,
                    displayRadius: 1,
                    shells: [
                        { n: 1, contourRadius: 1, curve: curve([1, 2, 3]) },
                        { n: 2, contourRadius: 1, curve: curve([4, 5, 6]) },
                    ],
                    subshells: [],
                },
            },
            level: 'atom',
            selectedShell: null,
            selectedSubshell: null,
            rGrid: RGRID,
        };
        const { curves, note } = buildComparisonCurves(input);
        expect(curves).toHaveLength(2);
        expect(curves[0]).toMatchObject({ label: 'n=1 non-relativistic', color: CURVE_COLORS[0], dashed: true });
        expect(curves[0].points).toEqual([{ r: 0, value: 1 }, { r: 1, value: 2 }, { r: 2, value: 3 }]);
        expect(curves[1]).toMatchObject({ label: 'n=2 non-relativistic', color: CURVE_COLORS[1], dashed: true });
        expect(note).toBeNull();
    });

    it('matches by (n, l) at the shell level when nothing is isolated, summing every j-level shown into one un-scaled curve', () => {
        const shellSubshells = [
            { n: 5, l: 0, j: 0.5, electrons: 2, curve: curve([0, 0, 0]) },
            { n: 5, l: 1, j: 0.5, electrons: 2, curve: curve([0, 0, 0]) },
            { n: 5, l: 1, j: 1.5, electrons: 4, curve: curve([0, 0, 0]) },
        ];
        const input: ComparisonCurvesInput = {
            profile: {
                shells: [],
                subshells: shellSubshells as any,
                nonRelativistic: {
                    framingRadius: 1,
                    displayRadius: 1,
                    shells: [],
                    subshells: [
                        { n: 5, l: 0, electrons: 2, curve: curve([1, 1, 1]) },
                        { n: 5, l: 1, electrons: 6, curve: curve([2, 2, 2]) },
                    ],
                },
            },
            level: 'shell',
            selectedShell: 5,
            selectedSubshell: null,
            rGrid: RGRID,
        };
        const { curves, note } = buildComparisonCurves(input);
        expect(curves).toHaveLength(2);
        const pCurve = curves.find(c => c.label === '5p non-relativistic')!;
        // Both j-levels' electrons (2 + 4 = 6) cover the whole non-relativistic
        // subshell's 6, so the scale is 1 -- no fractional note.
        expect(pCurve.points.every(p => p.value === 2)).toBe(true);
        // Coloured like the shell's first p entry (5p½, index 1), since more
        // than one j-level of l=1 is on screen at once -- there is no single
        // curve to pair it with.
        expect(pCurve.color).toBe(CURVE_COLORS[1]);
        expect(note).toBeNull();
    });

    it('I1: an isolated j-level\'s dashed twin takes that curve\'s own colour, not the shell\'s first j-level at that l', () => {
        const shellSubshells = [
            { n: 6, l: 0, j: 0.5, electrons: 1, curve: curve([0, 0, 0]) },
            { n: 6, l: 1, j: 0.5, electrons: 2, curve: curve([0, 0, 0]) },
            { n: 6, l: 1, j: 1.5, electrons: 4, curve: curve([0, 0, 0]) },
        ];
        const input: ComparisonCurvesInput = {
            profile: {
                shells: [],
                subshells: shellSubshells as any,
                nonRelativistic: {
                    framingRadius: 1,
                    displayRadius: 1,
                    shells: [],
                    subshells: [
                        { n: 6, l: 1, electrons: 6, curve: curve([6, 12, 18]) },
                    ],
                },
            },
            level: 'shell',
            selectedShell: 6,
            // Isolate 6p³⁄₂ (the *third* entry, index 2 -- not the shell's
            // first p entry, which is 6p½ at index 1).
            selectedSubshell: { n: 6, l: 1, j: 1.5 },
            rGrid: RGRID,
        };
        const { curves, note } = buildComparisonCurves(input);
        expect(curves).toHaveLength(1);
        expect(curves[0].label).toBe('6p non-relativistic');
        // shellSubshells.indexOf(6p³⁄₂) === 2, so CURVE_COLORS[2] -- the
        // isolated curve's own colour, not CURVE_COLORS[1] (6p½'s).
        expect(curves[0].color).toBe(CURVE_COLORS[2]);
        // Scaled to the 4 electrons shown out of the non-relativistic
        // subshell's 6: 4/6 of the reference curve.
        expect(curves[0].points.map(p => p.value)).toEqual([4, 8, 12]);
        expect(note).toBe('dashed: non-relativistic 6p, scaled to the 4 electrons shown');
    });

    it('does not scale, and states no note, when the isolated subshell has no j-split to share electrons with', () => {
        const shellSubshells = [
            { n: 6, l: 0, j: 0.5, electrons: 2, curve: curve([0, 0, 0]) },
        ];
        const input: ComparisonCurvesInput = {
            profile: {
                shells: [],
                subshells: shellSubshells as any,
                nonRelativistic: {
                    framingRadius: 1,
                    displayRadius: 1,
                    shells: [],
                    subshells: [{ n: 6, l: 0, electrons: 2, curve: curve([1, 1, 1]) }],
                },
            },
            level: 'shell',
            selectedShell: 6,
            selectedSubshell: { n: 6, l: 0, j: 0.5 },
            rGrid: RGRID,
        };
        const { curves, note } = buildComparisonCurves(input);
        expect(curves).toHaveLength(1);
        expect(curves[0].points.every(p => p.value === 1)).toBe(true);
        expect(note).toBeNull();
    });

    it('skips an (n, l) with no non-relativistic match, or a matched but unoccupied one', () => {
        const shellSubshells = [
            { n: 6, l: 2, j: 2.5, electrons: 1, curve: curve([0, 0, 0]) },
        ];
        const input: ComparisonCurvesInput = {
            profile: {
                shells: [],
                subshells: shellSubshells as any,
                nonRelativistic: {
                    framingRadius: 1,
                    displayRadius: 1,
                    shells: [],
                    // No (n=6, l=2) entry at all, and an unoccupied one elsewhere.
                    subshells: [{ n: 6, l: 1, electrons: 0, curve: curve([1, 1, 1]) }],
                },
            },
            level: 'shell',
            selectedShell: 6,
            selectedSubshell: null,
            rGrid: RGRID,
        };
        expect(buildComparisonCurves(input)).toEqual({ curves: [], note: null });
    });
});

// Final review M3: the plot's range covers the dashed curve too, so its
// tail is not clipped where it runs past the relativistic sphere, and the
// axis does not rescale when relativity is switched (gold's 6s contracts
// inward of the non-relativistic one, so the old range was the larger).
describe('radialPlotRange', () => {
    const base = {
        displayRadius: 4, contourRadius: 3.5,
        shells: [{ n: 5, contourRadius: 2 }, { n: 6, contourRadius: 3.5 }],
    };
    const comparison = {
        displayRadius: 5, framingRadius: 1,
        shells: [{ n: 5, contourRadius: 2.1, curve: curve([]) }, { n: 6, contourRadius: 4.2, curve: curve([]) }],
        subshells: [],
    };

    it('is the drawn radius alone with no comparison (off, byte-identical)', () => {
        expect(radialPlotRange({ ...base, nonRelativistic: null }, 'atom', null)).toBe(4);
        expect(radialPlotRange({ ...base, nonRelativistic: null }, 'shell', 6)).toBe(3.5);
    });

    it('is the larger of the drawn and the non-relativistic radius at the atom level', () => {
        expect(radialPlotRange({ ...base, nonRelativistic: comparison }, 'atom', null)).toBe(5);
        expect(radialPlotRange({ ...base, displayRadius: 6, nonRelativistic: comparison }, 'atom', null)).toBe(6);
    });

    it('is the larger of the two shells\' contour radii at the shell level', () => {
        expect(radialPlotRange({ ...base, nonRelativistic: comparison }, 'shell', 6)).toBe(4.2);
        expect(radialPlotRange({ ...base, nonRelativistic: comparison }, 'orbital', 5)).toBe(2.1);
    });
});
