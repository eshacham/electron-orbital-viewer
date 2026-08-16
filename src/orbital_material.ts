import * as THREE from 'three';
import { ClipAxis, SurfaceStyle } from './types/orbital';

/**
 * Material for the orbital isosurface.
 *
 * Solid shows the surface as a lit shell, which is the only way to read the
 * shape at high resolution — a wireframe that dense turns into a solid block of
 * lines. Wireframe keeps the see-through view.
 *
 * The higher orbitals are nested shells, and an opaque outer shell hides
 * everything inside it. Two ways through that: lower the opacity, or cut the
 * whole thing open with a plane. Vertex colours carry the sign of psi in every
 * mode, so the two phases stay red and blue.
 */
export function createOrbitalMaterial(
    style: SurfaceStyle,
    clippingPlanes: THREE.Plane[]
): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        metalness: 0,
        clippingPlanes
    });
    applyStyleToMaterial(material, style);
    return material;
}

function applyStyleToMaterial(material: THREE.MeshStandardMaterial, style: SurfaceStyle) {
    const wireframe = style.mode === 'wireframe';
    const opacity = Math.max(0, Math.min(1, style.opacity));
    const translucent = opacity < 1;

    // Changing `transparent` or `wireframe` swaps the shader program, so the
    // material has to be told even though the values are plain assignments.
    const needsRecompile =
        material.wireframe !== wireframe || material.transparent !== translucent;

    material.wireframe = wireframe;
    // A wireframe wants flat, saturated lines rather than shading that dims half
    // of them; a solid surface wants the shading.
    material.roughness = wireframe ? 1 : 0.45;
    material.opacity = opacity;
    material.transparent = translucent;
    // Translucent shells overlap themselves constantly and there is no useful
    // draw order for them. Not writing depth gives an even x-ray blend instead
    // of whichever shell happened to be drawn first winning.
    material.depthWrite = !translucent;

    if (needsRecompile) material.needsUpdate = true;
}

/** Restyles an already-built orbital in place, without rebuilding it. */
export function applySurfaceStyle(group: THREE.Object3D | null, style: SurfaceStyle): void {
    if (!group) return;

    group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) {
                applyStyleToMaterial(material, style);
            }
        }
    });
}

const AXIS_NORMALS: Record<Exclude<ClipAxis, 'none'>, [number, number, number]> = {
    x: [-1, 0, 0],
    y: [0, -1, 0],
    z: [0, 0, -1]
};

/** Far enough out that the plane keeps every point of any orbital. */
const NO_CLIP_CONSTANT = 1e9;

/**
 * Points the cut plane along the chosen axis.
 *
 * A THREE.Plane keeps the side where `normal . point + constant > 0`. With the
 * normal pointing down the axis, the constant is simply where along that axis
 * the cut falls, so the slider maps straight onto it.
 */
export function updateClipPlane(
    plane: THREE.Plane,
    axis: ClipAxis,
    position: number,
    rMax: number
): void {
    if (axis === 'none') {
        plane.normal.set(0, 0, -1);
        plane.constant = NO_CLIP_CONSTANT;
        return;
    }

    const [x, y, z] = AXIS_NORMALS[axis];
    plane.normal.set(x, y, z);
    plane.constant = position * rMax;
}
