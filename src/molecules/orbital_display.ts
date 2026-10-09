import type { MoleculeOrbitalInfo } from './types';

export const HARTREE_TO_EV = 27.211386;
const signed = (v: number, digits: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export function formatOrbitalEnergy(energyHartree: number): string {
    return `${signed(energyHartree, 3)} Ha (${signed(energyHartree * HARTREE_TO_EV, 2)} eV)`;
}

/** Size of each orbital's degenerate set (|ΔE| below tol, chained through energy order), keyed by orbital index. */
export function degeneracyCounts(orbitals: Array<{ index: number; energyHartree: number }>, tol = 1e-4): Map<number, number> {
    const sorted = [...orbitals].sort((a, b) => a.energyHartree - b.energyHartree);
    const counts = new Map<number, number>();
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i].energyHartree - sorted[i - 1].energyHartree >= tol) {
            for (let j = start; j < i; j++) counts.set(sorted[j].index, i - start);
            start = i;
        }
    }
    return counts;
}

/**
 * PySCF names the two linear point groups with their ASCII typable spelling
 * (Dooh/Coov, "oo" standing in for ∞); the UI shows the conventional
 * D∞h/C∞v wherever a point group is displayed (D34). Every other group name
 * passes through unchanged.
 */
const INFINITE_GROUPS: Record<string, string> = { Dooh: 'D∞h', Coov: 'C∞v' };
export function formatPointGroup(group: string): string {
    return INFINITE_GROUPS[group] ?? group;
}

/** tools/molecules/orbitals.py's VALENCE_THRESHOLD (tests/molecules/valence_threshold.test.ts reads it). */
export const VALENCE_THRESHOLD = 0.75;
/** Spec §5: wherever a HOMO–LUMO (or HOMO–LVMO) gap is shown. */
export const GAP_CAVEAT = 'Kohn–Sham orbital gap — neither the optical gap (absorption) nor the fundamental gap (IP − EA)';
/** Ruling D4: what a virtual under VALENCE_THRESHOLD is, whatever its energy -- water's 4a1 (55 %) lies below zero,
 * and silane's 3t2 (68 %) is not "unbound". */
export const DIFFUSE_NOTE = 'its shape depends on the basis';
/** Ruling D4: said of a diffuse virtual only when its energy is above zero. */
export const UNBOUND_NOTE = 'positive energy: an unbound state, not a bound orbital';
export const LVMO_NOTE = 'the antibonding orbital textbooks draw';
/** What a constructed LVMO row is, short enough to follow its role where it is named. */
export const VALENCE_VIRTUAL_NOTE = 'constructed from the valence part of the virtual space — not an orbital of this calculation';
/** Ruling D4-energy, the caption for a constructed LVMO: orbitals.py's CONSTRUCTED_NOTE, word for word
 * (tests/molecules/valence_threshold.test.ts compares them). */
export const CONSTRUCTED_NOTE = `${VALENCE_VIRTUAL_NOTE}; its energy is an upper estimate (its value within the valence space), `
    + "typically several eV above this calculation's orbital energies";
/** Ruling no-jargon: user-facing text never names an internal phase. */
export const UNCLASSIFIED_NOTE = 'Virtual orbitals are not classified in this data (computed before the app classified empty (virtual) '
    + 'orbitals as valence or diffuse): the LUMO may be a diffuse, basis-dependent state rather than an antibonding orbital.';
export const DIFFUSE_MARK = '◌';
export const CONSTRUCTED_MARK = '◇';
/** The constructed mark's accessible name. */
export const CONSTRUCTED_LABEL = 'constructed: not an orbital of this calculation';

type Flags = Pick<MoleculeOrbitalInfo, 'kind' | 'constructed' | 'energyApproximate'>;

export const percentValence = (o: { valenceCharacter?: number }): string => `${Math.round((o.valenceCharacter ?? 0) * 100)} % valence`;

/** A row orbitals.py appended rather than one of the calculation's own: either flag says so (meta.json carries both). */
export const isConstructed = (o: Flags): boolean => o.constructed === true || o.kind === 'valence-virtual';

/** Ruling D4-energy: a constructed row's energy (or any the generator flags `energyApproximate`) is an upper estimate. */
export const isUpperEstimate = (o: Flags): boolean => isConstructed(o) || o.energyApproximate === true;

/** An orbital's energy as the list and captions show it: "…, upper estimate" for a constructed row, never "≈". */
export function orbitalEnergyText(o: Flags & { energyHartree: number }): string {
    return `${formatOrbitalEnergy(o.energyHartree)}${isUpperEstimate(o) ? ', upper estimate' : ''}`;
}

/** Ruling D4: "partly diffuse (55 % valence): its shape depends on the basis", adding that it is unbound only above zero. */
export function diffuseDescription(o: Pick<MoleculeOrbitalInfo, 'valenceCharacter' | 'energyHartree'>): string {
    return `partly diffuse (${percentValence(o)}): ${DIFFUSE_NOTE}${o.energyHartree > 0 ? `; ${UNBOUND_NOTE}` : ''}`;
}

function lowest(orbitals: MoleculeOrbitalInfo[]): MoleculeOrbitalInfo | null {
    return orbitals.reduce<MoleculeOrbitalInfo | null>((a, b) => (a === null || b.energyHartree < a.energyHartree ? b : a), null);
}
const lowestWithRole = (orbitals: MoleculeOrbitalInfo[], role: string) => lowest(orbitals.filter(o => o.role === role));

/** What follows an orbital's role wherever it is named (the "Showing" line, captions): null for an occupied orbital,
 * a valence canonical virtual that is not the LVMO, or older data, which makes no claim either way (spec §4). */
export function orbitalTag(o: MoleculeOrbitalInfo): string | null {
    if (o.occupation > 0) return null;
    const parts: string[] = [];
    if (isConstructed(o)) parts.push(VALENCE_VIRTUAL_NOTE);
    if (o.class === 'diffuse') parts.push(diffuseDescription(o));
    else if (o.role === 'LVMO' && !isConstructed(o)) parts.push(LVMO_NOTE);
    return parts.length ? parts.join('; ') : null;
}

export interface OrbitalGap { name: string; hartree: number }

/** The HOMO–LUMO gap (SOMO–LUMO for an open shell) and, where the LVMO is one of the calculation's own orbitals
 * and differs from the LUMO, the HOMO–LVMO gap too (spec §5). A constructed LVMO gives no gap (Ruling D4-energy):
 * its energy is an upper estimate, and a gap to it would overstate the canonical one by several eV. */
export function orbitalGaps(orbitals: MoleculeOrbitalInfo[]): OrbitalGap[] {
    const occupied = orbitals.filter(o => o.occupation > 0);
    const virtual = orbitals.filter(o => !(o.occupation > 0) && !isConstructed(o));
    if (!occupied.length || !virtual.length) return [];
    const top = occupied.reduce((a, b) => (b.energyHartree > a.energyHartree ? b : a));
    const lower = top.role === 'SOMO' ? 'SOMO' : 'HOMO';
    // Older data without roles still has a lowest virtual, which is its LUMO.
    const lumo = lowestWithRole(virtual, 'LUMO') ?? lowest(virtual)!;
    const lvmo = lowestWithRole(virtual, 'LVMO');
    return [
        { name: `${lower}–LUMO`, hartree: lumo.energyHartree - top.energyHartree },
        ...(lvmo && lvmo.index !== lumo.index ? [{ name: `${lower}–LVMO`, hartree: lvmo.energyHartree - top.energyHartree }] : []),
    ];
}

/** "The LUMO" a lesson or caption means (spec §4): the LVMO where the LUMO is a diffuse state of the basis, saying so
 * -- and saying when the LVMO is constructed. No consumer yet: lessons arrive in Phase 7 (preflight D18). */
export function textbookLumo(orbitals: MoleculeOrbitalInfo[]): { orbital: MoleculeOrbitalInfo; note: string | null } | null {
    const lumo = lowestWithRole(orbitals, 'LUMO');
    const lvmo = lowestWithRole(orbitals, 'LVMO');
    if (lvmo) {
        const what = `the LVMO, ${LVMO_NOTE}${isConstructed(lvmo) ? `, ${CONSTRUCTED_NOTE}` : ''}`;
        return { orbital: lvmo, note: lumo?.class === 'diffuse' ? `${what}: the LUMO itself is ${diffuseDescription(lumo)}` : what };
    }
    return lumo ? { orbital: lumo, note: null } : null;
}

/** The caption's sentence on what the labels are. Older data has no `labels`, and was labelled in PySCF's own group. */
export function labelsSentence(symmetry: { pointGroup: string; labelGroup: string | null; labels?: string; labelNote?: string }): string {
    const pointGroup = formatPointGroup(symmetry.pointGroup);
    const note = symmetry.labelNote;
    if (symmetry.labels === 'full-group') {
        return `Labels: irreducible representations of ${pointGroup}, numbered in energy order within each, core included${note ? `; ${note}` : ''}.`;
    }
    if (symmetry.labels === 'subgroup' && note) return `Labels: ${note}.`;
    if (symmetry.labels === 'none' || symmetry.labelGroup === null) {
        return `Labels: ψ, numbered in energy order (no symmetry labels${note ? `: ${note}` : ''}).`;
    }
    const labelGroup = formatPointGroup(symmetry.labelGroup);
    return `Labels: irreducible representations of ${labelGroup}${symmetry.labelGroup !== symmetry.pointGroup ? `, the subgroup of ${pointGroup} the calculation uses` : ''}.`;
}
