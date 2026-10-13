import React from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import GridOnOutlined from '@mui/icons-material/GridOnOutlined';
import { elementFor } from '../elements';
import { ATOMIC_WEIGHT_SOURCE, atomicWeightLabel } from '../atomic_weights';
import { isNeutralGround, speciesSymbol, type AtomSpecies } from '../atom/species';
import './element_tile.css';

interface ElementTileProps {
    species: AtomSpecies;
    tableOpen: boolean;
    /** The tile itself opens the periodic table (it is "the way to change" the element). */
    onOpenTable(): void;
    onToggleTable(): void;
    /** ▾: the searchable list as a popover under the tile. */
    onOpenList(anchor: HTMLElement): void;
}

/**
 * The element tile (spec §9.1): Z top-left, the electron count top-right
 * ("11 / 10 e⁻" reads an ion), the symbol with any charge, the name and the
 * standard atomic weight.
 */
const ElementTile: React.FC<ElementTileProps> = ({ species, tableOpen, onOpenTable, onToggleTable, onOpenList }) => {
    const element = elementFor(species.Z);
    const name = element?.name ?? `Z = ${species.Z}`;
    // The charge only: an excitation is not part of a symbol.
    const symbol = speciesSymbol({ ...species, excitation: null });
    // Ruling M10 (controller ruling DB7): the name names any species that is
    // not the plain element -- an ion ("Na⁺ · Sodium") or an excited atom
    // ("Na* · Sodium") -- as LevelNav's element button did.
    const spokenName = isNeutralGround(species) ? name : `${speciesSymbol(species)} · ${name}`;
    return (
        <div className="element-header">
            <div className="element-header-row">
                <span className="ql-section">Element</span>
                <Tooltip title="Choose an element from a list">
                    <IconButton className="ql-icon-button" size="small" aria-label="Choose an element from a list"
                        onClick={event => onOpenList(event.currentTarget)}>
                        <ExpandMore fontSize="small" />
                    </IconButton>
                </Tooltip>
            </div>
            <div className="element-header-body">
                <button
                    type="button"
                    className="element-tile"
                    title={ATOMIC_WEIGHT_SOURCE}
                    aria-label={`change element, currently ${spokenName}`}
                    onClick={onOpenTable}
                >
                    <span className="element-tile-z ql-tabular">{species.Z}</span>
                    <span className="element-tile-electrons ql-tabular">{species.Z - species.charge} e⁻</span>
                    <span className="element-tile-symbol">{symbol}</span>
                    <span className="element-tile-name">{name}</span>
                    <span className="element-tile-weight ql-tabular">{atomicWeightLabel(species.Z)}</span>
                </button>
                <Button variant="outlined" size="small" className="element-table-button" startIcon={<GridOnOutlined fontSize="small" />}
                    aria-pressed={tableOpen} onClick={onToggleTable}>
                    Periodic Table
                </Button>
            </div>
        </div>
    );
};

export default ElementTile;
