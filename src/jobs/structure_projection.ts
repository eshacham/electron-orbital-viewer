import { ATOM_RADIUS_FACTOR, BOHR_TO_ANGSTROM, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../molecules/ball_and_stick';
import type { MoleculeAtom } from '../molecules/library_types';
import type { CanonicalAtom } from './api_types';

export type Vec = [number, number, number];
export interface ProjectedAtom { index: number; Z: number; x: number; y: number; depth: number; radius: number; color: string }
export interface ProjectedBond { a: number; b: number }
/** Å throughout. `atoms` are in painter's order (farthest first); `halfExtent` does not change as the drawing turns. */
export interface Projection { atoms: ProjectedAtom[]; bonds: ProjectedBond[]; halfExtent: number }

const dot = (u: Vec, v: Vec) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u: Vec, v: Vec): Vec => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/** The API's atoms are [Z, x, y, z] in Å; Phase 6's bonding rule takes bohr. */
export function canonicalToBohr(atoms: CanonicalAtom[]): MoleculeAtom[] {
    return atoms.map(([Z, x, y, z]) => ({ Z, position: [x / BOHR_TO_ANGSTROM, y / BOHR_TO_ANGSTROM, z / BOHR_TO_ANGSTROM] }));
}

/** Eigenpairs of a symmetric 3×3 matrix by cyclic Jacobi rotations, largest eigenvalue first. */
export function symmetricEigen(matrix: number[][]): { values: number[]; vectors: Vec[] } {
    const a = matrix.map(row => [...row]);
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
        const diagonal = a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2;
        if (off <= 1e-24 * Math.max(diagonal, 1e-300)) break;
        for (let p = 0; p < 2; p++) {
            for (let q = p + 1; q < 3; q++) {
                if (a[p][q] === 0) continue;
                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;
                for (let k = 0; k < 3; k++) {
                    const [akp, akq] = [a[k][p], a[k][q]];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for (let k = 0; k < 3; k++) {
                    const [apk, aqk] = [a[p][k], a[q][k]];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for (let k = 0; k < 3; k++) {
                    const [vkp, vkq] = [v[k][p], v[k][q]];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
    return { values: order.map(i => a[i][i]), vectors: order.map(i => [v[0][i], v[1][i], v[2][i]] as Vec) };
}

/**
 * Looks down the axis along which the structure is thinnest, so a planar
 * molecule (benzene, caffeine) is seen face-on whatever orientation PubChem
 * or a pasted file gave it; `yaw` then turns it about the vertical. The
 * viewing axis is the cross product of the other two, so the view is always
 * a rotation, never a mirror: a chiral molecule is shown as itself, not as
 * its enantiomer.
 */
export function projectStructure(atoms: CanonicalAtom[], yaw = 0): Projection {
    const n = atoms.length;
    const centre: Vec = [0, 0, 0];
    for (const [, x, y, z] of atoms) {
        centre[0] += x / n;
        centre[1] += y / n;
        centre[2] += z / n;
    }
    const relative: Vec[] = atoms.map(([, x, y, z]) => [x - centre[0], y - centre[1], z - centre[2]]);
    const scatter = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of relative) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) scatter[i][j] += p[i] * p[j];
    const [e1, e2] = symmetricEigen(scatter).vectors;
    const e3 = cross(e1, e2);
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    const projected: ProjectedAtom[] = relative.map((p, index) => {
        const Z = atoms[index][0];
        const [u, w] = [dot(p, e1), dot(p, e3)];
        return {
            index, Z, x: c * u + s * w, y: dot(p, e2), depth: -s * u + c * w,
            radius: ATOM_RADIUS_FACTOR * COVALENT_RADII_ANGSTROM[Z], color: CPK_COLORS[Z],
        };
    });
    const largestRadius = Math.max(...projected.map(a => a.radius));
    const halfExtent = Math.max(1, ...relative.map(p => Math.hypot(...p))) + largestRadius + 0.2;
    const bonds = detectBonds(canonicalToBohr(atoms)).map(bond => ({ a: bond.a, b: bond.b }));
    return { atoms: [...projected].sort((p, q) => p.depth - q.depth), bonds, halfExtent };
}
