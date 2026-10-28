import * as THREE from 'three';
import type { LibraryMoleculeMeta } from './library_types';
import { nb } from '../format/text';

export const DIPOLE_BOHR_PER_DEBYE = 1;
/** Below this the computed direction of a symmetric molecule's (zero) dipole is numerical noise. */
export const DIPOLE_MIN_DEBYE = 0.05;
const ARROW_COLOR = '#ffd166';

/** Whether `dipoleArrow` draws one: not below DIPOLE_MIN_DEBYE, where the direction is noise. */
export function hasDipoleArrow(meta: LibraryMoleculeMeta): boolean {
    return new THREE.Vector3(...meta.dipoleVectorDebye).length() >= DIPOLE_MIN_DEBYE;
}

/**
 * μ from − to + (the IUPAC and physics convention), from the centre of
 * nuclear charge, 1 a₀ per debye. Drawn over everything: it is an
 * annotation, and inside an opaque density it would otherwise vanish.
 */
export function dipoleArrow(meta: LibraryMoleculeMeta): THREE.ArrowHelper | null {
    if (!hasDipoleArrow(meta)) return null;
    const mu = new THREE.Vector3(...meta.dipoleVectorDebye);
    const magnitude = mu.length();
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

/**
 * Task 7b: the dipole as Info's fact -- computed against experiment, both in debye, with the measurement's source;
 * a symmetric molecule's zero by symmetry; and, where no measured value is listed (an on-demand computed molecule), it
 * says so rather than leave a gap. The method is under "How this was computed" (formatDipole names it, for exports).
 */
export function dipoleFactText(meta: LibraryMoleculeMeta): string {
    const reference = meta.references.find(r => r.quantity === 'dipole');
    // Fix round 1 (M4): each number held to its unit by a no-break space.
    const magnitude = nb(`${new THREE.Vector3(...meta.dipoleVectorDebye).length().toFixed(2)} D`);
    if (reference && reference.value === 0) return `${nb('0 D')} by symmetry (computed ${magnitude})`;
    const computed = `${magnitude} computed`;
    return reference
        ? `${computed} · ${nb(`${reference.value} ${reference.unit}`)} experiment (${reference.source})`
        : `${computed} · no measured value listed`;
}

/**
 * Task 9b (finish review, fix 1): the dipole below Research -- its value with units alone, cut from dipoleFactText: the
 * computed magnitude ("1.86 D"), or a symmetric molecule's "0 D by symmetry". The experiment and its reference are
 * Research's (the spec's level table: references at Research).
 */
export function dipoleValueText(meta: LibraryMoleculeMeta): string {
    const reference = meta.references.find(r => r.quantity === 'dipole');
    if (reference && reference.value === 0) return `${nb('0 D')} by symmetry`;
    return nb(`${new THREE.Vector3(...meta.dipoleVectorDebye).length().toFixed(2)} D`);
}
