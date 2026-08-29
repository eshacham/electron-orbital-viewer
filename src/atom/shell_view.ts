import * as THREE from 'three';

/**
 * Levels 1 and 2 (whole atom, single shell): a spherical cut-away shaded by
 * the radial distribution D(r) = 4*pi*r^2*rho(r), scaled to local structure
 * (see `shellEmphasis` in atom_profile.ts) so shells stay legible across the
 * atom's full range rather than only the tallest one.
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

// Ruling R25: the curve ships on the SCF's own logarithmic grid
// (r_j = rMin * e^(j*dx)), not resampled onto a uniform-in-r table. A
// uniform-in-r lookup sounds equivalent but silently flattens a heavy atom's
// inner shells -- uranium's K shell retained under 40% of its true height
// even at 4096 uniform samples, because it lives inside the first fraction
// of a percent of rMax. Computing `t` with the grid's own log spacing here
// is exactly what `interpolateOnGrid` (radial_grid.ts) does, so the
// texture's built-in linear filtering between texels *is* correct log-space
// interpolation, with no resampling step to get wrong.
//
// The texture carries `shellEmphasis` (atom_profile.ts) -- D(r) divided by a
// smoothed running maximum of itself -- rather than raw D(r). Ruling R16
// (raw D must not be normalised or quantised before upload) was about the
// *global* range of D itself, which spans three orders of magnitude between
// a heavy atom's K shell and its valence; dividing by a single global peak
// -- which is what a naive normalisation, or the pow(d, k) perceptual ramp
// this replaces, amounts to -- crushed every shell's peak against that one
// scale (uranium's inner troughs sat 0.028 below their neighbouring peaks:
// invisible). `shellEmphasis` sidesteps that entirely by comparing each
// point only to its own neighbourhood, so it is already bounded to [0, 1]
// by construction; R16's concern about losing precision to the global range
// does not apply to a curve that no longer has one. The contrast-expanding
// smoothstep below is what turns "denser than its neighbourhood" into a
// crisp ring instead of a soft gradient -- tuned against the acceptance
// test in atom_profile.test.ts, not chosen by eye.
const CAP_FRAGMENT_SHADER = /* glsl */`
    precision highp float;

    uniform sampler2D shellEmphasis;
    uniform float rMin;
    uniform float dx;
    uniform float size;
    uniform float rMax;
    uniform float opacity;
    uniform float highlightR;   // negative when nothing is highlighted
    // World-space half-width of the highlight band, kept proportional to the
    // camera's distance from the target (see setShellViewRingWidth) rather
    // than a fraction of the sampling grid's rMax. rMax can be 20-100x the
    // contour actually on screen for a heavy atom, and is completely
    // unrelated to how far the camera has zoomed in -- sizing the band from
    // it means zooming in on the sphere zooms in on the ring just as much,
    // until it is wide enough to wash out the whole view.
    uniform float ringWidth;

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

        float e = clamp(texture(shellEmphasis, vec2(texCoord, 0.5)).r, 0.0, 1.0);

        // Shell rings: a shell peak sits at its own local maximum, so its
        // emphasis approaches 1 regardless of the shell's absolute height;
        // a trough between two peaks sits well below whichever neighbour is
        // taller. smoothstep's lower edge is set high (0.9) so that ratio
        // gap turns into a crisp bright ring against a dark background
        // rather than a soft gradient -- see the module doc above.
        vec3 cold = vec3(0.02, 0.03, 0.10);
        vec3 warm = vec3(1.00, 0.85, 0.45);
        vec3 color = mix(cold, warm, smoothstep(0.9, 1.0, e));

        // The ring the radial plot is pointing at. Comparing the cut face's
        // own |worldPosition| against highlightR is already geometrically
        // correct for a plot-selected radius: it traces the circle where the
        // sphere of radius r meets the cut plane, without any extra geometry.
        if (highlightR > 0.0 && abs(r - highlightR) < ringWidth) {
            color = vec3(0.30, 0.95, 1.00);
        }

        fragColor = vec4(color, opacity);
    }
`;

export interface ShellViewOptions {
    /** Sphere radius: the contour enclosing the profile's requested electron fraction. */
    contourRadius: number;
    /**
     * `shellEmphasis(grid, D, ...)` for this view (the whole atom at level
     * 1, one shell at level 2) -- D(r) already divided by a smoothed running
     * maximum of itself, and so already bounded to [0, 1] -- on the log grid
     * described by rMin/dx/size below (ruling R25 -- supersedes the
     * uniform-in-r `radialTexture` sketch in the original brief, which loses
     * a heavy atom's inner-shell peak).
     */
    shellEmphasis: Float32Array;
    /** The shared log grid's parameters: r_j = rMin * e^(j*dx), j = 0..size-1. */
    rMin: number;
    dx: number;
    size: number;
    /** Extent of the sampled curve; also sizes the cut-face quad and the discard radius. */
    rMax: number;
    opacity: number;
    plane: THREE.Plane;
}

/** Wraps the log-grid emphasis curve in a float texture the cap shader can read. */
function createShellEmphasisTexture(values: Float32Array): THREE.DataTexture {
    const texture = new THREE.DataTexture(values, values.length, 1);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Builds the stencil passes and the shaded cut face for one spherical shell
 * view. See the module doc above for why this is a sphere rather than a
 * marching-cubes surface, and why the stencil technique matches
 * `clip_caps.ts` exactly.
 */
export function createShellView(options: ShellViewOptions): THREE.Group {
    const { contourRadius, shellEmphasis, rMin, dx, size, rMax, opacity, plane } = options;

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
            shellEmphasis: { value: createShellEmphasisTexture(shellEmphasis) },
            rMin: { value: rMin },
            dx: { value: dx },
            size: { value: size },
            rMax: { value: rMax },
            opacity: { value: opacity },
            highlightR: { value: -1 },
            // Placeholder until the first setShellViewRingWidth call from the
            // render loop; only visible for a single frame at worst.
            ringWidth: { value: rMax * 0.004 },
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

/**
 * Keeps the highlight ring a constant apparent thickness by sizing its
 * world-space half-width from the camera's own distance to the target
 * (spec bugfix -- see the `ringWidth` uniform's doc comment above). Called
 * once per frame from the render loop rather than only on camera-move
 * events: `OrbitControls` damping means the camera keeps moving for several
 * frames after the user stops dragging, and this is cheap enough (one
 * uniform write) that there is no reason to track "did the distance
 * actually change" separately.
 */
export function setShellViewRingWidth(view: THREE.Object3D | null, worldHalfWidth: number): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        material.uniforms.ringWidth.value = worldHalfWidth;
    });
}

/** Frees the shell-emphasis texture; the geometry is shared and disposed with the mesh. */
export function disposeShellView(view: THREE.Object3D | null): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        material.uniforms.shellEmphasis.value?.dispose();
    });
}
