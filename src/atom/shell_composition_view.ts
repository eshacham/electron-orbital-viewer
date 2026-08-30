import * as THREE from 'three';
import { OrbitalComponent } from './shell_composition';
import { LobeMeshData } from '../workers/shellCompositionWorker';
import { CURVE_COLORS, orbitalShade } from '../curve_colors';

/**
 * Turns a shell's computed orbital lobes (Addendum 2) into a group of
 * translucent meshes, one per mₗ orbital, coloured by subshell and shaded by
 * occupancy.
 *
 * Deliberately no stencil caps here, unlike a marching-cubes orbital
 * (`clip_caps.ts`) or the shell view itself (`shell_view.ts`): both of those
 * rely on a shared stencil buffer that assumes it is the only capped object
 * on screen (see `renderCrossFade`'s doc comment in orbital_visualizer.ts),
 * and up to sixteen of these lobes are alive at once inside the very shell
 * view that already owns the one stencil-capped object allowed. Since every
 * lobe here is translucent anyway, its own interior is already visible
 * through it without a cut-face fill -- the clip plane still cuts the
 * geometry open (via `clippingPlanes`, shared with the shell view and every
 * other orbital material), it just does not get its own shaded cross-section.
 */

/**
 * Ceiling on one fully-occupied orbital's own opacity. Kept below 1 even at
 * full occupancy: the whole point of the composition view is the overlap
 * between orbitals (spec §2 / Addendum 2 -- "why the sum comes out
 * spherical"), and an opaque lobe would hide whatever sits behind it exactly
 * the way the old, opaque shell sphere hid all of this in the first place.
 */
const MAX_LOBE_OPACITY = 0.85;

/** How translucent an unoccupied-looking (occupancyFraction near 0) orbital is allowed to fade to. Never fully zero: every mₗ state of an occupied subshell must still be visibly present (Addendum 2), not silently invisible. */
const MIN_LOBE_OPACITY_FLOOR = 0.06;

function lobeOpacity(restingOpacity: number, occupancyFraction: number): number {
    const scaled = restingOpacity * MAX_LOBE_OPACITY * Math.max(0, Math.min(1, occupancyFraction));
    return Math.max(0, Math.min(1, Math.max(scaled, restingOpacity > 0 ? MIN_LOBE_OPACITY_FLOOR * restingOpacity : 0)));
}

/**
 * Builds one shell's worth of orbital-lobe meshes. `components` and
 * `meshes` must be the same length and in the same order (they are:
 * both come from iterating the same shell's subshells the same way -- see
 * OrbitalViewer.tsx).
 */
export function createCompositionLobesGroup(
    components: OrbitalComponent[],
    meshes: LobeMeshData[],
    clippingPlanes: THREE.Plane[],
    restingOpacity: number,
    /**
     * True when the view has been isolated to a single subshell (Addendum
     * 2's readability follow-up), in which case each of that subshell's
     * orbitals gets its own shade of the subshell colour so five
     * interpenetrating d cloverleaves can be counted instead of summing to
     * one gold mass -- see `orbitalShade`. False for the default,
     * overlapping whole-shell view, where one colour per subshell is
     * exactly the distinction that matters.
     */
    distinguishOrbitals: boolean = false
): THREE.Group {
    const group = new THREE.Group();
    group.userData.isCompositionLobes = true;

    components.forEach((component, i) => {
        const meshData = meshes[i];
        // No isosurface at this resolution/contour for this particular
        // orbital (should be rare at the composite view's default enclosed
        // fraction, but not impossible for a very thin occupancy) -- skip
        // rather than throw, so one missing lobe does not blank the rest.
        if (!meshData || meshData.positions.length === 0 || meshData.cells.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions.flat(), 3));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();

        const baseColor = CURVE_COLORS[component.colorIndex % CURVE_COLORS.length];
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(
                distinguishOrbitals
                    ? orbitalShade(baseColor, component.l + component.ml, 2 * component.l + 1)
                    : baseColor
            ),
            metalness: 0,
            roughness: 0.45,
            side: THREE.DoubleSide,
            clippingPlanes,
            transparent: true,
            opacity: lobeOpacity(restingOpacity, component.occupancyFraction),
            depthWrite: false, // Translucent lobes overlap by design (see the module doc); see orbital_material.ts's setMaterialOpacity for the same reasoning applied to a single orbital's own surface.
        });

        const mesh = new THREE.Mesh(geometry, material);
        // Read back by setCompositionLobesOpacity below whenever the shared
        // opacity slider changes, so each lobe keeps its own occupancy
        // weighting instead of every lobe snapping to the same raw value.
        mesh.userData.occupancyFraction = component.occupancyFraction;
        group.add(mesh);
    });

    return group;
}

/** Rescales every lobe's opacity when the shared surface-style slider changes, preserving each one's own occupancy weighting. */
export function setCompositionLobesOpacity(group: THREE.Object3D | null, restingOpacity: number): void {
    if (!group) return;

    group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const occupancyFraction = typeof child.userData.occupancyFraction === 'number' ? child.userData.occupancyFraction : 1;
        const material = child.material as THREE.MeshStandardMaterial;
        const opacity = lobeOpacity(restingOpacity, occupancyFraction);
        material.opacity = opacity;
        material.transparent = true;
    });
}

/** Disposes every lobe's geometry and material. The clipping planes and any shared shell-view resources belong to the caller. */
export function disposeCompositionLobes(group: THREE.Object3D | null): void {
    if (!group) return;

    group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material.dispose();
    });
}
