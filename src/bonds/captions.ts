import { MoleculeMeta, MoleculeOrbitalInfo, MoleculeScan } from '../molecules/types';
import { BOHR_TO_ANGSTROM, BondsSystemId, HARTREE_TO_EV, openingScanIndex } from './systems';

/** A signed number as the panel prints it: a true minus sign (U+2212), not a hyphen. */
export function signed(value: number, digits: number): string {
    return value.toFixed(digits).replace('-', '−');
}

/** R in a₀ with Å beside it (atomic units in code, Å only at display and always beside them). */
export function lengths(R: number): string {
    return `R = ${R.toFixed(2)} a₀ (${(R * BOHR_TO_ANGSTROM).toFixed(3)} Å)`;
}

/**
 * Captions for H₂⁺, the one system solved here rather than precomputed. The
 * solver's own error (h2plus.ts: doubling both expansions moves no energy on
 * the slider by more than 3 × 10⁻¹⁴ Ha) is far inside the 10⁻¹⁰ quoted; what
 * remains is the Born–Oppenheimer approximation itself.
 */
export const H2PLUS_CAPTIONS: readonly string[] = [
    'Exact within Born–Oppenheimer (nuclei fixed): the separated spheroidal equations are solved to 10⁻¹⁰ Ha, with no basis set.',
    'E = E_el + 1/R. One electron, so its orbital energy is the exact electronic energy.',
    '1σu* has no minimum between 0.5 and 10 a₀; its only well, 0.06 mHa deep at 12.5 a₀, is a polarisation effect outside this range.',
];

/**
 * Ruling T4-d: B₂ and C₂ are kept although T1 at R_e is past the
 * single-reference limit -- B₂'s paramagnetism and C₂'s contested bond are
 * the reason to show them -- so the caveat goes first, where it is read.
 */
export function multireferenceCaption(scan: MoleculeScan): string | null {
    if (!scan.validity.multireference) return null;
    const t1 = scan.validity.t1AtRe;
    return `Strongly multireference: single-reference CCSD(T) is only qualitative here${t1 !== null ? ` (T1 = ${t1.toFixed(3)} at R_e)` : ''}.`;
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
        return `The curve stops at ${lengths(validUpToRBohr)}: at the next point T1 exceeds 1.5 × its value at R_e`
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
    return 'Exact only for the valence pair: core–valence correlation is frozen out, so R_e comes out '
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
export const wellMilliHartree = (scan: MoleculeScan) => `${(scan.fit.DeHartree * 1000).toFixed(2)} mHa`;

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

function bondCaptions(system: BondsSystemId, scan: MoleculeScan): string[] {
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
    return [
        `D_e = ${fit.DeEv.toFixed(2)} eV (${fit.DeHartree.toFixed(4)} Ha) from separated atoms, ${atomsMethod(scan)}: `
            + 'E(A) + E(B) − E(R_e), without zero-point energy; aug-cc-pVTZ underbinds by a few % against experiment.',
        `R_e = ${fit.ReBohr.toFixed(3)} a₀ (${(fit.ReBohr * BOHR_TO_ANGSTROM).toFixed(3)} Å), fitted to the scan points `
            + `(fit uncertainty ${uncertainty} a₀)${experiment}.${system === 'li2' ? ` ${li2Caveat(scan, reference !== null)}` : ''}`,
    ];
}

/** Spec §3.1 and §3.3: the method behind every number and picture in the Bonds panel. */
export function bondsCaptions(system: BondsSystemId, scan: MoleculeScan | null): string[] {
    if (system === 'h2plus') return [...H2PLUS_CAPTIONS];
    if (!scan) return [];
    const captions: string[] = [];
    const multireference = multireferenceCaption(scan);
    if (multireference) captions.push(multireference);
    captions.push(
        `Energies: ${scan.energyMethod}.`,
        `Orbitals and density: ${scan.densityMethod}; orbital energies are ${scan.densityMethod} Kohn–Sham eigenvalues — not ionisation energies.`,
    );
    if (scan.fit.bound) {
        captions.push(...bondCaptions(system, scan));
    } else {
        captions.push(unboundCaption(`${wellMilliHartree(scan)} below the separated atoms, ${atomsMethod(scan)}`));
        const opening = scan.points[openingScanIndex(scan)];
        if (opening) captions.push(`The view opens at ${lengths(opening.RBohr)}, the lowest energy on the scan: van der Waals contact, not a bond.`);
    }
    const validity = validityCaption(scan);
    if (validity) captions.push(validity);
    if (scan.spin > 0) captions.push('Unrestricted Kohn–Sham: α and β orbitals differ; levels are drawn at α energies.');
    if (scan.spinCheck) {
        const gap = scan.spinCheck.singletHartree - scan.spinCheck.tripletHartree;
        captions.push(`The triplet lies ${gap.toFixed(4)} Ha (${(gap * HARTREE_TO_EV).toFixed(2)} eV) below the closed-shell singlet `
            + `at R = ${scan.spinCheck.RBohr.toFixed(2)} a₀ (${scan.spinCheck.method}).`);
    }
    // An unbound molecule's note (He₂'s) says what the caption above already
    // says, with its number; every other note adds something.
    if (scan.note && scan.fit.bound) captions.push(scan.note);
    const { pointsShipped, pointsComputed } = scan.validity;
    captions.push(`Precomputed at ${scan.points.length} bond lengths${pointsShipped < pointsComputed ? ` (of ${pointsComputed} computed)` : ''}; the slider snaps to them.`);
    return captions;
}

const SPIN_MARK: Record<string, string> = { alpha: ' α', beta: ' β', restricted: '' };
const ROLE_ORDER = ['HOMO', 'SOMO', 'LUMO'] as const;

/**
 * The frontier orbitals the data name (meta.json's `role`), one entry per
 * degenerate set: "HOMO 3σg (ε = −0.438 Ha) · LUMO 1πg* (ε = −0.033 Ha)".
 * ε is the Kohn–Sham eigenvalue the diagram draws. Null when none is named
 * (H₂⁺'s exact levels carry no role).
 */
export function frontierText(orbitals: readonly MoleculeOrbitalInfo[]): string | null {
    const groups = new Map<string, { role: string; orbital: MoleculeOrbitalInfo; count: number }>();
    for (const orbital of orbitals) {
        if (!orbital.role) continue;
        const key = `${orbital.role}|${orbital.label}|${orbital.spin ?? 'restricted'}`;
        const group = groups.get(key);
        if (group) group.count += 1;
        else groups.set(key, { role: orbital.role, orbital, count: 1 });
    }
    const parts = [...groups.values()]
        .sort((a, b) => ROLE_ORDER.indexOf(a.role as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.role as typeof ROLE_ORDER[number]))
        .map(({ role, orbital, count }) => `${role} ${orbital.label}${SPIN_MARK[orbital.spin ?? 'restricted']}`
            + `${count > 1 ? ` ×${count}` : ''} (ε = ${signed(orbital.energyHartree, 3)} Ha)`);
    return parts.length > 0 ? parts.join(' · ') : null;
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
