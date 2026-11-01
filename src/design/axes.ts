import { TOKENS, type ThemeMode } from './tokens';

export interface AxesStyle {
    line: string;
    lineOpacity: number;
    labels: { x: string; y: string; z: string };
}

/** The axes' opacity (Brass Instrument, the graticule): the ink is a quiet warm neutral, not a full-strength line. */
export const AXES_OPACITY = 0.85;

/**
 * §11.1 "Axes", engraved (Brass Instrument): one warm neutral ink for the lines and the 6 % arrowheads -- the
 * `field-axis` token at 0.85 -- and the labels in text-1, since the orange x label would have read as ψ > 0. The mode
 * is the viewing field's (Appearance.theme), which is dark in both page modes. Chrome, not science: it lives beside
 * the tokens, not in science.ts, because an axis says nothing about phase or density.
 */
export function axesStyle(mode: ThemeMode): AxesStyle {
    const label = TOKENS[mode]['text-1'];
    return { line: TOKENS[mode]['field-axis'], lineOpacity: AXES_OPACITY, labels: { x: label, y: label, z: label } };
}
