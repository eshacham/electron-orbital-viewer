import * as THREE from 'three';
import {
    detectBonds, anglesAtAtom, describePick, buildBallAndStick, buildSpaceFilling, pickMoleculePart, bondLabel, disposeOverlay, BOHR_TO_ANGSTROM, CPK_COLORS,
    overlayExtent,
} from '../../src/molecules/ball_and_stick';
import { dipoleArrow, formatDipole, hasDipoleArrow } from '../../src/molecules/dipole';
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
        expect(() => detectBonds([{ Z: 37, position: [0, 0, 0] }])).toThrow('no covalent radius for Rb');
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

// Ruling P8/P8b: space filling draws each atom as its van der Waals sphere -- no sticks -- and the spheres
// keep what the ball-and-stick atoms carry: CPK materials tagged with Z (ruling R12's recolour) and the
// picking tags, so hover and tap still name an atom.
describe('the space-filling group', () => {
    const atoms = waterAtoms();
    const group = buildSpaceFilling(atoms);
    const meshes = group.children as THREE.Mesh[];

    it('has one sphere per atom at its van der Waals radius, and no sticks', () => {
        expect(meshes).toHaveLength(3);
        expect(meshes.map(m => m.userData)).toEqual([
            { moleculePart: 'atom', index: 0 }, { moleculePart: 'atom', index: 1 }, { moleculePart: 'atom', index: 2 },
        ]);
        expect(meshes[0].scale.x).toBeCloseTo(1.52 / BOHR_TO_ANGSTROM, 9);
        expect(meshes[1].scale.x).toBeCloseTo(1.20 / BOHR_TO_ANGSTROM, 9);
        meshes.forEach((m, i) => expect(m.position.toArray()).toEqual(atoms[i].position));
        // The spheres overlap: O–H is 0.958 Å, far less than 1.52 + 1.20 Å.
        expect(meshes[0].position.distanceTo(meshes[1].position) * BOHR_TO_ANGSTROM).toBeLessThan(1.52 + 1.20);
    });
    it('colours each sphere by its element, tagged with Z for the theme’s recolour', () => {
        const materials = meshes.map(m => m.material as THREE.MeshStandardMaterial);
        expect(materials.map(m => m.userData.Z)).toEqual([8, 1, 1]);
        expect(`#${materials[0].color.getHexString()}`).toBe(CPK_COLORS[8]);
        expect(materials[1]).toBe(materials[2]);
    });
    it('picks the atom under a ray', () => {
        const raycaster = new THREE.Raycaster();
        raycaster.set(new THREE.Vector3(10, 0, -2), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toEqual({ kind: 'atom', index: 0 });
        raycaster.set(new THREE.Vector3(10, 30, 30), new THREE.Vector3(-1, 0, 0));
        expect(pickMoleculePart(group, raycaster)).toBeNull();
    });
    it('refuses an element with no tabulated radius, rather than guessing (ruling P8b)', () => {
        expect(() => buildSpaceFilling([{ Z: 26, position: [0, 0, 0] }])).toThrow('no van der Waals radius tabulated for Fe');
    });
});

// Structure only has no surface to frame the camera on; it frames what is drawn instead (ruling T13-I2,
// replacing Task 13's one van-der-Waals bound for every representation, which left ball and stick small).
describe('the drawn overlay’s extent', () => {
    it('reaches a ball-and-stick hydrogen’s ball: its position plus 0.4 of its covalent radius, in bohr', () => {
        expect(overlayExtent(buildBallAndStick(waterAtoms(), detectBonds(waterAtoms())))).toBeCloseTo((0.958 + 0.4 * 0.31) / BOHR_TO_ANGSTROM, 6); // the sphere's vertices are float32
    });
    it('reaches a space-filling hydrogen’s van der Waals surface', () => {
        expect(overlayExtent(buildSpaceFilling(waterAtoms()))).toBeCloseTo((0.958 + 1.20) / BOHR_TO_ANGSTROM, 6);
    });
    it('reaches past the dipole arrow’s tip when the arrow is the farthest thing drawn, and is 0 for nothing', () => {
        const group = new THREE.Group();
        expect(overlayExtent(group)).toBe(0);
        const arrow = dipoleArrow(waterMeta())!;
        group.add(arrow);
        const tip = arrow.position.clone().add(new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion).multiplyScalar(arrow.userData.lengthBohr));
        expect(overlayExtent(group)).toBeGreaterThanOrEqual(tip.length() - 1e-9);
        expect(overlayExtent(group)).toBeLessThan(tip.length() + 0.6);
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
        // The same rule, asked without building the arrow (what a subtitle or an export needs to know).
        expect([hasDipoleArrow(methaneMeta()), hasDipoleArrow(waterMeta())]).toEqual([false, true]);
    });
    it('states the method and the experimental value', () => {
        expect(formatDipole(waterMeta())).toBe('μ = 1.86 D (B3LYP/def2-TZVP) · experiment 1.855 D');
        expect(formatDipole(methaneMeta())).toBe('μ = 0 by symmetry (computed 0.00 D, B3LYP/def2-TZVP)');
    });
    it('disposes an arrow’s own materials but never its line/cone geometry, which every ArrowHelper in the process shares', () => {
        const group = new THREE.Group();
        const arrow = dipoleArrow(waterMeta())!;
        group.add(arrow);
        const lineGeometryDispose = jest.spyOn(arrow.line.geometry, 'dispose');
        const coneGeometryDispose = jest.spyOn(arrow.cone.geometry, 'dispose');
        disposeOverlay(group);
        expect(lineGeometryDispose).not.toHaveBeenCalled();
        expect(coneGeometryDispose).not.toHaveBeenCalled();
        // a second, unrelated arrow still finds its geometry intact and shared, not disposed out from under it.
        const second = dipoleArrow(waterMeta())!;
        expect(second.cone.geometry).toBe(arrow.cone.geometry);
        expect(second.line.geometry).toBe(arrow.line.geometry);
    });
});
