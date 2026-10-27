import React, { useId } from 'react';
import { FormControl, FormControlLabel, FormGroup, FormLabel, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
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
    showDipole: boolean;
    onShowDipole: (on: boolean) => void;
    /**
     * Task 2: the learning level in use. Structure, the bond labels switch and the Dipole arrow switch appear at
     * Explore -- hidden at Basics, where App's line says so. Omitted, everything shows. Task 7b: the dipole's value
     * (with ozone's caveat beside it, ruling T7-O3) and the arrow's sign convention are Info's (moleculeInfo), at every
     * level while the arrow is drawn (ruling T2-I2).
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
 * name holds its visible label (WCAG 2.5.3). Task 7b: the notes that stood under them -- what the spheres can hide,
 * why Space filling is unavailable, what the labels can show, the dipole and its convention -- are Info's; a disabled
 * control keeps its reason as its accessible description (and Space filling its tooltip).
 */
const MoleculeViewOptions: React.FC<MoleculeViewOptionsProps> = ({
    representation, onRepresentationChange, spaceFillingUnavailable, showDipole, onShowDipole, level = 'research',
}) => {
    const reasonId = useId();
    const labelsNoteId = useId();
    const display = usePref(displayPref);
    // The labels switch is disabled with no structure: its reason, for a screen reader (the words are Info's).
    const labelsDisabledReason = representation === 'none' ? 'No structure is drawn, so there is nothing to label.' : null;
    const showStructure = atLeast(level, CONTROL_LEVEL.structure);
    const showLabels = atLeast(level, CONTROL_LEVEL.bondLabels);
    const showDipoleControl = atLeast(level, CONTROL_LEVEL.dipole);
    if (!showStructure && !showLabels && !showDipoleControl) return null;
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
                    {spaceFillingUnavailable && (
                        <span id={reasonId} className="visually-hidden">Space filling is unavailable: {spaceFillingUnavailable}</span>
                    )}
                </FormControl>
            )}
            {/* Ruling P9 (spec §9.4.1): a display preference, never in a link. */}
            {showLabels && (
                <>
                    <FormControlLabel label="Show bond lengths and angles" disabled={representation === 'none'}
                        control={<Switch size="small" checked={display.moleculeLabels} inputProps={{ 'aria-describedby': labelsDisabledReason ? labelsNoteId : undefined }}
                            onChange={e => displayPref.set({ ...displayPref.get(), moleculeLabels: e.target.checked })} />} />
                    {labelsDisabledReason && <span id={labelsNoteId} className="visually-hidden">{labelsDisabledReason}</span>}
                </>
            )}
            {showDipoleControl && (
                <FormControlLabel control={<Switch size="small" checked={showDipole} onChange={e => onShowDipole(e.target.checked)} />} label="Dipole arrow" />
            )}
        </FormGroup>
    );
};

export default MoleculeViewOptions;
