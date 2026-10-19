import { readFileSync } from 'fs';
import { resolve } from 'path';
import { frontierOccupied, frontierOrbitals } from '../../src/molecules/orbital_display';
import type { MoleculeMeta } from '../../src/molecules/types';
import { waterMeta } from './fixtures';

// The library's own files (data v3), as published: water (closed shell, a constructed LVMO) and NO₂ (open shell).
const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));
const h2o: MoleculeMeta = fixture('h2o', 'meta.json');
const no2: MoleculeMeta = fixture('no2', 'meta.json');
const o2: MoleculeMeta = fixture('o2', 'meta.json');

describe('frontier orbitals (preflight D8)', () => {
    it('lists each role the data name, once, in HOMO · SOMO · LUMO · LVMO order', () => {
        expect(frontierOrbitals(h2o.orbitals).map(f => [f.role, f.orbital.index, f.orbital.label])).toEqual([
            ['HOMO', 4, '1b1'], ['LUMO', 5, '4a1'], ['LVMO', 10, 'a1'],
        ]);
    });

    it('names an open shell\'s SOMO by its own role, beside the HOMO the data also name (NO₂)', () => {
        expect(frontierOrbitals(no2.orbitals).map(f => [f.role, f.orbital.index, f.orbital.label])).toEqual([
            ['HOMO', 10, '4b2'], ['SOMO', 11, '6a1'], ['LUMO', 12, '2b1'],
        ]);
        // The view opens on the HOMO where the data name one.
        expect(frontierOccupied(no2.orbitals)?.index).toBe(10);
    });

    it('opens on the SOMO where the data name no HOMO (O₂, spin-unrestricted)', () => {
        expect(o2.orbitals.some(o => o.role === 'HOMO')).toBe(false);
        expect(frontierOccupied(o2.orbitals)).toMatchObject({ index: 7, role: 'SOMO' });
    });

    it('lets the first member stand for a degenerate set', () => {
        const orbitals = [
            { index: 3, label: '1e1g', energyHartree: -0.25, occupation: 2, role: 'HOMO' as const },
            { index: 2, label: '1e1g', energyHartree: -0.25, occupation: 2, role: 'HOMO' as const },
            { index: 4, label: '1e2u', energyHartree: -0.05, occupation: 0, role: 'LUMO' as const },
        ];
        expect(frontierOrbitals(orbitals).map(f => f.orbital.index)).toEqual([2, 4]);
    });

    it('finds nothing in older data that names no role', () => {
        const orbitals = waterMeta().orbitals.map(({ role: _role, ...rest }) => rest);
        expect(frontierOrbitals(orbitals)).toEqual([]);
        expect(frontierOccupied(orbitals)).toBeNull();
    });
});
