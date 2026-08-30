/**
 * Layout and block classification for the periodic-table selector
 * (Addendum 3).
 *
 * Two things live here and nothing else: where each element sits in the
 * standard 18-column table, and which block it belongs to. Both are pure
 * data over atomic number, so the component that draws the table stays
 * presentational and both are testable without rendering anything.
 */
import { MAX_ATOMIC_NUMBER } from './elements';
import { configurationFor } from './atom/configurations';

export type Block = 's' | 'p' | 'd' | 'f';

/**
 * Colour per block. Deliberately not `CURVE_COLORS`: that palette means
 * "which n", and reusing it here would imply a correspondence between a
 * tile's colour and a shell's colour in the 3D view that does not exist.
 * Blocks are about l, shells are about n.
 */
export const BLOCK_COLORS: Record<Block, string> = {
    s: '#5b8dd9',
    p: '#d98b4a',
    d: '#4aa88a',
    f: '#9d7ad4',
};

export const BLOCK_LABELS: Record<Block, string> = {
    s: 's-block',
    p: 'p-block',
    d: 'd-block',
    f: 'f-block',
};

/** Where one element sits, and what it is. */
export interface Tile {
    atomicNumber: number;
    /** 1-7. For an f-row element this is the period its row hangs below (6 or 7). */
    period: number;
    /** 1-18 for a main-table element; null for the detached lanthanide/actinide rows, which sit outside the 18 groups. */
    group: number | null;
    /** 0-14 along its detached row, or null for a main-table element. */
    fIndex: number | null;
    block: Block;
    /**
     * What "the same column" means for this tile — the unit the selector
     * highlights (Addendum 3: "a group *is* a column precisely because its
     * members share a valence configuration"). Group number for the main
     * table; position along the detached row for the lanthanides and
     * actinides, which is the same analogy one row down (Ce with Th, Pr
     * with Pa) even though those positions are not IUPAC groups.
     */
    columnKey: string;
}

/** The detached rows, in full: La–Lu and Ac–Lr, fifteen wide each. */
const F_ROWS: Array<{ period: number; start: number }> = [
    { period: 6, start: 57 },
    { period: 7, start: 89 },
];
const F_ROW_LENGTH = 15;

/** Which main-table groups each period occupies, and the atomic number the run starts at. */
const MAIN_RUNS: Array<{ period: number; firstGroup: number; lastGroup: number; start: number }> = [
    { period: 1, firstGroup: 1, lastGroup: 1, start: 1 },     // H
    { period: 1, firstGroup: 18, lastGroup: 18, start: 2 },   // He
    { period: 2, firstGroup: 1, lastGroup: 2, start: 3 },
    { period: 2, firstGroup: 13, lastGroup: 18, start: 5 },
    { period: 3, firstGroup: 1, lastGroup: 2, start: 11 },
    { period: 3, firstGroup: 13, lastGroup: 18, start: 13 },
    { period: 4, firstGroup: 1, lastGroup: 18, start: 19 },
    { period: 5, firstGroup: 1, lastGroup: 18, start: 37 },
    { period: 6, firstGroup: 1, lastGroup: 2, start: 55 },
    // Group 3 of periods 6 and 7 is left empty: its fifteen occupants are in
    // the detached rows below, which is how a printed table handles them.
    { period: 6, firstGroup: 4, lastGroup: 18, start: 72 },
    { period: 7, firstGroup: 1, lastGroup: 2, start: 87 },
    { period: 7, firstGroup: 4, lastGroup: 18, start: 104 },
];

function fRowIndexOf(atomicNumber: number): { period: number; fIndex: number } | null {
    for (const row of F_ROWS) {
        const offset = atomicNumber - row.start;
        if (offset >= 0 && offset < F_ROW_LENGTH) return { period: row.period, fIndex: offset };
    }
    return null;
}

/**
 * Which block an element belongs to: the subshell type being filled across
 * its row, which is what "block" means and what makes the table's rows
 * rows.
 *
 * Derived from table position rather than from `configurationFor(Z)`
 * directly, and the reason is recorded because the spec asked for the
 * opposite. Every configuration-based rule tried misclassifies the same
 * handful of elements, because their ground states are aufbau exceptions:
 * lanthanum (5d¹ 6s², the first lanthanide, with no f electron at all),
 * actinium and thorium likewise sit in the f rows with a d differentiating
 * electron, while zinc's is 4s and it is unambiguously d-block. Those
 * exceptions are real chemistry, not a defect in the table, and
 * `periodic_table.test.ts` asserts the relationship in the direction that
 * does hold: every d-block element has an occupied d subshell, every
 * p-block element an occupied p subshell, and every element bar lanthanum
 * occupies a subshell of its own block's l. The configuration is what the
 * claim is checked against; it is just not what the claim is computed
 * from.
 */
export function blockFor(atomicNumber: number): Block {
    if (fRowIndexOf(atomicNumber)) return 'f';
    // Helium is group 18 by its chemistry (a closed shell, hence a noble
    // gas) but 1s² by its configuration: there is no 1p for it to be in.
    if (atomicNumber === 2) return 's';
    const group = groupFor(atomicNumber);
    if (group === null) return 's';
    if (group <= 2) return 's';
    if (group <= 12) return 'd';
    return 'p';
}

/** The IUPAC group (column) of a main-table element, or null for the detached rows. */
export function groupFor(atomicNumber: number): number | null {
    if (fRowIndexOf(atomicNumber)) return null;
    for (const run of MAIN_RUNS) {
        const span = run.lastGroup - run.firstGroup + 1;
        const offset = atomicNumber - run.start;
        if (offset >= 0 && offset < span) return run.firstGroup + offset;
    }
    return null;
}

function tileFor(atomicNumber: number): Tile {
    const fRow = fRowIndexOf(atomicNumber);
    if (fRow) {
        return {
            atomicNumber,
            period: fRow.period,
            group: null,
            fIndex: fRow.fIndex,
            block: 'f',
            columnKey: `f${fRow.fIndex}`,
        };
    }
    const group = groupFor(atomicNumber);
    const run = MAIN_RUNS.find(r => {
        const span = r.lastGroup - r.firstGroup + 1;
        const offset = atomicNumber - r.start;
        return offset >= 0 && offset < span;
    });
    return {
        atomicNumber,
        period: run ? run.period : 1,
        group,
        fIndex: null,
        block: blockFor(atomicNumber),
        columnKey: group === null ? `z${atomicNumber}` : `g${group}`,
    };
}

/** Every element, in atomic-number order, with its position and block. */
export const PERIODIC_TABLE: Tile[] =
    Array.from({ length: MAX_ATOMIC_NUMBER }, (_, i) => tileFor(i + 1));

export function tileOf(atomicNumber: number): Tile | null {
    return PERIODIC_TABLE[atomicNumber - 1] ?? null;
}

/** The main 18-column grid, excluding the detached rows. */
export const MAIN_TABLE: Tile[] = PERIODIC_TABLE.filter(tile => tile.group !== null);

/** The two detached rows, in order (lanthanides then actinides). */
export const F_BLOCK_ROWS: Tile[][] = F_ROWS.map(row =>
    PERIODIC_TABLE.filter(tile => tile.fIndex !== null && tile.period === row.period)
);

/**
 * Whether this element's ground state actually occupies a subshell of its
 * block's l — the honest half of the block claim, exposed so the test can
 * assert it and so a caption can say what a colour means. See `blockFor`
 * for the three elements where the answer is legitimately "no".
 */
export function occupiesItsBlockSubshell(atomicNumber: number): boolean {
    const l = { s: 0, p: 1, d: 2, f: 3 }[blockFor(atomicNumber)];
    return configurationFor(atomicNumber).some(subshell => subshell.l === l && subshell.electrons > 0);
}
