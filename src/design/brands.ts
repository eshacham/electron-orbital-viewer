import { createPref } from './local_pref';

/**
 * The switchable brand (spec §5). Production shows DEFAULT_BRAND_ID until the
 * owner picks a domain -- a one-line change. The owner previews others from
 * the avatar menu; that writes eov.brand in their browser only, and the brand
 * never enters a share link.
 */
export type BrandId = 'quantumlab' | 'atomvista' | 'novalab' | 'learnlab' | 'moleculeforge';

export interface Brand {
    id: BrandId;
    name: string;
    /** The two-tone split: parts[1] renders in the accent. */
    parts: [string, string];
    /** CSS colour or gradient for parts[1], per theme. */
    accent: { dark: string; light: string };
}

export const BRANDS: readonly Brand[] = [
    { id: 'quantumlab', name: 'QuantumLab', parts: ['Quantum', 'Lab'],
        accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: 'linear-gradient(90deg,#3A4BE8,#7B3FE4)' } },
    { id: 'atomvista', name: 'AtomVista', parts: ['Atom', 'Vista'], accent: { dark: '#5AA9FF', light: '#1559D6' } },
    { id: 'novalab', name: 'NovaLab', parts: ['Nova', 'Lab'], accent: { dark: '#5CC8DE', light: '#0E7490' } },
    { id: 'learnlab', name: 'LearnLab', parts: ['Learn', 'Lab'], accent: { dark: 'linear-gradient(90deg,#8A6CFF,#C05CF2)', light: '#6D28D9' } },
    { id: 'moleculeforge', name: 'MoleculeForge', parts: ['Molecule', 'Forge'],
        accent: { dark: 'linear-gradient(90deg,#B05CF0,#D946EF)', light: '#A21CAF' } },
];
export const DEFAULT_BRAND_ID: BrandId = 'quantumlab';
export const BRAND_KEY = 'eov.brand';

export function brandById(id: string | null): Brand {
    return BRANDS.find(brand => brand.id === id) ?? BRANDS.find(brand => brand.id === DEFAULT_BRAND_ID)!;
}

export const brandPref = createPref<BrandId>(BRAND_KEY, {
    decode: raw => brandById(raw).id,
    encode: id => id,
});

export function currentBrand(): Brand {
    return brandById(brandPref.get());
}

/** Export metadata (spec §5): the brand, with the repository id kept for traceability. */
export function exportAppLabel(brand: Brand = currentBrand()): string {
    return `${brand.name} (electron-orbital-viewer)`;
}

/** Dev server only (spec §5): `?brand=<id>` previews a brand for quick screenshots. */
export function applyDevBrandParam(search: string, dev: boolean): void {
    if (!dev) return;
    const id = new URLSearchParams(search).get('brand');
    if (id && BRANDS.some(brand => brand.id === id)) brandPref.set(id as BrandId);
}

/** The #rrggbb stops of a gradient, or the one colour of a solid accent. */
export function accentStops(accent: string): string[] {
    return accent.match(/#[0-9a-fA-F]{6}/g) ?? [];
}
