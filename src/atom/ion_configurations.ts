/**
 * Ground-state configurations of ions, charge -2..+3 (spec §5 Phase 3).
 *
 * A table, not a rule. "Remove the outermost electron" gets 52 of the 301
 * cations offered here wrong: V+ is 3d4 (not 3d3 4s1), Y+ is 5s2, La+ is
 * 5d2, every lanthanide 3+ ion is pure 4f^n, Th2+ is 5f 6d. These are
 * measured ground states, and the rule-plus-exceptions alternative would
 * carry the same 52 facts in two places instead of one -- the argument
 * configurations.ts makes for the neutral atoms, and it holds here too.
 *
 * Transcribed from the NIST Atomic Spectra Database "Ground Shells" column
 * and checked entry by entry against a committed extract of it
 * (tests/atom/fixtures/nist_ion_ground_configurations.json). NIST has no
 * ground configurations beyond Z = 108, so no ion is offered past hassium.
 *
 * Which charges are offered is a physical judgment, stated once here:
 * cations never break into a noble-gas core and never strip the atom bare;
 * anions only for hydrogen and the group 14-17 elements whose electron
 * affinity is positive (nitrogen's is not), with -2 for group 16 because
 * the oxide and sulfide ions are what chemistry teaches. Whether LDA binds
 * them is a separate question, answered by the solver and shown, not hidden.
 */
import { configurationFor, parseConfiguration, SubshellOccupancy } from './configurations';

export const MIN_CHARGE = -2;
export const MAX_CHARGE = 3;

/** Index 0 is charge +1. One entry per element that has cations to offer; NIST ASD Ground Shells. */
// prettier-ignore
const CATION_CONFIGURATIONS: Readonly<Record<number, readonly string[]>> = {
    2: ['1s1'],  // He
    3: ['[He]'],  // Li
    4: ['[He] 2s1', '[He]'],  // Be
    5: ['[He] 2s2', '[He] 2s1', '[He]'],  // B
    6: ['[He] 2s2 2p1', '[He] 2s2', '[He] 2s1'],  // C
    7: ['[He] 2s2 2p2', '[He] 2s2 2p1', '[He] 2s2'],  // N
    8: ['[He] 2s2 2p3', '[He] 2s2 2p2', '[He] 2s2 2p1'],  // O
    9: ['[He] 2s2 2p4', '[He] 2s2 2p3', '[He] 2s2 2p2'],  // F
    10: ['[He] 2s2 2p5', '[He] 2s2 2p4', '[He] 2s2 2p3'],  // Ne
    11: ['[Ne]'],  // Na
    12: ['[Ne] 3s1', '[Ne]'],  // Mg
    13: ['[Ne] 3s2', '[Ne] 3s1', '[Ne]'],  // Al
    14: ['[Ne] 3s2 3p1', '[Ne] 3s2', '[Ne] 3s1'],  // Si
    15: ['[Ne] 3s2 3p2', '[Ne] 3s2 3p1', '[Ne] 3s2'],  // P
    16: ['[Ne] 3s2 3p3', '[Ne] 3s2 3p2', '[Ne] 3s2 3p1'],  // S
    17: ['[Ne] 3s2 3p4', '[Ne] 3s2 3p3', '[Ne] 3s2 3p2'],  // Cl
    18: ['[Ne] 3s2 3p5', '[Ne] 3s2 3p4', '[Ne] 3s2 3p3'],  // Ar
    19: ['[Ar]'],  // K
    20: ['[Ar] 4s1', '[Ar]'],  // Ca
    21: ['[Ar] 3d1 4s1', '[Ar] 3d1', '[Ar]'],  // Sc
    22: ['[Ar] 3d2 4s1', '[Ar] 3d2', '[Ar] 3d1'],  // Ti
    23: ['[Ar] 3d4', '[Ar] 3d3', '[Ar] 3d2'],  // V
    24: ['[Ar] 3d5', '[Ar] 3d4', '[Ar] 3d3'],  // Cr
    25: ['[Ar] 3d5 4s1', '[Ar] 3d5', '[Ar] 3d4'],  // Mn
    26: ['[Ar] 3d6 4s1', '[Ar] 3d6', '[Ar] 3d5'],  // Fe
    27: ['[Ar] 3d8', '[Ar] 3d7', '[Ar] 3d6'],  // Co
    28: ['[Ar] 3d9', '[Ar] 3d8', '[Ar] 3d7'],  // Ni
    29: ['[Ar] 3d10', '[Ar] 3d9', '[Ar] 3d8'],  // Cu
    30: ['[Ar] 3d10 4s1', '[Ar] 3d10', '[Ar] 3d9'],  // Zn
    31: ['[Ar] 3d10 4s2', '[Ar] 3d10 4s1', '[Ar] 3d10'],  // Ga
    32: ['[Ar] 3d10 4s2 4p1', '[Ar] 3d10 4s2', '[Ar] 3d10 4s1'],  // Ge
    33: ['[Ar] 3d10 4s2 4p2', '[Ar] 3d10 4s2 4p1', '[Ar] 3d10 4s2'],  // As
    34: ['[Ar] 3d10 4s2 4p3', '[Ar] 3d10 4s2 4p2', '[Ar] 3d10 4s2 4p1'],  // Se
    35: ['[Ar] 3d10 4s2 4p4', '[Ar] 3d10 4s2 4p3', '[Ar] 3d10 4s2 4p2'],  // Br
    36: ['[Ar] 3d10 4s2 4p5', '[Ar] 3d10 4s2 4p4', '[Ar] 3d10 4s2 4p3'],  // Kr
    37: ['[Kr]'],  // Rb
    38: ['[Kr] 5s1', '[Kr]'],  // Sr
    39: ['[Kr] 5s2', '[Kr] 4d1', '[Kr]'],  // Y
    40: ['[Kr] 4d2 5s1', '[Kr] 4d2', '[Kr] 4d1'],  // Zr
    41: ['[Kr] 4d4', '[Kr] 4d3', '[Kr] 4d2'],  // Nb
    42: ['[Kr] 4d5', '[Kr] 4d4', '[Kr] 4d3'],  // Mo
    43: ['[Kr] 4d5 5s1', '[Kr] 4d5', '[Kr] 4d4'],  // Tc
    44: ['[Kr] 4d7', '[Kr] 4d6', '[Kr] 4d5'],  // Ru
    45: ['[Kr] 4d8', '[Kr] 4d7', '[Kr] 4d6'],  // Rh
    46: ['[Kr] 4d9', '[Kr] 4d8', '[Kr] 4d7'],  // Pd
    47: ['[Kr] 4d10', '[Kr] 4d9', '[Kr] 4d8'],  // Ag
    48: ['[Kr] 4d10 5s1', '[Kr] 4d10', '[Kr] 4d9'],  // Cd
    49: ['[Kr] 4d10 5s2', '[Kr] 4d10 5s1', '[Kr] 4d10'],  // In
    50: ['[Kr] 4d10 5s2 5p1', '[Kr] 4d10 5s2', '[Kr] 4d10 5s1'],  // Sn
    51: ['[Kr] 4d10 5s2 5p2', '[Kr] 4d10 5s2 5p1', '[Kr] 4d10 5s2'],  // Sb
    52: ['[Kr] 4d10 5s2 5p3', '[Kr] 4d10 5s2 5p2', '[Kr] 4d10 5s2 5p1'],  // Te
    53: ['[Kr] 4d10 5s2 5p4', '[Kr] 4d10 5s2 5p3', '[Kr] 4d10 5s2 5p2'],  // I
    54: ['[Kr] 4d10 5s2 5p5', '[Kr] 4d10 5s2 5p4', '[Kr] 4d10 5s2 5p3'],  // Xe
    55: ['[Xe]'],  // Cs
    56: ['[Xe] 6s1', '[Xe]'],  // Ba
    57: ['[Xe] 5d2', '[Xe] 5d1', '[Xe]'],  // La
    58: ['[Xe] 4f1 5d2', '[Xe] 4f2', '[Xe] 4f1'],  // Ce
    59: ['[Xe] 4f3 6s1', '[Xe] 4f3', '[Xe] 4f2'],  // Pr
    60: ['[Xe] 4f4 6s1', '[Xe] 4f4', '[Xe] 4f3'],  // Nd
    61: ['[Xe] 4f5 6s1', '[Xe] 4f5', '[Xe] 4f4'],  // Pm
    62: ['[Xe] 4f6 6s1', '[Xe] 4f6', '[Xe] 4f5'],  // Sm
    63: ['[Xe] 4f7 6s1', '[Xe] 4f7', '[Xe] 4f6'],  // Eu
    64: ['[Xe] 4f7 5d1 6s1', '[Xe] 4f7 5d1', '[Xe] 4f7'],  // Gd
    65: ['[Xe] 4f9 6s1', '[Xe] 4f9', '[Xe] 4f8'],  // Tb
    66: ['[Xe] 4f10 6s1', '[Xe] 4f10', '[Xe] 4f9'],  // Dy
    67: ['[Xe] 4f11 6s1', '[Xe] 4f11', '[Xe] 4f10'],  // Ho
    68: ['[Xe] 4f12 6s1', '[Xe] 4f12', '[Xe] 4f11'],  // Er
    69: ['[Xe] 4f13 6s1', '[Xe] 4f13', '[Xe] 4f12'],  // Tm
    70: ['[Xe] 4f14 6s1', '[Xe] 4f14', '[Xe] 4f13'],  // Yb
    71: ['[Xe] 4f14 6s2', '[Xe] 4f14 6s1', '[Xe] 4f14'],  // Lu
    72: ['[Xe] 4f14 5d1 6s2', '[Xe] 4f14 5d2', '[Xe] 4f14 5d1'],  // Hf
    73: ['[Xe] 4f14 5d3 6s1', '[Xe] 4f14 5d3', '[Xe] 4f14 5d2'],  // Ta
    74: ['[Xe] 4f14 5d4 6s1', '[Xe] 4f14 5d4', '[Xe] 4f14 5d3'],  // W
    75: ['[Xe] 4f14 5d5 6s1', '[Xe] 4f14 5d5', '[Xe] 4f14 5d4'],  // Re
    76: ['[Xe] 4f14 5d6 6s1', '[Xe] 4f14 5d6', '[Xe] 4f14 5d5'],  // Os
    77: ['[Xe] 4f14 5d7 6s1', '[Xe] 4f14 5d7', '[Xe] 4f14 5d6'],  // Ir
    78: ['[Xe] 4f14 5d9', '[Xe] 4f14 5d8', '[Xe] 4f14 5d7'],  // Pt
    79: ['[Xe] 4f14 5d10', '[Xe] 4f14 5d9', '[Xe] 4f14 5d8'],  // Au
    80: ['[Xe] 4f14 5d10 6s1', '[Xe] 4f14 5d10', '[Xe] 4f14 5d9'],  // Hg
    81: ['[Xe] 4f14 5d10 6s2', '[Xe] 4f14 5d10 6s1', '[Xe] 4f14 5d10'],  // Tl
    82: ['[Xe] 4f14 5d10 6s2 6p1', '[Xe] 4f14 5d10 6s2', '[Xe] 4f14 5d10 6s1'],  // Pb
    83: ['[Xe] 4f14 5d10 6s2 6p2', '[Xe] 4f14 5d10 6s2 6p1', '[Xe] 4f14 5d10 6s2'],  // Bi
    84: ['[Xe] 4f14 5d10 6s2 6p3', '[Xe] 4f14 5d10 6s2 6p2', '[Xe] 4f14 5d10 6s2 6p1'],  // Po
    85: ['[Xe] 4f14 5d10 6s2 6p4', '[Xe] 4f14 5d10 6s2 6p3', '[Xe] 4f14 5d10 6s2 6p2'],  // At
    86: ['[Xe] 4f14 5d10 6s2 6p5', '[Xe] 4f14 5d10 6s2 6p4', '[Xe] 4f14 5d10 6s2 6p3'],  // Rn
    87: ['[Rn]'],  // Fr
    88: ['[Rn] 7s1', '[Rn]'],  // Ra
    89: ['[Rn] 7s2', '[Rn] 7s1', '[Rn]'],  // Ac
    90: ['[Rn] 6d1 7s2', '[Rn] 5f1 6d1', '[Rn] 5f1'],  // Th
    91: ['[Rn] 5f2 7s2', '[Rn] 5f2 6d1', '[Rn] 5f2'],  // Pa
    92: ['[Rn] 5f3 7s2', '[Rn] 5f4', '[Rn] 5f3'],  // U
    93: ['[Rn] 5f4 6d1 7s1', '[Rn] 5f5', '[Rn] 5f4'],  // Np
    94: ['[Rn] 5f6 7s1', '[Rn] 5f6', '[Rn] 5f5'],  // Pu
    95: ['[Rn] 5f7 7s1', '[Rn] 5f7', '[Rn] 5f6'],  // Am
    96: ['[Rn] 5f7 7s2', '[Rn] 5f8', '[Rn] 5f7'],  // Cm
    97: ['[Rn] 5f9 7s1', '[Rn] 5f9', '[Rn] 5f8'],  // Bk
    98: ['[Rn] 5f10 7s1', '[Rn] 5f10', '[Rn] 5f9'],  // Cf
    99: ['[Rn] 5f11 7s1', '[Rn] 5f11', '[Rn] 5f10'],  // Es
    100: ['[Rn] 5f12 7s1', '[Rn] 5f12', '[Rn] 5f11'],  // Fm
    101: ['[Rn] 5f13 7s1', '[Rn] 5f13', '[Rn] 5f12'],  // Md
    102: ['[Rn] 5f14 7s1', '[Rn] 5f14', '[Rn] 5f13'],  // No
    103: ['[Rn] 5f14 7s2', '[Rn] 5f14 7s1', '[Rn] 5f14'],  // Lr
    104: ['[Rn] 5f14 6d1 7s2', '[Rn] 5f14 7s2', '[Rn] 5f14 7s1'],  // Rf
    105: ['[Rn] 5f14 6d2 7s2', '[Rn] 5f14 6d2 7s1', '[Rn] 5f14 6d2'],  // Db
    106: ['[Rn] 5f14 6d3 7s2', '[Rn] 5f14 6d3 7s1', '[Rn] 5f14 6d3'],  // Sg
    107: ['[Rn] 5f14 6d4 7s2', '[Rn] 5f14 6d4 7s1', '[Rn] 5f14 6d4'],  // Bh
    108: ['[Rn] 5f14 6d5 7s2', '[Rn] 5f14 6d5 7s1', '[Rn] 5f14 6d4 7s1'],  // Hs
};

/** Most negative charge offered: hydrogen and group 14-17 elements with a positive electron affinity; -2 for group 16. */
const ANION_FLOOR: Readonly<Record<number, -1 | -2>> = {
    1: -1, 6: -1, 8: -2, 9: -1, 14: -1, 15: -1, 16: -2, 17: -1,
    32: -1, 33: -1, 34: -2, 35: -1, 50: -1, 51: -1, 52: -2, 53: -1,
    82: -1, 83: -1, 84: -2, 85: -1,
};

const NOBLE_GAS_Z = [2, 10, 18, 36, 54, 86];

export function maxCationCharge(Z: number): number {
    const coreZ = NOBLE_GAS_Z.filter(core => core < Z).pop() ?? 0;
    return Math.min(CATION_CONFIGURATIONS[Z]?.length ?? 0, Z - 1, Z - coreZ, MAX_CHARGE);
}

export function minAnionCharge(Z: number): number {
    return ANION_FLOOR[Z] ?? 0;
}

export function allowedCharges(Z: number): number[] {
    const charges: number[] = [];
    for (let q = minAnionCharge(Z); q <= maxCationCharge(Z); q++) charges.push(q);
    return charges;
}

/** Ground-state configuration of Z with the given charge, sorted by (n, l). Throws for a charge not offered. */
export function ionConfigurationFor(Z: number, charge: number): SubshellOccupancy[] {
    if (!allowedCharges(Z).includes(charge)) {
        throw new Error(`Charge ${charge} is not offered for Z=${Z}.`);
    }
    if (charge === 0) return configurationFor(Z);
    if (charge > 0) return parseConfiguration(CATION_CONFIGURATIONS[Z][charge - 1]);

    // Anion: the extra electrons complete the valence p subshell (1s for H).
    const configuration = configurationFor(Z).map(s => ({ ...s }));
    const valenceN = configuration.reduce((max, s) => Math.max(max, s.n), 0);
    const l = Z === 1 ? 0 : 1;
    const target = configuration.find(s => s.n === valenceN && s.l === l);
    if (target) target.electrons -= charge;
    else configuration.push({ n: valenceN, l, electrons: -charge });
    return configuration.sort((a, b) => (a.n - b.n) || (a.l - b.l));
}
