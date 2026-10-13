import { createTheme, type Theme } from '@mui/material/styles';
import { FONT_SANS, RADIUS, SHADOWS, TOKENS, TYPE, type ThemeMode } from './tokens';

export type QuantumThemeMode = ThemeMode;

/**
 * The MUI theme for one mode, from the tokens alone (spec §6.3): palette,
 * typography and shape, plus component overrides through MUI's own theme
 * API -- no blanket `.Mui*` stylesheet rewrites.
 */
export function quantumTheme(mode: ThemeMode): Theme {
    const t = TOKENS[mode];
    const focus = { outline: `2px solid ${t['focus-ring']}`, outlineOffset: 2 };
    return createTheme({
        palette: {
            mode,
            primary: { main: t.accent, contrastText: t['on-accent'] },
            success: { main: t.success },
            warning: { main: t.warning },
            error: { main: t.danger },
            background: { default: t['bg-app'], paper: t['surface-1'] },
            text: { primary: t['text-1'], secondary: t['text-2'], disabled: t['text-3'] },
            divider: t['border-subtle'],
        },
        shape: { borderRadius: RADIUS.md },
        typography: {
            fontFamily: FONT_SANS,
            fontSize: TYPE.body.size,
            button: { textTransform: 'none', fontWeight: 500 },
        },
        components: {
            MuiCssBaseline: { styleOverrides: { body: { backgroundColor: t['bg-app'], color: t['text-1'] } } },
            MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
            MuiPopover: { styleOverrides: { paper: { boxShadow: SHADOWS[mode].popover, border: `1px solid ${t['border-subtle']}` } } },
            // §13: a visible focus ring on every MUI control, never removed.
            MuiButtonBase: { styleOverrides: { root: { '&.Mui-focusVisible': focus } } },
            MuiToggleButton: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        '&.Mui-selected, &.Mui-selected:hover': {
                            backgroundColor: t['selected-fill'], color: t['on-fill'], borderColor: t['selected-edge'],
                        },
                    },
                },
            },
            MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm } } },
            MuiTooltip: { styleOverrides: { tooltip: { borderRadius: RADIUS.sm, fontSize: TYPE.caption.size } } },
        },
    });
}
