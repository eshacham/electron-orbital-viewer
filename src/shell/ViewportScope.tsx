import React, { createContext, useContext, useMemo } from 'react';
import { ThemeProvider, useTheme, type Theme } from '@mui/material/styles';
import { quantumTheme } from '../design/theme';
import { DEFAULT_TEMPER, VIEWPORT_MODE, type ThemeMode } from '../design/tokens';

interface ScopeValue { page: Theme; pageMode: ThemeMode; field: Theme; fieldMode: ThemeMode }
/** What an element wears to be a scope of the field: the field's mode and the marker that resets the level (tokens.css). */
export type FieldAttrs = { 'data-theme': ThemeMode; 'data-field': '' };
const ScopeContext = createContext<ScopeValue | null>(null);

/**
 * The viewing field's MUI scope (Brass Instrument, spec B4). The viewport cell carries `data-theme` = VIEWPORT_MODE of
 * the page's mode and `data-field`, so tokens.css resolves every role inside it in the field's mode; this nests the
 * matching MUI theme around it, so what MUI colours from its palette (an Alert, a ripple) agrees. Finish ruling F2: the
 * field does not change with the level -- it is its mode's Explore at every level, in the tokens and here. It also
 * remembers the page's theme and mode for the page chrome that sits inside the cell (PageScope) and for portals opened
 * from it (PageTheme), and the field's for a window of the field inside that chrome (FieldScope).
 * Final review M4: the field's mode has this one source. The cell's `data-theme` / `data-field` come from here, handed
 * to `children` (as FieldScope hands them), so the attribute and the MUI theme of the same scope cannot diverge.
 */
export function ViewportScope({ pageMode, children }: { pageMode: ThemeMode; children: (attrs: FieldAttrs) => React.ReactNode }) {
    const page = useTheme();
    const fieldMode = VIEWPORT_MODE[pageMode];
    const field = useMemo(() => quantumTheme(fieldMode, DEFAULT_TEMPER), [fieldMode]);
    const scope = useMemo(() => ({ page, pageMode, field, fieldMode }), [page, pageMode, field, fieldMode]);
    return (
        <ScopeContext.Provider value={scope}>
            <ThemeProvider theme={field}>{children({ 'data-theme': fieldMode, 'data-field': '' })}</ThemeProvider>
        </ScopeContext.Provider>
    );
}

/**
 * The page's MUI theme again, inside the field (controller ruling, Task 3): for a menu or dialog the field's toolbar
 * opens. It renders in a portal under <body>, where the page's tokens apply, so it reads like every other menu.
 * Outside a ViewportScope it changes nothing.
 */
export function PageTheme({ children }: { children: React.ReactNode }) {
    const scope = useContext(ScopeContext);
    return scope ? <ThemeProvider theme={scope.page}>{children}</ThemeProvider> : <>{children}</>;
}

/**
 * Page chrome that sits inside the viewport cell -- the medium drawer, the phone's top bar and sheet, the periodic
 * table and the pickers -- back in the page's mode and the page's level: its own `data-theme` (a `display: contents`
 * box, so no layout moves; app_shell.css) and the page's MUI theme. Spec B4: page chrome keeps the page mode over the
 * canvas.
 */
export function PageScope({ children }: { children: React.ReactNode }) {
    const scope = useContext(ScopeContext);
    if (!scope) return <>{children}</>;
    return (
        <ThemeProvider theme={scope.page}>
            <div className="page-scope" data-theme={scope.pageMode}>{children}</div>
        </ThemeProvider>
    );
}

/**
 * A window of the field inside page chrome (finish ruling F3): the phone's header -- its nav chip, tier chip, caption
 * and, sideways, the merged top bar -- has no band of its own and sits straight on the field, so it wears the field.
 * The caller's own element takes `attrs` (`data-theme` = the field's mode, `data-field`), so no box is added; the
 * field's MUI theme goes around it. Outside a ViewportScope it changes nothing.
 */
export function FieldScope({ children }: { children: (attrs: { 'data-theme'?: ThemeMode; 'data-field'?: '' }) => React.ReactNode }) {
    const scope = useContext(ScopeContext);
    if (!scope) return <>{children({})}</>;
    return <ThemeProvider theme={scope.field}>{children({ 'data-theme': scope.fieldMode, 'data-field': '' })}</ThemeProvider>;
}
