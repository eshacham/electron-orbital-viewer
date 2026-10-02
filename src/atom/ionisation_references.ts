/**
 * Measured references for Task 6's spec check (spec §3.2): first ionisation
 * energies H-Ar and the sodium D line, both quoted verbatim from source so
 * a reviewer can check them without re-deriving anything.
 */

/** NIST Atomic Spectra Database, Ionization Energies Data (retrieved 2026-09-25), eV. */
export const NIST_ASD_IONISATION_SOURCE = 'NIST Atomic Spectra Database, Ionization Energies (Kramida, Ralchenko, Reader and NIST ASD Team)';
export const NIST_FIRST_IONISATION_EV: Readonly<Record<number, number>> = {
    1: 13.598434599702, 2: 24.587389011, 3: 5.391714996, 4: 9.322699, 5: 8.298019, 6: 11.2602880,
    7: 14.53413, 8: 13.618055, 9: 17.42282, 10: 21.564541, 11: 5.13907696, 12: 7.646236,
    13: 5.985769, 14: 8.15168, 15: 10.486686, 16: 10.3600167, 17: 12.967633, 18: 15.7596119,
};
/** Sodium's 3s -> 3p excitation, the D line, as the spec states it. */
export const NA_D_LINE_EV = 2.104;
export const NA_D_LINE_SOURCE = 'NIST Atomic Spectra Database, Na I 3p levels (D lines), as stated in spec §5 Phase 3';
