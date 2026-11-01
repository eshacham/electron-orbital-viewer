import * as brands from '../../src/design/brands';
import { BRAND, exportAppLabel } from '../../src/design/brands';

// Owner R25-B3: the five-brand preview is gone ("they are all the same"); the app has one brand, QuantumLab. This
// replaces the list / unknown-id fallback / eov.brand / ?brand= tests -- there is nothing left to choose or store.
describe('the brand (spec §5, owner R25-B3)', () => {
    it('is QuantumLab, two-tone, and the only one: nothing to pick, store or preview', () => {
        expect(BRAND.name).toBe('QuantumLab');
        expect(BRAND.parts).toEqual(['Quantum', 'Lab']);
        expect(Object.keys(brands).sort()).toEqual(['BRAND', 'exportAppLabel']);
        // Brass Instrument Ruling P1: the wordmark is one colour, accent-text from tokens.css, so a Brand carries no
        // accent or gradient stops (the 4.5:1 check on the stops moved to the accent-text rows of tokens_contrast.test.ts).
        expect(Object.keys(BRAND).sort()).toEqual(['name', 'parts']);
    });

    it('labels exports with the brand and keeps the repository id, inside an STL header', () => {
        expect(exportAppLabel()).toBe('QuantumLab (electron-orbital-viewer)');
        expect(`${exportAppLabel()}, millimetres, 1 a0 = 0.01665 mm`.length).toBeLessThanOrEqual(80);
    });
});
