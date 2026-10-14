import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { deltaE76, hexToLab } from '../../src/design/colour_math';
import {
    axesStyle, CURVE_COLORS_LIGHT, DENSITY_SURFACE, LIGHT_HYDROGEN, curvePalette, densitySurfaceHex, displayRgb, linearRgb,
    PHASE_HUES, phaseColours, themeCurveColour,
} from '../../src/design/science';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';
import { CURVE_COLORS } from '../../src/curve_colors';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

describe('science colours (spec §4.2, §11)', () => {
    // Ruling R22a (owner) replaces "Classic is exactly today's constants": one look per theme, no scheme.
    it('gives each theme one density colour and one axes style, the labels in text-1', () => {
        for (const theme of THEME_MODES) {
            expect(densitySurfaceHex(theme)).toBe(DENSITY_SURFACE[theme]);
            const axes = axesStyle(theme);
            expect(axes.labels).toEqual({ x: TOKENS[theme]['text-1'], y: TOKENS[theme]['text-1'], z: TOKENS[theme]['text-1'] });
        }
        expect(axesStyle('dark')).toMatchObject({ line: '#4F86FF', lineOpacity: 0.7 });
        expect(axesStyle('light')).toMatchObject({ line: '#8090A8', lineOpacity: 1 });
        expect(displayRgb(PHASE_HUES.positive).map(c => Math.round(c * 255))).toEqual([0xff, 0x7a, 0x2f]);
        expect(linearRgb('#FFFFFF')).toEqual([1, 1, 1]);
    });

    it('holds Light Clean\'s hydrogen (ruling R12), off CPK white so it does not vanish on the page', () => {
        expect(LIGHT_HYDROGEN).toBe('#F2F2F2');
        expect(LIGHT_HYDROGEN.toLowerCase()).not.toBe('#ffffff');
    });

    // Ruling R22a: the key, PNG legend, surface and cut face all read the one `positive`/`negative` pair
    // (the separate legend and cap fields existed only for Classic, and went with it).
    it('the phase key, PNG legend and surface are one colour pair (one source)', () => {
        for (const theme of THEME_MODES) {
            expect(Object.keys(phaseColours(theme)).sort()).toEqual(['negative', 'positive', 'rimNegative', 'rimPositive']);
        }
        expect(phaseColours('dark').positive).toBe('#FF7A2F');
        // Ruling R20a-1: one phase pair in both themes (Light Clean's ψ < 0 was #1F5FE0).
        expect(phaseColours('light').negative).toBe('#2F6BFF');
    });

    // Ruling R20a-1 (owner): the lobes are the same hues in Deep Space and Light Clean;
    // only the rim differs (added light on dark, a darker ink of the same phase on white).
    it('paints ψ > 0 and ψ < 0 in the same hues in both themes, the rims apart', () => {
        const dark = phaseColours('dark');
        const light = phaseColours('light');
        expect([light.positive, light.negative]).toEqual([dark.positive, dark.negative]);
        expect([light.positive, light.negative]).toEqual([PHASE_HUES.positive, PHASE_HUES.negative]);
        expect(light.rimPositive).not.toBe(dark.rimPositive);
        // Ink: darker than the hue it rims, in L*.
        expect(hexToLab(light.rimPositive)[0]).toBeLessThan(hexToLab(light.positive)[0]);
        expect(hexToLab(light.rimNegative)[0]).toBeLessThan(hexToLab(light.negative)[0]);
    });

    // Ruling R20a-1: the key's swatch, not the hue, carries 3:1 against the key's
    // panel (WCAG 1.4.11): the fill itself, or else the swatch-ring outline.
    it('every ψ key swatch reaches 3:1 against its panel, by its fill or by its ring', () => {
        for (const theme of THEME_MODES) {
            const panel = rgb(TOKENS[theme]['surface-2']);
            const ring = parseCssColor(TOKENS[theme]['swatch-ring']);
            const ringPasses = ring[3] === 1 && contrastRatio([ring[0], ring[1], ring[2]], panel) >= 3;
            const p = phaseColours(theme);
            for (const hex of [p.positive, p.negative]) {
                expect(contrastRatio(rgb(hex), panel) >= 3 || ringPasses).toBe(true);
            }
        }
        // Light Clean's orange alone is under 3:1 on its panel: that is what the ring is for.
        expect(contrastRatio(rgb(PHASE_HUES.positive), rgb(TOKENS.light['surface-2']))).toBeLessThan(3);
    });

    it('separates + from − by colour and by lightness (ΔE ≥ 130; different L*)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme);
            const [plus, minus] = [hexToLab(p.positive), hexToLab(p.negative)];
            expect(deltaE76(plus, minus)).toBeGreaterThanOrEqual(130);
            expect(Math.abs(plus[0] - minus[0])).toBeGreaterThanOrEqual(10);
        }
    });

    it('tints each rim with its own phase, never the other phase\'s hue (§11.2 ruling)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme);
            const near = (rim: string, own: string, other: string) => deltaE76(hexToLab(rim), hexToLab(own)) < deltaE76(hexToLab(rim), hexToLab(other));
            expect(near(p.rimPositive, p.positive, p.negative)).toBe(true);
            expect(near(p.rimNegative, p.negative, p.positive)).toBe(true);
        }
    });

    it('keeps curve identity across themes, every light curve ≥ 3:1 on white', () => {
        expect(CURVE_COLORS_LIGHT).toHaveLength(CURVE_COLORS.length);
        for (const hex of CURVE_COLORS_LIGHT) expect(contrastRatio(rgb(hex), [255, 255, 255])).toBeGreaterThanOrEqual(3);
        expect(curvePalette('dark')).toBe(CURVE_COLORS);
        expect(curvePalette('light')).toBe(CURVE_COLORS_LIGHT);
        expect(themeCurveColour(CURVE_COLORS[3], CURVE_COLORS_LIGHT)).toBe(CURVE_COLORS_LIGHT[3]);
        expect(themeCurveColour('#123456', CURVE_COLORS_LIGHT)).toBe('#123456');
    });
});
