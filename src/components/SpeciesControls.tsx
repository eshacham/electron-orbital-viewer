import React, { useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography, Alert } from '@mui/material';
import { AtomSpecies, Excitation, excitationSources, excitationTargets, excitationLabel, speciesSymbol } from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import { DELTA_SCF_LABEL, DELTA_SCF_METHOD, EnergyReading } from '../atom/delta_scf';
import { NIST_FIRST_IONISATION_EV } from '../atom/ionisation_references';
import type { EnergiesState } from '../store/atomSlice';
import type { ReferenceRadii } from '../workers/atomWorker';
import { elementFor } from '../elements';

interface SpeciesControlsProps {
    species: AtomSpecies;
    onChargeChange: (charge: number) => void;
    onExcitationChange: (excitation: Excitation | null) => void;
    energies: EnergiesState;
    /** The drawn radius of what is on screen and of the neutral reference, when both are known. */
    radii: { displayRadius: number; reference: ReferenceRadii | null } | null;
    unbound: string | null;
}

/** "5.37 eV  ΔSCF, LDA", the method one hover away (spec §3.1). */
const EnergyLine: React.FC<{ label: string; reading: EnergyReading | null; status: EnergiesState['status']; measuredEv?: number }> =
    ({ label, reading, status, measuredEv }) => (
        <Typography variant="body2" className="species-energy">
            {label}:{' '}
            {status === 'computing' ? 'computing…' : reading ? `${reading.valueEv.toFixed(2)} eV` : '—'}
            {' '}<span className="species-method" title={DELTA_SCF_METHOD}>{DELTA_SCF_LABEL}</span>
            {measuredEv !== undefined && reading && <span className="species-measured"> · measured {measuredEv.toFixed(3)} eV (NIST)</span>}
        </Typography>
    );

/**
 * Charge and excitation for atom mode (spec §5 Phase 3), with the energies
 * that describe them and the size comparison against the neutral atom.
 * Presentational: every change goes out through a callback.
 */
const SpeciesControls: React.FC<SpeciesControlsProps> = ({ species, onChargeChange, onExcitationChange, energies, radii, unbound }) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const charges = allowedCharges(species.Z);
    const symbol = elementFor(species.Z)?.symbol ?? `Z${species.Z}`;
    const sources = excitationSources(species.Z, species.charge);
    const options = sources.flatMap(from => excitationTargets(species.Z, species.charge, from).map(to => ({ from, to })));
    const isAnion = species.charge < 0;
    const reading = species.excitation ? energies.excitation : energies.ionisation;
    const reference = radii?.reference ?? null;
    // Ruling C15: the 10 % spec check only covers Z ≤ 18, so the "measured"
    // comparison only ever shows for that range -- NIST_FIRST_IONISATION_EV
    // has no entries past Z = 18 anyway, but the Z <= 18 guard says why,
    // rather than leaving it to a lookup miss to say nothing.
    const measuredEv = species.charge === 0 && species.Z <= 18 ? NIST_FIRST_IONISATION_EV[species.Z] : undefined;

    return (
        <Box className="species-controls" aria-label="ion and excitation">
            <Box className="species-charge-row">
                <Typography variant="body2" component="span">Charge</Typography>
                <Button size="small" aria-label="decrease charge" disabled={species.charge <= charges[0]}
                    onClick={() => onChargeChange(species.charge - 1)}>−</Button>
                <span className="species-charge-value" aria-label="charge">
                    {species.charge === 0 ? `${symbol} (neutral)` : speciesSymbol({ ...species, excitation: null })}
                </span>
                <Button size="small" aria-label="increase charge" disabled={species.charge >= charges[charges.length - 1]}
                    onClick={() => onChargeChange(species.charge + 1)}>+</Button>
            </Box>

            <Box className="species-excite-row">
                <Button size="small" variant="outlined" aria-label="excite one electron" disabled={options.length === 0}
                    onClick={event => setMenuAnchor(event.currentTarget)}>
                    {species.excitation ? `Excited ${excitationLabel(species.excitation)} ▾` : 'Excite: promote one electron to… ▾'}
                </Button>
                <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
                    {options.map(option => (
                        <MenuItem key={excitationLabel(option)} onClick={() => { setMenuAnchor(null); onExcitationChange(option); }}>
                            {excitationLabel(option)}
                        </MenuItem>
                    ))}
                    {species.excitation && (
                        <MenuItem onClick={() => { setMenuAnchor(null); onExcitationChange(null); }}>Back to the ground state</MenuItem>
                    )}
                </Menu>
            </Box>

            {unbound ? (
                <Alert severity="warning" role="alert" className="species-unbound">{unbound}</Alert>
            ) : (
                <>
                    {species.excitation ? (
                        <EnergyLine label={`Excitation energy ${excitationLabel(species.excitation)}`} reading={reading} status={energies.status} />
                    ) : (
                        <EnergyLine
                            label={isAnion ? `Ionisation energy (= electron affinity of ${symbol})` : 'Ionisation energy'}
                            reading={reading}
                            status={energies.status}
                            measuredEv={measuredEv}
                        />
                    )}
                    {energies.status === 'failed' && energies.message && (
                        <Typography variant="caption" display="block" className="species-energy-failed">{energies.message}</Typography>
                    )}
                    {radii && reference && (
                        <Typography variant="caption" display="block" className="species-compare" aria-label="size compared with the neutral atom">
                            <span className="species-compare-swatch" aria-hidden="true" />
                            dashed ring: neutral {symbol}, drawn radius {reference.displayRadius.toFixed(2)} a₀ ·{' '}
                            {speciesSymbol(species)} {radii.displayRadius.toFixed(2)} a₀
                            {' '}({radii.displayRadius < reference.displayRadius ? '−' : '+'}
                            {Math.round(Math.abs(radii.displayRadius / reference.displayRadius - 1) * 100)} %)
                        </Typography>
                    )}
                </>
            )}
        </Box>
    );
};

export default SpeciesControls;
