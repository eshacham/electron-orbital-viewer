import React from 'react';
import { MAIN_TABLE, F_BLOCK_ROWS, BLOCK_COLORS, Tile } from '../periodic_table';
import './periodic_table_mini.css';

interface PeriodicTableMiniProps {
    /** The element currently being solved -- the cell this highlights. */
    Z: number;
    /** Its name, for the accessible name; the mini never spells out an ion or excitation (the table is per-element, not per-species). */
    name: string;
    /** Whether the big table is open, so this can report aria-expanded and shift its own highlight. */
    open: boolean;
    onToggle(): void;
}

/**
 * The "Periodic Table" button's replacement (ruling R23d): a miniature of
 * `PeriodicTable.tsx`'s own layout -- same 18 columns, same detached
 * f-block rows, same block colours (`BLOCK_COLORS`, the one source,
 * imported rather than restated) -- with the selected element's cell lit by
 * `selected-edge` (periodic_table_mini.css), so where the current element
 * sits is visible without opening the big table at all. Clicking it still
 * opens the big table; nothing about that behaviour changes, only that the
 * button showing it is now a picture of the thing it opens rather than
 * words naming it.
 *
 * One button, not 118 -- the miniature is too small to carry a tile's own
 * number and symbol legibly (spec §4.3's 11 px floor), so unlike
 * `PeriodicTable.tsx` the cells here are not independently interactive;
 * they are `aria-hidden`, and the one real control is the button around
 * them.
 */
const PeriodicTableMini: React.FC<PeriodicTableMiniProps> = ({ Z, name, open, onToggle }) => {
    const renderCell = (tile: Tile) => (
        <span
            key={tile.atomicNumber}
            className={['periodic-table-mini-cell', `block-${tile.block}`, tile.atomicNumber === Z ? 'selected' : '']
                .filter(Boolean).join(' ')}
            style={{ gridColumn: tile.group ?? (tile.fIndex ?? 0) + 3, borderColor: BLOCK_COLORS[tile.block] }}
            data-z={tile.atomicNumber}
        />
    );

    return (
        <button
            type="button"
            className="periodic-table-mini"
            aria-expanded={open}
            aria-controls="periodic-table-panel"
            aria-label={`Periodic table, ${name} selected — open`}
            onClick={onToggle}
        >
            <span className="periodic-table-mini-grid" aria-hidden="true">
                {MAIN_TABLE.map(renderCell)}
            </span>
            {F_BLOCK_ROWS.map((row, index) => (
                <span key={index} className="periodic-table-mini-grid periodic-table-mini-f-row" aria-hidden="true">
                    {row.map(renderCell)}
                </span>
            ))}
        </button>
    );
};

export default PeriodicTableMini;
