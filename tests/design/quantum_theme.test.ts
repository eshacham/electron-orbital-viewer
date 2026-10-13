import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { quantumTheme } from '../../src/design/theme';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';

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
});
