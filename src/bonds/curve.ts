import type { CurveSeries } from '../components/PotentialCurvePlot';
import { CURVE_COLORS } from '../curve_colors';
import { MoleculeScan } from '../molecules/types';
import { LI2_CAVEAT, multireferenceCaption, signed, unboundCaption, validityCaption, wellMilliHartree } from './captions';
import { H2PLUS_LABELS, H2PLUS_R_RANGE } from './h2plus';
import { BOHR_TO_ANGSTROM, DiatomicId, HARTREE_TO_EV, systemFormula } from './systems';
import type { H2PlusCurve } from './useH2PlusCurve';

/** Everything PotentialCurvePlot draws for a Bonds system, bar its width and click handler. */
export interface CurvePlotSpec {
    title: string;
    unit: string;
    series: CurveSeries[];
    xRange: [number, number];
    yRange: [number, number];
    markerR: number | null;
    snapRs: number[];
    referenceR: { R: number; label: string } | null;
    caption: string;
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

    const parts = [`${scan.energyMethod}. Zero: ${fit.separatedAtomsMethod}.`];
    const multireference = multireferenceCaption(scan);
    if (multireference) parts.push(multireference);
    if (!fit.bound) parts.push(`${unboundCaption(wellMilliHartree(scan))} At this scale the well is invisible.`);
    const validity = validityCaption(scan);
    if (validity) parts.push(validity);
    if (system === 'li2') parts.push(LI2_CAVEAT);

    return {
        title: 'E − E(separated atoms)',
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
        caption: parts.join(' '),
    };
}

/** H₂⁺'s two exact curves, in Ha, with H + H⁺ (−0.5 Ha) as the limit both approach. */
export function h2plusCurveSpec(curve: H2PlusCurve, R: number | null): CurvePlotSpec {
    const xRange: [number, number] = [H2PLUS_R_RANGE.min, H2PLUS_R_RANGE.max];
    const along = (E: number[]) => curve.R.map((r, i) => ({ R: r, E: E[i] }));
    const { equilibrium } = curve;
    return {
        title: 'E = E_el + 1/R',
        unit: 'Ha',
        series: [
            { key: 'g', label: H2PLUS_LABELS['1sigma_g'], color: CURVE_COLORS[0], points: along(curve.sigmaG) },
            { key: 'u', label: H2PLUS_LABELS['1sigma_u'], color: CURVE_COLORS[1], points: along(curve.sigmaU) },
            { key: 'limit', label: 'H + H⁺', color: LIMIT_COLOR, points: [{ R: xRange[0], E: -0.5 }, { R: xRange[1], E: -0.5 }] },
        ],
        xRange,
        // The 1σg well (−0.603 Ha) and the limit, with room above for 1σu* falling towards it.
        yRange: [-0.65, -0.2],
        markerR: R === null ? null : clampTo(xRange, R),
        snapRs: [],
        referenceR: {
            R: equilibrium.R,
            label: `Dotted line: R_e = ${equilibrium.R.toFixed(3)} a₀ (${(equilibrium.R * BOHR_TO_ANGSTROM).toFixed(3)} Å), E = ${signed(equilibrium.totalEnergy, 4)} Ha.`,
        },
        caption: 'Exact within Born–Oppenheimer (nuclei fixed). Grey line: H + H⁺ at −0.5 Ha. 1σu* has no minimum on this range.',
    };
}
