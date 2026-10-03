import React, { useRef, useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography, Alert, Tooltip } from '@mui/material';
import {
    AtomSpecies, Excitation, SubshellRef, excitationSources, excitationTargets, excitationLabel, speciesSymbol, speciesKey,
} from '../atom/species';
import { allowedCharges } from '../atom/ion_configurations';
import { BELOW_GROUND_NOTE, DELTA_SCF_LABEL, DELTA_SCF_METHOD, EnergyReading, ionisedSpeciesOf } from '../atom/delta_scf';
import { NIST_FIRST_IONISATION_EV } from '../atom/ionisation_references';
import { formatDrawnRadius } from '../atom/format_radius';
import type { EnergiesState } from '../store/atomSlice';
import type { ReferenceRadii } from '../workers/atomWorker';

interface SpeciesControlsProps {
    species: AtomSpecies;
    onChargeChange: (charge: number) => void;
    onExcitationChange: (excitation: Excitation | null) => void;
    energies: EnergiesState;
    /** The drawn radius of what is on screen and of the neutral reference, when both are known. */
    radii: { displayRadius: number; reference: ReferenceRadii | null } | null;
    unbound: string | null;
    /** The species' picture solve failed, so the energies, which wait for it (ruling C15), will never start. */
    pictureFailed?: boolean;
}

const NO_ENERGIES: EnergiesState = { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null };

const sameRef = (a: SubshellRef, b: SubshellRef): boolean => a.n === b.n && a.l === b.l;

/**
 * The ground-state → ionised-species label ("Na → Na⁺", "Na⁺ → Na²⁺") that
 * disambiguates *which* ionisation an energy is (ruling M4: without it,
 * every cation's "Ionisation energy" line reads the same as the neutral
 * atom's). Only defined for a ground-state species (an excited one shows its
 * excitation energy instead, never an ionisation energy -- see the caller).
 *
 * Prefers the energy reading's own labels when one has arrived (they are
 * exactly what the ΔSCF calculation used); falls back to deriving the same
 * strings from the species itself via `ionisedSpeciesOf` + `speciesSymbol`
 * so the qualifier is not blank while the reading is still computing.
 * `ionisedSpeciesOf` only identifies *which* species is next -- it is not
 * `ionisationEnergy`, which would trigger a real SCF solve, wrong to do from
 * inside a presentational component.
 */
function ionisationQualifier(species: AtomSpecies, reading: EnergyReading | null): string | null {
    if (species.excitation) return null;
    if (reading) return `${reading.fromLabel} → ${reading.toLabel}`;
    const ionised = ionisedSpeciesOf(species);
    if (ionised === null) return null;
    const toLabel = ionised === 'bare nucleus'
        ? `${speciesSymbol({ ...species, charge: species.Z, excitation: null })} (bare nucleus)`
        : speciesSymbol(ionised);
    return `${speciesSymbol(species)} → ${toLabel}`;
}

/**
 * What the value slot says. "—" is reserved for an answer the ΔSCF gave --
 * no such energy (Na⁺'s next electron would break the neon core) -- never
 * for one not asked yet: the energies wait for the species' picture (ruling
 * C15), and until then the line says so.
 */
function energyValueText(reading: EnergyReading | null, status: EnergiesState['status'], noValueReason?: string, pictureFailed = false, isExcitation = false): string {
    // Ruling FR-2: "waiting" would wait for ever on a picture that failed.
    // The picture's error is either an unconverged SCF or a worker failure;
    // both leave the energies unasked, so say that rather than guess which.
    if (status === 'idle') return pictureFailed ? 'not computed — the picture\'s solve failed' : 'waiting for the picture…';
    if (status === 'computing') return 'computing…';
    if (reading) {
        const value = `${reading.valueEv.toFixed(2).replace('-', '−')} eV`;
        // Ruling FR-1's note is about an excited configuration landing below
        // the ground one; a negative ionisation energy would be another fault.
        return isExcitation && reading.valueEv < 0 ? `${value} (${BELOW_GROUND_NOTE})` : value;
    }
    return noValueReason ? `— (${noValueReason})` : '—';
}

/**
 * "ΔSCF, LDA", with the full method one hover, focus or tap away (spec
 * §3.1; final review M4). A `title` alone reached only a mouse: the label is
 * focusable, and focus or a tap opens the same tooltip a hover does, which
 * the label carries as its accessible description while open.
 */
const MethodLabel: React.FC = () => {
    const [open, setOpen] = useState(false);
    return (
        <Tooltip title={DELTA_SCF_METHOD} describeChild open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
            <span
                className="species-method"
                tabIndex={0}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={() => setOpen(true)}
            >
                {DELTA_SCF_LABEL}
            </span>
        </Tooltip>
    );
};

/** "5.37 eV  ΔSCF, LDA", the method one hover away (spec §3.1). */
const EnergyLine: React.FC<{
    label: string; reading: EnergyReading | null; status: EnergiesState['status']; measuredEv?: number; noValueReason?: string; pictureFailed?: boolean; isExcitation?: boolean;
}> =
    ({ label, reading, status, measuredEv, noValueReason, pictureFailed, isExcitation }) => (
        <Typography variant="body2" className="species-energy">
            {label}:{' '}
            {energyValueText(reading, status, noValueReason, pictureFailed, isExcitation)}
            {' '}<MethodLabel />
            {measuredEv !== undefined && reading && <span className="species-measured"> · measured {measuredEv.toFixed(3)} eV (NIST)</span>}
        </Typography>
    );

// MUI's ButtonBase removes the browser's focus outline and relies on the
// ripple to show keyboard focus; with the ripple off, these buttons need
// their own ring or a keyboard user cannot see where focus is.
const FOCUS_RING = { '&.Mui-focusVisible': { outline: '2px solid #1565c0', outlineOffset: '2px' } } as const;

/**
 * Charge and excitation for atom mode (spec §5 Phase 3), with the energies
 * that describe them and the size comparison against the neutral atom.
 * Presentational: every change goes out through a callback.
 */
const SpeciesControls: React.FC<SpeciesControlsProps> = ({ species, onChargeChange, onExcitationChange, energies, radii, unbound, pictureFailed = false }) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const decreaseRef = useRef<HTMLButtonElement>(null);
    const increaseRef = useRef<HTMLButtonElement>(null);
    const charges = allowedCharges(species.Z);
    const neutralSymbol = speciesSymbol({ Z: species.Z, charge: 0, excitation: null });
    const sources = excitationSources(species.Z, species.charge);
    const options = sources.flatMap(from => excitationTargets(species.Z, species.charge, from).map(to => ({ from, to })));
    const isAnion = species.charge < 0;
    const reference = radii?.reference ?? null;

    // Ruling C5: a reply already in flight (or left behind by a fast
    // stepper) can describe a species no longer selected -- SpeciesControls
    // guards this itself, the same check `selectSpeciesEnergies` makes at
    // the store boundary, rather than trusting every future caller to pass
    // a pre-filtered `energies` (Task 12 wires the store; this component
    // must still be correct if it is ever handed the raw slice).
    const energiesMatch = energies.speciesKey === speciesKey(species);
    const effectiveEnergies = energiesMatch ? energies : NO_ENERGIES;
    const reading = species.excitation ? effectiveEnergies.excitation : effectiveEnergies.ionisation;

    // Ruling C15: the 10 % spec check only covers Z ≤ 18, so the "measured"
    // comparison only ever shows for that range, and only for the neutral
    // atom's own first ionisation energy (not a cation's, not an anion's) --
    // NIST_FIRST_IONISATION_EV has no entries past Z = 18 anyway, but the
    // Z <= 18 guard says why, rather than leaving it to a lookup miss.
    const measuredEv = species.charge === 0 && species.Z <= 18 ? NIST_FIRST_IONISATION_EV[species.Z] : undefined;

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

    const qualifier = ionisationQualifier(species, reading);
    const ionisationLabel = isAnion
        // M3: ionising an anion of charge q releases exactly the electron
        // affinity of the species one charge less negative -- O²⁻ → O⁻ is
        // the electron affinity of O⁻, not of the neutral O, so the label is
        // built from species.charge + 1, never a bare element symbol.
        ? `Ionisation energy (= electron affinity of ${speciesSymbol({ ...species, charge: species.charge + 1, excitation: null })})`
        : qualifier
            ? `Ionisation energy (${qualifier})`
            : 'Ionisation energy';

    return (
        <Box className="species-controls" role="group" aria-label="ion and excitation">
            <Box className="species-charge-row">
                <Typography variant="body2" component="span">Charge</Typography>
                <Button ref={decreaseRef} size="small" disableRipple sx={FOCUS_RING} aria-label="decrease charge" disabled={species.charge <= charges[0]}
                    onClick={handleDecrease}>−</Button>
                <span className="species-charge-value" aria-label="charge" role="status">
                    {species.charge === 0 ? `${neutralSymbol} (neutral)` : speciesSymbol({ ...species, excitation: null })}
                </span>
                <Button ref={increaseRef} size="small" disableRipple sx={FOCUS_RING} aria-label="increase charge" disabled={species.charge >= charges[charges.length - 1]}
                    onClick={handleIncrease}>+</Button>
            </Box>

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

            {unbound ? (
                <Alert severity="warning" role="alert" className="species-unbound">{unbound}</Alert>
            ) : (
                <>
                    {species.excitation ? (
                        <EnergyLine
                            label={`Excitation energy ${excitationLabel(species.excitation)}`}
                            isExcitation
                            reading={reading}
                            status={effectiveEnergies.status}
                            pictureFailed={pictureFailed}
                        />
                    ) : (
                        <EnergyLine
                            label={ionisationLabel}
                            reading={reading}
                            status={effectiveEnergies.status}
                            measuredEv={measuredEv}
                            pictureFailed={pictureFailed}
                            // Final review M6: Na⁺'s next electron would
                            // break the neon core, and nothing past Z = 108
                            // has a tabulated ion -- either way the app
                            // offers no next ion, so there is nothing to
                            // subtract, and the line says so.
                            noValueReason={ionisedSpeciesOf(species) === null ? 'next ion not offered' : undefined}
                        />
                    )}
                    {effectiveEnergies.status === 'failed' && effectiveEnergies.message && (
                        <Typography variant="caption" display="block" className="species-energy-failed">{effectiveEnergies.message}</Typography>
                    )}
                    {radii && reference && (() => {
                        const ratio = radii.displayRadius / reference.displayRadius;
                        const percent = Math.abs(ratio - 1) * 100;
                        // M11: a rounded 0 % reads as a typo ("−0 %"), not as
                        // "these are the same size" -- say that plainly
                        // instead of showing a signed near-zero.
                        const sizeNote = percent < 0.5 ? '≈ same size' : `${ratio < 1 ? '−' : '+'}${Math.round(percent)} %`;
                        return (
                            <Typography variant="caption" display="block" className="species-compare" aria-label="size compared with the neutral atom">
                                <span className="species-compare-swatch" aria-hidden="true" />
                                dashed ring: neutral {neutralSymbol}, drawn radius {formatDrawnRadius(reference.displayRadius)} a₀ ·{' '}
                                {speciesSymbol(species)} {formatDrawnRadius(radii.displayRadius)} a₀ ({sizeNote})
                            </Typography>
                        );
                    })()}
                </>
            )}
        </Box>
    );
};

export default SpeciesControls;
