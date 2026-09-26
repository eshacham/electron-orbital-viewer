/**
 * WCAG 2 contrast, for text on the app's translucent panels.
 *
 * The panels float over the 3D view, so what sits behind them changes with
 * the view: the black scene, or a brightly lit lobe. Contrast is therefore
 * checked against the worst of those backdrops, not against the panel colour
 * alone.
 */
export type Rgba = [number, number, number, number];
export type Rgb = [number, number, number];

export function parseCssColor(css: string): Rgba {
    const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim());
    if (!rgba) throw new Error(`Unparsed colour ${css}`);
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
}

export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrastRatio(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** The lowest contrast of `fg` on `panel` over any of the backdrops the panel can sit on. */
export function worstCaseContrast(fg: string, panel: string, backdrops: string[] = ['#050505', '#ffffff']): number {
    return Math.min(...backdrops.map(backdrop => {
        const surface = compositeOver(parseCssColor(panel), compositeOver(parseCssColor(backdrop), [0, 0, 0]));
        return contrastRatio(compositeOver(parseCssColor(fg), surface), surface);
    }));
}
