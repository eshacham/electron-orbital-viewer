import { readFileSync } from 'fs';
import { resolve } from 'path';
import { orbitalBox } from '../../src/molecules/orbital_box';
import type { MoleculeBasis, MoleculeMeta } from '../../src/molecules/types';

const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));
const hfBasis: MoleculeBasis = fixture('hf', 'basis.json');
const hfMeta: MoleculeMeta = fixture('hf', 'meta.json');
const n2Basis: MoleculeBasis = fixture('n2', 'basis.json');
/** The molecule's own box, as bondsFieldRequest sizes it: the farthest atom plus MOLECULE_PADDING (6.5 a₀). */
const moleculeBox = (basis: MoleculeBasis) => Math.max(...basis.atoms.map(atom => Math.hypot(...atom))) + 6.5;
const index = (basis: MoleculeBasis, label: string, component = 0) => basis.orbitals.filter(o => o.label === label)[component].index;

// Ruling T10-core: a strip tile meshes its orbital in a box fitted to that orbital.
describe('orbitalBox (ruling T10-core)', () => {
    it('fits a core orbital in a small box centred on its atom (HF 1σ: fluorine 1s)', () => {
        const fluorine = hfMeta.atoms.findIndex(atom => atom.Z === 9);
        const box = orbitalBox(hfBasis, index(hfBasis, '1σ'), moleculeBox(hfBasis));
        expect(box.centre).toEqual(hfBasis.atoms[fluorine]);
        expect(box.halfWidth).toBeLessThan(moleculeBox(hfBasis) / 5);
        // Still wide enough for fluorine's 1s 90 % surface (~0.2 a₀) with room to spare.
        expect(box.halfWidth).toBeGreaterThan(0.5);
    });

    it('fits a core pair over both atoms (N₂ 1σg and 1σu*: the two nitrogen 1s)', () => {
        for (const label of ['1σg', '1σu*']) {
            const box = orbitalBox(n2Basis, index(n2Basis, label), moleculeBox(n2Basis));
            box.centre.forEach(c => expect(c).toBeCloseTo(0, 9));
            const farthest = Math.max(...n2Basis.atoms.map(atom => Math.abs(atom[2])));
            expect(box.halfWidth).toBeGreaterThan(farthest + 0.5);
            expect(box.halfWidth).toBeLessThan(moleculeBox(n2Basis) / 2);
        }
    });

    it('keeps a valence orbital\'s box around every atom, far larger than a core one', () => {
        const limit = moleculeBox(n2Basis);
        const core = orbitalBox(n2Basis, index(n2Basis, '1σg'), limit);
        for (const label of ['3σg', '1πg*', '3σu*']) {
            const box = orbitalBox(n2Basis, index(n2Basis, label), limit);
            expect(box.halfWidth).toBeGreaterThan(2 * core.halfWidth);
            expect(box.halfWidth).toBeLessThanOrEqual(limit);
            for (const atom of n2Basis.atoms) {
                atom.forEach((x, axis) => expect(Math.abs(x - box.centre[axis])).toBeLessThan(box.halfWidth));
            }
        }
    });

    it('is never larger than the molecule\'s box, which it falls back to unchanged', () => {
        expect(orbitalBox(n2Basis, index(n2Basis, '3σu*'), 2)).toEqual({ centre: [0, 0, 0], halfWidth: 2 });
    });
});
