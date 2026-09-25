import * as THREE from 'three';
import { DensityMap } from './types/orbital';

/**
 * Solid faces over a cut-away plane, shaded by the density they cut through.
 *
 * Clipping alone leaves the orbital hollow: you see the inside of the far wall
 * of each shell rather than a cut through solid material. The fix is the usual
 * stencil trick — draw the clipped geometry's back faces incrementing the
 * stencil and its front faces decrementing it, then paint a quad on the plane
 * wherever the count is non-zero, which is exactly where the plane passes
 * through the interior. It relies on the surface being closed and consistently
 * wound, which the isosurface is.
 *
 * The quad reads |psi|^2 out of a 3D texture, so the cut face shows the density
 * falling off from the core of each lobe towards its edge instead of a flat
 * colour chip. Shading per fragment is also why the mesh needs no splitting by
 * phase: red and blue come out of the same texture lookup.
 */

// Display-space (sRGB) components, deliberately not THREE.Color: the brightness
// ramp below has to be perceptual. Ramping in the linear working space and
// converting afterwards lifts the dark end from 53/255 to 137/255, which flattens
// the whole gradient into a narrow band of near-identical colour.
const POSITIVE_PHASE = new THREE.Vector3(0xd4 / 255, 0x20 / 255, 0x20 / 255);
const NEGATIVE_PHASE = new THREE.Vector3(0x20 / 255, 0x30 / 255, 0xd4 / 255);

const CAP_VERTEX_SHADER = /* glsl */`
    varying vec3 vWorldPosition;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const CAP_FRAGMENT_SHADER = /* glsl */`
    precision highp sampler3D;

    uniform sampler3D densityMap;
    uniform vec3 positivePhase;
    uniform vec3 negativePhase;
    uniform float rMax;
    uniform float opacity;

    varying vec3 vWorldPosition;

    // Under GLSL3 three leaves the fragment output to the shader, so the usual
    // gl_FragColor and <colorspace_fragment> are both unavailable here.
    layout(location = 0) out vec4 fragColor;

    void main() {
        vec3 unit = (vWorldPosition + rMax) / (2.0 * rMax);
        if (any(lessThan(unit, vec3(0.0))) || any(greaterThan(unit, vec3(1.0)))) discard;

        // Samples run z-fastest, so the texture's first axis is world z.
        float encoded = texture(densityMap, vec3(unit.z, unit.y, unit.x)).r * 255.0;

        // 128 is the iso level; the distance from it is how far the density has
        // climbed towards the peak, and the direction is the phase.
        float signedClimb = (encoded - 128.0) / 127.0;
        float climb = abs(signedClimb);

        vec3 phase = signedClimb >= 0.0 ? positivePhase : negativePhase;
        // Dark where the cut meets the surface, full colour through the body of
        // the lobe, washing out at the densest point. Worked in display space,
        // so the output needs no further colour conversion.
        vec3 color = mix(phase * (0.25 + 0.75 * climb), vec3(1.0), pow(climb, 2.2));

        fragColor = vec4(color, opacity);
    }
`;

/** Wraps the encoded samples in a texture the cap shader can read. */
export function createDensityTexture(map: DensityMap): THREE.Data3DTexture {
    const texture = new THREE.Data3DTexture(map.data, map.side, map.side, map.side);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    // One byte per texel, so rows are not padded to a multiple of four.
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
}

interface CapOptions {
    plane: THREE.Plane;
    densityMap: DensityMap;
    opacity: number;
}

/**
 * Builds the stencil passes and the cap face.
 *
 * The stencil passes cover the whole surface at once: the count says whether
 * the plane is inside material at that pixel, which is true regardless of phase.
 */
export function createClipCaps(
    geometry: THREE.BufferGeometry,
    { plane, densityMap, opacity }: CapOptions
): THREE.Group {
    const caps = new THREE.Group();
    caps.userData.isCapAssembly = true;

    const stencilBase = new THREE.MeshBasicMaterial({
        depthWrite: false,
        depthTest: false,
        colorWrite: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        clippingPlanes: [plane]
    });

    const backFaces = stencilBase.clone();
    backFaces.side = THREE.BackSide;
    backFaces.stencilFail = THREE.IncrementWrapStencilOp;
    backFaces.stencilZFail = THREE.IncrementWrapStencilOp;
    backFaces.stencilZPass = THREE.IncrementWrapStencilOp;

    const frontFaces = stencilBase.clone();
    frontFaces.side = THREE.FrontSide;
    frontFaces.stencilFail = THREE.DecrementWrapStencilOp;
    frontFaces.stencilZFail = THREE.DecrementWrapStencilOp;
    frontFaces.stencilZPass = THREE.DecrementWrapStencilOp;
    stencilBase.dispose();
    // clone() deep-copies clippingPlanes, which froze the stencil passes at
    // the cut as it was when this was built: changing the axis or depth then
    // moved the cut face but not the region it paints in. Share the live
    // plane instead, as the cut face itself does.
    backFaces.clippingPlanes = [plane];
    frontFaces.clippingPlanes = [plane];

    for (const material of [backFaces, frontFaces]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.userData.isCapStencil = true;
        caps.add(mesh);
    }

    const capMaterial = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            densityMap: { value: createDensityTexture(densityMap) },
            positivePhase: { value: POSITIVE_PHASE.clone() },
            negativePhase: { value: NEGATIVE_PHASE.clone() },
            rMax: { value: densityMap.rMax },
            opacity: { value: opacity }
        },
        vertexShader: CAP_VERTEX_SHADER,
        fragmentShader: CAP_FRAGMENT_SHADER,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        // Only where the stencil count came out non-zero.
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp
    });

    // Comfortably larger than the box so the cut face is never short of the edge.
    const size = densityMap.rMax * 3;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(size, size), capMaterial);
    cap.renderOrder = 2;
    cap.userData.isCap = true;
    // Leave the buffer clean for the next frame.
    cap.onAfterRender = renderer => renderer.clearStencil();
    caps.add(cap);

    return caps;
}

/** Lays the cap onto the plane, facing the side that was cut away. */
export function positionCaps(caps: THREE.Object3D | null, plane: THREE.Plane): void {
    if (!caps) return;

    caps.traverse(child => {
        if (!child.userData.isCap) return;
        plane.coplanarPoint(child.position);
        child.lookAt(
            child.position.x - plane.normal.x,
            child.position.y - plane.normal.y,
            child.position.z - plane.normal.z
        );
    });
}

/** Caps only make sense on a solid surface that is actually cut open. */
export function setCapsVisible(caps: THREE.Object3D | null, visible: boolean): void {
    if (caps) caps.visible = visible;
}

/** Keeps the cut face at the same opacity as the surface it belongs to. */
export function setCapsOpacity(caps: THREE.Object3D | null, opacity: number): void {
    if (!caps) return;

    caps.traverse(child => {
        if (!child.userData.isCap || !(child instanceof THREE.Mesh)) return;
        const material = child.material as THREE.ShaderMaterial;
        const translucent = opacity < 1;
        if (material.transparent !== translucent) material.needsUpdate = true;
        material.transparent = translucent;
        material.uniforms.opacity.value = opacity;
    });
}

/** Frees the density texture; the geometry is shared and disposed with the mesh. */
export function disposeCaps(caps: THREE.Object3D | null): void {
    if (!caps) return;

    caps.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        material.uniforms.densityMap.value?.dispose();
    });
}
