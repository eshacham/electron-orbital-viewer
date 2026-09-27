import * as THREE from 'three';
import { MeshData, SurfaceStyle } from './types/orbital';
import { createOrbitalMaterial } from './orbital_material';
import { ExportMember, markExportSurface } from './export/surfaces';

/**
 * Several field sources at once (all four sp³ hybrids, both Stark states) as
 * one mesh. Each member takes its own colour, and the ψ < 0 parts are a
 * darker shade of it, so phase stays legible without red and blue.
 *
 * There are no cut-face caps: the stencil caps assume one capped object on
 * screen (see shell_composition_view.ts's module doc, which makes the same
 * call for the composition lobes). A cut still opens the overlay; it shows
 * the inside of the lobes rather than a shaded cross-section.
 */

export const NEGATIVE_PHASE_SHADE = 0.45;

/** Linear-space RGB per vertex, member by member, in the order `meshes` are given. */
export function overlayVertexColors(meshes: MeshData[], colors: string[]): Float32Array {
    const total = meshes.reduce((count, mesh) => count + mesh.positions.length, 0);
    const out = new Float32Array(total * 3);
    let vertex = 0;
    meshes.forEach((mesh, i) => {
        // THREE.Color converts the sRGB hex into the linear working space vertex colours are read in.
        const color = new THREE.Color(colors[i % colors.length]);
        for (const sign of mesh.psiSigns) {
            const shade = sign > 0 ? 1 : NEGATIVE_PHASE_SHADE;
            out[vertex * 3] = color.r * shade;
            out[vertex * 3 + 1] = color.g * shade;
            out[vertex * 3 + 2] = color.b * shade;
            vertex++;
        }
    });
    return out;
}

export function createFieldOverlayGroup(
    meshes: MeshData[],
    colors: string[],
    style: SurfaceStyle,
    clippingPlanes: THREE.Plane[]
): THREE.Group {
    const positions: number[] = [];
    const indices: number[] = [];
    const members: ExportMember[] = [];
    let offset = 0;
    meshes.forEach((mesh, i) => {
        members.push({ name: `overlay member ${i + 1}`, start: indices.length, count: mesh.cells.length * 3 });
        for (const [x, y, z] of mesh.positions) positions.push(x, y, z);
        for (const [a, b, c] of mesh.cells) indices.push(a + offset, b + offset, c + offset);
        offset += mesh.positions.length;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(overlayVertexColors(meshes, colors), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const group = new THREE.Group();
    group.userData.isFieldOverlay = true;
    const mesh = new THREE.Mesh(geometry, createOrbitalMaterial(style, clippingPlanes));
    // Ruling C4: each member exported as its own solid. On the symmetric grid
    // mirror-image members meet at identical vertices, so welded as one mesh
    // their shared edges would belong to four triangles and fail the
    // manifold check -- no overlay would ever print.
    markExportSurface(mesh, 'overlay', members);
    group.add(mesh);
    return group;
}
