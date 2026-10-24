import React from 'react';
import { FormControl, FormControlLabel, FormLabel, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { displayPref, renderPref, type Finish } from '../design/presentation';
import { usePref } from '../design/usePref';
import { KEEP_CASE } from '../design/mui';

interface SurfaceStyleControlProps {
    /** Only a marching-cubes surface has a surface style (Controls' isMeshLevel rule). */
    meshLevel: boolean;
}

/**
 * The inspector's Display section (spec §9.1, ruling R20b-atoms): Surface
 * style, the viewer's finish (eov.render, never in a link). Ruling R22a
 * (owner): there is no colour-scheme choice beside it -- the surface is
 * always coloured by the sign of ψ. Owner R25-B1: Wireframe is gone, so
 * both choices are the solid surface.
 */
export const SurfaceStyleControl: React.FC<SurfaceStyleControlProps> = ({ meshLevel }) => {
    const render = usePref(renderPref);
    if (!meshLevel) return null;
    const chooseSurface = (next: Finish | null) => {
        if (next) renderPref.set({ ...render, finish: next });
    };
    return (
        <FormControl component="fieldset" margin="normal" fullWidth className="surface-style-controls">
            <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Surface style</FormLabel>
            <ToggleButtonGroup value={render.finish} exclusive size="small" fullWidth aria-label="surface style" sx={KEEP_CASE}
                onChange={(_event, next: Finish | null) => chooseSurface(next)}>
                <ToggleButton value="glow" aria-label="glow surface">Glow</ToggleButton>
                <ToggleButton value="solid" aria-label="solid surface">Solid</ToggleButton>
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
