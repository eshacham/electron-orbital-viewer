import React from 'react';
import { Chip } from '@mui/material';
import BondsPanel, { BondsPanelProps } from '../components/BondsPanel';
import { BONDS_SYSTEMS, bondOrderSelectText } from '../bonds/systems';
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
    const { bonds } = props;
    const system = BONDS_SYSTEMS.find(s => s.id === bonds.system)!;
    return (
        <div className="bonds-explore">
            <div className="bonds-tile">
                <div className="bonds-tile-formula">{system.formula}</div>
                <div className="bonds-tile-name">{system.name}</div>
                <div className="bonds-tile-group">{system.group}</div>
                <div className="bonds-tile-order">{bondOrderSelectText(system.id)}</div>
                {/* WCAG 2.5.3: the accessible name contains the visible label ("exact"). */}
                {system.id === 'h2plus' && (
                    <Chip size="small" color="success" label="exact" aria-label="exact solution" className="bonds-tile-chip" />
                )}
            </div>
            <BondsPanel {...props} />
        </div>
    );
};

export default BondsExplore;
