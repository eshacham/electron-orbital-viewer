import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import {
    accentStops, applyDevBrandParam, BRAND_KEY, brandById, brandPref, BRANDS, currentBrand, DEFAULT_BRAND_ID, exportAppLabel,
} from '../../src/design/brands';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };
afterEach(() => window.localStorage.clear());

describe('brands (spec §5)', () => {
    it('lists the five candidates with QuantumLab the default', () => {
        expect(BRANDS.map(b => b.id)).toEqual(['quantumlab', 'atomvista', 'novalab', 'learnlab', 'moleculeforge']);
        expect(DEFAULT_BRAND_ID).toBe('quantumlab');
        expect(BRANDS.every(b => b.parts.join('') === b.name)).toBe(true);
    });

    it('falls back to the default for an unknown or missing id', () => {
        expect(brandById('nonsense').id).toBe('quantumlab');
        expect(brandById(null).id).toBe('quantumlab');
        window.localStorage.setItem(BRAND_KEY, 'nonsense');
        expect(currentBrand().id).toBe('quantumlab');
    });

    it('stores the owner\'s preview choice under eov.brand', () => {
        brandPref.set('novalab');
        expect(window.localStorage.getItem(BRAND_KEY)).toBe('novalab');
        expect(currentBrand().name).toBe('NovaLab');
    });

    it('takes ?brand= only on the dev server, and only a known id', () => {
        applyDevBrandParam('?brand=atomvista', false);
        expect(currentBrand().id).toBe('quantumlab');
        applyDevBrandParam('?brand=nope', true);
        expect(currentBrand().id).toBe('quantumlab');
        applyDevBrandParam('?brand=atomvista', true);
        expect(currentBrand().id).toBe('atomvista');
    });

    it('labels exports with the brand and keeps the repository id, inside an STL header for every brand', () => {
        expect(exportAppLabel()).toBe('QuantumLab (electron-orbital-viewer)');
        for (const brand of BRANDS) {
            expect(`${exportAppLabel(brand)}, millimetres, 1 a0 = 0.01665 mm`.length).toBeLessThanOrEqual(80);
        }
    });

    it.each(THEME_MODES)('holds every accent stop to 4.5:1 against bg-bar in %s', mode => {
        for (const brand of BRANDS) {
            for (const stop of accentStops(brand.accent[mode])) {
                expect(contrastRatio(rgb(stop), rgb(TOKENS[mode]['bg-bar']))).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('reads a gradient\'s stops and a solid colour alike', () => {
        expect(accentStops('linear-gradient(90deg,#8A6CFF,#C05CF2)')).toEqual(['#8A6CFF', '#C05CF2']);
        expect(accentStops('#5AA9FF')).toEqual(['#5AA9FF']);
    });
});
