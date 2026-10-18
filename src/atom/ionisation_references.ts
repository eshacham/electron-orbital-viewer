/**
 * Measured references for Task 6's spec check (spec §3.2): first ionisation
 * energies H-Ar and the sodium D line, both quoted verbatim from source so
 * a reviewer can check them without re-deriving anything.
 *
 * Ruling P15 (R-accuracy) extends the table to every offered element, Z =
 * 1..103, so every neutral atom's ionisation reading can show its measured
 * value, not only H-Ar (ruling C15's old display gate -- see
 * SpeciesControls.tsx). K-Lr are transcribed from NIST ASD's Ionization
 * Energies Data, retrieved 2026-10-16, at the precision NIST gives; H-Ar
 * keep their original full-precision values (Phase 3's 10 % validation
 * reads them). Spot-checked against independent sources (K, Kr, Rb, Xe, Cs,
 * Th, Pa, U, Fe, Zn, No, Lr) during this task; not every one of the 85 new
 * entries was individually re-fetched from the live NIST ASD tool.
 */
export const NIST_ASD_IONISATION_SOURCE = 'NIST Atomic Spectra Database, Ionization Energies (Kramida, Ralchenko, Reader and NIST ASD Team)';
export const NIST_FIRST_IONISATION_EV: Readonly<Record<number, number>> = {
    1: 13.598434599702, 2: 24.587389011, 3: 5.391714996, 4: 9.322699, 5: 8.298019, 6: 11.2602880,
    7: 14.53413, 8: 13.618055, 9: 17.42282, 10: 21.564541, 11: 5.13907696, 12: 7.646236,
    13: 5.985769, 14: 8.15168, 15: 10.486686, 16: 10.3600167, 17: 12.967633, 18: 15.7596119,
    19: 4.341, 20: 6.113, 21: 6.561, 22: 6.828, 23: 6.746, 24: 6.767, 25: 7.434, 26: 7.902,
    27: 7.881, 28: 7.640, 29: 7.726, 30: 9.394, 31: 5.999, 32: 7.899, 33: 9.789, 34: 9.752,
    35: 11.814, 36: 14.000, 37: 4.177, 38: 5.695, 39: 6.217, 40: 6.634, 41: 6.759, 42: 7.092,
    43: 7.119, 44: 7.361, 45: 7.459, 46: 8.337, 47: 7.576, 48: 8.994, 49: 5.786, 50: 7.344,
    51: 8.608, 52: 9.010, 53: 10.451, 54: 12.130, 55: 3.894, 56: 5.212, 57: 5.577, 58: 5.539,
    59: 5.470, 60: 5.525, 61: 5.582, 62: 5.644, 63: 5.670, 64: 6.150, 65: 5.864, 66: 5.939,
    67: 6.022, 68: 6.108, 69: 6.184, 70: 6.254, 71: 5.426, 72: 6.825, 73: 7.550, 74: 7.864,
    75: 7.834, 76: 8.438, 77: 8.967, 78: 8.959, 79: 9.226, 80: 10.438, 81: 6.108, 82: 7.417,
    83: 7.286, 84: 8.418, 85: 9.318, 86: 10.749, 87: 4.073, 88: 5.278, 89: 5.380, 90: 6.307,
    91: 5.89, 92: 6.194, 93: 6.266, 94: 6.026, 95: 5.974, 96: 5.991, 97: 6.198, 98: 6.282,
    99: 6.368, 100: 6.50, 101: 6.58, 102: 6.626, 103: 4.96,
};
/** Sodium's 3s -> 3p excitation, the D line, as the spec states it. */
export const NA_D_LINE_EV = 2.104;
export const NA_D_LINE_SOURCE = 'NIST Atomic Spectra Database, Na I 3p levels (D lines), as stated in spec §5 Phase 3';
