import { createPref } from './local_pref';
import type { ThemeMode } from './tokens';

/** What the user chose; 'system' is stored as no key at all (spec §6.1). */
export type ThemeChoice = ThemeMode | 'system';

export const THEME_KEY = 'eov.theme';
/** The foundation's key and the kit's (spec §6.1): read once, then deleted. */
export const LEGACY_THEME_KEYS = ['eov.quantumlab.theme', 'eov-color-theme'] as const;
export const PREFERS_LIGHT_QUERY = '(prefers-color-scheme: light)';

export function decodeThemeChoice(raw: string | null): ThemeChoice {
    return raw === 'dark' || raw === 'light' ? raw : 'system';
}

export function encodeThemeChoice(choice: ThemeChoice): string | null {
    return choice === 'system' ? null : choice;
}

export const themeChoicePref = createPref<ThemeChoice>(THEME_KEY, { decode: decodeThemeChoice, encode: encodeThemeChoice });

export function resolveMode(choice: ThemeChoice, prefersLight: boolean): ThemeMode {
    return choice === 'system' ? (prefersLight ? 'light' : 'dark') : choice;
}

/** Same rule as the HTML boot script, for a page that loaded before it existed. */
export function migrateLegacyTheme(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): void {
    if (!storage) return;
    try {
        if (decodeThemeChoice(storage.getItem(THEME_KEY)) === 'system') {
            for (const key of LEGACY_THEME_KEYS) {
                const legacy = storage.getItem(key);
                if (legacy === 'dark' || legacy === 'light') {
                    storage.setItem(THEME_KEY, legacy);
                    break;
                }
            }
        }
        for (const key of LEGACY_THEME_KEYS) storage.removeItem(key);
    } catch {
        // Storage refused: the in-memory pref takes over (local_pref.ts).
    }
}
