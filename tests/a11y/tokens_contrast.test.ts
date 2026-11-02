import { contrastRatio, parseCssColor, worstCaseContrast } from '../../src/a11y/contrast';
import { AXES_OPACITY } from '../../src/design/axes';
import { hexToOklch, oklchToHex } from '../../src/design/colour_math';
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

    it.each(['success', 'warning', 'danger', 'plot-axis'] as const)('%s text on surface-1 and bg-app is at least 4.5:1', role => {
        expect(ratio(t[role], t['surface-1'])).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[role], t['bg-app'])).toBeGreaterThanOrEqual(4.5);
    });

    // Brass Instrument: the selected fill is a tint, so its ink (on-fill) is the temper's text-1; the brass fills
    // (accent-fill, avatar) are the accent itself and carry on-accent.
    it('on-fill text on selected-fill is at least 4.5:1', () => {
        expect(ratio(t['on-fill'], t['selected-fill'])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['accent-fill', 'avatar'] as const)('on-accent text on %s is at least 4.5:1', fill => {
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

    // Task 4: the 3D view's axes are drawn in field-axis at 0.85 over the field's backdrop (design/axes.ts); a graphic
    // needs 3:1, on the raw ink and on the ink as blended.
    it('field-axis, drawn at the axes opacity, is at least 3:1 against the field\'s canvas', () => {
        const ink = parseCssColor(t['field-axis']);
        const ground = parseCssColor(t['canvas-solid']);
        const blended = ink.slice(0, 3).map((c, i) => Math.round(AXES_OPACITY * c + (1 - AXES_OPACITY) * ground[i])).join(',');
        expect(ratio(t['field-axis'], t['canvas-solid'])).toBeGreaterThanOrEqual(3);
        expect(ratio(`rgb(${blended})`, t['canvas-solid'])).toBeGreaterThanOrEqual(3);
    });

    it('error alerts read', () => {
        expect(ratio(t['error-text'], t['error-bg'])).toBeGreaterThanOrEqual(4.5);
    });

});

// The viewing field is dark in both modes (VIEWPORT_MODE): the title block sits in the field's scope, so its ink and
// its scrim are the field mode's -- its Explore at every level (finish ruling F2) -- over the page mode's own field
// (CANVAS_BACKDROPS). Brass Instrument Task 3: at the plan's 72 % the subtitle's text-2 was only 3.70:1 (dark) /
// 3.12:1 (light field) over a fully lit lobe; the scrim is now 84 %, the least whole percent at which text-2 clears
// 4.5:1 there. Both modes' scrims are checked, so the pair also holds if VIEWPORT_MODE is switched back to a light field.
describe.each(THEME_MODES)('the title block on a %s page', mode => {
    const ink = TOKENS[VIEWPORT_MODE[mode]];
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

    // Final review I2: a status colour is drawn on any of these grounds (a linked admin row is surface-3, the wordmark's
    // ground is bg-bar), so it is pinned on all five in every temper -- dark danger was 4.4:1 on surface-3 before.
    it.each(['success', 'warning', 'danger'] as const)('%s is at least 4.5:1 on every surface', fg => {
        for (const bg of SURFACES) expect([bg, ratio(t[fg], t[bg]) >= 4.5]).toEqual([bg, true]);
    });

    it('accent-text is at least 4.5:1 on bg-bar, the wordmark\'s ground', () => {
        expect(ratio(t['accent-text'], t['bg-bar'])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['selected-edge', 'focus-ring'] as const)('%s is at least 3:1 on bg-app, surface-1 and selected-fill', role => {
        for (const bg of ['bg-app', 'surface-1', 'selected-fill'] as const) expect([bg, ratio(t[role], t[bg]) >= 3]).toEqual([bg, true]);
    });

    it('text-1 is at least 4.5:1 on selected-fill, and on-accent on accent', () => {
        expect(ratio(t['text-1'], t['selected-fill'])).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
    });

    // Hallmark audit (FAIL 40): the search field's resting edge was border-subtle, 1.5:1 against what surrounds it. The
    // control-edge role is 3:1 against the ground (bg-app, bg-bar, surface-1, surface-2) and against the field's own fill
    // (surface-3), the least 0.01 of OKLCH L away from that fill that does it, in border-subtle's own hue and chroma.
    it('control-edge is at least 3:1 on bg-app, bg-bar, surface-1, surface-2 and surface-3 (the search field\'s fill)', () => {
        for (const bg of ['bg-app', 'bg-bar', 'surface-1', 'surface-2', 'surface-3'] as const) expect([bg, ratio(t['control-edge'], t[bg]) >= 3]).toEqual([bg, true]);
    });

    it('control-edge is the smallest 0.01 step of OKLCH L that does it, and stays in the ground\'s hue family', () => {
        const [edgeL, edgeC, edgeH] = hexToOklch(t['control-edge']);
        const [, subtleC, subtleH] = hexToOklch(t['border-subtle']);
        const toward = mode === 'dark' ? -0.01 : 0.01; // one step back toward the surface-3 fill
        const lighter = oklchToHex([edgeL + toward, subtleC, subtleH]);
        const ground = ['bg-bar', 'surface-1', 'surface-3'] as const;
        expect(ground.every(bg => ratio(lighter, t[bg]) >= 3)).toBe(false);
        // The family: chroma within the ground's (hex rounding aside) and a hue within 15 degrees of border-subtle's.
        expect(Math.abs(edgeC - subtleC)).toBeLessThan(0.012);
        const dh = Math.abs(edgeH - subtleH);
        expect(Math.min(dh, 360 - dh)).toBeLessThan(15);
        // And far from the quiet border: it is a different, firmer role.
        expect(ratio(t['border-subtle'], t['surface-3'])).toBeLessThan(2);
    });
});
