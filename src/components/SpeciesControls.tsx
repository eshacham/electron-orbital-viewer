import React, { useRef, useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography, Alert } from '@mui/material';
import {
    AtomSpecies, Excitation, SubshellRef, excitationSources, excitationTargets, excitationLabel, speciesSymbol, speciesKey,
} from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import type { EnergyReading } from '../atom/delta_scf';
import type { EnergiesState } from '../store/atomSlice';
import { atLeast, CONTROL_LEVEL, IE_LEVEL, LearningLevel } from '../levels/levels';
import { energyValueText, ionisationLabelOf, ionisationNoValueReason } from '../atom/atom_text';
import InfoButton from '../info/InfoButton';

interface SpeciesControlsProps {
    species: AtomSpecies;
    onChargeChange: (charge: number) => void;
    onExcitationChange: (excitation: Excitation | null) => void;
    energies: EnergiesState;
    unbound: string | null;
    /** The species' picture solve failed, so the energies, which wait for it (ruling C15), will never start. */
    pictureFailed?: boolean;
    /**
     * Task 2: the learning level in use. The Charge and Excite rows appear at Advanced -- hidden below it. Task 6:
     * so does the energy line, a short labelled value (IE_LEVEL); its method, NIST comparison, limitation note and
     * the size comparison are Info's. Omitted, everything shows.
     */
    level?: LearningLevel;
}

const NO_ENERGIES: EnergiesState = { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null };

const sameRef = (a: SubshellRef, b: SubshellRef): boolean => a.n === b.n && a.l === b.l;

/**
 * "Ionisation energy (Na → Na⁺): 5.37 eV" with an (i) -- Task 6: a short labelled value. Its method, NIST measurement,
 * signed difference and limitation note are said in Info (atomInfo), from the same reading.
 */
const EnergyLine: React.FC<{
    label: string; reading: EnergyReading | null; status: EnergiesState['status']; noValueReason?: string; pictureFailed?: boolean; isExcitation?: boolean;
}> =
    ({ label, reading, status, noValueReason, pictureFailed, isExcitation }) => (
        <Typography variant="body2" component="div" className="species-energy">
            <span>
                {label}:{' '}
                {energyValueText(reading, status, noValueReason, pictureFailed, isExcitation)}
            </span>
            {!isExcitation && <InfoButton topic="ionisation" label="Ionisation energy" />}
        </Typography>
    );

/**
 * Charge and excitation for atom mode (spec §5 Phase 3), with the energy
 * that describes them as a short labelled value. Task 6: the energy's method
 * (ΔSCF), its NIST comparison and limitation note, and the size comparison
 * against the neutral atom are said in Info (atomInfo). Presentational:
 * every change goes out through a callback.
 */
const SpeciesControls: React.FC<SpeciesControlsProps> = ({
    species, onChargeChange, onExcitationChange, energies, unbound, pictureFailed = false, level = 'research',
}) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const decreaseRef = useRef<HTMLButtonElement>(null);
    const increaseRef = useRef<HTMLButtonElement>(null);
    const charges = allowedCharges(species.Z);
    const neutralSymbol = speciesSymbol({ Z: species.Z, charge: 0, excitation: null });
    const sources = excitationSources(species.Z, species.charge);
    const options = sources.flatMap(from => excitationTargets(species.Z, species.charge, from).map(to => ({ from, to })));
    const showEnergy = atLeast(level, IE_LEVEL);

    // Ruling C5: a reply already in flight (or left behind by a fast
    // stepper) can describe a species no longer selected -- SpeciesControls
    // guards this itself, the same check `selectSpeciesEnergies` makes at
    // the store boundary, rather than trusting every future caller to pass
    // a pre-filtered `energies` (Task 12 wires the store; this component
    // must still be correct if it is ever handed the raw slice).
    const energiesMatch = energies.speciesKey === speciesKey(species);
    const effectiveEnergies = energiesMatch ? energies : NO_ENERGIES;
    const reading = species.excitation ? effectiveEnergies.excitation : effectiveEnergies.ionisation;

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

            {unbound ? (
                <Alert severity="warning" role="alert" className="species-unbound">{unbound}</Alert>
            ) : (
                <>
                    {showEnergy && (species.excitation ? (
                        <EnergyLine
                            label={`Excitation energy ${excitationLabel(species.excitation)}`}
                            isExcitation
                            reading={reading}
                            status={effectiveEnergies.status}
                            pictureFailed={pictureFailed}
                        />
                    ) : (
                        <EnergyLine
                            label={ionisationLabelOf(species, reading)}
                            reading={reading}
                            status={effectiveEnergies.status}
                            pictureFailed={pictureFailed}
                            // Final review M6: Na⁺'s next electron would
                            // break the neon core, and nothing past Z = 108
                            // has a tabulated ion -- either way the app
                            // offers no next ion, so there is nothing to
                            // subtract, and the line says so.
                            noValueReason={ionisationNoValueReason(species)}
                        />
                    ))}
                    {showEnergy && effectiveEnergies.status === 'failed' && effectiveEnergies.message && (
                        <Typography variant="caption" display="block" className="species-energy-failed">{effectiveEnergies.message}</Typography>
                    )}
                    {/* Task 6: the dashed ring's size comparison (or why there is no ring) is Info's (atomInfo). */}
                </>
            )}
        </Box>
    );
};

export default SpeciesControls;
