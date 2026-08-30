import {
    PERIODIC_TABLE,
    MAIN_TABLE,
    F_BLOCK_ROWS,
    BLOCK_COLORS,
    blockFor,
    groupFor,
    tileOf,
    occupiesItsBlockSubshell,
} from '../src/periodic_table';
import { MAX_ATOMIC_NUMBER } from '../src/elements';
import { configurationFor } from '../src/atom/configurations';

describe('periodic table layout', () => {
    it('places every element exactly once', () => {
        expect(PERIODIC_TABLE).toHaveLength(MAX_ATOMIC_NUMBER);
        expect(PERIODIC_TABLE.map(t => t.atomicNumber)).toEqual(
            Array.from({ length: MAX_ATOMIC_NUMBER }, (_, i) => i + 1)
        );
        expect(MAIN_TABLE.length + F_BLOCK_ROWS.flat().length).toBe(MAX_ATOMIC_NUMBER);
    });

    it('puts hydrogen and helium at the two ends of period 1', () => {
        expect(tileOf(1)).toMatchObject({ period: 1, group: 1 });
        expect(tileOf(2)).toMatchObject({ period: 1, group: 18 });
    });

    it('leaves the period-2 and period-3 d-block gap empty', () => {
        // Beryllium is group 2, boron group 13 -- nothing between them.
        expect(groupFor(4)).toBe(2);
        expect(groupFor(5)).toBe(13);
        expect(MAIN_TABLE.filter(t => t.period === 2)).toHaveLength(8);
        expect(MAIN_TABLE.filter(t => t.period === 3)).toHaveLength(8);
    });

    it('fills periods 4 and 5 across all eighteen groups', () => {
        for (const period of [4, 5]) {
            const row = MAIN_TABLE.filter(t => t.period === period);
            expect(row).toHaveLength(18);
            expect(row.map(t => t.group)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
        }
    });

    it('detaches the lanthanides and actinides into two fifteen-wide rows, leaving group 3 empty in periods 6 and 7', () => {
        expect(F_BLOCK_ROWS).toHaveLength(2);
        expect(F_BLOCK_ROWS[0].map(t => t.atomicNumber)).toEqual(
            Array.from({ length: 15 }, (_, i) => 57 + i)
        );
        expect(F_BLOCK_ROWS[1].map(t => t.atomicNumber)).toEqual(
            Array.from({ length: 15 }, (_, i) => 89 + i)
        );
        for (const period of [6, 7]) {
            expect(MAIN_TABLE.find(t => t.period === period && t.group === 3)).toBeUndefined();
        }
        // The main row resumes at hafnium / rutherfordium, in group 4.
        expect(tileOf(72)).toMatchObject({ period: 6, group: 4 });
        expect(tileOf(104)).toMatchObject({ period: 7, group: 4 });
        expect(tileOf(118)).toMatchObject({ period: 7, group: 18 });
    });

    it('never places two elements in the same cell', () => {
        const cells = MAIN_TABLE.map(t => `${t.period}:${t.group}`);
        expect(new Set(cells).size).toBe(cells.length);
    });
});

describe('blocks', () => {
    it('classifies the canonical members of each block', () => {
        expect(blockFor(3)).toBe('s');   // lithium
        expect(blockFor(2)).toBe('s');   // helium: group 18 by chemistry, 1s² by configuration
        expect(blockFor(9)).toBe('p');   // fluorine
        expect(blockFor(26)).toBe('d');  // iron
        expect(blockFor(30)).toBe('d');  // zinc: differentiating electron is 4s, but its row fills 3d
        expect(blockFor(31)).toBe('p');  // gallium
        expect(blockFor(64)).toBe('f');  // gadolinium
        expect(blockFor(92)).toBe('f');  // uranium
    });

    it('gives every block a colour', () => {
        for (const tile of PERIODIC_TABLE) {
            expect(BLOCK_COLORS[tile.block]).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    /**
     * The honest half of Addendum 3's claim that a tile's colour predicts
     * the shapes the composition view will show. Asserted against the
     * engine's own configuration table, not against a second copy of the
     * layout.
     */
    it('every element occupies a subshell of its own block\'s l, apart from one named ground-state exception', () => {
        const exceptions = PERIODIC_TABLE
            .filter(t => !occupiesItsBlockSubshell(t.atomicNumber))
            .map(t => t.atomicNumber);
        // Lanthanum alone: [Xe] 5d¹ 6s², the first tile of the lanthanide
        // row and with no f electron anywhere in its ground state. Actinium
        // and thorium are also 6d-differentiated, but they carry the radon
        // core's own 4f¹⁴ -- so an f-coloured tile still correctly predicts
        // f orbitals in their composition view. Real chemistry, and exactly
        // why the block is not computed from the configuration (blockFor).
        expect(exceptions).toEqual([57]);
    });

    it('no d-block element is without an occupied d subshell', () => {
        for (const tile of PERIODIC_TABLE.filter(t => t.block === 'd')) {
            expect(configurationFor(tile.atomicNumber).some(s => s.l === 2 && s.electrons > 0)).toBe(true);
        }
    });

    it('no p-block element is without an occupied p subshell', () => {
        for (const tile of PERIODIC_TABLE.filter(t => t.block === 'p')) {
            expect(configurationFor(tile.atomicNumber).some(s => s.l === 1 && s.electrons > 0)).toBe(true);
        }
    });
});

describe('columns', () => {
    it('gives every member of a group the same column key', () => {
        // The alkali metals: Li, Na, K, Rb, Cs, Fr -- all ns¹, all group 1.
        const alkali = [3, 11, 19, 37, 55, 87].map(z => tileOf(z)!.columnKey);
        expect(new Set(alkali).size).toBe(1);
        // The halogens are a different column from them.
        expect(tileOf(9)!.columnKey).not.toBe(tileOf(3)!.columnKey);
        expect(tileOf(9)!.columnKey).toBe(tileOf(17)!.columnKey);
    });

    it('pairs each lanthanide with the actinide below it, since the detached rows have no IUPAC groups', () => {
        // Cerium with thorium, praseodymium with protactinium, and so on.
        expect(tileOf(58)!.columnKey).toBe(tileOf(90)!.columnKey);
        expect(tileOf(59)!.columnKey).toBe(tileOf(91)!.columnKey);
        expect(tileOf(58)!.columnKey).not.toBe(tileOf(59)!.columnKey);
    });
});
