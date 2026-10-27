import React, { useId } from 'react';
import { FormControl, FormControlLabel, FormGroup, FormLabel, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { Representation } from '../molecules/ball_and_stick';
import { KEEP_CASE } from '../design/mui';
import { displayPref } from '../design/presentation';
import { usePref } from '../design/usePref';
import { LAYOUT, TYPE } from '../design/tokens';
import { atLeast, CONTROL_LEVEL, LearningLevel } from '../levels/levels';

interface MoleculeViewOptionsProps {
    representation: Representation;
    onRepresentationChange: (representation: Representation) => void;
    /** Why this molecule cannot be drawn space-filling (ruling P8b: no tabulated radius for one of its elements), or null. */
    spaceFillingUnavailable: string | null;
    /** A surface is drawn under the structure -- space filling's spheres can then hide it (ruling T13-M). */
    surfaceShown: boolean;
    showDipole: boolean;
    onShowDipole: (on: boolean) => void;
    dipoleText: string | null;
    /**
     * Ruling T7-O3: a documented exception to "every number states its
     * method" (ozone's multireference dipole, from `meta.caveat`). When
     * given alongside `dipoleText`, it is shown right beside it -- the
     * dipole is never shown without it.
     */
    caveat?: string | null;
    /**
     * Task 2: the learning level in use. Structure, the bond labels switch and the Dipole arrow switch appear at
     * Explore -- hidden at Basics, where App's line says so. Ruling T2-I2: while the arrow is drawn, its value, the
     * caveat and the sign convention stay at every level. Omitted, everything shows.
     */
    level?: LearningLevel;
}

/**
 * The spec's 32 px segments (§10, Controls row), labels in their own case (preflight D16). Three labels of up to 14 characters
 * share the inspector's 256 px row, which at body size leaves them touching their borders; the caption
 * size gives each a few pixels of air.
 */
const SEGMENTS = [KEEP_CASE, { '& .MuiToggleButton-root': { height: LAYOUT.chip, fontSize: TYPE.caption.size } }];

/**
 * Molecule-only view settings, shown inside Controls in the right-hand column / View tab: the structure
 * (ruling P8, spec §9.4 View: Ball and stick | Space filling | None), the on-model lengths and angles
 * (ruling P9, a presentation preference read here) and the dipole arrow. Each segment's
 * name holds its visible label (WCAG 2.5.3).
 */
const MoleculeViewOptions: React.FC<MoleculeViewOptionsProps> = ({
    representation, onRepresentationChange, spaceFillingUnavailable, surfaceShown, showDipole, onShowDipole, dipoleText, caveat,
    level = 'research',
}) => {
    const reasonId = useId();
    const labelsNoteId = useId();
    const display = usePref(displayPref);
    // Ruling P9: what the labels switch draws depends on the structure (bond_labels.ts modelLabels).
    const labelsNote = representation === 'none' ? 'No structure is drawn, so there is nothing to label.'
        : representation === 'space-filling' && display.moleculeLabels ? 'Space filling draws no bonds, so only angles are labelled.'
        : null;
    const showStructure = atLeast(level, CONTROL_LEVEL.structure);
    const showLabels = atLeast(level, CONTROL_LEVEL.bondLabels);
    const showDipoleControl = atLeast(level, CONTROL_LEVEL.dipole);
    // Ruling T2-I2: the arrow is never on screen without what it means (and ozone's caveat, ruling T7-O3).
    const showDipoleText = showDipoleControl || showDipole;
    if (!showStructure && !showLabels && !showDipoleText) return null;
    return (
        <FormGroup className="molecule-view-options">
            {showStructure && (
                <FormControl component="fieldset" margin="dense" fullWidth className="molecule-structure-controls">
                    <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Structure</FormLabel>
                    <ToggleButtonGroup value={representation} exclusive size="small" fullWidth aria-label="structure" sx={SEGMENTS}
                        onChange={(_event, next: Representation | null) => { if (next) onRepresentationChange(next); }}>
                        <ToggleButton value="ball-and-stick" aria-label="Ball and stick (ball-and-stick structure)">Ball and stick</ToggleButton>
                        {/* A disabled button takes no pointer, so the reason's tooltip hangs on this wrapper. */}
                        <span className="molecule-structure-segment" title={spaceFillingUnavailable ?? undefined}>
                            <ToggleButton value="space-filling" aria-label="Space filling (space-filling structure)"
                                disabled={spaceFillingUnavailable !== null} aria-describedby={spaceFillingUnavailable ? reasonId : undefined}>
                                Space filling
                            </ToggleButton>
                        </span>
                        <ToggleButton value="none" aria-label="None (no structure)">None</ToggleButton>
                    </ToggleButtonGroup>
                    {representation === 'space-filling' && surfaceShown && (
                        <Typography variant="caption" className="molecule-caption">The spheres can hide the surface inside them.</Typography>
                    )}
                    {spaceFillingUnavailable && (
                        <Typography id={reasonId} variant="caption" className="molecule-caption">
                            Space filling is unavailable: {spaceFillingUnavailable}
                        </Typography>
                    )}
                </FormControl>
            )}
            {/* Ruling P9 (spec §9.4.1): a display preference, never in a link. */}
            {showLabels && (
                <>
                    <FormControlLabel label="Show bond lengths and angles" disabled={representation === 'none'}
                        control={<Switch size="small" checked={display.moleculeLabels} inputProps={{ 'aria-describedby': labelsNote ? labelsNoteId : undefined }}
                            onChange={e => displayPref.set({ ...displayPref.get(), moleculeLabels: e.target.checked })} />} />
                    {labelsNote && <Typography id={labelsNoteId} variant="caption" className="molecule-caption">{labelsNote}</Typography>}
                </>
            )}
            {showDipoleControl && (
                <FormControlLabel control={<Switch size="small" checked={showDipole} onChange={e => onShowDipole(e.target.checked)} />} label="Dipole arrow" />
            )}
            {showDipoleText && (
                <>
                    {dipoleText && (
                        <Typography variant="body2">
                            {dipoleText}{caveat ? ` — ${caveat}` : ''}
                        </Typography>
                    )}
                    <Typography variant="caption" className="molecule-caption">
                        The arrow points from − to + (the physics convention), 1 a₀ per debye; many chemistry texts draw it the other way.
                    </Typography>
                </>
            )}
        </FormGroup>
    );
};

export default MoleculeViewOptions;
