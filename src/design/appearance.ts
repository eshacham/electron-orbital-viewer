import type { ColourScheme, Finish } from './presentation';
import type { ThemeMode } from './tokens';

/** What OrbitalViewer tells the renderer about how to draw (spec §6.6): never part of a link. */
export interface Appearance {
    theme: ThemeMode;
    scheme: ColourScheme;
    finish: Finish;
    showAxes: boolean;
    /** A phone: Glow's halo and mesh lines stay off (spec §11.2, §15). */
    lowPower: boolean;
}

/** Today's look, constant for constant (§11.3): what the visualizer draws until setAppearance is called. */
export const CLASSIC_APPEARANCE: Appearance = { theme: 'dark', scheme: 'classic', finish: 'solid', showAxes: true, lowPower: false };

/** The Display section's names for the schemes (atom_ui/DisplayControls.tsx), for text that says which one is on screen. */
export const SCHEME_LABEL: Record<ColourScheme, string> = { phase: 'Phase ψ', density: 'Density', classic: 'Classic' };
