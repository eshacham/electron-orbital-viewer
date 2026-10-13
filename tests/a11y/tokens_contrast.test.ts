import { contrastRatio, parseCssColor, worstCaseContrast } from '../../src/a11y/contrast';
import { CANVAS_BACKDROPS, ColorRole, THEME_MODES, TOKENS } from '../../src/design/tokens';

/**
 * Spec §13: every text token on every surface it is used on is AA (4.5:1);
 * control edges in their selected state, the focus ring and accents are
 * 3:1 against what they sit on; text over the canvas is checked through its
 * scrim against the canvas's darkest and lightest points and a lit lobe.
 */
const rgb = (css: string): [number, number, number] => {
    const [r, g, b] = parseCssColor(css);
    return [r, g, b];
};
const ratio = (fg: string, bg: string) => contrastRatio(rgb(fg), rgb(bg));
const SURFACES: ColorRole[] = ['bg-app', 'bg-bar', 'surface-1', 'surface-2', 'surface-3'];
const TEXT: ColorRole[] = ['text-1', 'text-2', 'text-3', 'accent-text'];

describe.each(THEME_MODES)('%s tokens', mode => {
    const t = TOKENS[mode];

    it.each(TEXT.flatMap(fg => SURFACES.map(bg => [fg, bg] as const)))('%s on %s is at least 4.5:1', (fg, bg) => {
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['success', 'warning', 'danger', 'learn-accent-text', 'plot-axis'] as const)('%s text on surface-1 and bg-app is at least 4.5:1', role => {
        expect(ratio(t[role], t['surface-1'])).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[role], t['bg-app'])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['accent-fill', 'selected-fill', 'learn-accent-fill', 'avatar'] as const)('on-fill text on %s is at least 4.5:1', fill => {
        expect(ratio(t['on-fill'], t[fill])).toBeGreaterThanOrEqual(4.5);
    });

    // Ruling T2-onaccent: MUI's primary.contrastText (theme.ts) is on-accent,
    // not on-fill -- on-fill's fixed white is only 3.6:1 against dark's accent.
    it('on-accent is at least 4.5:1 against accent', () => {
        expect(ratio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['selected-edge', 'accent', 'focus-ring'] as const)('%s is at least 3:1 against surface-1, surface-2 and bg-app', role => {
        for (const bg of ['surface-1', 'surface-2', 'bg-app'] as const) expect(ratio(t[role], t[bg])).toBeGreaterThanOrEqual(3);
    });

    it('error alerts read', () => {
        expect(ratio(t['error-text'], t['error-bg'])).toBeGreaterThanOrEqual(4.5);
    });

    it('title-block text reads through its scrim over the canvas and a lit lobe', () => {
        for (const fg of ['text-1', 'text-2'] as const) {
            expect(worstCaseContrast(t[fg], t.scrim, CANVAS_BACKDROPS[mode])).toBeGreaterThanOrEqual(4.5);
        }
    });
});
