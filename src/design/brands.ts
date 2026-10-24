/**
 * The brand (spec §5). Owner R25-B3: the avatar menu's five-brand preview
 * is gone ("they are all the same"), so the app has the one brand,
 * QuantumLab -- no choice to store (a stored eov.brand from before is never
 * read), no ?brand= preview, nothing in a share link.
 */
export interface Brand {
    name: string;
    /** The two-tone split: parts[1] renders in the accent. */
    parts: [string, string];
    /** CSS colour or gradient for parts[1], per theme. */
    accent: { dark: string; light: string };
}

export const BRAND: Brand = {
    name: 'QuantumLab', parts: ['Quantum', 'Lab'],
    accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: 'linear-gradient(90deg,#3A4BE8,#7B3FE4)' },
};

/** Export metadata (spec §5): the brand, with the repository id kept for traceability. */
export function exportAppLabel(): string {
    return `${BRAND.name} (electron-orbital-viewer)`;
}

/** The #rrggbb stops of a gradient, or the one colour of a solid accent. */
export function accentStops(accent: string): string[] {
    return accent.match(/#[0-9a-fA-F]{6}/g) ?? [];
}
