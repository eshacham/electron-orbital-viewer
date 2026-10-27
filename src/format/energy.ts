/**
 * Energy texts every mode shares (Task 6 ruling: eV first, Ha in parentheses). Moved here from orbital_facts.ts in
 * Task 7a so Bonds' frontier line (bonds/captions.ts) prints its orbital energies with the same formatter as Atoms --
 * orbital_facts.ts imports the view title, which imports the export captions, which import bonds/captions.ts: a cycle.
 */
import { HARTREE_IN_EV } from '../atom/delta_scf';
import { formatSci, minus } from './sci';
import { nb } from './text';

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
 * never a rounded "−0.00 eV".
 */
export function energyDifferenceText(hartree: number): string {
    return nb(`${formatSci(hartree * HARTREE_IN_EV)} eV (${formatSci(hartree)} Ha)`);
}
