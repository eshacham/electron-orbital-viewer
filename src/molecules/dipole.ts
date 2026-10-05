import * as THREE from 'three';
import type { LibraryMoleculeMeta } from './library_types';

export const DIPOLE_BOHR_PER_DEBYE = 1;
/** Below this the computed direction of a symmetric molecule's (zero) dipole is numerical noise. */
export const DIPOLE_MIN_DEBYE = 0.05;
const ARROW_COLOR = '#ffd166';

/**
 * μ from − to + (the IUPAC and physics convention), from the centre of
 * nuclear charge, 1 a₀ per debye. Drawn over everything: it is an
 * annotation, and inside an opaque density it would otherwise vanish.
 */
export function dipoleArrow(meta: LibraryMoleculeMeta): THREE.ArrowHelper | null {
    const mu = new THREE.Vector3(...meta.dipoleVectorDebye);
    const magnitude = mu.length();
    if (magnitude < DIPOLE_MIN_DEBYE) return null;
    const totalZ = meta.atoms.reduce((sum, atom) => sum + atom.Z, 0);
    const origin = meta.atoms
        .reduce((sum, atom) => sum.add(new THREE.Vector3(...atom.position).multiplyScalar(atom.Z)), new THREE.Vector3())
        .divideScalar(totalZ);
    const length = magnitude * DIPOLE_BOHR_PER_DEBYE;
    const head = Math.min(0.35 * length, 0.6);
    const arrow = new THREE.ArrowHelper(mu.normalize(), origin, length, ARROW_COLOR, head, 0.6 * head);
    arrow.userData = { isDipoleArrow: true, lengthBohr: length };
    arrow.renderOrder = 5;
    for (const material of [arrow.line.material, arrow.cone.material] as THREE.Material[]) material.depthTest = false;
    return arrow;
}

export function formatDipole(meta: LibraryMoleculeMeta): string {
    const method = meta.method.density;
    const reference = meta.references.find(r => r.quantity === 'dipole');
    // dipoleDebye is optional on the base MoleculeMeta (Phase 5 orbitals don't carry one);
    // the library always ships dipoleVectorDebye, so its magnitude is the one source of truth here.
    const magnitude = new THREE.Vector3(...meta.dipoleVectorDebye).length();
    if (reference && reference.value === 0) return `μ = 0 by symmetry (computed ${magnitude.toFixed(2)} D, ${method})`;
    const experiment = reference ? ` · experiment ${reference.value} D` : '';
    return `μ = ${magnitude.toFixed(2)} D (${method})${experiment}`;
}
