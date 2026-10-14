import type { Finish } from './presentation';
import type { ThemeMode } from './tokens';

/**
 * What OrbitalViewer tells the renderer about how to draw (spec §6.6): never
 * part of a link. Ruling R22a (owner): there is no colour scheme -- a surface
 * is always coloured by the sign of ψ, in the theme's phase colours.
 */
export interface Appearance {
    theme: ThemeMode;
    finish: Finish;
    showAxes: boolean;
    /** A phone: Glow's halo and mesh lines stay off (spec §11.2, §15). */
    lowPower: boolean;
}

/** What the visualizer draws until OrbitalViewer's first setAppearance: Deep Space's phase colours, no Glow. */
export const INITIAL_APPEARANCE: Appearance = { theme: 'dark', finish: 'solid', showAxes: true, lowPower: false };
