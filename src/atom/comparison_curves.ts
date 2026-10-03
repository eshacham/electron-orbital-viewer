import type { RadialCurve } from '../components/RadialPlot';
import type { SerialisedAtomProfile } from '../workers/atomWorker';
import type { SubshellSelection, ViewLevel } from '../store/atomSlice';
import { subshellLabel } from './configurations';
import { CURVE_COLORS } from '../curve_colors';

/** The electron count, right-sized: whole for a whole subshell, two places for a j-level's fractional share. */
function formatElectronsCount(electrons: number): string {
    return Number.isInteger(electrons) ? String(electrons) : electrons.toFixed(2);
}

export interface ComparisonCurvesResult {
    curves: RadialCurve[];
    /**
     * Stated only when a dashed curve stands for less than the whole (n, l)
     * subshell -- an isolated j-level, scaled to just the electrons shown
     * (spec §3.6, ruling C5) rather than the full non-relativistic
     * subshell. Without this the dashed curve's height has no stated
     * reason to differ from "the whole subshell", which the label alone
     * (e.g. "6p non-relativistic") does not say.
     */
    note: string | null;
}

export interface ComparisonCurvesInput {
    /** Only the fields this needs from a `SerialisedAtomProfile` -- a pure function's fixtures stay small. */
    profile: Pick<SerialisedAtomProfile, 'shells' | 'subshells' | 'nonRelativistic'> | null | undefined;
    level: ViewLevel;
    selectedShell: number | null;
    selectedSubshell: SubshellSelection | null;
    /** The shared log grid every curve (the profile's own, and the comparison's) is sampled on. */
    rGrid: number[];
}

/**
 * The same species' non-relativistic D(r) (ruling C5: the species itself,
 * never the neutral atom), reduced to exactly the curves `atomCurves` is
 * showing at the same drill-down level, for the dashed overlay (spec §5
 * Phase 4). Matched on (n) at the atom level and on (n, l) at the shell
 * level -- the non-relativistic atom has no j-levels (spec §3.6). Returns
 * `{ curves: [], note: null }` whenever there is nothing to compare against
 * (off mode, or `comparisonUnavailable` -- both leave `nonRelativistic`
 * null), which the caller can splice in unconditionally.
 *
 * Extracted out of App.tsx (fix round 1, I2) so this can be tested directly
 * rather than only through a rendered component tree.
 */
export function buildComparisonCurves({
    profile, level, selectedShell, selectedSubshell, rGrid,
}: ComparisonCurvesInput): ComparisonCurvesResult {
    const reference = profile?.nonRelativistic;
    if (!profile || !reference) return { curves: [], note: null };
    const pointsFor = (curve: Float64Array, scale: number) =>
        rGrid.map((r, j) => ({ r, value: scale * curve[j] }));

    if (level === 'atom') {
        const curves = profile.shells.flatMap((shell, i) => {
            const match = reference.shells.find(s => s.n === shell.n);
            return match ? [{
                label: `n=${shell.n} non-relativistic`,
                color: CURVE_COLORS[i % CURVE_COLORS.length],
                dashed: true,
                points: pointsFor(match.curve, 1),
            }] : [];
        });
        return { curves, note: null };
    }

    const shellSubshells = profile.subshells.filter(s => s.n === selectedShell);
    const shown = selectedSubshell
        ? shellSubshells.filter(s => s.l === selectedSubshell.l && s.j === selectedSubshell.j)
        : shellSubshells;
    const curves: RadialCurve[] = [];
    let note: string | null = null;
    for (const l of Array.from(new Set(shown.map(s => s.l)))) {
        const match = reference.subshells.find(s => s.n === selectedShell && s.l === l);
        if (!match || !(match.electrons > 0)) continue;
        const shownForL = shown.filter(s => s.l === l);
        const shownElectrons = shownForL.reduce((sum, s) => sum + s.electrons, 0);
        // I1 fix: a single isolated subshell/j-level's dashed twin takes
        // *that* curve's own colour -- the solid curve it is actually being
        // compared with -- rather than always the shell's first level at
        // this l, which used to mismatch a non-first j-level (e.g. an
        // isolated 6p³⁄₂ beside a dashed 6p coloured like 6p½). With more
        // than one j-level of this l on screen at once there is no single
        // curve to pair with, so it keeps the first-at-this-l colour, as
        // it did for the unfiltered shell view before this fix.
        const colorSubshell = shownForL.length === 1 ? shownForL[0] : shellSubshells.find(s => s.l === l)!;
        const scale = shownElectrons / match.electrons;
        const label = subshellLabel(match.n, l);
        if (scale < 0.999995) {
            note = `dashed: non-relativistic ${label}, scaled to the ${formatElectronsCount(shownElectrons)} electrons shown`;
        }
        curves.push({
            label: `${label} non-relativistic`,
            color: CURVE_COLORS[shellSubshells.indexOf(colorSubshell) % CURVE_COLORS.length],
            dashed: true,
            points: pointsFor(match.curve, scale),
        });
    }
    return { curves, note };
}
