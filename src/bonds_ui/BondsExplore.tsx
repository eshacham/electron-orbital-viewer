import React from 'react';
import { Chip } from '@mui/material';
import BondsPanel, { BondsPanelProps } from '../components/BondsPanel';
import { BONDS_SYSTEMS, bondOrderSelectText } from '../bonds/systems';
import InfoButton from '../info/InfoButton';
import './bonds_explore.css';

/**
 * Bonds mode's Explore panel (spec §9.3, Phase 6G-2 Task 9): a header tile
 * naming the current system -- formula, name, the bond-type group it is
 * listed under (ruling R23e's grouped select), and its textbook bond order,
 * with an "exact" chip for H₂⁺ (the one system solved here rather than
 * precomputed) -- above BondsPanel's own navigation, unchanged (the System
 * select, R, the Show switch and the titled MO list). The frontier line,
 * caveats and methods list move out of here into the inspector's Data tab
 * (BondsInspector): "where this comes from" belongs with the rest of the
 * view's data, not the panel that chooses what to draw.
 */
const BondsExplore: React.FC<BondsPanelProps> = props => {
    const { bonds, lengthFirst = false } = props;
    const system = BONDS_SYSTEMS.find(s => s.id === bonds.system)!;
    const tile = (
        <div className="bonds-tile">
            <div className="bonds-tile-formula">{system.formula}</div>
            <div className="bonds-tile-name">{system.name}</div>
            <div className="bonds-tile-group">{system.group}</div>
            {/* Task 7a: an (i) beside the bond order opens its glossary entry; Info's fact gives the number counted. */}
            <div className="bonds-tile-order">
                <span>{bondOrderSelectText(system.id)}</span>
                <InfoButton topic="bondOrder" label="Bond order" />
            </div>
            {/* WCAG 2.5.3: the accessible name contains the visible label ("exact"). */}
            {system.id === 'h2plus' && (
                <Chip size="small" variant="outlined" label="exact" aria-label="exact solution" className="bonds-tile-chip neutral-chip" />
            )}
        </div>
    );
    // Task 5b (picture control, finish fix 1): on a phone (`lengthFirst`) the Bond length block leads, and the card
    // follows it inside the panel, above the select; on the desktop the card heads the column as before.
    return (
        <div className="bonds-explore">
            {lengthFirst ? <BondsPanel {...props} lead={tile} /> : <>{tile}<BondsPanel {...props} /></>}
        </div>
    );
};

export default BondsExplore;
