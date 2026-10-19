import { readFileSync } from 'fs';
import { resolve } from 'path';
import { basisCentredOn, orbitalBox } from '../../src/molecules/orbital_box';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { sampleFieldSource } from '../../src/orbital_mesh';
import { isoLevelForEnclosedFraction } from '../../src/radial_distribution';
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
        // Ruling T10-core-I1: the centre is the midpoint of the atom's spheres, so it equals the atom to rounding.
        box.centre.forEach((c, axis) => expect(c).toBeCloseTo(hfBasis.atoms[fluorine][axis], 12));
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

/**
 * Ruling T10-core-I1/I2: the fitted box must never cut the surface. These two
 * scan points (v3 data, basis.json as published: C₂ at scan point 01, F₂ at
 * equilibrium, 07) are where a 5 % per-shell cut dropped the diffuse shells
 * that set an orbital's reach -- C₂'s 3σu* at 90 %, F₂'s occupied 3σg at 99 %.
 * Every fitted tile is sampled exactly as the strip samples it (40³, the basis
 * moved to the box's centre), and no sample on the box's faces may reach the
 * tile's own iso level: if one did, the 90 % (99 %) surface would cross the
 * face and the tile would show a cut-open shape. The full sweep over every
 * molecule and scan point is tools/thumbs/validate_tile_boxes.mjs.
 */
describe('orbitalBox never cuts a surface (rulings T10-core-I1/I2)', () => {
    const faceOverIso = (basis: MoleculeBasis, orbitalIndex: number, fractions: number[]) => {
        const limit = moleculeBox(basis);
        const { centre, halfWidth } = orbitalBox(basis, orbitalIndex, limit);
        if (halfWidth >= limit) return null;
        const moved = basisCentredOn(basis, centre);
        registerMoleculeBasis(moved);
        const { id } = moved;
        const { samples, side } = sampleFieldSource({ kind: 'analytic', id, rMax: halfWidth, recipe: { type: 'gaussianMO', moleculeId: id, index: orbitalIndex } }, 40);
        let face = 0;
        for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
            if (i !== 0 && i !== side - 1 && j !== 0 && j !== side - 1 && k !== 0 && k !== side - 1) continue;
            face = Math.max(face, samples[(i * side + j) * side + k] ** 2);
        }
        return fractions.map(f => face / isoLevelForEnclosedFraction(samples, f));
    };

    for (const point of ['c2-01', 'f2-07']) {
        it(`keeps every tile of ${point} inside its box at 90 % and at 99 %`, () => {
            const basis: MoleculeBasis = fixture(point, 'basis.json');
            const cut: string[] = [];
            for (const orbital of basis.orbitals) {
                const ratios = faceOverIso(basis, orbital.index, [0.9, 0.99]);
                ratios?.forEach((ratio, i) => {
                    if (ratio >= 1) cut.push(`${orbital.label} at ${[90, 99][i]} %: face/iso ${ratio.toFixed(2)}`);
                });
            }
            expect(cut).toEqual([]);
        });
    }
});

