// tests/molecules/vdw_radii.test.ts -- the van der Waals radii space filling draws (ruling P8b).
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { VDW_RADII_ANGSTROM, VDW_SOURCE, missingVdwRadii, spaceFillingUnavailableReason } from '../../src/molecules/vdw_radii';
import { ELEMENTS } from '../../src/elements';
import { waterAtoms } from './fixtures';

const Z_OF = new Map(ELEMENTS.map((element, index) => [element.symbol, index + 1]));

describe('van der Waals radii (Bondi 1964; Mantina et al. 2009 where Bondi has none)', () => {
    it('holds Bondi’s values for the elements Bondi lists', () => {
        expect(VDW_RADII_ANGSTROM[1]).toBe(1.20);
        expect(VDW_RADII_ANGSTROM[6]).toBe(1.70);
        expect(VDW_RADII_ANGSTROM[7]).toBe(1.55);
        expect(VDW_RADII_ANGSTROM[8]).toBe(1.52);
        expect(VDW_RADII_ANGSTROM[17]).toBe(1.75);
    });
    it('takes Be, B, Al, Ca and Ge from Mantina et al. 2009', () => {
        expect([4, 5, 13, 20, 32].map(Z => VDW_RADII_ANGSTROM[Z])).toEqual([1.53, 1.92, 1.84, 2.31, 2.11]);
        expect(VDW_SOURCE).toBe('Bondi 1964; Be, B, Al, Ca, Ge from Mantina et al. 2009');
    });
    it('has no radius for Sc–Co, which neither source tabulates, and one for every other element H–Kr', () => {
        for (let Z = 1; Z <= 36; Z++) {
            if (Z >= 21 && Z <= 27) expect(VDW_RADII_ANGSTROM[Z]).toBeUndefined();
            else expect(VDW_RADII_ANGSTROM[Z]).toBeGreaterThan(0);
        }
    });
    it('names the elements without a radius, once each, in the order first met', () => {
        expect(missingVdwRadii([{ Z: 26 }, { Z: 6 }])).toEqual(['Fe']);
        expect(missingVdwRadii([{ Z: 27 }, { Z: 26 }, { Z: 27 }, { Z: 1 }])).toEqual(['Co', 'Fe']);
        expect(missingVdwRadii(waterAtoms())).toEqual([]);
    });
    it('says why space filling is unavailable, naming the element and both sources', () => {
        expect(spaceFillingUnavailableReason([{ Z: 26 }, { Z: 6 }]))
            .toBe('no van der Waals radius tabulated for Fe (Bondi 1964 / Mantina 2009)');
        expect(spaceFillingUnavailableReason([{ Z: 26 }, { Z: 27 }]))
            .toBe('no van der Waals radius tabulated for Fe, Co (Bondi 1964 / Mantina 2009)');
        expect(spaceFillingUnavailableReason(waterAtoms())).toBeNull();
    });
    // Every library molecule can be drawn space-filling: the elements of every formula the library builds
    // (tools/molecules/library.py, read here so a new entry is checked too) all have a radius.
    it('has a radius for every element in the shipped library', () => {
        const source = readFileSync(resolve(__dirname, '../../tools/molecules/library.py'), 'utf8');
        const formulas = [...source.matchAll(/^\s+M\('[a-z0-9]+', '[^']+', '([^']+)'/gm)].map(match => match[1]);
        expect(formulas.length).toBeGreaterThanOrEqual(25);
        const symbols = new Set(formulas.flatMap(formula => formula.match(/[A-Z][a-z]?/g) ?? []));
        expect([...symbols].sort()).toEqual(['B', 'C', 'F', 'H', 'N', 'O', 'P', 'S', 'Si']);
        const atoms = [...symbols].map(symbol => ({ Z: Z_OF.get(symbol)! }));
        expect(missingVdwRadii(atoms)).toEqual([]);
    });
});
