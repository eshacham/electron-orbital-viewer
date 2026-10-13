import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { quantumTheme } from '../../src/design/theme';
import { PHONE_MEDIA } from '../../src/design/theme';
import { THEME_MODES, TOKENS, TYPE } from '../../src/design/tokens';
import { NARROW_VIEWPORT } from '../../src/useMediaQuery';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

describe.each(THEME_MODES)('quantumTheme(%s)', mode => {
    const theme = quantumTheme(mode);
    it('is built from the tokens', () => {
        expect(theme.palette.mode).toBe(mode);
        expect(theme.palette.background.default).toBe(TOKENS[mode]['bg-app']);
        expect(theme.palette.background.paper).toBe(TOKENS[mode]['surface-1']);
        expect(theme.palette.text.primary).toBe(TOKENS[mode]['text-1']);
        expect(theme.palette.primary.main).toBe(TOKENS[mode].accent);
        expect(theme.typography.fontFamily).toMatch(/^"Inter Variable"/);
    });
    it('primary text on a panel is AA, and its contrast text on primary too', () => {
        expect(contrastRatio(rgb(theme.palette.primary.main), rgb(TOKENS[mode]['surface-1']))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(rgb(theme.palette.primary.contrastText), rgb(theme.palette.primary.main))).toBeGreaterThanOrEqual(4.5);
    });
    it('draws the focus ring on MUI controls whose own styles would hide it (spec §13)', () => {
        const ring = { outline: `2px solid ${TOKENS[mode]['focus-ring']}`, outlineOffset: 2 };
        const overrides = theme.components!;
        expect((overrides.MuiButtonBase!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
        expect((overrides.MuiChip!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
        expect((overrides.MuiSlider!.styleOverrides!.thumb as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
        expect((overrides.MuiOutlinedInput!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focused']).toEqual(ring);
        // The keyboard walk found LevelNav's breadcrumb Links (component="button") showing the browser's `outline: auto`.
        expect((overrides.MuiLink!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
    });
});

// Controller ruling T10-11px (spec §4.3): MUI's variants used to scale off the
// 13 px base (caption 11.14, Chip/Button 12.07, body1 14.86). They now come
// from the TYPE tokens in px, nothing under 11, and a phone reads body 14,
// captions 12.
describe.each(THEME_MODES)('quantumTheme(%s) typography (spec §4.3)', mode => {
    const typography = quantumTheme(mode).typography as unknown as Record<string, Record<string, unknown>>;
    const VARIANTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'subtitle1', 'subtitle2', 'body1', 'body2', 'button', 'caption', 'overline'];
    /** A resolved size in px: MUI keeps a number as px, a rem string is 16 px to the rem. */
    const px = (size: unknown): number => {
        if (typeof size === 'number') return size;
        const match = /^([\d.]+)(px|rem)$/.exec(String(size));
        if (!match) throw new Error(`unreadable font size ${String(size)}`);
        return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
    };

    it.each(VARIANTS)('%s is never under 11 px, on a desktop or a phone', variant => {
        const style = typography[variant];
        expect(px(style.fontSize)).toBeGreaterThanOrEqual(11);
        const phone = style[PHONE_MEDIA] as { fontSize?: unknown } | undefined;
        if (phone?.fontSize !== undefined) expect(px(phone.fontSize)).toBeGreaterThanOrEqual(11);
    });

    it('reads body 13 and captions 12, and on a phone body 14 and captions 12', () => {
        for (const variant of ['body1', 'body2']) {
            expect(px(typography[variant].fontSize)).toBe(TYPE.body.size);
            expect(px((typography[variant][PHONE_MEDIA] as { fontSize: unknown }).fontSize)).toBe(14);
        }
        expect(px(typography.caption.fontSize)).toBe(TYPE.caption.size);
        expect(typography.caption[PHONE_MEDIA]).toBeUndefined(); // 12 everywhere
    });

    it('turns MUI\'s own component sizes into whole px (a Chip\'s 13 is 13, not 12.07)', () => {
        expect(px((typography as unknown as { pxToRem(n: number): string }).pxToRem(13))).toBe(13);
    });

    it('uses the app\'s phone breakpoint', () => {
        expect(PHONE_MEDIA).toBe(`@media ${NARROW_VIEWPORT}`);
    });
});
