import React from 'react';
import { FormControl, FormControlLabel, FormLabel, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { RenderMode } from '../types/orbital';
import { displayPref, renderPref } from '../design/presentation';
import { usePref } from '../design/usePref';
import { KEEP_CASE } from '../design/mui';

type SurfaceChoice = 'glow' | 'solid' | 'wireframe';

interface SurfaceStyleControlProps {
    /** The store's surfaceStyle.mode -- what the link carries (ruling R1). */
    surfaceMode: RenderMode;
    /** Only a marching-cubes surface has a surface style (Controls' isMeshLevel rule). */
    meshLevel: boolean;
    onSurfaceMode(mode: RenderMode): void;
}

/**
 * The inspector's Display section (spec §9.1, ruling R20b-atoms): Surface
 * style. Ruling R22a (owner): there is no colour-scheme choice beside it --
 * the surface is always coloured by the sign of ψ.
 */
export const SurfaceStyleControl: React.FC<SurfaceStyleControlProps> = ({ surfaceMode, meshLevel, onSurfaceMode }) => {
    const render = usePref(renderPref);
    if (!meshLevel) return null;
    const value: SurfaceChoice = surfaceMode === 'wireframe' ? 'wireframe' : render.finish;
    const chooseSurface = (next: SurfaceChoice | null) => {
        if (!next) return;
        if (next === 'wireframe') { onSurfaceMode('wireframe'); return; }
        renderPref.set({ ...render, finish: next });
        if (surfaceMode !== 'solid') onSurfaceMode('solid');
    };
    return (
        <FormControl component="fieldset" margin="normal" fullWidth className="surface-style-controls">
            <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Surface style</FormLabel>
            <ToggleButtonGroup value={value} exclusive size="small" fullWidth aria-label="surface style" sx={KEEP_CASE}
                onChange={(_event, next: SurfaceChoice | null) => chooseSurface(next)}>
                <ToggleButton value="glow" aria-label="glow surface">Glow</ToggleButton>
                <ToggleButton value="solid" aria-label="solid surface">Solid</ToggleButton>
                <ToggleButton value="wireframe" aria-label="wireframe surface">Wireframe</ToggleButton>
            </ToggleButtonGroup>
        </FormControl>
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
