import React, { useState } from 'react';
import { Box, Button, Collapse, Typography } from '@mui/material';
import {
    MAIN_TABLE,
    F_BLOCK_ROWS,
    BLOCK_COLORS,
    BLOCK_LABELS,
    Block,
    Tile,
    tileOf,
} from '../periodic_table';
import { elementFor } from '../elements';

interface PeriodicTableProps {
    /** The element currently being solved. */
    Z: number;
    onSelect: (Z: number) => void;
}

const BLOCK_ORDER: Block[] = ['s', 'p', 'd', 'f'];

/**
 * The element selector as a real periodic table (Addendum 3), replacing the
 * 118-item dropdown on anything wider than a phone.
 *
 * Coloured by **block**, not by chemical family. Blocks are what the engine
 * computes with — the block names which subshell type a row is filling, so
 * a d-block tile says "this element's shells contain cloverleaves" and an
 * f-block tile says "seven-lobed shapes here". Chemical families (alkali
 * metal, halogen, …) are an external taxonomy the app does not calculate,
 * and colouring by them would be decoration bolted onto physics rather than
 * an expression of it (spec §7). See `periodic_table.ts`'s `blockFor` for
 * the one place that claim is qualified, and its test for how it is checked.
 *
 * Hovering or selecting a tile lights its whole column, because a group
 * *is* a column precisely in that its members share a valence
 * configuration: Li/Na/K all ns¹, F/Cl/Br all ns²np⁵. Lighting the column
 * while the composition view shows that valence shell is what makes "why
 * does this belong to a family" visible rather than asserted.
 */
const PeriodicTable: React.FC<PeriodicTableProps> = ({ Z, onSelect }) => {
    const [open, setOpen] = useState(true);
    const [hovered, setHovered] = useState<number | null>(null);

    const selectedTile = tileOf(Z);
    // The column the highlight follows: whatever is under the pointer, or
    // the selection when nothing is.
    const activeColumn = (hovered !== null ? tileOf(hovered) : selectedTile)?.columnKey ?? null;
    const element = elementFor(Z);

    const renderTile = (tile: Tile) => {
        const tileElement = elementFor(tile.atomicNumber);
        const isSelected = tile.atomicNumber === Z;
        const inColumn = activeColumn !== null && tile.columnKey === activeColumn;
        return (
            <button
                key={tile.atomicNumber}
                type="button"
                className={[
                    'periodic-tile',
                    `block-${tile.block}`,
                    isSelected ? 'selected' : '',
                    inColumn ? 'in-column' : '',
                ].filter(Boolean).join(' ')}
                style={{
                    // Positioned by group and period rather than by document
                    // order, so the empty cells of periods 1-3 and the
                    // detached rows' gap need no filler elements.
                    // The detached rows are indented to start under group
                    // 3 -- the empty cell they were lifted out of -- so the
                    // gap in periods 6 and 7 visibly points at them.
                    gridColumn: tile.group ?? (tile.fIndex ?? 0) + 3,
                    borderColor: BLOCK_COLORS[tile.block],
                }}
                data-z={tile.atomicNumber}
                data-block={tile.block}
                aria-pressed={isSelected}
                aria-label={`${tileElement?.name ?? tile.atomicNumber} (${tile.block}-block)`}
                onClick={() => {
                    onSelect(tile.atomicNumber);
                    // Folds to its header once a choice is made, like a
                    // dropdown closing: open, the table covers the top third
                    // of the view and the atom has to shrink to fit below it.
                    // The header keeps the element and the way back in.
                    setOpen(false);
                }}
                onMouseEnter={() => setHovered(tile.atomicNumber)}
                onMouseLeave={() => setHovered(current => (current === tile.atomicNumber ? null : current))}
                onFocus={() => setHovered(tile.atomicNumber)}
                onBlur={() => setHovered(current => (current === tile.atomicNumber ? null : current))}
            >
                <span className="periodic-tile-number">{tile.atomicNumber}</span>
                <span className="periodic-tile-symbol">{tileElement?.symbol ?? '?'}</span>
            </button>
        );
    };

    return (
        <Box className="periodic-table-panel" aria-label="periodic table">
            <Box className="periodic-table-header">
                <Typography variant="body2" className="periodic-table-current">
                    {element ? `${element.atomicNumber} — ${element.symbol} (${element.name})` : `Z = ${Z}`}
                    {selectedTile ? ` · ${BLOCK_LABELS[selectedTile.block]}` : ''}
                </Typography>
                <Button
                    size="small"
                    className="periodic-table-toggle"
                    onClick={() => setOpen(value => !value)}
                    aria-expanded={open}
                >
                    {open ? 'Hide table' : 'Change element'}
                </Button>
            </Box>

            <Collapse in={open}>
                <div className="periodic-table-grid" role="group" aria-label="elements">
                    {MAIN_TABLE.map(renderTile)}
                </div>
                {F_BLOCK_ROWS.map((row, index) => (
                    <div
                        key={index}
                        className="periodic-table-grid periodic-table-f-row"
                        role="group"
                        aria-label={index === 0 ? 'lanthanides' : 'actinides'}
                    >
                        {row.map(renderTile)}
                    </div>
                ))}
                <div className="periodic-table-legend">
                    {BLOCK_ORDER.map(block => (
                        <span key={block} className="periodic-table-legend-item">
                            <span
                                className="periodic-table-legend-swatch"
                                style={{ background: BLOCK_COLORS[block] }}
                            />
                            {BLOCK_LABELS[block]}
                        </span>
                    ))}
                    <span className="periodic-table-legend-note">
                        the subshell each row fills — and the shapes its shells contain
                    </span>
                </div>
            </Collapse>
        </Box>
    );
};

export default PeriodicTable;
