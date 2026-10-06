import React from 'react';
import { FormControlLabel, FormGroup, Switch, Typography } from '@mui/material';

interface MoleculeViewOptionsProps {
    showStructure: boolean; showDipole: boolean;
    onShowStructure: (on: boolean) => void; onShowDipole: (on: boolean) => void;
    dipoleText: string | null;
    /**
     * Ruling T7-O3: a documented exception to "every number states its
     * method" (ozone's multireference dipole, from `meta.caveat`). When
     * given alongside `dipoleText`, it is shown right beside it -- the
     * dipole is never shown without it.
     */
    caveat?: string | null;
}

/** Molecule-only view settings, shown inside Controls in the right-hand column / View tab. */
const MoleculeViewOptions: React.FC<MoleculeViewOptionsProps> = ({ showStructure, showDipole, onShowStructure, onShowDipole, dipoleText, caveat }) => (
    <FormGroup className="molecule-view-options">
        <FormControlLabel control={<Switch size="small" checked={showStructure} onChange={e => onShowStructure(e.target.checked)} />} label="Ball-and-stick" />
        <FormControlLabel control={<Switch size="small" checked={showDipole} onChange={e => onShowDipole(e.target.checked)} />} label="Dipole arrow" />
        {dipoleText && (
            <Typography variant="body2">
                {dipoleText}{caveat ? ` — ${caveat}` : ''}
            </Typography>
        )}
        <Typography variant="caption" className="molecule-caption">
            The arrow points from − to + (the physics convention), 1 a₀ per debye; many chemistry texts draw it the other way.
        </Typography>
    </FormGroup>
);

export default MoleculeViewOptions;
