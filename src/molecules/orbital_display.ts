import type { MoleculeOrbitalInfo } from './types';
import { orbitalEnergyText } from '../format/energy';
import { typedPointGroup } from '../format/sci';

/**
 * Task 7b: the one Ha→eV factor (format/energy.ts, CODATA 2018), under the name the Molecules CSV export prints in its
 * header ("1 Ha = 27.211386245988 eV"). Not a copy: it was 27.211386 here, a second rounding of the same constant. A
 * re-export, a live binding: format/energy imports format/sci, which imports this module, so a `const` copied at load
 * could read the factor before format/energy has set it.
 */
export { HARTREE_IN_EV as HARTREE_TO_EV } from '../format/energy';

/** Orbitals this close in energy, with no symmetry label to say otherwise, are one level (Ha). */
const UNLABELLED_SAME_LEVEL_HARTREE = 1e-4;

/** One degenerate set: `size` orbitals (their `indices`), and whether a shared symmetry label or an energy tie made it. */
export interface DegenerateGroup {
    size: number;
    indices: number[];
    /** True when the members share a symmetry label ("1e", "2t2"); false when unlabelled ('?') orbitals tied in energy. */
    bySymmetry: boolean;
}

/**
 * Science correction S4: a degenerate set is the orbitals that share a symmetry label (the generator gives every member of
 * an e, t or π set the exact same label, "1e", "2t2", "1πu"), counted within one spin so an unrestricted α orbital is never
 * grouped with its β partner. An energy near-tie across *different* labels is not degeneracy (NO₂'s 1b2 and 1a1 core
 * orbitals lie 1.9e-5 Ha apart and are two levels). Only an unlabelled ('?') orbital falls back to the energy: those
 * within 1e-4 Ha of the next one (chained through energy order, still within one spin) are one set. Keyed by orbital index;
 * every orbital has a group, a lone one has size 1.
 */
export function degenerateGroups(
    orbitals: Array<{ index: number; energyHartree: number; label: string; spin?: string }>,
): Map<number, DegenerateGroup> {
    const groups = new Map<number, DegenerateGroup>();
    const add = (members: typeof orbitals, bySymmetry: boolean) => {
        const group: DegenerateGroup = { size: members.length, indices: members.map(o => o.index), bySymmetry };
        for (const o of members) groups.set(o.index, group);
    };
    const labelled = new Map<string, typeof orbitals>();
    const unlabelled = new Map<string, typeof orbitals>();
    for (const o of orbitals) {
        const bucket = o.label === UNLABELLED ? unlabelled : labelled;
        const key = o.label === UNLABELLED ? (o.spin ?? '') : `${o.spin ?? ''}|${o.label}`;
        bucket.set(key, [...(bucket.get(key) ?? []), o]);
    }
    for (const members of labelled.values()) add(members, true);
    for (const members of unlabelled.values()) {
        const sorted = [...members].sort((a, b) => a.energyHartree - b.energyHartree);
        let start = 0;
        for (let i = 1; i <= sorted.length; i++) {
            if (i === sorted.length || sorted[i].energyHartree - sorted[i - 1].energyHartree >= UNLABELLED_SAME_LEVEL_HARTREE) {
                add(sorted.slice(start, i), false);
                start = i;
            }
        }
    }
    return groups;
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

/**
 * Task 7b: the Kohn–Sham caveat, stated once for every energy Molecules shows (the orbital list's energies, the gaps,
 * Info's orbital energy): the orbital list's old caption ("Kohn–Sham orbital energies … Not ionisation energies.") and
 * GAP_CAVEAT, joined into one sentence (Task 9b). The gap clause names the molecule's own gaps; none without a virtual.
 */
export function kohnShamNote(orbitals: MoleculeOrbitalInfo[]): string {
    const gaps = orbitalGaps(orbitals);
    // Task 9b (finish review, fix 5): one sentence, the two clauses joined -- the finish review read two as a wall. Task 9b
    // review M1: "These", not "Orbital energies are" -- a claim about these numbers (Hartree–Fock's are not KS eigenvalues).
    const energies = 'These orbital energies are Kohn–Sham eigenvalues, not ionisation energies';
    if (gaps.length === 0) return `${energies}.`;
    // "… and the HOMO–LUMO gap is a Kohn–Sham orbital gap — …"; two: "… and the HOMO–LUMO and HOMO–LVMO gaps are Kohn–Sham orbital gaps — …".
    return gaps.length === 1
        ? `${energies}, and the ${gapTerm(gaps[0])} is a ${GAP_CAVEAT}.`
        : `${energies}, and the ${gaps.map(gap => gap.name).join(' and ')} gaps are Kohn–Sham orbital gaps — ${GAP_CAVEAT.split(' — ')[1]}.`;
}
/** Ruling D4: what a virtual under VALENCE_THRESHOLD is, whatever its energy -- water's 4a1 (55 %) lies below zero,
 * and silane's 3t2 (68 %) is not "unbound". */
export const DIFFUSE_NOTE = 'its shape depends on the basis';
/** Ruling D4: said of a diffuse virtual only when its energy is above zero. */
export const UNBOUND_NOTE = 'positive energy: an unbound state, not a bound orbital';
/** Ruling LVMO-wording: not every LVMO is antibonding -- BF3's is boron's empty 2p. */
export const LVMO_NOTE = "the lowest empty valence orbital — the one textbooks draw (antibonding, or an empty valence orbital such as boron's 2p in BF3)";
/** What a constructed LVMO row is, short enough to follow its role where it is named. */
export const VALENCE_VIRTUAL_NOTE = 'constructed from the valence part of the virtual space — not an orbital of this calculation';
/** Ruling D4-energy, the caption for a constructed LVMO: orbitals.py's CONSTRUCTED_NOTE, word for word
 * (tests/molecules/valence_threshold.test.ts compares them). */
export const CONSTRUCTED_NOTE = `${VALENCE_VIRTUAL_NOTE}; its energy is an upper estimate (its value within the valence space), `
    + "typically several eV above this calculation's orbital energies";
/** Ruling no-jargon: user-facing text never names an internal phase. */
export const UNCLASSIFIED_NOTE = 'Virtual orbitals are not classified in this data (computed before the app classified empty (virtual) '
    + 'orbitals as valence or diffuse): the LUMO may be a diffuse, basis-dependent state rather than an antibonding orbital.';
/** point_group.UNLABELLED, and what the caption says of it where the generator gave no labelNote. */
export const UNLABELLED = '?';
export const UNLABELLED_NOTE = 'no symmetry label could be assigned to this orbital, so it is left unlabelled';
export const DIFFUSE_MARK = '◌';
export const CONSTRUCTED_MARK = '◇';
/** The constructed mark's accessible name. */
export const CONSTRUCTED_LABEL = 'constructed: not an orbital of this calculation';

type Flags = Pick<MoleculeOrbitalInfo, 'kind' | 'constructed' | 'energyApproximate'>;

export const percentValence = (o: { valenceCharacter?: number }): string => `${Math.round((o.valenceCharacter ?? 0) * 100)} % valence`;

/** A row orbitals.py appended rather than one of the calculation's own: either flag says so (meta.json carries both). */
export const isConstructed = (o: Flags): boolean => o.constructed === true || o.kind === 'valence-virtual';

/** Ruling D4-energy: a constructed row's energy (or any the generator flags `energyApproximate`) is an upper estimate. */
/** Final review M5: what an exported caption or cube calls the orbital -- never "MO" for one that is not an orbital
 * of the calculation. */
export const orbitalNoun = (o: Flags, short = false): string =>
    isConstructed(o) ? 'constructed valence virtual orbital' : short ? 'MO' : 'molecular orbital';

export const isUpperEstimate = (o: Flags): boolean => isConstructed(o) || o.energyApproximate === true;

/**
 * An orbital's energy as Info and the export caption say it: format/energy's one orbitalEnergyText (eV first, Ha in
 * parentheses -- Task 6 ruling; Task 7b fix round 1, M8: the Ha-first copy that stood here is gone), with "…, upper
 * estimate" for a constructed row, never "≈".
 */
export function orbitalEnergyWithEstimate(o: Flags & { energyHartree: number }): string {
    return `${orbitalEnergyText(o.energyHartree)}${isUpperEstimate(o) ? ', upper estimate' : ''}`;
}

/** Ruling D4: "partly diffuse (55 % valence): its shape depends on the basis", adding that it is unbound only above zero. */
export function diffuseDescription(o: Pick<MoleculeOrbitalInfo, 'valenceCharacter' | 'energyHartree'>): string {
    return `partly diffuse (${percentValence(o)}): ${DIFFUSE_NOTE}${o.energyHartree > 0 ? `; ${UNBOUND_NOTE}` : ''}`;
}

function lowest(orbitals: MoleculeOrbitalInfo[]): MoleculeOrbitalInfo | null {
    return orbitals.reduce<MoleculeOrbitalInfo | null>((a, b) => (a === null || b.energyHartree < a.energyHartree ? b : a), null);
}
const lowestWithRole = (orbitals: MoleculeOrbitalInfo[], role: string) => lowest(orbitals.filter(o => o.role === role));

/** The roles a frontier orbital can carry (meta.json's `role`), in the order they are shown: occupied, then empty. */
export const FRONTIER_ROLES = ['HOMO', 'SOMO', 'LUMO', 'LVMO'] as const;
export type FrontierRole = typeof FRONTIER_ROLES[number];

/**
 * Preflight D8: every frontier orbital the data names, one per role, in FRONTIER_ROLES order -- each named by
 * its own role, never relabelled (a SOMO is never called the HOMO). A degenerate set shares its role; its first
 * member (lowest index) stands for it. An open shell may name both: NO₂'s data has a doubly occupied HOMO (4b2)
 * below its SOMO (6a1); O₂'s (spin-unrestricted) has SOMOs and no HOMO. Older data names none.
 */
export function frontierOrbitals<T extends { index: number; role?: string }>(orbitals: readonly T[]): Array<{ role: FrontierRole; orbital: T }> {
    return FRONTIER_ROLES.flatMap(role => {
        const named = orbitals.filter(o => o.role === role);
        if (!named.length) return [];
        return [{ role, orbital: named.reduce((a, b) => (b.index < a.index ? b : a)) }];
    });
}

/**
 * Preflight D8: the occupied orbital a view opens on when none is picked yet -- the frontier occupied orbital.
 * Task 16d item 5 (T15-M2, science): for an open shell that is its SOMO, the highest occupied level, even where the
 * data also name a doubly occupied HOMO below it (NO₂: 6a1 over 4b2); O₂ names SOMOs alone. A closed shell opens on
 * its HOMO. Null when the data name neither (older data); callers that must show something fall back to their own
 * choice.
 */
export function frontierOccupied<T extends { index: number; role?: string }>(orbitals: readonly T[]): T | null {
    const frontier = frontierOrbitals(orbitals);
    return (frontier.find(f => f.role === 'SOMO') ?? frontier.find(f => f.role === 'HOMO'))?.orbital ?? null;
}

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

/** What a gap is called wherever it is shown -- the orbital list's divider and the Properties card: "HOMO–LUMO gap". */
export const gapTerm = (gap: OrbitalGap): string => `${gap.name} gap`;

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
/** Final review M4: the groups whose B labels (b1/b2, b1u/b2u/b3u …) depend on which axes are called x, y and z. */
const AXIS_DEPENDENT = new Set(['C2v', 'D2', 'D2h']);
export const AXES_NOTE = "The b labels depend on which axes are called x, y and z: these follow the calculation's (PySCF's) axes, "
    + "which a textbook may assign differently (ethylene's π HOMO reads 1b2u in the library, 1b3u in Mulliken's convention).";

export function labelsSentence(symmetry: { pointGroup: string; labelGroup: string | null; labels?: string; labelNote?: string }): string {
    const sentence = labelsSentenceAlone(symmetry);
    return symmetry.labelGroup && AXIS_DEPENDENT.has(symmetry.labelGroup) ? `${sentence} ${AXES_NOTE}` : sentence;
}

function labelsSentenceAlone(symmetry: { pointGroup: string; labelGroup: string | null; labels?: string; labelNote?: string }): string {
    // Task 7b fix round 1 (M3): typed, as the point group fact beside it (C₂ᵥ, not C2v); text only, so typedPointGroup.
    const pointGroup = typedPointGroup(symmetry.pointGroup);
    const note = symmetry.labelNote;
    if (symmetry.labels === 'full-group' && symmetry.labelGroup === 'SO3') {
        // Final review M1: an atom's orbitals read 1s, 2s, 2p … (point_group.atom_labels), not SO3's irreps.
        return `Labels: atomic orbitals (1s, 2s, 2p, 3d …), numbered by principal quantum number, core included${note ? `; ${note}` : ''}.`;
    }
    if (symmetry.labels === 'full-group') {
        return `Labels: irreducible representations of ${pointGroup}, numbered in energy order within each, core included${note ? `; ${note}` : ''}.`;
    }
    if (symmetry.labels === 'subgroup' && note) return `Labels: ${note}.`;
    if (symmetry.labels === 'none' || symmetry.labelGroup === null) {
        return `Labels: ψ, numbered in energy order (no symmetry labels${note ? `: ${note}` : ''}).`;
    }
    const labelGroup = typedPointGroup(symmetry.labelGroup);
    return `Labels: irreducible representations of ${labelGroup}${symmetry.labelGroup !== symmetry.pointGroup ? `, the subgroup of ${pointGroup} the calculation uses` : ''}.`;
}

/** The caption's label notes: one per distinct (label, note) -- a degenerate set's members share both -- under the
 * label it explains, which may be '?' or a combined label such as BF3's 1a1′+1e′. A '?' with no note of its own
 * gets UNLABELLED_NOTE rather than silence. */
export function labelNotes(orbitals: Array<Pick<MoleculeOrbitalInfo, 'label' | 'labelNote'>>): string[] {
    const seen = new Set<string>();
    for (const o of orbitals) {
        const note = o.labelNote ?? (o.label === UNLABELLED ? UNLABELLED_NOTE : null);
        if (note) seen.add(`${o.label}: ${note}.`);
    }
    return [...seen];
}
