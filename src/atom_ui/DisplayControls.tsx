import React from 'react';
import { FormControl, FormControlLabel, FormHelperText, FormLabel, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { RenderMode } from '../types/orbital';
import { displayPref, renderPref, type ColourScheme } from '../design/presentation';
import { usePref } from '../design/usePref';

type SurfaceChoice = 'glow' | 'solid' | 'wireframe';

const SCHEME_HELP: Record<ColourScheme, string> = {
    phase: 'The surface is coloured by the sign of ψ.',
    density: '|ψ|² on the cut face, from the surface value (Low) to the peak (High); the surface keeps its ψ colours.',
    classic: 'The original red and blue, for continuity with textbooks and earlier exports.',
};

/** MUI upper-cases toggle labels; "Phase ψ" must not become "PHASE Ψ". */
const KEEP_CASE = { '& .MuiToggleButton-root': { textTransform: 'none' } } as const;

interface SurfaceAndSchemeProps {
    /** The store's surfaceStyle.mode -- what the link carries (ruling R1). */
    surfaceMode: RenderMode;
    /** Only a marching-cubes surface has a surface style (Controls' isMeshLevel rule). */
    meshLevel: boolean;
    onSurfaceMode(mode: RenderMode): void;
}

/** The inspector's Display section (spec §9.1, ruling R20b-atoms): Surface style and Colour scheme. */
export const SurfaceAndScheme: React.FC<SurfaceAndSchemeProps> = ({ surfaceMode, meshLevel, onSurfaceMode }) => {
    const render = usePref(renderPref);
    const value: SurfaceChoice = surfaceMode === 'wireframe' ? 'wireframe' : render.finish;
    const chooseSurface = (next: SurfaceChoice | null) => {
        if (!next) return;
        if (next === 'wireframe') { onSurfaceMode('wireframe'); return; }
        renderPref.set({ ...render, finish: next });
        if (surfaceMode !== 'solid') onSurfaceMode('solid');
    };
    return (
        <>
            {meshLevel && (
                <FormControl component="fieldset" margin="normal" fullWidth className="surface-style-controls">
                    <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Surface style</FormLabel>
                    <ToggleButtonGroup value={value} exclusive size="small" fullWidth aria-label="surface style" sx={KEEP_CASE}
                        onChange={(_event, next: SurfaceChoice | null) => chooseSurface(next)}>
                        <ToggleButton value="glow" aria-label="glow surface">Glow</ToggleButton>
                        <ToggleButton value="solid" aria-label="solid surface">Solid</ToggleButton>
                        <ToggleButton value="wireframe" aria-label="wireframe surface">Wireframe</ToggleButton>
                    </ToggleButtonGroup>
                </FormControl>
            )}
            <FormControl component="fieldset" margin="normal" fullWidth className="colour-scheme-controls">
                <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Colour scheme</FormLabel>
                <ToggleButtonGroup value={render.scheme} exclusive size="small" fullWidth aria-label="colour scheme" sx={KEEP_CASE}
                    onChange={(_event, next: ColourScheme | null) => { if (next) renderPref.set({ ...render, scheme: next }); }}>
                    {/* Ruling DB5 (WCAG 2.5.3 label-in-name): the visible text is "Phase
                        ψ", so the accessible name must contain it -- "phase colours"
                        alone does not. */}
                    <ToggleButton value="phase" aria-label="Phase ψ colours">Phase ψ</ToggleButton>
                    <ToggleButton value="density" aria-label="density on the cut face">Density</ToggleButton>
                    <ToggleButton value="classic" aria-label="classic colours">Classic</ToggleButton>
                </ToggleButtonGroup>
                <FormHelperText sx={{ mx: 0 }}>{SCHEME_HELP[render.scheme]}</FormHelperText>
            </FormControl>
        </>
    );
};

/** The inspector's Display section (spec §9.1, ruling R20b-atoms): the Show axes preference (§2 In, item 7). */
export const AxesSwitch: React.FC = () => {
    const display = usePref(displayPref);
    return (
        <FormControlLabel
            className="axes-switch"
            control={<Switch checked={display.showAxes} onChange={event => displayPref.set({ ...display, showAxes: event.target.checked })} />}
            label="Show axes"
        />
    );
};
