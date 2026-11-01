import React, { createContext, useContext, useMemo } from 'react';
import { ThemeProvider, useTheme, type Theme } from '@mui/material/styles';
import { quantumTheme } from '../design/theme';
import { VIEWPORT_MODE, type TemperLevel, type ThemeMode } from '../design/tokens';

interface PageScopeValue { theme: Theme; mode: ThemeMode }
const PageScopeContext = createContext<PageScopeValue | null>(null);

/**
 * The viewing field's MUI scope (Brass Instrument, spec B4). The viewport cell carries `data-theme` = VIEWPORT_MODE of
 * the page's mode, so tokens.css resolves every role inside it in the field's mode (at the page's level); this nests
 * the matching MUI theme around it, so what MUI colours from its palette (an Alert, a ripple) agrees. On a dark page
 * the field's theme is the page's own object: nothing about a dark page changes. It also remembers the page's theme
 * and mode for the page chrome that sits inside the cell (PageScope) and for portals opened from it (PageTheme).
 */
export function ViewportScope({ pageMode, level, children }: { pageMode: ThemeMode; level: TemperLevel; children: React.ReactNode }) {
    const page = useTheme();
    const fieldMode = VIEWPORT_MODE[pageMode];
    const field = useMemo(() => (fieldMode === pageMode ? page : quantumTheme(fieldMode, level)), [fieldMode, pageMode, page, level]);
    const scope = useMemo(() => ({ theme: page, mode: pageMode }), [page, pageMode]);
    return (
        <PageScopeContext.Provider value={scope}>
            <ThemeProvider theme={field}>{children}</ThemeProvider>
        </PageScopeContext.Provider>
    );
}

/**
 * The page's MUI theme again, inside the field (controller ruling, Task 3): for a menu or dialog the field's toolbar
 * opens. It renders in a portal under <body>, where the page's tokens apply, so it reads like every other menu.
 * Outside a ViewportScope it changes nothing.
 */
export function PageTheme({ children }: { children: React.ReactNode }) {
    const scope = useContext(PageScopeContext);
    return scope ? <ThemeProvider theme={scope.theme}>{children}</ThemeProvider> : <>{children}</>;
}

/**
 * Page chrome that sits inside the viewport cell -- the medium drawer, the phone's top bar, header and sheet, the
 * periodic table and the pickers -- back in the page's mode: its own `data-theme` (a `display: contents` box, so no
 * layout moves; app_shell.css) and the page's MUI theme. Spec B4: page chrome keeps the page mode over the canvas.
 */
export function PageScope({ children }: { children: React.ReactNode }) {
    const scope = useContext(PageScopeContext);
    if (!scope) return <>{children}</>;
    return (
        <ThemeProvider theme={scope.theme}>
            <div className="page-scope" data-theme={scope.mode}>{children}</div>
        </ThemeProvider>
    );
}
