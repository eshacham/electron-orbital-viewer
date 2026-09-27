import * as THREE from 'three';

/** A surface to export: world-space bohr, indexed triangles, linear RGB per vertex. */
export interface ExportSurface { name: string; positions: Float32Array; indices: Uint32Array; colors: Float32Array; }

/**
 * Ruling R1: the one wording STL and glTF give when the viewer holds no
 * surface -- the shell's lobes still coming back from their worker, most
 * often, since that fetch has no busy flag in the store to refuse on sooner.
 */
export const NOTHING_TO_EXPORT_REASON = 'Nothing to export yet — the surface is still being computed.';

/** One solid inside a merged mesh: a run of its index buffer, in indices (three per triangle). */
export interface ExportMember { name: string; start: number; count: number; }

/**
 * Marks the meshes that are the surface itself. Caps, the shell view's
 * sphere, axes and labels are view furniture and stay unmarked.
 *
 * `members` is for a mesh that is several solids drawn as one (ruling C4: a
 * Phase 1 overlay). Its members can meet at identical vertices on the
 * symmetric grid, so welded together they would share edges between four
 * triangles and no overlay would ever pass the manifold check; each is
 * exported as its own surface instead.
 */
export function markExportSurface(mesh: THREE.Mesh, name: string, members?: ExportMember[]): void {
    mesh.userData.exportName = name;
    if (members) mesh.userData.exportMembers = members;
}

/**
 * The part of a surface one index range uses, its vertices renumbered from 0
 * in their original order -- so a member stored as a contiguous run of
 * vertices comes back numbered exactly as it was before it was merged.
 */
function memberSurface(whole: ExportSurface, { name, start, count }: ExportMember): ExportSurface {
    const range = whole.indices.subarray(start, start + count);
    const used = Array.from(new Set(range)).sort((a, b) => a - b);
    const renumbered = new Map(used.map((v, id) => [v, id]));
    const indices = Uint32Array.from(range, v => renumbered.get(v)!);
    const positions = new Float32Array(used.length * 3);
    const colors = new Float32Array(used.length * 3);
    used.forEach((v, id) => {
        positions.set(whole.positions.subarray(3 * v, 3 * v + 3), 3 * id);
        colors.set(whole.colors.subarray(3 * v, 3 * v + 3), 3 * id);
    });
    return { name, positions, indices, colors };
}

export function collectExportSurfaces(root: THREE.Object3D | null): ExportSurface[] {
    if (!root) return [];
    root.updateWorldMatrix(true, true);
    const surfaces: ExportSurface[] = [];
    const point = new THREE.Vector3();
    root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || typeof object.userData.exportName !== 'string') return;
        const geometry = object.geometry as THREE.BufferGeometry;
        const position = geometry.getAttribute('position');
        if (!position || position.count === 0) return;
        const count = position.count;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
            positions.set([point.x, point.y, point.z], 3 * i);
        }
        const index = geometry.getIndex();
        const indices = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: count }, (_, i) => i);
        const colorAttribute = geometry.getAttribute('color');
        const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial;
        const base = material.color ?? new THREE.Color(1, 1, 1);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            colors.set(colorAttribute
                ? [colorAttribute.getX(i), colorAttribute.getY(i), colorAttribute.getZ(i)]
                : [base.r, base.g, base.b], 3 * i);
        }
        const whole: ExportSurface = { name: object.userData.exportName, positions, indices, colors };
        const members = object.userData.exportMembers as ExportMember[] | undefined;
        if (members) surfaces.push(...members.map(member => memberSurface(whole, member)));
        else surfaces.push(whole);
    });
    return surfaces;
}

/** How many surfaces collectExportSurfaces would return, counted without copying any geometry. */
export function countExportSurfaces(root: THREE.Object3D | null): number {
    let count = 0;
    root?.traverse(object => {
        if (!(object instanceof THREE.Mesh) || typeof object.userData.exportName !== 'string') return;
        const position = (object.geometry as THREE.BufferGeometry).getAttribute('position');
        if (!position || position.count === 0) return;
        count += (object.userData.exportMembers as ExportMember[] | undefined)?.length ?? 1;
    });
    return count;
}

export interface SurfaceBounds { min: [number, number, number]; max: [number, number, number]; longestSide: number; }

export function surfaceBounds(surfaces: ExportSurface[]): SurfaceBounds {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const { positions } of surfaces) {
        for (let i = 0; i < positions.length; i++) {
            const axis = i % 3;
            min[axis] = Math.min(min[axis], positions[i]);
            max[axis] = Math.max(max[axis], positions[i]);
        }
    }
    return { min, max, longestSide: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) };
}
