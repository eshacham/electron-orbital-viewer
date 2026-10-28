import React, { useRef, useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography, Alert } from '@mui/material';
import {
    AtomSpecies, Excitation, SubshellRef, excitationSources, excitationTargets, excitationLabel, speciesSymbol,
} from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import { atLeast, CONTROL_LEVEL, LearningLevel } from '../levels/levels';

interface SpeciesControlsProps {
    species: AtomSpecies;
    onChargeChange: (charge: number) => void;
    onExcitationChange: (excitation: Excitation | null) => void;
    unbound: string | null;
    /**
     * Task 2: the learning level in use. The Charge and Excite rows appear at Advanced -- hidden below it. Omitted,
     * everything shows.
     */
    level?: LearningLevel;
}

const sameRef = (a: SubshellRef, b: SubshellRef): boolean => a.n === b.n && a.l === b.l;

/**
 * Charge and excitation for atom mode (spec §5 Phase 3). Task 9b: the energy that describes them, with its method
 * (ΔSCF), NIST comparison and limitation note, and the size comparison against the neutral atom, is said in Info
 * (atomInfo) alone. Presentational: every change goes out through a callback.
 */
const SpeciesControls: React.FC<SpeciesControlsProps> = ({
    species, onChargeChange, onExcitationChange, unbound, level = 'research',
}) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const decreaseRef = useRef<HTMLButtonElement>(null);
    const increaseRef = useRef<HTMLButtonElement>(null);
    const charges = allowedCharges(species.Z);
    const neutralSymbol = speciesSymbol({ Z: species.Z, charge: 0, excitation: null });
    const sources = excitationSources(species.Z, species.charge);
    const options = sources.flatMap(from => excitationTargets(species.Z, species.charge, from).map(to => ({ from, to })));

    const excitePopupOpen = menuAnchor !== null;
    const isCurrentOption = (option: Excitation) =>
        !!species.excitation && sameRef(option.from, species.excitation.from) && sameRef(option.to, species.excitation.to);

    // Ruling M7: a disabled button cannot keep the focus a keyboard user left
    // it with. Each handler already knows, from the value it is about to
    // send, whether it is stepping onto the limit -- so it moves focus to
    // the other stepper button itself rather than leaving it to fall back to
    // the document body.
    const handleDecrease = () => {
        const next = species.charge - 1;
        onChargeChange(next);
        if (next <= charges[0]) increaseRef.current?.focus();
    };
    const handleIncrease = () => {
        const next = species.charge + 1;
        onChargeChange(next);
        if (next >= charges[charges.length - 1]) decreaseRef.current?.focus();
    };

    return (
        <Box className="species-controls" role="group" aria-label="ion and excitation">
            {atLeast(level, CONTROL_LEVEL.charge) && (
                <Box className="species-charge-row">
                    <Typography variant="body2" component="span">Charge</Typography>
                    {/* No ripple: the theme's MuiButtonBase ring (focus-ring token, §13) shows keyboard focus. */}
                    <Button ref={decreaseRef} size="small" disableRipple aria-label="decrease charge" disabled={species.charge <= charges[0]}
                        onClick={handleDecrease}>−</Button>
                    <span className="species-charge-value" aria-label="charge" role="status">
                        {species.charge === 0 ? `${neutralSymbol} (neutral)` : speciesSymbol({ ...species, excitation: null })}
                    </span>
                    <Button ref={increaseRef} size="small" disableRipple aria-label="increase charge" disabled={species.charge >= charges[charges.length - 1]}
                        onClick={handleIncrease}>+</Button>
                </Box>
            )}

            {atLeast(level, CONTROL_LEVEL.excite) && (
                <Box className="species-excite-row">
                    {/* No aria-label here (WCAG 2.5.3, Label in Name): the
                        accessible name must contain the visible label, and the
                        visible label already says everything a hidden one would
                        duplicate. */}
                    <Button
                        id="species-excite-button"
                        size="small"
                        variant="outlined"
                        disabled={options.length === 0}
                        aria-haspopup="menu"
                        aria-expanded={excitePopupOpen}
                        aria-controls={excitePopupOpen ? 'species-excite-menu' : undefined}
                        onClick={event => setMenuAnchor(event.currentTarget)}
                    >
                        {species.excitation ? `Excited ${excitationLabel(species.excitation)} ▾` : 'Excite: promote one electron to… ▾'}
                    </Button>
                    <Menu
                        anchorEl={menuAnchor}
                        open={excitePopupOpen}
                        onClose={() => setMenuAnchor(null)}
                        MenuListProps={{ id: 'species-excite-menu', 'aria-label': 'Promote one electron to…' }}
                    >
                        {options.map(option => (
                            <MenuItem
                                key={excitationLabel(option)}
                                selected={isCurrentOption(option)}
                                aria-current={isCurrentOption(option) ? 'true' : undefined}
                                onClick={() => { setMenuAnchor(null); onExcitationChange(option); }}
                            >
                                {excitationLabel(option)}
                            </MenuItem>
                        ))}
                        {species.excitation && (
                            <MenuItem onClick={() => { setMenuAnchor(null); onExcitationChange(null); }}>Back to the ground state</MenuItem>
                        )}
                    </Menu>
                </Box>
            )}

            {/* Task 9b (finish review, fix 2): the energy -- ionisation or excitation, its value, its failure -- has one
                home, Info's fact (atomInfo); the panel keeps the controls. */}
            {unbound && <Alert severity="warning" role="alert" className="species-unbound">{unbound}</Alert>}
        </Box>
    );
};

export default SpeciesControls;
