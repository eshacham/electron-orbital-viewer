import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { quantumTheme } from '../../src/design/theme';
import { PHONE_MEDIA } from '../../src/design/theme';
import { TEMPER_LEVELS, THEME_MODES, TOKENS, TYPE, colorsAt } from '../../src/design/tokens';
import { NARROW_VIEWPORT } from '../../src/useMediaQuery';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

// Brass Instrument Task 1: the MUI theme follows the learning level's temper (chrome only).
describe('quantumTheme(mode, level)', () => {
    it('tempers the palette to the level, Explore by default', () => {
        expect(quantumTheme('dark', 'research').palette.primary.main).toBe('#B8A87C');
        expect(quantumTheme('dark').palette.primary.main).toBe('#C4A15A');
        expect(quantumTheme('dark', 'explore').palette.primary.main).toBe('#C4A15A');
        expect(quantumTheme('light', 'basics').palette.primary.main).toBe('#8E6011');
    });

    it.each(TEMPER_LEVELS)('%s: palette, selection and focus follow colorsAt(mode, level)', level => {
        for (const mode of THEME_MODES) {
            const t = colorsAt(mode, level);
            const theme = quantumTheme(mode, level);
            expect(theme.palette.background.default).toBe(t['bg-app']);
            expect(theme.palette.background.paper).toBe(t['surface-1']);
            expect(theme.palette.text.primary).toBe(t['text-1']);
            expect(theme.palette.text.secondary).toBe(t['text-2']);
            expect(theme.palette.divider).toBe(t['border-subtle']);
            expect(theme.palette.primary.contrastText).toBe(t['on-accent']);
            const toggle = (theme.components!.MuiToggleButton!.styleOverrides!.root as Record<string, Record<string, unknown>>)['&.Mui-selected, &.Mui-selected:hover'];
            expect(toggle).toEqual({ backgroundColor: t['selected-fill'], color: t['on-fill'], borderColor: t['selected-edge'] });
            const ring = (theme.components!.MuiButtonBase!.styleOverrides!.root as Record<string, Record<string, unknown>>)['&.Mui-focusVisible'];
            expect(ring.outline).toBe(`2px solid ${t['focus-ring']}`);
        }
    });

    it('sizes Basics a little larger: body1 14, caption 13, radius 10 -- and the other levels as before', () => {
        const basics = quantumTheme('dark', 'basics');
        const typography = basics.typography as unknown as Record<string, Record<string, unknown>>;
        expect(typography.body1.fontSize).toBe(14);
        expect(typography.body1.lineHeight).toBe('20px');
        expect(typography.caption.fontSize).toBe(13);
        expect(typography.caption.lineHeight).toBe('18px');
        expect(basics.shape.borderRadius).toBe(10);
        for (const level of ['explore', 'advanced', 'research'] as const) {
            const theme = quantumTheme('dark', level);
            const t = theme.typography as unknown as Record<string, Record<string, unknown>>;
            expect(t.body1.fontSize).toBe(TYPE.body.size);
            expect(t.caption.fontSize).toBe(TYPE.caption.size);
            expect(theme.shape.borderRadius).toBe(8);
        }
    });
});

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
        // The keyboard walk found LevelNav's breadcrumb Links (component="button") showing the browser's `outline: auto`.
        expect((overrides.MuiLink!.styleOverrides!.root as Record<string, unknown>)['&.Mui-focusVisible']).toEqual(ring);
    });

    // Ruling R23b-1 (owner): the outlined input/Select's own focused border is
    // the indicator -- the ring above would land on the inner input/select box
    // and overdraw the floating label -- so it gets no extra outline; its
    // fieldset border is pinned to the focus-ring token at 2 px instead.
    it('gives an outlined input/Select only its own 2 px focused border, in the focus-ring token', () => {
        const outlined = theme.components!.MuiOutlinedInput!.styleOverrides!.root as Record<string, unknown>;
        expect(outlined['&.Mui-focused']).toBeUndefined();
        expect(outlined['&.Mui-focused .MuiOutlinedInput-notchedOutline']).toEqual({
            borderColor: TOKENS[mode]['focus-ring'], borderWidth: 2,
        });
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
