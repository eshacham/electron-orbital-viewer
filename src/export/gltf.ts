import * as THREE from 'three';
import { ExportSurface, NOTHING_TO_EXPORT_REASON, surfaceBounds } from './surfaces';
import { exportGlb } from './gltf_exporter_factory';

/** Tabletop size for AR, and irrelevant to slides, which rescale anyway. */
export const GLTF_LONGEST_SIDE_METRES = 0.2;

/**
 * A clean scene of just the surfaces: plain standard materials with the
 * app's colours (the ψ phase, or the subshell palette), opaque, no clipping
 * or stencil caps. glTF's unit is the metre, so the root is scaled and its
 * extras record by how much.
 */
export function buildGltfScene(surfaces: ExportSurface[], description: string): THREE.Scene {
    const scene = new THREE.Scene();
    const metresPerBohr = GLTF_LONGEST_SIDE_METRES / surfaceBounds(surfaces).longestSide;
    const root = new THREE.Group();
    root.name = 'electron-orbital-viewer';
    root.scale.setScalar(metresPerBohr);
    root.userData = { description, unit: 'bohr', metresPerBohr };
    for (const surface of surfaces) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(surface.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = surface.name;
        root.add(mesh);
    }
    scene.add(root);
    return scene;
}

/**
 * Binary glTF of the surfaces, scaled to a 20 cm model with metresPerBohr in
 * the root node's extras (ruling: spec's AR/slides design decision). Refuses
 * with the same wording STL uses (ruling R1) when the viewer holds nothing.
 */
export async function encodeGlb(surfaces: ExportSurface[], description: string): Promise<ArrayBuffer> {
    if (surfaces.length === 0) throw new Error(NOTHING_TO_EXPORT_REASON);
    return exportGlb(buildGltfScene(surfaces, description));
}
