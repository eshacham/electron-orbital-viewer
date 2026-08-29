import { MAX_ATOMIC_NUMBER } from '../elements';
import { shellLetter } from '../orbital_names';

/**
 * Ground-state electron configurations for the neutral atoms, Z = 1..118.
 *
 * This is a lookup table, not a rule. Building configurations by filling
 * subshells in Madelung (n+l) order gets roughly twenty elements wrong —
 * Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag, La, Ce, Gd, Pt, Au, Ac, Th, Pa, U, Np, Cm
 * and Lr all promote an electron out of the "expected" subshell because the
 * resulting half-filled or filled d/f subshell (or, for Lr, the relativistic
 * ordering of 7p below 6d) lowers the total energy. A rule-plus-exceptions
 * scheme would need the same twenty special cases as this table, just spread
 * across two places instead of one, so the table is both shorter and the
 * more honest representation: these are measured ground states, not derived
 * ones. Sourced against NIST's Ground Levels and Ionization Energies for the
 * Neutral Atoms (SRD 111) / the Atomic Spectra Database, cross-checked
 * element-by-element for the twenty exceptions above.
 *
 * Only l = 0..3 (s, p, d, f) and n = 1..7 appear anywhere in this table: no
 * ground-state neutral atom reaches g, and nothing here needs n > 7.
 */
export interface SubshellOccupancy {
    n: number;
    l: number;
    electrons: number;
}

export interface ShellOccupancy {
    n: number;
    electrons: number;
    subshells: SubshellOccupancy[];
}

const LETTER_TO_L: Record<string, number> = { s: 0, p: 1, d: 2, f: 3 };

// Atomic numbers of the six noble gases used as cores below, so a
// configuration can be written the way references write it — "[Kr] 4d5 5s1"
// for molybdenum — rather than repeated in full. Copying a core wrong is a
// much smaller and more visible mistake than re-deriving 36 electrons' worth
// of subshells by hand for every element that borrows one.
const NOBLE_GAS_CORE: Record<string, number> = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };

// One entry per Z = 1..118, index 0 = hydrogen. Each entry is either a full
// subshell list or "[core] subshells-beyond-the-core"; see NOBLE_GAS_CORE.
// prettier-ignore
const RAW_CONFIGURATIONS: string[] = [
    '1s1', '1s2',
    '[He] 2s1', '[He] 2s2', '[He] 2s2 2p1', '[He] 2s2 2p2', '[He] 2s2 2p3',
    '[He] 2s2 2p4', '[He] 2s2 2p5', '[He] 2s2 2p6',
    '[Ne] 3s1', '[Ne] 3s2', '[Ne] 3s2 3p1', '[Ne] 3s2 3p2', '[Ne] 3s2 3p3',
    '[Ne] 3s2 3p4', '[Ne] 3s2 3p5', '[Ne] 3s2 3p6',
    '[Ar] 4s1', '[Ar] 4s2',
    '[Ar] 3d1 4s2', '[Ar] 3d2 4s2', '[Ar] 3d3 4s2',
    '[Ar] 3d5 4s1',                    // Cr: half-filled 3d beats a full 4s.
    '[Ar] 3d5 4s2', '[Ar] 3d6 4s2', '[Ar] 3d7 4s2', '[Ar] 3d8 4s2',
    '[Ar] 3d10 4s1',                   // Cu: filled 3d beats a full 4s.
    '[Ar] 3d10 4s2',
    '[Ar] 3d10 4s2 4p1', '[Ar] 3d10 4s2 4p2', '[Ar] 3d10 4s2 4p3',
    '[Ar] 3d10 4s2 4p4', '[Ar] 3d10 4s2 4p5', '[Ar] 3d10 4s2 4p6',
    '[Kr] 5s1', '[Kr] 5s2',
    '[Kr] 4d1 5s2', '[Kr] 4d2 5s2',
    '[Kr] 4d4 5s1',                    // Nb
    '[Kr] 4d5 5s1',                    // Mo: half-filled 4d beats a full 5s.
    '[Kr] 4d5 5s2',
    '[Kr] 4d7 5s1',                    // Ru
    '[Kr] 4d8 5s1',                    // Rh
    '[Kr] 4d10',                       // Pd: filled 4d, empty 5s entirely.
    '[Kr] 4d10 5s1',                   // Ag: filled 4d beats a full 5s.
    '[Kr] 4d10 5s2',
    '[Kr] 4d10 5s2 5p1', '[Kr] 4d10 5s2 5p2', '[Kr] 4d10 5s2 5p3',
    '[Kr] 4d10 5s2 5p4', '[Kr] 4d10 5s2 5p5', '[Kr] 4d10 5s2 5p6',
    '[Xe] 6s1', '[Xe] 6s2',
    '[Xe] 5d1 6s2',                    // La: 5d starts before 4f.
    '[Xe] 4f1 5d1 6s2',                // Ce
    '[Xe] 4f3 6s2', '[Xe] 4f4 6s2', '[Xe] 4f5 6s2', '[Xe] 4f6 6s2', '[Xe] 4f7 6s2',
    '[Xe] 4f7 5d1 6s2',                // Gd: half-filled 4f keeps a 5d electron too.
    '[Xe] 4f9 6s2', '[Xe] 4f10 6s2', '[Xe] 4f11 6s2', '[Xe] 4f12 6s2',
    '[Xe] 4f13 6s2', '[Xe] 4f14 6s2',
    '[Xe] 4f14 5d1 6s2', '[Xe] 4f14 5d2 6s2', '[Xe] 4f14 5d3 6s2',
    '[Xe] 4f14 5d4 6s2', '[Xe] 4f14 5d5 6s2', '[Xe] 4f14 5d6 6s2', '[Xe] 4f14 5d7 6s2',
    '[Xe] 4f14 5d9 6s1',               // Pt: nearly-filled 5d beats a full 6s.
    '[Xe] 4f14 5d10 6s1',              // Au: filled 5d beats a full 6s.
    '[Xe] 4f14 5d10 6s2',
    '[Xe] 4f14 5d10 6s2 6p1', '[Xe] 4f14 5d10 6s2 6p2', '[Xe] 4f14 5d10 6s2 6p3',
    '[Xe] 4f14 5d10 6s2 6p4', '[Xe] 4f14 5d10 6s2 6p5', '[Xe] 4f14 5d10 6s2 6p6',
    '[Rn] 7s1', '[Rn] 7s2',
    '[Rn] 6d1 7s2',                    // Ac
    '[Rn] 6d2 7s2',                    // Th: 6d fills ahead of 5f entirely.
    '[Rn] 5f2 6d1 7s2',                // Pa
    '[Rn] 5f3 6d1 7s2',                // U
    '[Rn] 5f4 6d1 7s2',                // Np
    '[Rn] 5f6 7s2', '[Rn] 5f7 7s2',
    '[Rn] 5f7 6d1 7s2',                // Cm: half-filled 5f keeps a 6d electron too.
    '[Rn] 5f9 7s2', '[Rn] 5f10 7s2', '[Rn] 5f11 7s2', '[Rn] 5f12 7s2',
    '[Rn] 5f13 7s2', '[Rn] 5f14 7s2',
    '[Rn] 5f14 7s2 7p1',               // Lr: relativistic 7p sits below 6d here.
    '[Rn] 5f14 6d2 7s2', '[Rn] 5f14 6d3 7s2', '[Rn] 5f14 6d4 7s2',
    '[Rn] 5f14 6d5 7s2', '[Rn] 5f14 6d6 7s2', '[Rn] 5f14 6d7 7s2',
    '[Rn] 5f14 6d8 7s2', '[Rn] 5f14 6d9 7s2', '[Rn] 5f14 6d10 7s2',
    '[Rn] 5f14 6d10 7s2 7p1', '[Rn] 5f14 6d10 7s2 7p2', '[Rn] 5f14 6d10 7s2 7p3',
    '[Rn] 5f14 6d10 7s2 7p4', '[Rn] 5f14 6d10 7s2 7p5', '[Rn] 5f14 6d10 7s2 7p6',
];

function parseOwnSubshells(spec: string): SubshellOccupancy[] {
    return spec.split(/\s+/).filter(Boolean).map(token => {
        const match = /^(\d+)([a-z])(\d+)$/.exec(token);
        if (!match) throw new Error(`Unparseable subshell token "${token}" in electron configuration table.`);
        const l = LETTER_TO_L[match[2]];
        if (l === undefined) throw new Error(`Unknown subshell letter in "${token}".`);
        return { n: Number(match[1]), l, electrons: Number(match[3]) };
    });
}

/** Parses the whole table once, resolving each `[core]` reference against the configurations already built for lower Z. */
function buildConfigurations(): SubshellOccupancy[][] {
    const configurations: SubshellOccupancy[][] = [];
    for (const spec of RAW_CONFIGURATIONS) {
        const coreMatch = /^\[(\w+)\]\s*(.*)$/.exec(spec);
        const core = coreMatch ? configurations[NOBLE_GAS_CORE[coreMatch[1]] - 1] : [];
        const own = parseOwnSubshells(coreMatch ? coreMatch[2] : spec);
        const combined = [...core, ...own];
        combined.sort((a, b) => (a.n - b.n) || (a.l - b.l));
        configurations.push(combined);
    }
    return configurations;
}

const CONFIGURATIONS: SubshellOccupancy[][] = buildConfigurations();

/** The ground-state subshell occupancies for neutral atom Z, ordered by (n, l). */
export function configurationFor(Z: number): SubshellOccupancy[] {
    const configuration = CONFIGURATIONS[Z - 1];
    if (!configuration) throw new Error(`No electron configuration for Z=${Z}; expected 1..${MAX_ATOMIC_NUMBER}.`);
    return configuration;
}

/** The same occupancies grouped into shells, still ordered by n then l within each shell. */
export function shellsFor(Z: number): ShellOccupancy[] {
    const shells: ShellOccupancy[] = [];
    for (const subshell of configurationFor(Z)) {
        let shell = shells[shells.length - 1];
        if (!shell || shell.n !== subshell.n) {
            shell = { n: subshell.n, electrons: 0, subshells: [] };
            shells.push(shell);
        }
        shell.subshells.push(subshell);
        shell.electrons += subshell.electrons;
    }
    return shells;
}

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function superscript(value: number): string {
    return String(value).split('').map(digit => SUPERSCRIPT_DIGITS[Number(digit)]).join('');
}

/** e.g. (2, 1) -> "2p". */
export function subshellLabel(n: number, l: number): string {
    return `${n}${shellLetter(l)}`;
}

/** e.g. 6 -> "1s² 2s² 2p²". */
export function configurationLabel(Z: number): string {
    return configurationFor(Z)
        .map(subshell => `${subshellLabel(subshell.n, subshell.l)}${superscript(subshell.electrons)}`)
        .join(' ');
}
