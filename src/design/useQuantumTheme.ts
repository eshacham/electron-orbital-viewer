import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Theme } from '@mui/material/styles';
import { quantumTheme } from './theme';
import { PREFERS_LIGHT_QUERY, resolveMode, themeChoicePref, type ThemeChoice } from './theme_storage';
import type { ThemeMode } from './tokens';
import { usePref } from './usePref';

// Its own media subscription rather than src/useMediaQuery.ts: /admin.html may
// import only src/design/* (spec §9.7).
function subscribePrefersLight(onChange: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const list = window.matchMedia(PREFERS_LIGHT_QUERY);
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
}

function prefersLightNow(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PREFERS_LIGHT_QUERY).matches;
}

export function usePrefersLight(): boolean {
    return useSyncExternalStore(subscribePrefersLight, prefersLightNow, () => false);
}

/** What the boot script in index.html/admin.html does, kept in step afterwards. */
export function applyThemeToDocument(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
}

export interface QuantumThemeState {
    mode: ThemeMode;
    choice: ThemeChoice;
    setChoice(choice: ThemeChoice): void;
    theme: Theme;
}

/** Any number of components may call this: they share one stored choice (local_pref). */
export function useQuantumTheme(): QuantumThemeState {
    const choice = usePref(themeChoicePref);
    const prefersLight = usePrefersLight();
    const mode = resolveMode(choice, prefersLight);
    useEffect(() => applyThemeToDocument(mode), [mode]);
    const theme = useMemo(() => quantumTheme(mode), [mode]);
    return { mode, choice, setChoice: themeChoicePref.set, theme };
}
