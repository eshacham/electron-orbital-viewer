/**
 * The brand (spec §5). Owner R25-B3: the avatar menu's five-brand preview
 * is gone ("they are all the same"), so the app has the one brand,
 * QuantumLab -- no choice to store (a stored eov.brand from before is never
 * read), no ?brand= preview, nothing in a share link.
 */
export interface Brand {
    name: string;
    /** The name's two parts, as two spans; the wordmark is one colour (Brass Instrument, Ruling P1). */
    parts: [string, string];
}

export const BRAND: Brand = {
    name: 'QuantumLab', parts: ['Quantum', 'Lab'],
};

/** Export metadata (spec §5): the brand, with the repository id kept for traceability. */
export function exportAppLabel(): string {
    return `${BRAND.name} (electron-orbital-viewer)`;
}
