import * as THREE from 'three';
import { elementFor } from '../elements';
import type { MoleculeAtom, MoleculePick } from './library_types';

export const BOHR_TO_ANGSTROM = 0.529177210903;
/**
 * Cordero et al., Dalton Trans. 2008, 2832, Table 2 (C sp³; Mn, Fe and Co
 * low-spin): every element a computed molecule may hold (H–Kr, spec §5.1),
 * and no guessing beyond them.
 */
export const COVALENT_RADII_ANGSTROM: Record<number, number> = {
    1: 0.31, 2: 0.28, 3: 1.28, 4: 0.96, 5: 0.84, 6: 0.76, 7: 0.71, 8: 0.66, 9: 0.57, 10: 0.58,
    11: 1.66, 12: 1.41, 13: 1.21, 14: 1.11, 15: 1.07, 16: 1.05, 17: 1.02, 18: 1.06,
    19: 2.03, 20: 1.76, 21: 1.70, 22: 1.60, 23: 1.53, 24: 1.39, 25: 1.39, 26: 1.32, 27: 1.26, 28: 1.24,
    29: 1.32, 30: 1.22, 31: 1.22, 32: 1.20, 33: 1.19, 34: 1.20, 35: 1.20, 36: 1.16,
};
/** Jmol's CPK palette, H–Kr. */
export const CPK_COLORS: Record<number, string> = {
    1: '#ffffff', 2: '#d9ffff', 3: '#cc80ff', 4: '#c2ff00', 5: '#ffb5b5', 6: '#909090', 7: '#3050f8', 8: '#ff0d0d',
    9: '#90e050', 10: '#b3e3f5', 11: '#ab5cf2', 12: '#8aff00', 13: '#bfa6a6', 14: '#f0c8a0', 15: '#ff8000', 16: '#ffff30',
    17: '#1ff01f', 18: '#80d1e3', 19: '#8f40d4', 20: '#3dff00', 21: '#e6e6e6', 22: '#bfc2c7', 23: '#a6a6ab', 24: '#8a99c7',
    25: '#9c7ac7', 26: '#e06633', 27: '#f090a0', 28: '#50d050', 29: '#c88033', 30: '#7d80b0', 31: '#c28f8f', 32: '#668f8f',
    33: '#bd80e3', 34: '#ffa100', 35: '#a62929', 36: '#5cb8d1',
};
export const BOND_TOLERANCE = 1.2;
export const ATOM_RADIUS_FACTOR = 0.4;
export const BOND_RADIUS_BOHR = 0.12;

export interface Bond { a: number; b: number; lengthAngstrom: number }

const symbol = (Z: number) => elementFor(Z)?.symbol ?? `Z${Z}`;
function radius(Z: number): number {
    const r = COVALENT_RADII_ANGSTROM[Z];
    if (r === undefined) throw new Error(`no covalent radius for ${symbol(Z)}`);
    return r;
}
const vec = (atom: MoleculeAtom) => new THREE.Vector3(...atom.position);

/**
 * Connectivity from distance alone: a stick wherever two atoms are closer
 * than 1.2 × the sum of their covalent radii. It says which atoms are
 * joined, not the bond order -- the caption says so.
 */
export function detectBonds(atoms: MoleculeAtom[], tolerance: number = BOND_TOLERANCE): Bond[] {
    atoms.forEach(atom => radius(atom.Z));
    const bonds: Bond[] = [];
    for (let a = 0; a < atoms.length; a++) {
        for (let b = a + 1; b < atoms.length; b++) {
            const d = vec(atoms[a]).distanceTo(vec(atoms[b])) * BOHR_TO_ANGSTROM;
            if (d < tolerance * (radius(atoms[a].Z) + radius(atoms[b].Z))) bonds.push({ a, b, lengthAngstrom: d });
        }
    }
    return bonds;
}

export function bondLabel(atoms: MoleculeAtom[], bond: Bond): string {
    return `${symbol(atoms[bond.a].Z)}–${symbol(atoms[bond.b].Z)}`;
}

export function anglesAtAtom(atoms: MoleculeAtom[], bonds: Bond[], vertex: number): Array<{ label: string; degrees: number; count: number }> {
    const neighbours = bonds.filter(b => b.a === vertex || b.b === vertex).map(b => (b.a === vertex ? b.b : b.a));
    const groups = new Map<string, { label: string; degrees: number; count: number }>();
    for (let i = 0; i < neighbours.length; i++) {
        for (let j = i + 1; j < neighbours.length; j++) {
            const u = vec(atoms[neighbours[i]]).sub(vec(atoms[vertex]));
            const w = vec(atoms[neighbours[j]]).sub(vec(atoms[vertex]));
            const degrees = Math.round(THREE.MathUtils.radToDeg(u.angleTo(w)) * 10) / 10;
            const ends = [symbol(atoms[neighbours[i]].Z), symbol(atoms[neighbours[j]].Z)].sort();
            const label = `${ends[0]}–${symbol(atoms[vertex].Z)}–${ends[1]}`;
            const key = `${label}|${degrees}`;
            const group = groups.get(key) ?? { label, degrees, count: 0 };
            group.count += 1;
            groups.set(key, group);
        }
    }
    return [...groups.values()].sort((p, q) => p.degrees - q.degrees);
}

export function describePick(atoms: MoleculeAtom[], bonds: Bond[], pick: MoleculePick): string[] {
    if (pick.kind === 'bond') {
        const bond = bonds[pick.index];
        return [`${bondLabel(atoms, bond)} ${bond.lengthAngstrom.toFixed(3)} Å`];
    }
    const head = `${symbol(atoms[pick.index].Z)}, atom ${pick.index + 1}`;
    const angles = anglesAtAtom(atoms, bonds, pick.index);
    if (angles.length) return [head, ...angles.map(a => `∠${a.label} ${a.degrees.toFixed(1)}°${a.count > 1 ? ` (×${a.count})` : ''}`)];
    const neighbours = bonds.filter(b => b.a === pick.index || b.b === pick.index).map(b => symbol(atoms[b.a === pick.index ? b.b : b.a].Z));
    return [head, neighbours.length ? `bonded to ${neighbours.join(', ')}` : 'not bonded'];
}

const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const STICK = new THREE.CylinderGeometry(BOND_RADIUS_BOHR, BOND_RADIUS_BOHR, 1, 12);

/**
 * Spheres and half-sticks, each coloured by its own atom. Deliberately not
 * clipped by the cut: the cut is for seeing inside the density, and the
 * structure is what you are looking for in there.
 */
export function buildBallAndStick(atoms: MoleculeAtom[], bonds: Bond[]): THREE.Group {
    const group = new THREE.Group();
    group.userData.isBallAndStick = true;
    const materials = new Map<number, THREE.MeshStandardMaterial>();
    const material = (Z: number) => {
        if (!materials.has(Z)) materials.set(Z, new THREE.MeshStandardMaterial({ color: CPK_COLORS[Z], roughness: 0.45, metalness: 0 }));
        return materials.get(Z)!;
    };
    atoms.forEach((atom, index) => {
        const sphere = new THREE.Mesh(SPHERE, material(atom.Z));
        sphere.scale.setScalar(ATOM_RADIUS_FACTOR * radius(atom.Z) / BOHR_TO_ANGSTROM);
        sphere.position.copy(vec(atom));
        sphere.userData = { moleculePart: 'atom', index };
        group.add(sphere);
    });
    const up = new THREE.Vector3(0, 1, 0);
    bonds.forEach((bond, index) => {
        const [p, q] = [vec(atoms[bond.a]), vec(atoms[bond.b])];
        const middle = p.clone().add(q).multiplyScalar(0.5);
        for (const [end, Z] of [[p, atoms[bond.a].Z], [q, atoms[bond.b].Z]] as Array<[THREE.Vector3, number]>) {
            const half = new THREE.Mesh(STICK, material(Z));
            half.position.copy(end).add(middle).multiplyScalar(0.5);
            half.scale.set(1, end.distanceTo(middle), 1);
            half.quaternion.setFromUnitVectors(up, middle.clone().sub(end).normalize());
            half.userData = { moleculePart: 'bond', index };
            group.add(half);
        }
    });
    group.updateMatrixWorld(true);
    return group;
}

export function pickMoleculePart(overlay: THREE.Object3D, raycaster: THREE.Raycaster): MoleculePick | null {
    for (const hit of raycaster.intersectObject(overlay, true)) {
        const part = hit.object.userData.moleculePart;
        if (part === 'atom' || part === 'bond') return { kind: part, index: hit.object.userData.index };
    }
    return null;
}

/**
 * Materials are per-group; the two ball-and-stick geometries (SPHERE, STICK)
 * are module-level and live for the page. An ArrowHelper's own
 * `dispose()` is NOT used here, and we never recurse into its line/cone
 * children either: their geometries are three.js module-level statics
 * shared by every ArrowHelper in the process (see ArrowHelper's
 * constructor), so disposing them would take out the next molecule's (or
 * any other overlay's) dipole arrow geometry too. Only the arrow's two
 * materials -- which are per-instance -- are ours to dispose.
 */
function disposeNode(node: THREE.Object3D): void {
    if (node instanceof THREE.ArrowHelper) {
        (Array.isArray(node.line.material) ? node.line.material : [node.line.material]).forEach(m => m.dispose());
        (Array.isArray(node.cone.material) ? node.cone.material : [node.cone.material]).forEach(m => m.dispose());
        return;
    }
    if (node instanceof THREE.Mesh) {
        if (node.geometry !== SPHERE && node.geometry !== STICK) node.geometry.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose());
    }
    node.children.forEach(disposeNode);
}

export function disposeOverlay(group: THREE.Object3D): void {
    group.children.forEach(disposeNode);
}
