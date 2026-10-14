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

/**
 * The System select's groups (ruling R23e, owner): the list stays molecules
 * (MO theory needs a concrete system to teach from) but is organised by the
 * kind of bond each one shows.
 */
export type BondsGroupName =
    | 'One-electron bond (exact)'
    | 'σ bonds from s orbitals'
    | 'σ and π bonds (second-row homonuclear)'
    | 'Polar bonds (heteronuclear)';

export const BOND_GROUP_ORDER: readonly BondsGroupName[] = [
    'One-electron bond (exact)',
    'σ bonds from s orbitals',
    'σ and π bonds (second-row homonuclear)',
    'Polar bonds (heteronuclear)',
];

export const BONDS_SYSTEMS: ReadonlyArray<{ id: BondsSystemId; formula: string; name: string; group: BondsGroupName }> = [
    { id: 'h2plus', formula: 'H₂⁺', name: 'Hydrogen molecular ion — exact', group: 'One-electron bond (exact)' },
    { id: 'h2', formula: 'H₂', name: 'Hydrogen', group: 'σ bonds from s orbitals' },
    { id: 'he2', formula: 'He₂', name: 'Helium dimer', group: 'σ bonds from s orbitals' },
    { id: 'li2', formula: 'Li₂', name: 'Lithium', group: 'σ bonds from s orbitals' },
    { id: 'b2', formula: 'B₂', name: 'Boron', group: 'σ and π bonds (second-row homonuclear)' },
    { id: 'c2', formula: 'C₂', name: 'Carbon', group: 'σ and π bonds (second-row homonuclear)' },
    { id: 'n2', formula: 'N₂', name: 'Nitrogen', group: 'σ and π bonds (second-row homonuclear)' },
    { id: 'o2', formula: 'O₂', name: 'Oxygen', group: 'σ and π bonds (second-row homonuclear)' },
    { id: 'f2', formula: 'F₂', name: 'Fluorine', group: 'σ and π bonds (second-row homonuclear)' },
    { id: 'co', formula: 'CO', name: 'Carbon monoxide', group: 'Polar bonds (heteronuclear)' },
    { id: 'hf', formula: 'HF', name: 'Hydrogen fluoride', group: 'Polar bonds (heteronuclear)' },
];

export function isBondsSystemId(value: unknown): value is BondsSystemId {
    return BONDS_SYSTEMS.some(system => system.id === value);
}

/**
 * The textbook bond order for each system (ruling R23e), for the System
 * select, where every option needs a number before its molecule's data has
 * loaded. For every homonuclear system this equals meta.json's own
 * `bondOrder` -- (bonding − antibonding)/2 over its MO occupations,
 * `bondOrderFromOrbitals` in mo_diagram.ts -- checked against the shipped
 * occupations in tests/bonds/mo_diagram.test.tsx's `bondOrderFromOrbitals`
 * suite. CO and HF carry no g/u antibonding mark in their orbital labels
 * (meta.json's own `bondOrder` is null for them, by the same rule, see
 * MoleculeMeta's doc comment), so their entries here are the textbook value
 * alone, unchecked against data.
 */
export const TEXTBOOK_BOND_ORDER: Record<BondsSystemId, number> = {
    h2plus: 0.5, h2: 1, he2: 0, li2: 1, b2: 1, c2: 2, n2: 3, o2: 2, f2: 1, co: 3, hf: 1,
};

/**
 * Whether a ground state has unpaired electrons, from the data's own
 * multiplicity (ruling T23e-B2; MoleculeMeta's `spin`, 2S -- 0 for a closed
 * shell, 2 for the two unpaired π electrons O₂ and B₂'s triplet ground
 * states both carry). Null when there is no `spin` to read: not yet loaded,
 * or H₂⁺, which is solved exactly (h2plusOrbitals) and never carries a
 * MoleculeMeta at all -- the caller falls back to TEXTBOOK_PARAMAGNETIC.
 */
export function isParamagneticSpin(spin: number | null | undefined): boolean | null {
    return spin === null || spin === undefined ? null : spin > 0;
}

/**
 * The System select's per-option paramagnetic marker (ruling T23e-B2),
 * needed before a molecule's data loads. Every entry but h2plus matches
 * `isParamagneticSpin` on the shipped data's own `spin` -- checked in
 * tests/bonds/systems.test.ts against the real v3 values (O₂ and B₂ carry
 * spin: 2; every other diatomic, 0). H₂⁺ has no `spin` field to check against
 * (see isParamagneticSpin) and is not paramagnetic by the sense this app's
 * captions use: one electron with nothing to pair against isn't what
 * "paramagnetic" describes for the other ten systems.
 */
export const TEXTBOOK_PARAMAGNETIC: Record<BondsSystemId, boolean> = {
    h2plus: false, h2: false, he2: false, li2: false, b2: true, c2: false, n2: false, o2: true, f2: false, co: false, hf: false,
};

function bondTypeName(order: number): string {
    if (order === 0) return 'no bond';
    if (order === 0.5) return 'one-electron bond';
    if (order === 1) return 'single bond';
    if (order === 2) return 'double bond';
    if (order === 3) return 'triple bond';
    return `bond, order ${order}`;
}

/**
 * The System select's per-option line (ruling R23e, e.g. "triple bond, order
 * 3", "no bond, order 0", "double bond, order 2, paramagnetic").
 */
export function bondOrderSelectText(id: BondsSystemId): string {
    const order = TEXTBOOK_BOND_ORDER[id];
    const orderText = Number.isInteger(order) ? String(order) : '½';
    const base = `${bondTypeName(order)}, order ${orderText}`;
    return TEXTBOOK_PARAMAGNETIC[id] ? `${base}, paramagnetic` : base;
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
