/**
 * Energy texts every mode shares (Task 6 ruling: eV first, Ha in parentheses). Moved here from orbital_facts.ts in
 * Task 7a so Bonds' frontier line (bonds/captions.ts) prints its orbital energies with the same formatter as Atoms --
 * orbital_facts.ts imports the view title, which imports the export captions, which import bonds/captions.ts: a cycle.
 */
import { formatSci, minus } from './sci';
import { nb } from './text';

/**
 * 1 Ha in eV, CODATA 2018: the one Ha→eV factor (Task 7a fix round 1, M7). bonds/systems.ts' HARTREE_TO_EV,
 * atom/delta_scf.ts' HARTREE_IN_EV and stark.ts' EV_PER_HARTREE are this same number under the names their modules use.
 */
export const HARTREE_IN_EV = 27.211386245988;

/** An orbital energy in hartree as every Atoms panel prints it: "−0.199 Ha", three places, a true minus. */
export function hartreeText(hartree: number): string {
    return `${orbitalEnergyParts(hartree).ha} Ha`;
}

/**
 * An orbital energy's two numbers without their units, for a table that names the unit in its column headers (the Atoms
 * "Orbital energies" table: "Energy (eV)", "(Ha)"): eV to 2 places and Ha to 3, each with a true minus.
 */
export function orbitalEnergyParts(hartree: number): { ev: string; ha: string } {
    return { ev: minus((hartree * HARTREE_IN_EV).toFixed(2)), ha: minus(hartree.toFixed(3)) };
}

/**
 * Task 6: one orbital-energy text for Info and the Data card -- eV first, then Ha: "−5.41 eV (−0.199 Ha)". It is an
 * eigenvalue (ruling R19), which the caller says beside it; never an ionisation energy.
 */
export function orbitalEnergyText(hartree: number): string {
    const { ev, ha } = orbitalEnergyParts(hartree);
    return `${ev} eV (${ha} Ha)`;
}

/**
 * Science corrections S2: an energy in eV alone, to 3 significant figures with a true minus -- "−13.6 eV". For a place too
 * small for the full "−13.63 eV (−0.501 Ha)" (the Atoms subshell chip), whose name and tooltip carry the full text.
 * A core energy of 1000 eV or more is a whole number, "−1339 eV", not "−1.34 × 10³ eV": it reads beside the table's digits.
 */
export function evText(hartree: number): string {
    const ev = hartree * HARTREE_IN_EV;
    return Math.abs(ev) >= 1000 ? `${minus(ev.toFixed(0))} eV` : `${formatSci(ev)} eV`;
}

/**
 * Task 7a: an energy difference, eV first, Ha in parentheses, each to 3 significant figures (×10ⁿ outside the plain
 * range), held on one line: "−9.44 eV (−0.347 Ha)"; He₂'s van der Waals contact "−1.07 × 10⁻³ eV (−3.93 × 10⁻⁵ Ha)",
 * never a rounded "−0.00 eV". Fix round 1 (M11): a positive difference carries its "+" -- "+9.05 eV (+0.333 Ha)" is
 * above the limit, unmistakably.
 */
export function energyDifferenceText(hartree: number): string {
    const sign = hartree > 0 ? '+' : '';
    return nb(`${sign}${formatSci(hartree * HARTREE_IN_EV)} eV (${sign}${formatSci(hartree)} Ha)`);
}

/**
 * Task 7a fix round 1 (M7): an absolute (total) energy, eV first, then Ha to five places, held on one line:
 * "−2976.40 eV (−109.38074 Ha)".
 */
export function absoluteEnergyText(hartree: number): string {
    return nb(`${minus((hartree * HARTREE_IN_EV).toFixed(2))} eV (${minus(hartree.toFixed(5))} Ha)`);
}

/**
 * Science corrections S2: an energy's eV and Ha, bare of their brackets, for a total or a correction in the molecule's
 * provenance. eV to 2 places -- or, below 1 eV where 2 places would drop the digits (a D3(BJ) correction of
 * −0.0156 eV), to 3 significant figures -- and Ha to `haDigits` places (6 by default: the full precision the job wrote).
 */
function totalEnergyParts(hartree: number, haDigits: number): { ev: string; ha: string } {
    const ev = Math.abs(hartree * HARTREE_IN_EV);
    const digits = ev >= 1 ? ev.toFixed(2) : ev === 0 ? '0' : ev >= 1e-3 ? ev.toPrecision(3) : formatSci(ev);
    return { ev: hartree < 0 ? `−${digits}` : digits, ha: minus(hartree.toFixed(haDigits)) };
}

/**
 * Science corrections S2: a total, a correction or a zero-point energy, eV first and Ha in brackets at full precision:
 * "−2077.83 eV (−76.358723 Ha)". H₂⁺'s curve note quotes four Ha places ("−16.40 eV (−0.6026 Ha)").
 * Unlike absoluteEnergyText (Ha to 5 places, always 2 eV places), Ha is the caller's and a sub-1 eV value keeps 3 figures.
 */
export function totalEnergyText(hartree: number, haDigits = 6): string {
    const { ev, ha } = totalEnergyParts(hartree, haDigits);
    return nb(`${ev} eV (${ha} Ha)`);
}

/** The same two numbers where the place is itself in brackets: "−13.61 eV, −0.5 Ha" (the H + H⁺ zero). */
export function totalEnergyPairText(hartree: number, haDigits = 6): string {
    const { ev, ha } = totalEnergyParts(hartree, haDigits);
    return nb(`${ev} eV, ${ha} Ha`);
}
