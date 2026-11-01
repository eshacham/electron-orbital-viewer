import { contrastRatio, parseCssColor, worstCaseContrast } from '../../src/a11y/contrast';
import { CANVAS_BACKDROPS, ColorRole, TEMPER_LEVELS, THEME_MODES, TOKENS, VIEWPORT_MODE, colorsAt } from '../../src/design/tokens';

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

    // Brass Instrument: the selected fill is a tint, so its ink (on-fill) is the temper's text-1; the brass fills
    // (accent-fill, avatar, learn-accent-fill) are the accent itself and carry on-accent.
    it('on-fill text on selected-fill is at least 4.5:1', () => {
        expect(ratio(t['on-fill'], t['selected-fill'])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['accent-fill', 'learn-accent-fill', 'avatar'] as const)('on-accent text on %s is at least 4.5:1', fill => {
        expect(ratio(t['on-accent'], t[fill])).toBeGreaterThanOrEqual(4.5);
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

});

// The viewing field is dark in both modes (VIEWPORT_MODE): the title block sits in the field's scope, so its ink and
// its scrim are the field mode's, tempered to the page's level, over the page mode's own field (CANVAS_BACKDROPS).
// Brass Instrument Task 3: at the plan's 72 % the subtitle's text-2 was only 3.70:1 (dark) / 3.12:1 (light field)
// over a fully lit lobe; the scrim is now 84 %, the least whole percent at which text-2 clears 4.5:1 there in every
// temper. Both modes' scrims are checked, so the pair also holds if VIEWPORT_MODE is switched back to a light field.
describe.each(THEME_MODES.flatMap(mode => TEMPER_LEVELS.map(level => [mode, level] as const)))('the title block on a %s page at %s', (mode, level) => {
    const ink = colorsAt(VIEWPORT_MODE[mode], level);
    it.each(THEME_MODES)('reads text-1 and text-2 at AA through %s\'s scrim over the field\'s darkest and lightest points and a lit lobe', scrimMode => {
        const scrim = TOKENS[scrimMode].scrim;
        expect(worstCaseContrast(ink['text-1'], scrim, CANVAS_BACKDROPS[mode])).toBeGreaterThanOrEqual(4.5);
        expect(worstCaseContrast(ink['text-2'], scrim, CANVAS_BACKDROPS[mode])).toBeGreaterThanOrEqual(4.5);
    });
});

// Brass Instrument Task 1: all 8 tempers (2 modes x 4 levels), not just the base.
describe.each(THEME_MODES.flatMap(mode => TEMPER_LEVELS.map(level => [mode, level] as const)))('%s / %s temper', (mode, level) => {
    const t = colorsAt(mode, level);

    // The plan's list is bg-app, surface-1 and surface-2; surface-3 and bg-bar are pinned for Explore above, so every
    // temper meets them too (the plan's text-3 rule moved text-3 for that, tokens.ts).
    it.each(['text-1', 'text-2', 'text-3'] as const)('%s is at least 4.5:1 on every surface', fg => {
        for (const bg of SURFACES) expect([bg, ratio(t[fg], t[bg]) >= 4.5]).toEqual([bg, true]);
    });

    it('accent-text is at least 4.5:1 on surface-1 and surface-2', () => {
        for (const bg of ['surface-1', 'surface-2'] as const) expect([bg, ratio(t['accent-text'], t[bg]) >= 4.5]).toEqual([bg, true]);
    });

    it.each(['selected-edge', 'focus-ring'] as const)('%s is at least 3:1 on bg-app, surface-1 and selected-fill', role => {
        for (const bg of ['bg-app', 'surface-1', 'selected-fill'] as const) expect([bg, ratio(t[role], t[bg]) >= 3]).toEqual([bg, true]);
    });

    it('text-1 is at least 4.5:1 on selected-fill, and on-accent on accent', () => {
        expect(ratio(t['text-1'], t['selected-fill'])).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
    });
});
