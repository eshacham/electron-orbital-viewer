import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { deltaE76, hexToLab } from '../../src/design/colour_math';
import {
    axesStyle, CLASSIC, CURVE_COLORS_LIGHT, LIGHT_HYDROGEN, curvePalette, DENSITY_RAMP, densitySurfaceHex, displayRgb, linearRgb,
    PHASE_HUES, phaseColours, themeCurveColour,
} from '../../src/design/science';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';
import { CURVE_COLORS } from '../../src/curve_colors';
import { DENSITY_SURFACE_HEX } from '../../src/bonds/systems';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

describe('science colours (spec §4.2, §11)', () => {
    it('Classic is exactly today\'s constants, in both themes (§11.3)', () => {
        for (const theme of THEME_MODES) {
            expect(phaseColours(theme, 'classic')).toEqual({
                positive: '#FF0000', negative: '#0000FF', legendPositive: '#e02020', legendNegative: '#2040ff',
                capPositive: '#D42020', capNegative: '#2030D4', rimPositive: null, rimNegative: null,
            });
            expect(densitySurfaceHex(theme, 'classic').toLowerCase()).toBe(DENSITY_SURFACE_HEX.toLowerCase());
            expect(curvePalette(theme, 'classic')).toBe(CURVE_COLORS);
            expect(axesStyle(theme, 'classic')).toMatchObject({ perAxis: true, labels: CLASSIC.axisLabels });
        }
        expect(linearRgb(CLASSIC.positive)).toEqual([1, 0, 0]);
        expect(linearRgb(CLASSIC.negative)).toEqual([0, 0, 1]);
        expect(displayRgb(CLASSIC.capPositive).map(c => Math.round(c * 255))).toEqual([0xd4, 0x20, 0x20]);
    });

    it('holds Light Clean\'s hydrogen (ruling R12), off CPK white so it does not vanish on the page', () => {
        expect(LIGHT_HYDROGEN).toBe('#F2F2F2');
        expect(LIGHT_HYDROGEN.toLowerCase()).not.toBe('#ffffff');
    });

    it('the phase scheme\'s key, PNG legend and surface are one colour pair (one source)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme, 'phase');
            expect([p.legendPositive, p.legendNegative]).toEqual([p.positive, p.negative]);
            expect([p.capPositive, p.capNegative]).toEqual([p.positive, p.negative]);
            expect(phaseColours(theme, 'density')).toEqual(p);
        }
        expect(phaseColours('dark', 'phase').positive).toBe('#FF7A2F');
        // Ruling R20a-1: one phase pair in both themes (Light Clean's ψ < 0 was #1F5FE0).
        expect(phaseColours('light', 'phase').negative).toBe('#2F6BFF');
    });

    // Ruling R20a-1 (owner): the lobes are the same hues in Deep Space and Light Clean;
    // only the rim differs (added light on dark, a darker ink of the same phase on white).
    it('paints ψ > 0 and ψ < 0 in the same hues in both themes, the rims apart', () => {
        const dark = phaseColours('dark', 'phase');
        const light = phaseColours('light', 'phase');
        expect([light.positive, light.negative]).toEqual([dark.positive, dark.negative]);
        expect([light.positive, light.negative]).toEqual([PHASE_HUES.positive, PHASE_HUES.negative]);
        expect(light.rimPositive).not.toBe(dark.rimPositive);
        // Ink: darker than the hue it rims, in L*.
        expect(hexToLab(light.rimPositive!)[0]).toBeLessThan(hexToLab(light.positive)[0]);
        expect(hexToLab(light.rimNegative!)[0]).toBeLessThan(hexToLab(light.negative)[0]);
    });

    // Ruling R20a-1: the key's swatch, not the hue, carries 3:1 against the key's
    // panel (WCAG 1.4.11): the fill itself, or else the swatch-ring outline.
    it('every ψ key swatch reaches 3:1 against its panel, by its fill or by its ring', () => {
        for (const theme of THEME_MODES) {
            const panel = rgb(TOKENS[theme]['surface-2']);
            const ring = parseCssColor(TOKENS[theme]['swatch-ring']);
            const ringPasses = ring[3] === 1 && contrastRatio([ring[0], ring[1], ring[2]], panel) >= 3;
            const p = phaseColours(theme, 'phase');
            for (const hex of [p.legendPositive, p.legendNegative]) {
                expect(contrastRatio(rgb(hex), panel) >= 3 || ringPasses).toBe(true);
            }
        }
        // Light Clean's orange alone is under 3:1 on its panel: that is what the ring is for.
        expect(contrastRatio(rgb(PHASE_HUES.positive), rgb(TOKENS.light['surface-2']))).toBeLessThan(3);
    });

    it('separates + from − by colour and by lightness (ΔE ≥ 130; different L*)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme, 'phase');
            const [plus, minus] = [hexToLab(p.positive), hexToLab(p.negative)];
            expect(deltaE76(plus, minus)).toBeGreaterThanOrEqual(130);
            expect(Math.abs(plus[0] - minus[0])).toBeGreaterThanOrEqual(10);
        }
    });

    it('tints each rim with its own phase, never the other phase\'s hue (§11.2 ruling)', () => {
        for (const theme of THEME_MODES) {
            const p = phaseColours(theme, 'phase');
            const near = (rim: string, own: string, other: string) => deltaE76(hexToLab(rim), hexToLab(own)) < deltaE76(hexToLab(rim), hexToLab(other));
            expect(near(p.rimPositive!, p.positive, p.negative)).toBe(true);
            expect(near(p.rimNegative!, p.negative, p.positive)).toBe(true);
        }
    });

    it('ramps the density strictly upwards in lightness, 16.7 → 93.6', () => {
        const L = DENSITY_RAMP.map(hex => hexToLab(hex)[0]);
        expect(L[0]).toBeCloseTo(16.7, 1);
        expect(L[L.length - 1]).toBeCloseTo(93.6, 1);
        for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThan(L[i - 1]);
    });

    it('keeps curve identity across themes, every light curve ≥ 3:1 on white', () => {
        expect(CURVE_COLORS_LIGHT).toHaveLength(CURVE_COLORS.length);
        for (const hex of CURVE_COLORS_LIGHT) expect(contrastRatio(rgb(hex), [255, 255, 255])).toBeGreaterThanOrEqual(3);
        expect(curvePalette('dark', 'phase')).toBe(CURVE_COLORS);
        expect(curvePalette('light', 'phase')).toBe(CURVE_COLORS_LIGHT);
        expect(themeCurveColour(CURVE_COLORS[3], CURVE_COLORS_LIGHT)).toBe(CURVE_COLORS_LIGHT[3]);
        expect(themeCurveColour('#123456', CURVE_COLORS_LIGHT)).toBe('#123456');
    });
});
