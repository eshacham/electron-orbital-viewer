import { MoleculeMeta, MoleculeOrbitalInfo, MoleculeScan } from '../molecules/types';
import type { ComputedParts } from '../info/info_types';
import { BOHR_TO_ANGSTROM, BondsSystemId, openingScanIndex } from './systems';
import { evHaPairText, orbitalEnergyText, totalEnergyText, wellDepthText } from '../format/energy';
import { nb } from '../format/text';

/** A signed number as the panel prints it: a true minus sign (U+2212), not a hyphen. */
export function signed(value: number, digits: number): string {
    return value.toFixed(digits).replace('-', '−');
}

/** R's value in a₀ with Å beside it (atomic units in code, Å only at display and always beside them): "2.07 a₀ (1.098 Å)". */
export function lengthText(R: number): string {
    return `${R.toFixed(2)} a₀ (${(R * BOHR_TO_ANGSTROM).toFixed(3)} Å)`;
}

/** "R = 2.07 a₀ (1.098 Å)". */
export function lengths(R: number): string {
    return `R = ${lengthText(R)}`;
}

/**
 * Task 5b (picture control, finish fix 5; ruling): R as Basics says it -- the curve's own words and unit ("Distance
 * between nuclei (Å)"), two decimals: "Distance between nuclei 1.10 Å". From Explore, `lengths`.
 */
export function plainLength(R: number): string {
    return plainLengthForms(R).line;
}

/**
 * Fix round 1 (review M5): Basics' bond length in its two forms -- the Bond length block's line, and the phone
 * caption's qualifier, lower-case as every qualifier is -- written here once, so neither is surgery on the other.
 */
export function plainLengthForms(R: number): { line: string; qualifier: string } {
    const value = `${(R * BOHR_TO_ANGSTROM).toFixed(2)} Å`;
    return { line: `Distance between nuclei ${value}`, qualifier: `distance between nuclei ${value}` };
}

/*
 * Task 8 fix round 1 (I1, M7): these captions are also an export's plain text -- the method line of every B₂/C₂
 * export, the CSV comments -- so their quantities are written with Unicode, never markup: Rₑ, Dₑ, E(el). Not
 * through flatSubscripts, which would write R_e as "Re", rhenium.
 */

/**
 * Captions for H₂⁺, the one system solved here rather than precomputed. The
 * solver's own error (h2plus.ts: doubling both expansions moves no energy on
 * the slider by more than 3 × 10⁻¹⁴ Ha) is far inside the 10⁻¹⁰ quoted; what
 * remains is the Born–Oppenheimer approximation itself.
 */
export const H2PLUS_CAPTIONS: readonly string[] = [
    'Exact within Born–Oppenheimer (nuclei fixed): the separated spheroidal equations are solved to 10⁻¹⁰ Ha, with no basis set.',
    'E = E(el) + 1/R. One electron, so its orbital energy is the exact electronic energy.',
    '1σu* has no minimum between 0.5 and 10 a₀; its only well, 1.6 × 10⁻³ eV (0.06 mHa) deep at 12.5 a₀, is a polarisation effect outside this range.',
];

/** Panel fixes: H₂⁺'s captions filed -- the exact solution and E's terms are method; 1σu*'s far well is a limit. */
const H2PLUS_PARTS: ReadonlyArray<keyof ComputedParts> = ['method', 'method', 'limits'];

/**
 * Panel fixes (owner review 2026-11-02): a caption and the part of Info's "How this was computed" it is filed under, by
 * what it says -- how it was computed (method), what qualifies it (limits: a sentence that is both is a limit), or what
 * it cites (sources).
 */
export interface BondsCaption {
    part: keyof ComputedParts;
    text: string;
    /** It continues the caption before it on that caption's line in bondsCaptions (Li₂'s caveat, after its Rₑ). */
    sameLine?: boolean;
}

/**
 * The scan's own note (tools/molecules/molecules.py), filed by what each says: B₂ and O₂'s names the ground state that
 * was computed (method); Li₂'s frozen cores and C₂'s multireference character qualify the method (limits), as would a
 * note not yet written.
 */
const NOTE_IS_METHOD: ReadonlySet<BondsSystemId> = new Set<BondsSystemId>(['b2', 'o2']);

/**
 * Ruling T4-d: B₂ and C₂ are kept although T1 at R_e is past the
 * single-reference limit -- B₂'s paramagnetism and C₂'s contested bond are
 * the reason to show them -- so the caveat goes first, where it is read.
 */
export function multireferenceCaption(scan: MoleculeScan): string | null {
    if (!scan.validity.multireference) return null;
    const t1 = scan.validity.t1AtRe;
    return `Strongly multireference: single-reference CCSD(T) is only qualitative here${t1 !== null ? ` (T1 = ${t1.toFixed(3)} at Rₑ)` : ''}.`;
}

/**
 * Ruling T4-a: past the first point where CCSD fails, T1 exceeds its limit or
 * the energy turns over, nothing is shipped; the curve's end is the method's,
 * not the molecule's.
 */
export function validityCaption(scan: MoleculeScan): string | null {
    const { stoppedAtRBohr, validUpToRBohr, stopReason, multireference, t1Limit } = scan.validity;
    if (stoppedAtRBohr === null) return null;
    if (multireference) {
        // Ruling T4-d: T1 is past the single-reference limit even at R_e, so
        // the stop is relative -- 1.5 × T1 at R_e -- and the points before it
        // are no more "valid" than the multireference caveat allows.
        return `The curve stops at ${lengths(validUpToRBohr)}: at the next point T1 exceeds 1.5 × its value at Rₑ`
            + `${t1Limit !== null ? ` (${t1Limit.toFixed(4)})` : ''}${stopReason ? ` — ${stopReason}` : ''}.`;
    }
    return `Single-reference CCSD(T) is not valid beyond ${lengths(validUpToRBohr)} (the bond breaks into open-shell atoms), `
        + `so the curve stops there${stopReason ? `: ${stopReason}` : ''}.`;
}

/**
 * Li₂'s experimental R_e (⁷Li₂ X ¹Σg⁺, 2.6729 Å), which v1's scan.json does
 * not carry (its `reference.ReAngstrom` is null). Stated here, with its
 * source, because Li₂'s caveat is a comparison with it.
 */
export const LI2_REFERENCE = { ReAngstrom: 2.673, source: 'Huber & Herzberg, Constants of Diatomic Molecules (1979), via NIST Chemistry WebBook' };

/** The experimental R_e a scan is compared with: its own, or Li₂'s from LI2_REFERENCE. */
function experimentalRe(system: BondsSystemId, scan: MoleculeScan): { ReAngstrom: number; source: string | null } | null {
    if (scan.reference.ReAngstrom !== null) return { ReAngstrom: scan.reference.ReAngstrom, source: scan.reference.source };
    return system === 'li2' ? LI2_REFERENCE : null;
}

/**
 * Ruling T4-c and Task 4's measurement: with both 1s shells frozen, CCSD(T)
 * is full CI for Li₂'s valence pair -- but the frozen cores leave out
 * core–valence correlation, and R_e comes out about 1 % long. "Exact" must
 * not be read as "exact R_e". `referenceStated`: the sentence before has just
 * given the experimental value and its source.
 */
export function li2Caveat(scan: MoleculeScan, referenceStated = false): string {
    const longer = ((scan.fit.ReBohr * BOHR_TO_ANGSTROM) / LI2_REFERENCE.ReAngstrom - 1) * 100;
    return 'Exact only for the valence pair: core–valence correlation is frozen out, so Rₑ comes out '
        + `${longer.toFixed(1)} % longer than experiment${referenceStated ? '' : ` (${LI2_REFERENCE.ReAngstrom} Å, ${LI2_REFERENCE.source})`}.`;
}

/**
 * He₂: a real van der Waals well, but a few hundredths of a mHa -- the size
 * of the basis-set superposition error no counterpoise correction removes
 * here. Not a bond. `counterpoiseStated`: the sentence before already says
 * there is no counterpoise correction (it is in the method), so this does not
 * say it twice.
 */
export function unboundCaption(detail: string, counterpoiseStated = false): string {
    return `No chemical bond: bond order 0 — a van der Waals well of a few hundredths of a mHa (${detail}), `
        + `comparable to this basis' superposition error${counterpoiseStated ? '' : ', with no counterpoise correction'}.`;
}
export const wellDepth = (scan: MoleculeScan) => wellDepthText(scan.fit.DeHartree);

/**
 * The separated atoms' method, shortened to "same method" where it ends with
 * the curve's own (H₂, He₂: "He ¹S + He ¹S, FCI/aug-cc-pVTZ (…)"), so a
 * caption does not repeat a method -- and its qualifiers -- twice.
 */
export function atomsMethod(scan: MoleculeScan): string {
    const { separatedAtomsMethod } = scan.fit;
    if (!separatedAtomsMethod.endsWith(scan.energyMethod) || separatedAtomsMethod === scan.energyMethod) return separatedAtomsMethod;
    return `${separatedAtomsMethod.slice(0, -scan.energyMethod.length).replace(/[,\s]+$/, '')}, same method`;
}

function bondCaptions(system: BondsSystemId, scan: MoleculeScan): BondsCaption[] {
    const { fit } = scan;
    const uncertainty = fit.ReUncertaintyBohr < 0.001 ? '< 0.001' : fit.ReUncertaintyBohr.toFixed(3);
    const reference = experimentalRe(system, scan);
    const experiment = reference !== null
        ? `; experiment ${reference.ReAngstrom} Å${reference.source ? ` (${reference.source})` : ''}` : '';
    // Final review M8: every v1 D_e falls short of experiment's (Huber &
    // Herzberg D₀ + ω_e/2): N₂ 9.44 vs 9.91 eV, O₂ 4.98 vs 5.21, F₂ 1.58 vs
    // 1.66, CO 10.92 vs 11.23, HF 6.04 vs 6.12, Li₂ 1.03 vs 1.06 -- 1-5 %;
    // H₂ (FCI) 4.71 vs Kołos & Wolniewicz's 4.75, 0.9 %. A triple-zeta basis
    // misses correlation energy that grows with the bond, so it underbinds.
    // Panel fixes: Dₑ's missing zero-point energy and underbinding make it a limit; Rₑ beside experiment cites its
    // reference (sources), and without one it is the fit alone (method); Li₂'s caveat, its own sentence, is a limit.
    return [
        { part: 'limits', text: `Dₑ = ${evHaPairText(fit.DeEv, fit.DeHartree)} from separated atoms, ${atomsMethod(scan)}: `
            + 'E(A) + E(B) − E(Rₑ), without zero-point energy; aug-cc-pVTZ underbinds by a few % against experiment.' },
        { part: reference !== null ? 'sources' : 'method', text: `Rₑ = ${fit.ReBohr.toFixed(3)} a₀ (${(fit.ReBohr * BOHR_TO_ANGSTROM).toFixed(3)} Å), fitted to the scan points `
            + `(fit uncertainty ${uncertainty} a₀)${experiment}.` },
        ...(system === 'li2' ? [{ part: 'limits' as const, text: li2Caveat(scan, reference !== null), sameLine: true }] : []),
    ];
}

/** Spec §3.1 and §3.3: the method behind every number and picture in the Bonds panel. */
export function bondsCaptions(system: BondsSystemId, scan: MoleculeScan | null): string[] {
    const lines: string[] = [];
    for (const caption of bondsCaptionParts(system, scan)) {
        if (caption.sameLine && lines.length > 0) lines[lines.length - 1] += ` ${caption.text}`;
        else lines.push(caption.text);
    }
    return lines;
}

/**
 * bondsCaptions' captions in its order, each filed under its part of "How this was computed" (panel fixes, owner review
 * 2026-11-02) -- Info groups them by part; an export keeps bondsCaptions' lines.
 */
export function bondsCaptionParts(system: BondsSystemId, scan: MoleculeScan | null): BondsCaption[] {
    if (system === 'h2plus') return H2PLUS_CAPTIONS.map((text, index) => ({ part: H2PLUS_PARTS[index], text }));
    if (!scan) return [];
    const captions: BondsCaption[] = [];
    const multireference = multireferenceCaption(scan);
    if (multireference) captions.push({ part: 'limits', text: multireference });
    captions.push(
        { part: 'method', text: `Energies: ${scan.energyMethod}.` },
        // Panel fixes: the density's method and the warning on its eigenvalues, in one sentence -- a limit.
        { part: 'limits', text: `Orbitals and density: ${scan.densityMethod}; orbital energies are ${scan.densityMethod} Kohn–Sham eigenvalues — not ionisation energies.` },
    );
    if (scan.fit.bound) {
        captions.push(...bondCaptions(system, scan));
    } else {
        // Fix round 1 (M6): "no counterpoise correction" is said once -- in the method, when the method says it.
        captions.push({ part: 'limits', text: unboundCaption(`${wellDepth(scan)} below the separated atoms, ${atomsMethod(scan)}`, /counterpoise/.test(scan.energyMethod)) });
        const opening = scan.points[openingScanIndex(scan)];
        if (opening) captions.push({ part: 'limits', text: `The view opens at ${lengths(opening.RBohr)}, the lowest energy on the scan: van der Waals contact, not a bond.` });
    }
    const validity = validityCaption(scan);
    if (validity) captions.push({ part: 'limits', text: validity });
    // Panel fixes: which levels the diagram draws for an open shell qualifies what it shows -- a limit.
    if (scan.spin > 0) captions.push({ part: 'limits', text: 'Unrestricted Kohn–Sham: α and β orbitals differ; levels are drawn at α energies.' });
    if (scan.spinCheck) {
        const gap = scan.spinCheck.singletHartree - scan.spinCheck.tripletHartree;
        captions.push({ part: 'method', text: `The triplet lies ${totalEnergyText(gap, 4)} below the closed-shell singlet `
            + `at R = ${scan.spinCheck.RBohr.toFixed(2)} a₀ (${scan.spinCheck.method}).` });
    }
    // An unbound molecule's note (He₂'s) says what the caption above already
    // says, with its number; every other note adds something.
    if (scan.note && scan.fit.bound) captions.push({ part: NOTE_IS_METHOD.has(system) ? 'method' : 'limits', text: scan.note });
    const { pointsShipped, pointsComputed } = scan.validity;
    captions.push({ part: 'method', text: `Precomputed at ${scan.points.length} bond lengths${pointsShipped < pointsComputed ? ` (of ${pointsComputed} computed)` : ''}; the slider snaps to them.` });
    return captions;
}

const SPIN_MARK: Record<string, string> = { alpha: ' α', beta: ' β', restricted: '' };
const ROLE_ORDER = ['HOMO', 'SOMO', 'LUMO'] as const;

/**
 * The frontier orbitals the data name (meta.json's `role`), one entry per
 * degenerate set: "HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · LUMO 1πg*: ε =
 * −0.91 eV (−0.033 Ha)". ε is the Kohn–Sham eigenvalue the diagram draws,
 * eV first with Ha in parentheses (Task 6 ruling, every mode; Task 7a: the
 * Data tab and Info share this one text). Null when none is named (H₂⁺'s
 * exact levels carry no role).
 */
export function frontierText(orbitals: readonly MoleculeOrbitalInfo[]): string | null {
    const parts = frontierParts(orbitals);
    return parts.length > 0 ? parts.join(' · ') : null;
}

/** The entries `frontierText` joins with " · ", one per degenerate set, so the Data line can hold each "· entry" together. */
export function frontierParts(orbitals: readonly MoleculeOrbitalInfo[]): string[] {
    const groups = new Map<string, { role: string; orbital: MoleculeOrbitalInfo; count: number }>();
    for (const orbital of orbitals) {
        if (!orbital.role) continue;
        const key = `${orbital.role}|${orbital.label}|${orbital.spin ?? 'restricted'}`;
        const group = groups.get(key);
        if (group) group.count += 1;
        else groups.set(key, { role: orbital.role, orbital, count: 1 });
    }
    return [...groups.values()]
        .sort((a, b) => ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]))
        // Fix round 1 (M8): each entry held on one line, so a value never parts from its unit.
        .map(({ role, orbital, count }) => nb(`${role} ${orbital.label}${SPIN_MARK[orbital.spin ?? 'restricted']}`
            + `${count > 1 ? ` ×${count}` : ''}: ε = ${orbitalEnergyText(orbital.energyHartree)}`));
}

/**
 * Orbitals at this R whose shape is one of two comparable choices (Task 4's
 * nearTie: a kept virtual that beat the best one left out by less than 5 % of
 * its norm in MINAO weight -- always two σ virtuals of one irrep sharing the
 * valence σ* character, so the label is right either way and only the shape
 * is a matter of mixing).
 */
export function orbitalCaveats(meta: MoleculeMeta | null): string[] {
    if (!meta) return [];
    const seen = new Set<string>();
    const caveats: string[] = [];
    for (const orbital of meta.orbitals) {
        const tie = orbital.nearTie;
        const key = `${orbital.label}|${orbital.spin ?? 'restricted'}`;
        if (!tie || seen.has(key)) continue;
        seen.add(key);
        // A tie in MINAO weight, not in energy (the runner-up may lie well
        // above); and "σ", not "σ*": the antibonding star is for homonuclear
        // molecules only, and CO's 6σ ties too.
        caveats.push(`${orbital.label}${SPIN_MARK[orbital.spin ?? 'restricted']}: this orbital's shape mixes with another σ virtual of the same symmetry at this R `
            + `— a tie in MINAO weight (${tie.minaoWeight.toFixed(3)} against ${tie.runnerUpMinaoWeight.toFixed(3)}), not in energy — `
            + 'so either shape is as fair a picture.');
    }
    return caveats;
}

/**
 * What a density surface at `iso` shows (ruling T7-a: drawn at exactly this
 * ρ). Only 0.002 e/a₀³ has a meaning shared by every molecule -- the
 * conventional outline; above it, whether the surface is one envelope or a
 * piece around each nucleus depends on the molecule and R, so it is read off
 * the density itself (`minOnAxis`, bondAxisMinimumDensity) when that is
 * known, and not claimed when it is not.
 */
export function densitySurfaceText(iso: number, method: string | null, minOnAxis: number | null): string {
    const meaning = iso === 0.002 ? 'the conventional molecular outline' : 'a higher-density contour, closer to the nuclei';
    const shape = minOnAxis === null ? ''
        : minOnAxis > iso
            ? `: one envelope around both nuclei here (ρ stays above ${minOnAxis.toPrecision(2)} e/a₀³ along the bond)`
            : `: separate around each nucleus here (ρ falls to ${minOnAxis.toPrecision(2)} e/a₀³ between them)`;
    return `Total electron density${method ? ` (${method})` : ''}, surface at ρ = ${iso} e/a₀³, ${meaning}${shape}.`;
}
