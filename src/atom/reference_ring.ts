import * as THREE from 'three';

/**
 * The neutral atom's edge, drawn on the cut face of an ion or excited atom
 * (spec §5 Phase 3). A separate, unstencilled mesh: the cut face is
 * stencilled to the current sphere, and a cation's neutral edge lies
 * outside it. See the plan's Task 10 for the full reasoning.
 */
const DASHES = 48;
const RING_COLOUR = new THREE.Vector3(0.85, 0.87, 0.92);

const VERTEX = /* glsl */`
    varying vec3 vWorldPosition;
    varying vec2 vLocal;
    void main() {
        vLocal = position.xy;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
    }
`;

// |worldPosition| against the radius traces the sphere-plane intersection
// exactly, at any cut depth -- the same test shell_view.ts's highlight ring
// uses. Dashed by angle in the plane, so it never reads as the solid rim.
const FRAGMENT = /* glsl */`
    precision highp float;
    uniform float radius;
    uniform float halfWidth;
    uniform vec3 colour;
    varying vec3 vWorldPosition;
    varying vec2 vLocal;
    layout(location = 0) out vec4 fragColor;
    void main() {
        if (abs(length(vWorldPosition) - radius) > halfWidth) discard;
        float turn = atan(vLocal.y, vLocal.x) / 6.28318530718;
        if (fract(turn * ${DASHES}.0) > 0.6) discard;
        fragColor = vec4(colour, 0.9);
    }
`;

export function createReferenceRing(radius: number): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            radius: { value: radius },
            // Placeholder until the render loop's first setReferenceRingWidth.
            halfWidth: { value: radius * 0.01 },
            colour: { value: RING_COLOUR },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        stencilWrite: false,
    });
    const size = radius * 2.2;
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    ring.renderOrder = 3;
    ring.userData.isReferenceRing = true;
    return ring;
}

/** On the plane, facing along it, centred where the nucleus projects; hidden when the plane misses the sphere. */
export function positionReferenceRing(ring: THREE.Object3D | null, plane: THREE.Plane): void {
    if (!(ring instanceof THREE.Mesh)) return;
    const radius = (ring.material as THREE.ShaderMaterial).uniforms.radius.value as number;
    ring.visible = Math.abs(plane.constant) < radius;
    plane.coplanarPoint(ring.position);
    ring.lookAt(ring.position.x - plane.normal.x, ring.position.y - plane.normal.y, ring.position.z - plane.normal.z);
}

export function setReferenceRingWidth(ring: THREE.Object3D | null, worldHalfWidth: number): void {
    if (!(ring instanceof THREE.Mesh)) return;
    (ring.material as THREE.ShaderMaterial).uniforms.halfWidth.value = worldHalfWidth;
}

export function disposeReferenceRing(ring: THREE.Object3D | null): void {
    if (!(ring instanceof THREE.Mesh)) return;
    ring.geometry.dispose();
    (ring.material as THREE.Material).dispose();
}
