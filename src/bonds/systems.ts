import type { MoleculeScan, ScanPoint } from '../molecules/types';
import { H2PLUS_R_RANGE } from './h2plus';

/**
 * The systems Bonds mode offers. H₂⁺ is solved exactly in the browser at any
 * R on its slider; every diatomic is precomputed at the points of its scan
 * and nowhere else, so its R is always one of those points.
 */
export const DIATOMIC_IDS = ['h2', 'he2', 'li2', 'b2', 'c2', 'n2', 'o2', 'f2', 'co', 'hf'] as const;
export type DiatomicId = typeof DIATOMIC_IDS[number];
export type BondsSystemId = 'h2plus' | DiatomicId;

export const BONDS_SYSTEMS: ReadonlyArray<{ id: BondsSystemId; formula: string; name: string }> = [
    { id: 'h2plus', formula: 'H₂⁺', name: 'Hydrogen molecular ion — exact' },
    { id: 'h2', formula: 'H₂', name: 'Hydrogen' },
    { id: 'he2', formula: 'He₂', name: 'Helium dimer' },
    { id: 'li2', formula: 'Li₂', name: 'Lithium' },
    { id: 'b2', formula: 'B₂', name: 'Boron' },
    { id: 'c2', formula: 'C₂', name: 'Carbon' },
    { id: 'n2', formula: 'N₂', name: 'Nitrogen' },
    { id: 'o2', formula: 'O₂', name: 'Oxygen' },
    { id: 'f2', formula: 'F₂', name: 'Fluorine' },
    { id: 'co', formula: 'CO', name: 'Carbon monoxide' },
    { id: 'hf', formula: 'HF', name: 'Hydrogen fluoride' },
];

export function isBondsSystemId(value: unknown): value is BondsSystemId {
    return BONDS_SYSTEMS.some(system => system.id === value);
}

export function systemFormula(id: BondsSystemId): string {
    return BONDS_SYSTEMS.find(system => system.id === id)!.formula;
}

/** CODATA 2018, the factors the global constraints fix for display. */
export const BOHR_TO_ANGSTROM = 0.529177210903;
export const HARTREE_TO_EV = 27.211386245988;
/**
 * Bonds meshes sample 97³ points. Timed on an M2 Pro and scaled by
 * single-core benchmarks to a 2020 laptop: an H₂⁺ mesh about 0.5–0.7 s, and
 * the dearest molecule (O₂'s density, sampled and meshed) about 0.7–0.9 s,
 * both inside §3.7's 1.5 s. At 128³ H₂⁺ alone came to 1.1–1.7 s.
 */
export const BONDS_RESOLUTION = 96;
/** e/a₀³ (spec §4.1). 0.002 is the conventional molecular outline; 0.05 shows the bond; 0.2 the cores. */
export const DENSITY_ISO_VALUES = [0.002, 0.05, 0.2] as const;
/** Sampling box beyond the outer nucleus, a₀; the same padding the shipped grids use. */
export const MOLECULE_PADDING = 6.5;
/** Grey: a density has no phase, so it takes neither ψ colour. */
export const DENSITY_SURFACE_HEX = '#cfd8dc';

/**
 * H₂⁺'s R as the slider holds it: on its 0.01 a₀ step (ruling C14 -- a link
 * stores R to three decimals and a click on the curve gives any float, so
 * without this a link would not reproduce the R drawn), and inside its range.
 * The solver throws outside (0, 100], and nothing a link or a click carries
 * may reach it unclamped. Null for a value that is not a number at all.
 */
export function snapH2PlusR(R: number): number | null {
    if (!Number.isFinite(R)) return null;
    const stepped = Math.round(R * 100) / 100;
    return Math.min(H2PLUS_R_RANGE.max, Math.max(H2PLUS_R_RANGE.min, stepped));
}

/** The id the shipped files give a scan point, e.g. 'n2@07'. */
export function pointId(system: DiatomicId, index: number): string {
    return `${system}@${String(index).padStart(2, '0')}`;
}

/**
 * The scan point nearest R. A diatomic is drawn only where data ship, so a
 * restored link's R lands on a shipped point, and one past either end of the
 * scan (beyond the range where its method is valid, ruling T4-a) on that end.
 * −1 for an empty scan, which has nothing to snap to.
 */
export function nearestScanIndex(points: readonly ScanPoint[], R: number): number {
    let best = points.length > 0 ? 0 : -1;
    points.forEach((point, i) => { if (Math.abs(point.RBohr - R) < Math.abs(points[best].RBohr - R)) best = i; });
    return best;
}

/**
 * Where a molecule opens: its equilibrium point, or -- for a pair with no
 * bond (He₂), whose equilibriumIndex is only a placeholder on the repulsive
 * wall -- the scan's lowest energy, van der Waals contact, where the two
 * atoms' outlines just separate (fix round 1, M4).
 */
export function openingScanIndex(scan: Pick<MoleculeScan, 'points' | 'equilibriumIndex' | 'fit'>): number {
    if (scan.fit.bound) return scan.equilibriumIndex;
    return scan.points.reduce((best, point, i) => (point.energyHartree < scan.points[best].energyHartree ? i : best), 0);
}
