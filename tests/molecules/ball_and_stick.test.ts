import * as THREE from 'three';
import { detectBonds, anglesAtAtom, describePick, buildBallAndStick, pickMoleculePart, bondLabel } from '../../src/molecules/ball_and_stick';
import { dipoleArrow, formatDipole } from '../../src/molecules/dipole';
import { waterAtoms, methaneAtoms, ozoneAtoms, waterMeta, methaneMeta } from './fixtures';

describe('bonds from distances', () => {
    it('finds water’s two O–H bonds at 0.958 Å, and no H–H', () => {
        const bonds = detectBonds(waterAtoms());
        expect(bonds.map(b => [b.a, b.b])).toEqual([[0, 1], [0, 2]]);
        bonds.forEach(b => expect(b.lengthAngstrom).toBeCloseTo(0.958, 6));
        expect(bondLabel(waterAtoms(), bonds[0])).toBe('O–H');
    });
    it('does not join methane’s hydrogens or ozone’s terminal oxygens', () => {
        expect(detectBonds(methaneAtoms())).toHaveLength(4);
        expect(detectBonds(ozoneAtoms())).toHaveLength(2);
    });
    it('refuses an element it has no radius for, rather than guessing', () => {
        expect(() => detectBonds([{ Z: 26, position: [0, 0, 0] }])).toThrow('no covalent radius for Fe');
    });
});

describe('readouts', () => {
    it('reports water’s angle at O and a hydrogen’s neighbour', () => {
        const atoms = waterAtoms();
        const bonds = detectBonds(atoms);
        expect(anglesAtAtom(atoms, bonds, 0)).toEqual([{ label: 'H–O–H', degrees: 104.5, count: 1 }]);
        expect(describePick(atoms, bonds, { kind: 'atom', index: 0 })).toEqual(['O, atom 1', '∠H–O–H 104.5°']);
        expect(describePick(atoms, bonds, { kind: 'atom', index: 2 })).toEqual(['H, atom 3', 'bonded to O']);
        expect(describePick(atoms, bonds, { kind: 'bond', index: 1 })).toEqual(['O–H 0.958 Å']);
    });
    it('groups methane’s six equal angles', () => {
        const atoms = methaneAtoms();
        expect(anglesAtAtom(atoms, detectBonds(atoms), 0)).toEqual([{ label: 'H–C–H', degrees: 109.5, count: 6 }]);
    });
});

describe('the ball-and-stick group', () => {
    const atoms = waterAtoms();
    const bonds = detectBonds(atoms);
    const group = buildBallAndStick(atoms, bonds);

    it('has a sphere per atom and two half-sticks per bond, tagged for picking', () => {
        const parts = group.children.map(c => c.userData.moleculePart);
        expect(parts.filter(p => p === 'atom')).toHaveLength(3);
        expect(parts.filter(p => p === 'bond')).toHaveLength(4);
    });
    it('picks the atom or bond under a ray', () => {
        const raycaster = new THREE.Raycaster();
        raycaster.set(new THREE.Vector3(10, 0, 0), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toEqual({ kind: 'atom', index: 0 });
        const [, y, z] = atoms[1].position;
        raycaster.set(new THREE.Vector3(10, y / 2, z / 2), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toEqual({ kind: 'bond', index: 0 });
        raycaster.set(new THREE.Vector3(10, 30, 30), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toBeNull();
    });
});

describe('the dipole arrow', () => {
    it('starts at the centre of nuclear charge and is 1 a₀ per debye, pointing − to +', () => {
        const arrow = dipoleArrow(waterMeta())!;
        const atoms = waterAtoms();
        const cz = atoms.reduce((s, a) => s + a.Z * a.position[2], 0) / 10;
        expect(arrow.position.z).toBeCloseTo(cz, 9);
        const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
        expect(direction.z).toBeCloseTo(1, 9);
        expect(arrow.userData.lengthBohr).toBeCloseTo(1.862, 9);
    });
    it('draws no arrow below 0.05 D, where the direction is noise', () => {
        expect(dipoleArrow(methaneMeta())).toBeNull();
    });
    it('states the method and the experimental value', () => {
        expect(formatDipole(waterMeta())).toBe('μ = 1.86 D (B3LYP/def2-TZVP) · experiment 1.855 D');
        expect(formatDipole(methaneMeta())).toBe('μ = 0 by symmetry (computed 0.00 D, B3LYP/def2-TZVP)');
    });
});
