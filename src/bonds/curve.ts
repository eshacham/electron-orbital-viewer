import type { CurveSeries } from '../components/PotentialCurvePlot';
import { CURVE_COLORS } from '../curve_colors';
import { MoleculeScan } from '../molecules/types';
import { atomsMethod, signed } from './captions';
import { H2PLUS_LABELS, H2PLUS_R_RANGE } from './h2plus';
import { BOHR_TO_ANGSTROM, BondsSystemId, DiatomicId, HARTREE_TO_EV, systemFormula } from './systems';
import type { H2PlusCurve } from './useH2PlusCurve';

/**
 * Everything PotentialCurvePlot draws for a Bonds system, bar its width and click handler. Task 7a: the plot keeps its
 * axis labels and the Rₑ marker's label; what its caption said is Info's (curveNote, after bondsCaptions).
 */
export interface CurvePlotSpec {
    title: string;
    unit: string;
    series: CurveSeries[];
    xRange: [number, number];
    yRange: [number, number];
    markerR: number | null;
    snapRs: number[];
    referenceR: { R: number; label: string } | null;
}

/** The plots' titles: what E means on each (zero is the separated atoms, or H + H⁺). */
const DIATOMIC_TITLE = 'E − E(separated atoms)';
const H2PLUS_TITLE = 'E − E(H + H⁺)';

/**
 * Task 7a: what the plot's caption said that bondsCaptions does not -- what the curve is relative to, and for an
 * unbound pair that its well cannot be seen at this scale. The rest of the old caption (the energy method, the
 * multireference caveat, the unbound caption, the validity stop, Li₂'s caveat) is bondsCaptions' too, and Info says it
 * once, there. Null before a molecule's scan has loaded.
 */
export function curveNote(system: BondsSystemId, scan: MoleculeScan | null): string | null {
    if (system === 'h2plus') return `Plot: ${H2PLUS_TITLE}, in eV. Zero: H + H⁺ (−0.5 Ha), the grey line.`;
    if (!scan) return null;
    return `Plot: ${DIATOMIC_TITLE}, in eV. Zero: ${atomsMethod(scan)}, the grey line.${scan.fit.bound ? '' : ' At this scale the well is invisible.'}`;
}

/** The asymptote lines' grey: a reference, not a state. */
const LIMIT_COLOR = '#9aa4ad';
/**
 * The smallest energy span a molecule's plot shows, eV. Without it the axis
 * would stretch to fit whatever the curve does, and He₂'s 0.001 eV van der
 * Waals well -- inside this basis' superposition error -- would fill the plot
 * like a bond. Every bound molecule here spans more than this anyway (the
 * shallowest, Li₂, has D_e = 1.03 eV), so only an unbound one is held to it.
 */
const MIN_SPAN_EV = 1;
/** A repulsive wall is cut off this far above the minimum, eV, so the well keeps the plot's height. */
const MAX_SPAN_EV = 15;

const clampTo = (range: [number, number], R: number) => Math.min(range[1], Math.max(range[0], R));

/**
 * A molecule's curve, E − E(separated atoms) in eV: zero is the dissociation
 * limit, as the separated-atom calculation defines it, so the depth of the
 * well is D_e as the captions state it and the grey line shows how far short
 * of the atoms a curve stops where its method gives out (ruling T4-a).
 */
export function diatomicCurveSpec(system: DiatomicId, scan: MoleculeScan, R: number | null): CurvePlotSpec {
    const { fit } = scan;
    const toEv = (E: number) => (E - fit.separatedAtomsHartree) * HARTREE_TO_EV;
    const points = scan.points.map(p => ({ R: p.RBohr, E: toEv(p.energyHartree) }));
    const xRange: [number, number] = [scan.points[0].RBohr, scan.points[scan.points.length - 1].RBohr];
    const energies = points.map(p => p.E);
    const lo = Math.min(...energies, 0);
    const hi = Math.min(Math.max(...energies, 0), lo + MAX_SPAN_EV);
    const span = Math.max(hi - lo, MIN_SPAN_EV);
    const pad = 0.05 * span;
    const yRange: [number, number] = [lo - pad, lo + span + pad];

    return {
        title: DIATOMIC_TITLE,
        unit: 'eV',
        series: [
            { key: 'e', label: systemFormula(system), color: CURVE_COLORS[0], points },
            { key: 'atoms', label: 'separated atoms', color: LIMIT_COLOR, points: [{ R: xRange[0], E: 0 }, { R: xRange[1], E: 0 }] },
        ],
        xRange,
        yRange,
        markerR: R === null ? null : clampTo(xRange, R),
        snapRs: scan.points.map(p => p.RBohr),
        // He₂ has no bond, so no bond length to mark.
        referenceR: fit.bound && fit.ReBohr >= xRange[0] && fit.ReBohr <= xRange[1]
            ? { R: fit.ReBohr, label: `Dotted line: R_e = ${fit.ReBohr.toFixed(3)} a₀ (${(fit.ReBohr * BOHR_TO_ANGSTROM).toFixed(3)} Å), fitted; D_e = ${fit.DeEv.toFixed(2)} eV from separated atoms.` }
            : null,
    };
}

/** H + H⁺: the exact limit both H₂⁺ curves approach, Ha. Exported for the CSV export (run_export.ts), which states the same zero. */
export const H_PLUS_H_PLUS_HARTREE = -0.5;

/**
 * H₂⁺'s two exact curves, E = E_el + 1/R, plotted like every molecule's:
 * relative to the separated fragments (H + H⁺, −0.5 Ha), in eV, so the depth
 * of the 1σg well is D_e here too.
 */
export function h2plusCurveSpec(curve: H2PlusCurve, R: number | null): CurvePlotSpec {
    const xRange: [number, number] = [H2PLUS_R_RANGE.min, H2PLUS_R_RANGE.max];
    const toEv = (E: number) => (E - H_PLUS_H_PLUS_HARTREE) * HARTREE_TO_EV;
    const along = (E: number[]) => curve.R.map((r, i) => ({ R: r, E: toEv(E[i]) }));
    const { equilibrium } = curve;
    const De = H_PLUS_H_PLUS_HARTREE - equilibrium.totalEnergy;
    return {
        title: H2PLUS_TITLE,
        unit: 'eV',
        series: [
            { key: 'g', label: H2PLUS_LABELS['1sigma_g'], color: CURVE_COLORS[0], points: along(curve.sigmaG) },
            { key: 'u', label: H2PLUS_LABELS['1sigma_u'], color: CURVE_COLORS[1], points: along(curve.sigmaU) },
            { key: 'limit', label: 'H + H⁺', color: LIMIT_COLOR, points: [{ R: xRange[0], E: 0 }, { R: xRange[1], E: 0 }] },
        ],
        xRange,
        // The 1σg well (−0.103 Ha) and the limit, with room above for 1σu* falling towards it.
        yRange: [-0.15 * HARTREE_TO_EV, 0.3 * HARTREE_TO_EV],
        markerR: R === null ? null : clampTo(xRange, R),
        snapRs: [],
        referenceR: {
            R: equilibrium.R,
            label: `Dotted line: R_e = ${equilibrium.R.toFixed(3)} a₀ (${(equilibrium.R * BOHR_TO_ANGSTROM).toFixed(3)} Å), `
                + `E = ${signed(equilibrium.totalEnergy, 4)} Ha; D_e = ${(De * HARTREE_TO_EV).toFixed(2)} eV (${De.toFixed(4)} Ha) to H + H⁺.`,
        },
    };
}
