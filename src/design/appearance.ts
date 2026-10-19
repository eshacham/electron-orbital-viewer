import type { Finish } from './presentation';
import type { ThemeMode } from './tokens';
import type { GlowOverrides } from '../orbital_glow';

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
    /**
     * Task 16b ("Advanced appearance"): the viewer's own Glow values for this
     * theme (eov.glow, design/glow_pref.ts) -- overrides only, absent when
     * there are none; GLOW_TUNING supplies the rest. Never in a link.
     */
    glow?: GlowOverrides;
}

/** What the visualizer draws until OrbitalViewer's first setAppearance: Deep Space's phase colours, no Glow. */
export const INITIAL_APPEARANCE: Appearance = { theme: 'dark', finish: 'solid', showAxes: true, lowPower: false };
