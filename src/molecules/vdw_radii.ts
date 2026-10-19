import { elementFor } from '../elements';

/** Van der Waals radii, Å. Bondi 1964 (J. Phys. Chem. 68, 441) where it lists the element; Mantina et al. 2009
 * (J. Phys. Chem. A 113, 5806) for Be, B, Al, Ca and Ge, which Bondi does not. Sc–Co have no value in either: absent, not guessed (ruling P8b). */
export const VDW_RADII_ANGSTROM: Readonly<Record<number, number>> = {
    1: 1.20, 2: 1.40, 3: 1.82, 4: 1.53, 5: 1.92, 6: 1.70, 7: 1.55, 8: 1.52, 9: 1.47, 10: 1.54,
    11: 2.27, 12: 1.73, 13: 1.84, 14: 2.10, 15: 1.80, 16: 1.80, 17: 1.75, 18: 1.88, 19: 2.75, 20: 2.31,
    28: 1.63, 29: 1.40, 30: 1.39, 31: 1.87, 32: 2.11, 33: 1.85, 34: 1.90, 35: 1.85, 36: 2.02,
};
export const VDW_SOURCE = 'Bondi 1964; Be, B, Al, Ca, Ge from Mantina et al. 2009';

const symbol = (Z: number) => elementFor(Z)?.symbol ?? `Z${Z}`;

/** The element symbols of `atoms` with no tabulated radius, in first-seen order; empty when space filling is available. */
export function missingVdwRadii(atoms: { Z: number }[]): string[] {
    const missing = atoms.filter(atom => VDW_RADII_ANGSTROM[atom.Z] === undefined).map(atom => symbol(atom.Z));
    return [...new Set(missing)];
}

/** Why space filling cannot be drawn for these atoms -- "no van der Waals radius tabulated for Fe (Bondi 1964 / Mantina 2009)" -- or null. */
export function spaceFillingUnavailableReason(atoms: { Z: number }[]): string | null {
    const missing = missingVdwRadii(atoms);
    return missing.length ? `no van der Waals radius tabulated for ${missing.join(', ')} (Bondi 1964 / Mantina 2009)` : null;
}
