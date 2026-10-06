import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { canonicalToBohr, projectStructure, symmetricEigen, Vec } from '../../src/jobs/structure_projection';
import StructurePreview from '../../src/components/StructurePreview';
import { BOHR_TO_ANGSTROM, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../../src/molecules/ball_and_stick';
import type { CanonicalAtom } from '../../src/jobs/api_types';

const WATER: CanonicalAtom[] = [[1, 0, -0.75545, -0.47116], [1, 0, 0.75545, -0.47116], [8, 0, 0, 0.11779]];

/** Benzene in the xy plane, then tilted by two arbitrary rotations: PubChem never hands it over face-on. */
function tiltedBenzene(): CanonicalAtom[] {
    const atoms: CanonicalAtom[] = [];
    for (let i = 0; i < 6; i++) {
        const t = (i * Math.PI) / 3;
        atoms.push([6, 1.397 * Math.cos(t), 1.397 * Math.sin(t), 0], [1, 2.481 * Math.cos(t), 2.481 * Math.sin(t), 0]);
    }
    const [a, b] = [0.7, 0.45];
    return atoms.map(([Z, x, y, z]) => {
        const [y1, z1] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
        const [x2, z2] = [x * Math.cos(b) + z1 * Math.sin(b), -x * Math.sin(b) + z1 * Math.cos(b)];
        return [Z, x2 + 0.3, y1 - 1.2, z2 + 2.0];
    });
}

const det = (u: Vec, v: Vec, w: Vec) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);

describe('H–Kr in the structure overlay', () => {
    it('knows every element a computed molecule may hold, and nothing past krypton', () => {
        for (let Z = 1; Z <= 36; Z++) {
            expect(COVALENT_RADII_ANGSTROM[Z]).toBeGreaterThan(0);
            expect(CPK_COLORS[Z]).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(COVALENT_RADII_ANGSTROM[37]).toBeUndefined();
    });
    it('bonds hydrogen chloride and ferrocene-like Fe–C distances', () => {
        const hcl = [{ Z: 1, position: [0, 0, 0] as Vec }, { Z: 17, position: [0, 0, 1.275 / BOHR_TO_ANGSTROM] as Vec }];
        expect(detectBonds(hcl)).toHaveLength(1);
        const feC = [{ Z: 26, position: [0, 0, 0] as Vec }, { Z: 6, position: [0, 0, 2.05 / BOHR_TO_ANGSTROM] as Vec }];
        expect(detectBonds(feC)).toHaveLength(1);
    });
});

describe('symmetricEigen', () => {
    it('recovers the axes of a rotated diagonal matrix, largest first', () => {
        const c = Math.cos(Math.PI / 6);
        const s = Math.sin(Math.PI / 6);
        const R = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
        const D = [5, 2, 1];
        const M = [0, 1, 2].map(i => [0, 1, 2].map(j => [0, 1, 2].reduce((sum, k) => sum + R[i][k] * D[k] * R[j][k], 0)));
        const { values, vectors } = symmetricEigen(M);
        values.forEach((value, i) => expect(value).toBeCloseTo(D[i], 10));
        expect(Math.abs(vectors[0][0] * c + vectors[0][1] * s)).toBeCloseTo(1, 10);
        expect(Math.abs(vectors[2][2])).toBeCloseTo(1, 10);
    });
});

describe('projectStructure', () => {
    it('shows a planar molecule face-on whatever orientation it came in', () => {
        const projection = projectStructure(tiltedBenzene());
        projection.atoms.forEach(atom => expect(Math.abs(atom.depth)).toBeLessThan(1e-9));
        expect(projection.bonds).toHaveLength(12);
    });
    it('is a rotation, never a mirror: a chiral centre keeps its handedness', () => {
        // Bromochlorofluoromethane: C at the origin, four substituents on a tetrahedron.
        const atoms: CanonicalAtom[] = [[6, 0, 0, 0], [1, 0.63, 0.63, 0.63], [9, -0.8, -0.8, 0.8], [17, -1.0, 1.0, -1.0], [35, 1.1, -1.1, -1.1]];
        const original = (Z: number): Vec => { const a = atoms.find(x => x[0] === Z)!; return [a[1], a[2], a[3]]; };
        const projection = projectStructure(atoms, 0.4);
        const p = (Z: number): Vec => { const a = projection.atoms.find(x => x.Z === Z)!; return [a.x, a.y, a.depth]; };
        const sub = (u: Vec, v: Vec): Vec => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
        const before = det(sub(original(9), original(6)), sub(original(17), original(6)), sub(original(35), original(6)));
        const after = det(sub(p(9), p(6)), sub(p(17), p(6)), sub(p(35), p(6)));
        expect(Math.sign(after)).toBe(Math.sign(before));
        expect(after).toBeCloseTo(before, 9);
    });
    it('turns about the vertical: y stays, x and depth rotate', () => {
        const flat = projectStructure(WATER, 0);
        const turned = projectStructure(WATER, Math.PI / 2);
        const byIndex = (projection: ReturnType<typeof projectStructure>, i: number) => projection.atoms.find(a => a.index === i)!;
        for (const i of [0, 1, 2]) {
            expect(byIndex(turned, i).y).toBeCloseTo(byIndex(flat, i).y, 9);
            expect(Math.abs(byIndex(turned, i).depth)).toBeCloseTo(Math.abs(byIndex(flat, i).x), 9);
        }
    });
    it('lists atoms farthest first, so nearer ones are drawn over them', () => {
        const depths = projectStructure(tiltedBenzene(), 1.0).atoms.map(a => a.depth);
        expect(depths).toEqual([...depths].sort((p, q) => p - q));
    });
    it('converts Å to bohr for the bonding rule', () => {
        expect(canonicalToBohr([[8, 0.529177210903, 0, 0]])[0].position[0]).toBeCloseTo(1, 12);
    });
});

describe('<StructurePreview>', () => {
    it('draws a circle per atom and two half-sticks per bond', () => {
        const { container } = render(<StructurePreview atoms={WATER} />);
        expect(screen.getByRole('img', { name: 'preview of the resolved structure, 3 atoms' })).toBeInTheDocument();
        expect(container.querySelectorAll('circle')).toHaveLength(3);
        expect(container.querySelectorAll('.structure-preview-bond line')).toHaveLength(4);
    });
    it('turns when asked', () => {
        const { container } = render(<StructurePreview atoms={WATER} />);
        const xs = () => Array.from(container.querySelectorAll('circle')).map(c => Number(c.getAttribute('cx')).toFixed(6));
        const before = xs();
        fireEvent.click(screen.getByRole('button', { name: 'turn the preview' }));
        expect(xs()).not.toEqual(before);
    });
});
