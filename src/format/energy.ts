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
    return `${minus(hartree.toFixed(3))} Ha`;
}

/**
 * Task 6: one orbital-energy text for Info and the Data card -- eV first, then Ha: "−5.41 eV (−0.199 Ha)". It is an
 * eigenvalue (ruling R19), which the caller says beside it; never an ionisation energy.
 */
export function orbitalEnergyText(hartree: number): string {
    return `${minus((hartree * HARTREE_IN_EV).toFixed(2))} eV (${hartreeText(hartree)})`;
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
