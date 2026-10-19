import { createPref, settledView } from './local_pref';
import type { ThemeMode } from './tokens';
import { clampGlow, glowDefaults, glowKnobApplies, GLOW_KNOBS, type GlowKnob, type GlowOverrides } from '../orbital_glow';

/**
 * Task 16b ("Advanced appearance", owner R24-adv): the viewer's own Glow
 * values, a personal preference like the theme -- per theme, in
 * localStorage only (spec §6.7), never in a link: the receiver of a link
 * sees their own. Holds overrides only; GLOW_TUNING (the owner's tuned
 * values, R24-2c) is everything else, and Reset is an empty theme.
 */
export type GlowPrefs = Readonly<Record<ThemeMode, GlowOverrides>>;

export const GLOW_KEY = 'eov.glow';
export const DEFAULT_GLOW: GlowPrefs = { dark: {}, light: {} };
const THEMES: readonly ThemeMode[] = ['dark', 'light'];

/**
 * How long the strip waits after the last slider move before its tiles are
 * drawn again with the new values (thumbnail jobs are not cheap; the main
 * view follows every move).
 */
export const GLOW_SETTLE_MS = 300;

function parse(raw: string | null): Record<string, unknown> {
    try {
        const value = JSON.parse(raw ?? '');
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

/**
 * One theme's overrides, made valid: knobs the theme reads only, finite
 * numbers only, each clamped to GLOW_CAPS and put on its step; a value equal
 * to the default is not an override and is dropped.
 */
export function normaliseGlow(theme: ThemeMode, value: unknown): GlowOverrides {
    const given = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const defaults = glowDefaults(theme);
    const overrides: GlowOverrides = {};
    for (const knob of GLOW_KNOBS) {
        const raw = given[knob];
        if (typeof raw !== 'number' || !Number.isFinite(raw) || !glowKnobApplies(knob, theme)) continue;
        const clamped = clampGlow(knob, raw);
        if (clamped !== defaults[knob]) overrides[knob] = clamped;
    }
    return overrides;
}

/** Validated on read: unknown themes and keys dropped, values clamped to the caps. */
export function decodeGlow(raw: string | null): GlowPrefs {
    const value = parse(raw);
    return { dark: normaliseGlow('dark', value.dark), light: normaliseGlow('light', value.light) };
}

/** Only the themes with overrides; no key at all once there are none. */
export function encodeGlow(prefs: GlowPrefs): string | null {
    const stored = Object.fromEntries(THEMES.filter(theme => Object.keys(prefs[theme]).length > 0).map(theme => [theme, prefs[theme]]));
    return Object.keys(stored).length > 0 ? JSON.stringify(stored) : null;
}

export const glowPref = createPref<GlowPrefs>(GLOW_KEY, { decode: decodeGlow, encode: encodeGlow });

/**
 * The same values as they were once the sliders stopped moving for
 * GLOW_SETTLE_MS: what the strip's tiles are drawn and filed with (their
 * look key, thumb_key.ts), so a drag starts no thumbnail jobs until it rests.
 */
export const settledGlowPref = settledView(glowPref, GLOW_SETTLE_MS);

/** Sets one knob for `theme` (clamped; back to the default removes the override). */
export function setGlowKnob(theme: ThemeMode, knob: GlowKnob, value: number): void {
    const prefs = glowPref.get();
    glowPref.set({ ...prefs, [theme]: normaliseGlow(theme, { ...prefs[theme], [knob]: value }) });
}

/** Reset to default: GLOW_TUNING for `theme` again; the other theme's values are kept. */
export function resetGlow(theme: ThemeMode): void {
    glowPref.set({ ...glowPref.get(), [theme]: {} });
}

/** The overrides an Appearance carries for `theme`: none (undefined) when the viewer has set none. */
export function glowOverridesOf(prefs: GlowPrefs, theme: ThemeMode): GlowOverrides | undefined {
    const overrides = prefs[theme];
    return Object.keys(overrides).length > 0 ? overrides : undefined;
}
