import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import * as brands from '../../src/design/brands';
import { accentStops, BRAND, exportAppLabel } from '../../src/design/brands';
import { THEME_MODES, TOKENS } from '../../src/design/tokens';

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

// Owner R25-B3: the five-brand preview is gone ("they are all the same"); the app has one brand, QuantumLab. This
// replaces the list / unknown-id fallback / eov.brand / ?brand= tests -- there is nothing left to choose or store.
describe('the brand (spec §5, owner R25-B3)', () => {
    it('is QuantumLab, two-tone, and the only one: nothing to pick, store or preview', () => {
        expect(BRAND.name).toBe('QuantumLab');
        expect(BRAND.parts).toEqual(['Quantum', 'Lab']);
        expect(Object.keys(brands).sort()).toEqual(['BRAND', 'accentStops', 'exportAppLabel']);
    });

    it('labels exports with the brand and keeps the repository id, inside an STL header', () => {
        expect(exportAppLabel()).toBe('QuantumLab (electron-orbital-viewer)');
        expect(`${exportAppLabel()}, millimetres, 1 a0 = 0.01665 mm`.length).toBeLessThanOrEqual(80);
    });

    it.each(THEME_MODES)('holds every accent stop to 4.5:1 against bg-bar in %s', mode => {
        const stops = accentStops(BRAND.accent[mode]);
        expect(stops.length).toBeGreaterThan(0);
        for (const stop of stops) {
            expect(contrastRatio(rgb(stop), rgb(TOKENS[mode]['bg-bar']))).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('reads a gradient\'s stops and a solid colour alike', () => {
        expect(accentStops('linear-gradient(90deg,#8A6CFF,#C05CF2)')).toEqual(['#8A6CFF', '#C05CF2']);
        expect(accentStops('#5AA9FF')).toEqual(['#5AA9FF']);
    });
});
