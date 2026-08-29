import * as THREE from 'three';

/**
 * Levels 1 and 2 (whole atom, single shell): a spherical cut-away shaded by
 * the radial distribution D(r) = 4*pi*r^2*rho(r).
 *
 * Under the central-field approximation the density is spherically
 * symmetric, so unlike level 3's orbital lobes the isosurface here is just a
 * sphere at the contour radius -- no marching cubes, no 3D sampling grid.
 * `THREE.SphereGeometry` supplies the surface directly, and the interesting
 * work is entirely in the cut face: it reads a **1D** curve (a texture of
 * width `size`, height 1) rather than a 3D density map, which is what keeps
 * a heavy atom's compressed inner shells resolved regardless of the sphere's
 * own polygon count.
 *
 * The stencil technique is copied from `clip_caps.ts` verbatim -- back faces
 * increment, front faces decrement, the cap is drawn only where the count is
 * non-zero, and the stencil is cleared in `onAfterRender` -- because closing
 * a sphere over a clip plane has exactly the same "hollow shell" problem as
 * closing an orbital lobe does. Only the fragment shader differs, so the same
 * `isCapAssembly`/`isCapStencil`/`isCap` markers are used here too: a
 * consumer that already calls `positionCaps`/`setCapsVisible`/`setCapsOpacity`
 * from clip_caps.ts against an orbital's cap assembly can call the very same
 * functions against a shell view's, unchanged.
 */

const CAP_VERTEX_SHADER = /* glsl */`
    varying vec3 vWorldPosition;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

// Ruling R25: the radial curve ships on the SCF's own logarithmic grid
// (r_j = rMin * e^(j*dx)), not resampled onto a uniform-in-r table. A
// uniform-in-r lookup sounds equivalent but silently flattens a heavy atom's
// inner shells -- uranium's K shell retained under 40% of its true height
// even at 4096 uniform samples, because it lives inside the first fraction
// of a percent of rMax. Computing `t` with the grid's own log spacing here
// is exactly what `interpolateOnGrid` (radial_grid.ts) does, so the
// texture's built-in linear filtering between texels *is* correct log-space
// interpolation, with no resampling step to get wrong.
//
// Ruling R16: the texture carries raw, unnormalised D(r) in a float
// (RedFormat/FloatType) texture. A shell's peak can be three orders of
// magnitude below the atom's innermost one; normalising or quantising to
// 8 bits before upload would put every outer shell below one quantisation
// step. Normalisation (against `peakD`) and the perceptual ramp both happen
// here in the shader instead, working in display space per the same
// reasoning as clip_caps.ts's cap shader (ramping in linear space and
// converting afterwards flattens the gradient).
const CAP_FRAGMENT_SHADER = /* glsl */`
    precision highp float;

    uniform sampler2D radialCurve;
    uniform float rMin;
    uniform float dx;
    uniform float size;
    uniform float rMax;
    uniform float peakD;
    uniform float opacity;
    uniform float highlightR;   // negative when nothing is highlighted

    varying vec3 vWorldPosition;

    layout(location = 0) out vec4 fragColor;

    void main() {
        float r = length(vWorldPosition);
        if (r > rMax) discard;

        // Guard r <= rMin (ruling R25): log(r / rMin) is undefined at or
        // below the grid's first point, so clamp to the first texel instead.
        float t = r > rMin ? log(r / rMin) / dx : 0.0;
        t = clamp(t, 0.0, size - 1.0);
        float texCoord = (t + 0.5) / size;

        float d = texture(radialCurve, vec2(texCoord, 0.5)).r / peakD;

        // Shell rings: D(r) peaks are the shells. Perceptual ramp, warm at
        // the peaks and near-black in the troughs between shells, tuned so
        // the troughs stay visibly dark rather than crushing to true black.
        vec3 cold = vec3(0.02, 0.03, 0.10);
        vec3 warm = vec3(1.00, 0.85, 0.45);
        vec3 color = mix(cold, warm, pow(clamp(d, 0.0, 1.0), 0.45));

        // The ring the radial plot is pointing at. Comparing the cut face's
        // own |worldPosition| against highlightR is already geometrically
        // correct for a plot-selected radius: it traces the circle where the
        // sphere of radius r meets the cut plane, without any extra geometry.
        if (highlightR > 0.0 && abs(r - highlightR) < rMax * 0.004) {
            color = vec3(0.30, 0.95, 1.00);
        }

        fragColor = vec4(color, opacity);
    }
`;

export interface ShellViewOptions {
    /** Sphere radius: the contour enclosing the profile's requested electron fraction. */
    contourRadius: number;
    /**
     * D(r) for this view (the whole atom at level 1, one shell at level 2),
     * raw and unnormalised, on the log grid described by rMin/dx/size below
     * (ruling R25 -- supersedes the uniform-in-r `radialTexture` sketch in
     * the original brief, which loses a heavy atom's inner-shell peak).
     */
    radialCurve: Float32Array;
    /** The shared log grid's parameters: r_j = rMin * e^(j*dx), j = 0..size-1. */
    rMin: number;
    dx: number;
    size: number;
    /** Extent of the sampled curve; also sizes the cut-face quad and the discard radius. */
    rMax: number;
    opacity: number;
    plane: THREE.Plane;
}

/** Wraps the raw log-grid curve in a float texture the cap shader can read. */
function createRadialCurveTexture(radialCurve: Float32Array): THREE.DataTexture {
    const texture = new THREE.DataTexture(radialCurve, radialCurve.length, 1);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

function peakOf(values: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < values.length; i++) {
        if (values[i] > peak) peak = values[i];
    }
    // A curve that is all zero would otherwise divide by zero in the shader;
    // 1 is an arbitrary safe fallback that never actually shows (d stays 0).
    return peak > 0 ? peak : 1;
}

/**
 * Builds the stencil passes and the shaded cut face for one spherical shell
 * view. See the module doc above for why this is a sphere rather than a
 * marching-cubes surface, and why the stencil technique matches
 * `clip_caps.ts` exactly.
 */
export function createShellView(options: ShellViewOptions): THREE.Group {
    const { contourRadius, radialCurve, rMin, dx, size, rMax, opacity, plane } = options;

    const view = new THREE.Group();
    view.userData.isCapAssembly = true;

    const geometry = new THREE.SphereGeometry(contourRadius, 64, 32);

    const stencilBase = new THREE.MeshBasicMaterial({
        depthWrite: false,
        depthTest: false,
        colorWrite: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        clippingPlanes: [plane],
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

    for (const material of [backFaces, frontFaces]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.userData.isCapStencil = true;
        view.add(mesh);
    }

    const capMaterial = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            radialCurve: { value: createRadialCurveTexture(radialCurve) },
            rMin: { value: rMin },
            dx: { value: dx },
            size: { value: size },
            rMax: { value: rMax },
            peakD: { value: peakOf(radialCurve) },
            opacity: { value: opacity },
            highlightR: { value: -1 },
        },
        vertexShader: CAP_VERTEX_SHADER,
        fragmentShader: CAP_FRAGMENT_SHADER,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
    });

    // Comfortably larger than the sphere so the cut face is never short of the edge.
    const capSize = rMax * 3;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(capSize, capSize), capMaterial);
    cap.renderOrder = 2;
    cap.userData.isCap = true;
    // Leave the buffer clean for the next frame.
    cap.onAfterRender = renderer => renderer.clearStencil();
    view.add(cap);

    return view;
}

/** Drives the shell view's highlight ring from the radial plot's hover radius. */
export function setShellViewHighlight(view: THREE.Object3D | null, r: number | null): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        material.uniforms.highlightR.value = r ?? -1;
    });
}

/** Frees the radial curve texture; the geometry is shared and disposed with the mesh. */
export function disposeShellView(view: THREE.Object3D | null): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        material.uniforms.radialCurve.value?.dispose();
    });
}
