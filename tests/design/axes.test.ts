import { AXES_OPACITY, axesStyle } from '../../src/design/axes';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';

// Brass Instrument Task 4 (the graticule): the 3D view's axes are one warm neutral ink at 0.85, the labels in the
// field's text-1. The mode is the viewing field's (Appearance.theme), which is dark in both page modes.
describe('axesStyle', () => {
    it.each(THEME_MODES)('%s: the line is the field-axis token at 0.85 and the labels are the mode\'s text-1', mode => {
        const axes = axesStyle(mode);
        expect(axes.line).toBe(TOKENS[mode]['field-axis']);
        expect(axes.line).toBe('#8F8676');
        expect(axes.lineOpacity).toBe(0.85);
        expect(AXES_OPACITY).toBe(0.85);
        const label = TOKENS[mode]['text-1'];
        expect(axes.labels).toEqual({ x: label, y: label, z: label });
    });

    it('draws no blue or grey of the old schemes, and no phase hue on a label', () => {
        for (const mode of THEME_MODES) {
            expect([axesStyle(mode).line.toUpperCase()]).not.toContain('#4F86FF');
            expect([axesStyle(mode).line.toUpperCase()]).not.toContain('#8090A8');
        }
    });
});
