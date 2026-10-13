import { createTheme, type Theme } from '@mui/material/styles';
import { FONT_SANS, PHONE_TYPE, RADIUS, SHADOWS, TOKENS, TYPE, type ThemeMode } from './tokens';

export type QuantumThemeMode = ThemeMode;

/**
 * The phone layout's breakpoint, as a style key. The same query as
 * src/useMediaQuery.ts's NARROW_VIEWPORT (a test pins the two together);
 * spelled out here because /admin.html imports only src/design/* (§9.7).
 */
export const PHONE_MEDIA = '@media (max-width: 760px), (max-height: 500px), (max-width: 1100px) and (orientation: portrait)';

/** One TYPE style as an MUI variant, in px (a bare number line height would be a multiplier). */
const variant = (style: { size: number; line: number; weight: number }) => (
    { fontSize: style.size, lineHeight: `${style.line}px`, fontWeight: style.weight });

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
        // §4.3, in px from TYPE: nothing under 11 px; a phone reads body 14.
        // Controller ruling T10-11px: the 13 px base used to scale every MUI
        // variant by 13/14 (caption 11.14, Chip 12.07, body1 14.86).
        typography: {
            fontFamily: FONT_SANS,
            // MUI's scaling base, not a text size: at 14, pxToRem(n) is n px,
            // so MUI's own component sizes (a Chip's or small Button's 13) land
            // on whole pixels. Every variant's size is set below.
            fontSize: 14,
            h1: variant(TYPE.title), h2: variant(TYPE.title), h3: variant(TYPE.title),
            h4: variant(TYPE.title), h5: variant(TYPE.title), h6: variant(TYPE.title),
            subtitle1: variant(TYPE.section),
            subtitle2: variant(TYPE.section),
            body1: { ...variant(TYPE.body), [PHONE_MEDIA]: { fontSize: PHONE_TYPE.body } },
            body2: { ...variant(TYPE.body), [PHONE_MEDIA]: { fontSize: PHONE_TYPE.body } },
            button: { ...variant(TYPE.body), fontWeight: 500, textTransform: 'none', [PHONE_MEDIA]: { fontSize: PHONE_TYPE.body } },
            caption: variant(TYPE.caption), // 12 on a phone too
            overline: variant(TYPE.tick),
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
            // §13: these draw their own focus styles, which would otherwise win over :focus-visible.
            MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, '&.Mui-focusVisible': focus } } },
            MuiSlider: { styleOverrides: { thumb: { '&.Mui-focusVisible': focus } } },
            MuiOutlinedInput: { styleOverrides: { root: { '&.Mui-focused': focus } } },
            // A Link rendered as a button (LevelNav's breadcrumbs) swaps the ring for the browser's own `outline: auto`.
            MuiLink: { styleOverrides: { root: { '&.Mui-focusVisible': focus } } },
            MuiTooltip: { styleOverrides: { tooltip: { borderRadius: RADIUS.sm, fontSize: TYPE.caption.size } } },
        },
    });
}
