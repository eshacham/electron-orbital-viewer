import * as THREE from 'three';
import { anglesAtAtom, BOHR_TO_ANGSTROM, detectBonds } from '../../src/molecules/ball_and_stick';
import { besideBond, declutter, LABEL_ATOM_LIMIT, LABEL_GAP_PX, modelLabels, projectToCanvas, type AngleLabel } from '../../src/molecules/bond_labels';
import { carbonChainAtoms, methaneAtoms, waterAtoms } from './fixtures';

type Point = [number, number, number];
const distance = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// Spec §9.4.1 / ruling P9: every bond's length (3 dp Å) at its midpoint, and the angle (1 dp °) at each atom
// with exactly two bonds -- the numbers the Selection readout (describePick, anglesAtAtom) prints.
describe('modelLabels', () => {
    it('labels water: two O–H lengths at their midpoints, and the angle at O with a 9-point arc', () => {
        const atoms = waterAtoms();
        const bonds = detectBonds(atoms);
        const labels = modelLabels(atoms, bonds, null);
        const lengths = labels.filter(l => l.kind === 'length');
        expect(lengths.map(l => l.text)).toEqual(bonds.map(b => `${b.lengthAngstrom.toFixed(3)} Å`));
        expect(lengths.map(l => l.text)).toEqual(['0.958 Å', '0.958 Å']);
        lengths.forEach((label, i) => {
            const [p, q] = [atoms[bonds[i].a].position, atoms[bonds[i].b].position];
            expect(label.world.map((c, k) => c - (p[k] + q[k]) / 2).every(d => Math.abs(d) < 1e-12)).toBe(true);
        });
        const angles = labels.filter((l): l is AngleLabel => l.kind === 'angle');
        expect(angles).toHaveLength(1);
        expect(angles[0].atom).toBe(0);
        expect(angles[0].text).toBe(`${anglesAtAtom(atoms, bonds, 0)[0].degrees.toFixed(1)}°`);
        expect(angles[0].text).toBe('104.5°');
        const r = (0.35 * 0.958) / BOHR_TO_ANGSTROM;
        expect(angles[0].arc).toHaveLength(9);
        angles[0].arc.forEach(point => expect(distance(point, atoms[0].position)).toBeCloseTo(r, 9));
        // The arc runs from one bond's direction to the other's.
        const along = (point: number[], end: number[]) => new THREE.Vector3(...point).normalize().dot(new THREE.Vector3(...end).normalize());
        expect(along(angles[0].arc[0], atoms[1].position)).toBeCloseTo(1, 9);
        expect(along(angles[0].arc[8], atoms[2].position)).toBeCloseTo(1, 9);
        // The degree label sits on the bisector, outside the arc.
        expect(distance(angles[0].world, atoms[0].position)).toBeCloseTo(1.6 * r, 9);
    });

    // A straight angle (CO₂, HCN, acetylene) has no plane of its own: the arc must still be a half circle
    // around the atom and the label off it -- not collapsed onto the atom centre.
    it('draws a straight angle as a half circle facing the standard view', () => {
        const r0 = 1.16 / BOHR_TO_ANGSTROM;
        const atoms = [{ Z: 6, position: [0, 0, 0] as Point }, { Z: 8, position: [r0, 0, 0] as Point }, { Z: 8, position: [-r0, 0, 0] as Point }];
        const [angle] = modelLabels(atoms, detectBonds(atoms), null).filter((l): l is AngleLabel => l.kind === 'angle');
        expect(angle.text).toBe('180.0°');
        const r = (0.35 * 1.16) / BOHR_TO_ANGSTROM;
        angle.arc.forEach(point => expect(distance(point, [0, 0, 0])).toBeCloseTo(r, 9));
        expect(angle.arc[4][0]).toBeCloseTo(0, 9);
        expect(Math.abs(angle.arc[4][1])).toBeCloseTo(r, 9); // in the x–y plane, which a camera on z faces
        expect(distance(angle.world, [0, 0, 0])).toBeCloseTo(1.6 * r, 9);
    });

    it('labels methane’s four lengths and no angle (C has four bonds, each H one)', () => {
        const atoms = methaneAtoms();
        const labels = modelLabels(atoms, detectBonds(atoms), null);
        expect(labels.map(l => l.kind)).toEqual(['length', 'length', 'length', 'length']);
        expect(labels.every(l => l.text === '1.087 Å')).toBe(true);
    });

    it('above 12 atoms labels nothing until something is picked, then only that', () => {
        const atoms = carbonChainAtoms(LABEL_ATOM_LIMIT + 1);
        const bonds = detectBonds(atoms);
        expect(bonds).toHaveLength(12);
        expect(modelLabels(atoms, bonds, null)).toEqual([]);
        const atAtom = modelLabels(atoms, bonds, { kind: 'atom', index: 5 });
        expect(atAtom).toHaveLength(1);
        expect(atAtom[0]).toMatchObject({ kind: 'angle', atom: 5, text: `${anglesAtAtom(atoms, bonds, 5)[0].degrees.toFixed(1)}°` });
        expect(atAtom[0].text).toBe('111.0°');
        const atBond = modelLabels(atoms, bonds, { kind: 'bond', index: 3 });
        expect(atBond).toEqual([expect.objectContaining({ kind: 'length', bond: 3, text: '1.540 Å' })]);
        // An end carbon has one bond: no angle to draw.
        expect(modelLabels(atoms, bonds, { kind: 'atom', index: 0 })).toEqual([]);
        // At the limit itself, everything.
        const twelve = carbonChainAtoms(LABEL_ATOM_LIMIT);
        expect(modelLabels(twelve, detectBonds(twelve), null)).toHaveLength(11 + 10);
    });

    // Space filling draws no sticks (ruling P8), so no length label hangs between its spheres; the angle is
    // the atom centres' and stays. With no structure drawn there is nothing to label.
    it('drops the lengths for space filling and everything for no structure', () => {
        const atoms = waterAtoms();
        const bonds = detectBonds(atoms);
        expect(modelLabels(atoms, bonds, null, 'space-filling').map(l => l.text)).toEqual(['104.5°']);
        expect(modelLabels(atoms, bonds, null, 'none')).toEqual([]);
        expect(modelLabels(atoms, bonds, null, 'ball-and-stick')).toEqual(modelLabels(atoms, bonds, null));
    });
});

describe('projectToCanvas', () => {
    const camera = () => {
        const c = new THREE.PerspectiveCamera(50, 600 / 400, 0.1, 100);
        c.position.set(0, 0, 10);
        c.lookAt(0, 0, 0);
        c.updateMatrixWorld();
        return c;
    };

    it('puts a point on the camera axis at the canvas centre, in CSS pixels from the top left', () => {
        // Depth (added for declutter, nearest first): the distance in front of the camera.
        expect(projectToCanvas(camera(), 600, 400, [0, 0, 0])).toEqual({ x: 300, y: 200, depth: 10 });
        const upRight = projectToCanvas(camera(), 600, 400, [1, 1, 0])!;
        expect(upRight.x).toBeGreaterThan(300);
        expect(upRight.y).toBeLessThan(200);
    });

    it('returns null for a point behind the camera', () => {
        expect(projectToCanvas(camera(), 600, 400, [0, 0, 20])).toBeNull();
        expect(projectToCanvas(camera(), 600, 400, [0, 0, 10])).toBeNull();
    });
});

// The live check showed water's length pills sitting on the sticks and over the angle's arc, and glycine's
// ten pills piled into one unreadable heap at its default framing: lengths go beside their bond, and a
// label that would overlap a nearer one waits until zooming in makes room.
describe('placing the labels on screen', () => {
    it('puts a length label beside its bond, on the side away from the molecule’s centre, just clear of the line', () => {
        // A horizontal bond above the centre: the label goes up, by half its height plus the gap.
        expect(besideBond({ x: 100, y: 50 }, { x: 80, y: 50 }, { x: 120, y: 50 }, { x: 100, y: 90 }, 60, 20))
            .toEqual({ x: 100, y: 50 - 10 - LABEL_GAP_PX });
        // A vertical bond left of the centre: it goes left, by half its width plus the gap.
        const left = besideBond({ x: 50, y: 100 }, { x: 50, y: 80 }, { x: 50, y: 120 }, { x: 90, y: 100 }, 60, 20);
        expect(left.x).toBeCloseTo(50 - 30 - LABEL_GAP_PX, 9);
        expect(left.y).toBeCloseTo(100, 9);
        // Seen end-on, a bond has no side: above it.
        expect(besideBond({ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 0, y: 0 }, 60, 20)).toEqual({ x: 10, y: 10 - 10 - LABEL_GAP_PX });
    });

    it('shows the nearest of two overlapping labels, both of two apart, and none behind the camera', () => {
        const box = (x: number, depth: number) => ({ x, y: 0, w: 50, h: 16, depth });
        expect(declutter([box(0, 9), box(30, 8)])).toEqual([false, true]);
        expect(declutter([box(0, 9), box(60, 8)])).toEqual([true, true]);
        expect(declutter([box(0, 9), null, box(30, 10)])).toEqual([true, false, false]);
        // Unmeasured (0 × 0) boxes never clash.
        expect(declutter([{ x: 0, y: 0, w: 0, h: 0, depth: 1 }, { x: 0, y: 0, w: 0, h: 0, depth: 2 }])).toEqual([true, true]);
    });

    it('keeps each length label’s bond ends, for placing it beside the bond', () => {
        const atoms = waterAtoms();
        const [first] = modelLabels(atoms, detectBonds(atoms), null);
        expect(first).toMatchObject({ kind: 'length', ends: [atoms[0].position, atoms[1].position] });
    });
});
