import * as THREE from 'three';
import { anglesAtAtom, BOHR_TO_ANGSTROM, type Bond, type Representation } from './ball_and_stick';
import type { MoleculeAtom, MoleculePick } from './library_types';

/** Spec §9.4.1: above this many atoms only the picked atom or bond is labelled, to avoid clutter. */
export const LABEL_ATOM_LIMIT = 12;

type Point = [number, number, number];
/** A bond's length, anchored at its midpoint, with the bond's two ends (bohr, the scene's units). */
export interface LengthLabel { kind: 'length'; bond: number; text: string; world: Point; ends: [Point, Point] }
/** The angle at an atom with exactly two bonds: the label's point on the bisector, and 9 points along its arc. */
export interface AngleLabel { kind: 'angle'; atom: number; text: string; world: Point; arc: Point[] }
export type ModelLabel = LengthLabel | AngleLabel;

const ARC_POINTS = 9;
/** The arc's radius as a share of the shorter of its two bonds; the degree label sits 1.6 × further out. */
const ARC_SHARE = 0.35;
const LABEL_OUT = 1.6;

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const bondBetween = (bonds: Bond[], i: number, j: number) => bonds.find(b => (b.a === i && b.b === j) || (b.a === j && b.b === i))!;

/**
 * What to label on the model (spec §9.4.1, ruling P9): every bond's length and the angle at each atom with
 * exactly two bonds for up to LABEL_ATOM_LIMIT atoms; above it, only the picked atom's angle or the picked
 * bond's length; [] when nothing applies. The texts are the Selection readout's own numbers: the length
 * as describePick prints it (3 dp Å), the angle as anglesAtAtom rounds it (1 dp °).
 *
 * Per representation (ruling P8): space filling draws no sticks, so it gets no length labels -- a number
 * hanging between two spheres would name a bond that is not drawn, and its bonds cannot be picked. The
 * angle stays: it is the atom centres' geometry, its vertex is a drawn, pickable sphere, and its arc points
 * at the two neighbouring spheres. With no structure drawn there is nothing to label.
 */
export function modelLabels(atoms: MoleculeAtom[], bonds: Bond[], pick: MoleculePick | null, representation: Representation = 'ball-and-stick'): ModelLabel[] {
    if (representation === 'none') return [];
    const all = atoms.length <= LABEL_ATOM_LIMIT;
    const out: ModelLabel[] = [];
    if (representation === 'ball-and-stick') {
        bonds.forEach((bond, index) => {
            if (!all && !(pick?.kind === 'bond' && pick.index === index)) return;
            const [p, q] = [atoms[bond.a].position, atoms[bond.b].position];
            out.push({
                kind: 'length', bond: index, text: `${bond.lengthAngstrom.toFixed(3)} Å`,
                world: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], ends: [[...p], [...q]],
            });
        });
    }
    atoms.forEach((atom, index) => {
        if (!all && !(pick?.kind === 'atom' && pick.index === index)) return;
        const n = bonds.filter(b => b.a === index || b.b === index).map(b => (b.a === index ? b.b : b.a));
        if (n.length !== 2) return; // §9.4.1: the angle at each atom with exactly two bonds
        const [{ degrees }] = anglesAtAtom(atoms, bonds, index);
        const v = new THREE.Vector3(...atom.position);
        const u = new THREE.Vector3(...atoms[n[0]].position).sub(v).normalize();
        const w = new THREE.Vector3(...atoms[n[1]].position).sub(v).normalize();
        const r = (ARC_SHARE * Math.min(bondBetween(bonds, index, n[0]).lengthAngstrom, bondBetween(bonds, index, n[1]).lengthAngstrom)) / BOHR_TO_ANGSTROM;
        // The arc turns u towards w in their plane, at even steps. A straight angle (CO₂'s C, 180°) has no
        // such plane: its half circle bends towards u × z (u × x for bonds along z), so for bonds lying
        // across the z axis it is drawn in the x–y plane rather than collapsing onto the atom.
        const theta = u.angleTo(w);
        const p = w.clone().addScaledVector(u, -Math.cos(theta));
        if (p.lengthSq() < 1e-12) p.crossVectors(u, Math.abs(u.z) < 0.9 ? Z_AXIS : X_AXIS);
        p.normalize();
        const at = (t: number, radius: number): Point => {
            const d = u.clone().multiplyScalar(Math.cos(t * theta)).addScaledVector(p, Math.sin(t * theta)).multiplyScalar(radius);
            return [v.x + d.x, v.y + d.y, v.z + d.z];
        };
        const arc = Array.from({ length: ARC_POINTS }, (_, i) => at(i / (ARC_POINTS - 1), r));
        out.push({ kind: 'angle', atom: index, text: `${degrees.toFixed(1)}°`, world: at(0.5, r * LABEL_OUT), arc });
    });
    return out;
}

const scratch = new THREE.Vector3();

/** A point on the canvas in CSS pixels from its top left, and how far in front of the camera it is. */
export interface CanvasPoint { x: number; y: number; depth: number }

/**
 * World → CSS pixels inside a canvas of `width` × `height`, from its top left; null for a point behind the
 * camera (or in front of its near plane), which has no place on screen. The camera's matrices are taken as
 * they are -- after a render they are current.
 */
export function projectToCanvas(camera: THREE.Camera, width: number, height: number, world: Point): CanvasPoint | null {
    const near = (camera as THREE.PerspectiveCamera).near ?? 0;
    scratch.set(world[0], world[1], world[2]).applyMatrix4(camera.matrixWorldInverse);
    const depth = -scratch.z;
    if (depth < near) return null;
    scratch.applyMatrix4(camera.projectionMatrix);
    return { x: ((scratch.x + 1) / 2) * width, y: ((1 - scratch.y) / 2) * height, depth };
}

/** The gap, in CSS pixels, between a length label and its bond. */
export const LABEL_GAP_PX = 3;

/**
 * Where a length label's centre goes on screen: beside its bond rather than on it (the concept's "0.958 Å"
 * sits by its stick, which stays visible), on the side away from the molecule's centre -- outside the
 * angle at the atom, where that angle's own label is. `w` × `h` is the label's size: it is moved just far
 * enough for its box to clear the bond's line. A bond seen end-on has no side; its label goes above it.
 */
export function besideBond(mid: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number },
    centre: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let nx = 0;
    let ny = -1;
    if (length > 1e-6) {
        nx = -(b.y - a.y) / length;
        ny = (b.x - a.x) / length;
        if (nx * (mid.x - centre.x) + ny * (mid.y - centre.y) < 0) { nx = -nx; ny = -ny; }
    }
    const reach = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2 + LABEL_GAP_PX;
    return { x: mid.x + nx * reach, y: mid.y + ny * reach };
}

/** A label's box on screen, centred on (x, y). */
export interface ScreenBox { x: number; y: number; w: number; h: number; depth: number }

/**
 * Which labels to show: nearest first, each unless its box overlaps one already shown, so piled-up labels
 * (a small molecule seen from far away) never print over each other; zooming in makes room and brings the
 * rest back. A null box (behind the camera) is never shown.
 */
export function declutter(boxes: Array<ScreenBox | null>): boolean[] {
    const shown = boxes.map(() => false);
    const kept: ScreenBox[] = [];
    boxes
        .map((box, index) => ({ box, index }))
        .filter((entry): entry is { box: ScreenBox; index: number } => entry.box !== null)
        .sort((p, q) => p.box.depth - q.box.depth)
        .forEach(({ box, index }) => {
            const clash = kept.some(k => Math.abs(k.x - box.x) * 2 < k.w + box.w && Math.abs(k.y - box.y) * 2 < k.h + box.h);
            if (clash) return;
            kept.push(box);
            shown[index] = true;
        });
    return shown;
}
