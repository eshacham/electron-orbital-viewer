import * as THREE from 'three';
import { CURVE_COLORS, hexToRgb01 } from '../curve_colors';

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
    // Addendum 2 ("the 2d graph has different colors f the n ... incorporate
    // these colors somehow to the 3d view"): which curve-palette colour a
    // given radius should read as, and how strongly to apply it. hueStrength
    // is 0 for a view that was not given a ringColorIndex (createShellView's
    // default, and every existing shell view before this change) -- the mix
    // below then reduces to exactly the old warm literal, unchanged.
    uniform sampler2D ringColorIndexMap;
    uniform float hueStrength;
    uniform vec3 palette[8];
    // Core versus valence (Addendum 2, §3 of "what actually makes atoms
    // look different"): which palette index belongs to the outermost
    // occupied shell, and how hard to lean on the distinction. -1 (with
    // valenceStrength 0) is the neutral setting every shell-level view and
    // every pre-existing test uses, under which the mix below is the
    // identity and core and valence rings shade exactly as before.
    uniform int valenceIndex;
    uniform float valenceStrength;
    // The valence shell's *own* emphasis curve, on the same log grid.
    // Needed because the total's emphasis does not resolve the valence
    // shell for most of the periodic table: sodium's 3s is a shoulder on
    // the 2p tail, never a local maximum of the total, so it drew no ring
    // at all. Its own D_n(r) has an unambiguous peak, and that is what the
    // ring is. Read only where the valence shell already dominates the
    // total (paletteIndex == valenceIndex), so an inner lobe of a 3s -- a
    // real local maximum of D_3s sitting inside the K shell -- cannot paint
    // a spurious ring over the core.
    uniform sampler2D valenceEmphasis;
    // World-space half-width of the highlight band, kept proportional to the
    // camera's distance from the target (see setShellViewRingWidth) rather
    // than a fraction of the sampling grid's rMax. rMax can be 20-100x the
    // contour actually on screen for a heavy atom, and is completely
    // unrelated to how far the camera has zoomed in -- sizing the band from
    // it means zooming in on the sphere zooms in on the ring just as much,
    // until it is wide enough to wash out the whole view.
    uniform float ringWidth;
    // The sphere's own radius, and how wide its rim is drawn -- see the rim
    // block below. Zero disables it (a view that was not told its radius).
    uniform float edgeRadius;
    uniform float edgeWidth;

    varying vec3 vWorldPosition;

    // How far a core shell's ring recedes, and how far the valence ring is
    // lifted towards white, at full valenceStrength. Tuned so the core is
    // plainly quieter without going dark enough to lose its own shell
    // structure -- the rings still have to be countable, and clickable.
    const float CORE_DIM = 0.55;
    const float VALENCE_LIFT = 0.35;

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

        // Which shell (by position, ascending n) dominates the total at this
        // radius -- see dominantShellIndex in atom_profile.ts. The index is
        // categorical, not a continuum, so it is sampled with NearestFilter
        // (see createRingColorIndexTexture) rather than interpolated the way
        // shellEmphasis's own texture is.
        int paletteIndex = int(texture(ringColorIndexMap, vec2(texCoord, 0.5)).r + 0.5);
        paletteIndex = clamp(paletteIndex, 0, 7);

        if (valenceStrength > 0.0 && paletteIndex == valenceIndex) {
            e = max(e, clamp(texture(valenceEmphasis, vec2(texCoord, 0.5)).r, 0.0, 1.0));
        }

        // Shell rings: a shell peak sits at its own local maximum, so its
        // emphasis approaches 1 regardless of the shell's absolute height;
        // a trough between two peaks sits well below whichever neighbour is
        // taller. smoothstep's lower edge is set high (0.9) so that ratio
        // gap turns into a crisp bright ring against a dark background
        // rather than a soft gradient -- see the module doc above.
        //
        // Bug fix (task 22, bug 5): the old floor, vec3(0.02, 0.03, 0.10),
        // sat almost exactly on the scene's own background colour (0x050505,
        // ~0.02 in each channel -- see orbital_visualizer.ts's
        // scene.background), so the disc's low-D(r) outer region was
        // nearly indistinguishable from the void around it and the atom
        // read as having no visible extent at all. This floor is roughly
        // six times brighter (by perceptual luminance) than that
        // background, which is enough to read as a distinct navy disc,
        // while staying dark enough that warm (unchanged) still lands a
        // clearly brighter ring on top of it: the peak-to-trough contrast
        // this trades on lives entirely in e and the smoothstep ramp above,
        // not in these two colours, so it is unaffected either way (see
        // atom_profile.test.ts's acceptance test).
        vec3 cold = vec3(0.17, 0.20, 0.36);
        vec3 warm = vec3(1.00, 0.85, 0.45);
        vec3 peakColor = mix(warm, palette[paletteIndex], hueStrength);

        // An element's chemistry is almost entirely its outermost shell;
        // everything inside is inert core, and every ring looking equally
        // important hid the single most chemically meaningful fact about an
        // atom. The core recedes and the valence ring is lifted towards
        // white, which reads as "lit" without changing its hue -- the hue
        // still has to say which n it is, and still has to match the radial
        // plot's own curve for that shell.
        //
        // Applied to the ring's colour only, never to the emphasis e:
        // the peak-to-
        // trough emphasis ratio is what the >= 0.35 contrast acceptance
        // test measures (atom_profile.test.ts), and it is untouched here.
        vec3 recededCore = peakColor * mix(1.0, CORE_DIM, valenceStrength);
        vec3 litValence = mix(peakColor, vec3(1.0), VALENCE_LIFT * valenceStrength);
        vec3 shellColor = paletteIndex == valenceIndex ? litValence : recededCore;

        vec3 color = mix(cold, shellColor, smoothstep(0.9, 1.0, e));

        // The atom's own edge. Reported from the running app: "the bg color
        // of the outer shell is too dark compared with the app's bg colour
        // ... I think the outermost shell has the same colour as the app's
        // bg". Lifting the cold floor (above) helps, but the real problem is
        // that a disc fading into black has no edge at all -- the radial
        // plot's curve visibly continued past where the sphere appeared to
        // stop. A rim states the boundary outright, so "this is where the
        // atom ends" is drawn rather than inferred.
        if (edgeRadius > 0.0 && r > edgeRadius - edgeWidth && r <= edgeRadius) {
            float t = (r - (edgeRadius - edgeWidth)) / max(edgeWidth, 1e-6);
            color = mix(color, vec3(0.62, 0.70, 0.90), 0.35 + 0.45 * t);
        }

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
    /**
     * Per-grid-point index into `CURVE_COLORS` (see `curve_colors.ts`),
     * same log grid as `shellEmphasis`, choosing which palette colour a
     * given radius reads as (Addendum 2's ring colouring). Omit for the
     * plain, uncoloured cold/warm ramp -- this is what every shell-level
     * (single-shell) view currently does, and what the pre-Addendum-2 tests
     * exercise.
     */
    ringColorIndex?: Float32Array;
    /**
     * Palette index of the outermost occupied shell (Addendum 2's core /
     * valence distinction), i.e. its position in the same ascending-n
     * `shells` list `ringColorIndex` indexes into. Omit — as every
     * shell-level view does, having only one shell to show — to shade every
     * ring alike, exactly as before.
     */
    valenceIndex?: number;
    /**
     * The valence shell's own `shellEmphasis` curve, on the same log grid.
     * Supplied alongside `valenceIndex` for the whole-atom view; without it
     * the valence ring falls back to the total's own emphasis, which for
     * most elements does not resolve the valence shell at all (see the
     * `valenceEmphasis` uniform in the fragment shader).
     */
    valenceEmphasis?: Float32Array;
}

/** How thick the sphere's rim is, as a fraction of its radius. Enough to read as an edge at any zoom without eating into the outermost ring. */
const SHELL_EDGE_FRACTION = 0.035;

/** `CURVE_COLORS`, converted once to the [0,1] triples the shader's `palette` uniform array expects. */
const PALETTE = CURVE_COLORS.map(hex => new THREE.Vector3(...hexToRgb01(hex)));

/**
 * Wraps the log-grid emphasis curve in a float texture the cap shader can
 * read. Copies `values` rather than handing it to `DataTexture` directly:
 * the atom<->shell fade (`setShellViewCurve`) mutates the texture's backing
 * array in place every frame, and callers pass this a direct reference to
 * data owned elsewhere -- `AtomProfile.totalEmphasis`/`shell.emphasis`,
 * kept in the Redux store and read again by later views and by the radial
 * plot. Without this copy, animating one shell view corrupts that shared
 * array permanently: a bug caught live rather than by any test, because
 * every existing test builds a single view and never goes on to read the
 * profile's curve again afterwards -- see the level-transition task report
 * for how this actually manifested (a later fade that should reveal three
 * shells stayed stuck on one, because "the whole atom's curve" it was
 * fading towards had already been overwritten with the previous fade's
 * result).
 */
function createShellEmphasisTexture(values: Float32Array): THREE.DataTexture {
    const texture = new THREE.DataTexture(values.slice(), values.length, 1);
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
 * Wraps a per-grid-point palette index in a texture the cap shader can read.
 * NearestFilter, unlike `createShellEmphasisTexture`'s LinearFilter: the
 * index is categorical (which shell owns this radius), and interpolating
 * between e.g. index 1 and index 2 at the boundary between two shells would
 * momentarily read back some third, unrelated fractional value instead of
 * snapping cleanly from one shell's colour to the next.
 */
function createRingColorIndexTexture(values: Float32Array): THREE.DataTexture {
    const texture = new THREE.DataTexture(values.slice(), values.length, 1);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
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
    const { contourRadius, shellEmphasis, rMin, dx, size, rMax, opacity, plane, ringColorIndex, valenceIndex, valenceEmphasis } = options;

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
            edgeRadius: { value: contourRadius },
            edgeWidth: { value: contourRadius * SHELL_EDGE_FRACTION },
            // A 1-texel dummy when ringColorIndex is omitted -- hueStrength
            // 0 means it is never sampled meaningfully either way (see the
            // fragment shader), so its actual contents do not matter then.
            ringColorIndexMap: { value: createRingColorIndexTexture(ringColorIndex ?? new Float32Array([0])) },
            hueStrength: { value: ringColorIndex ? 1 : 0 },
            palette: { value: PALETTE },
            valenceIndex: { value: valenceIndex ?? -1 },
            valenceStrength: { value: valenceIndex === undefined ? 0 : 1 },
            // A 1-texel dummy when no valence curve was given; the guard on
            // valenceStrength above means it is never sampled then.
            valenceEmphasis: { value: createShellEmphasisTexture(valenceEmphasis ?? new Float32Array([0])) },
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

/**
 * Overwrites the emphasis curve in place -- the atom<->shell fade (level-
 * transition spec addendum) mutates one already-built view's texture every
 * frame rather than rebuilding it, since both levels render the same sphere
 * and shader (see the module doc above). A plain data upload, not a new
 * `THREE.DataTexture`: rebuilding the texture object itself on every
 * animation frame would work but is needless churn for what is otherwise a
 * one-line `set` + a dirty flag.
 */
export function setShellViewCurve(view: THREE.Object3D | null, curve: Float32Array): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        const texture = material.uniforms.shellEmphasis.value as THREE.DataTexture;
        const data = texture.image.data as Float32Array;
        const length = Math.min(data.length, curve.length);
        data.set(curve.subarray(0, length));
        texture.needsUpdate = true;
    });
}

/**
 * Reads the currently-displayed curve back out, as a fresh copy -- lets an
 * interrupted transition (orbital_visualizer.ts) read wherever the view
 * actually is right now, mid-fade or settled, as the new "from" endpoint
 * rather than either the stale original start or the target it never
 * reached.
 */
export function getShellViewCurve(view: THREE.Object3D | null): Float32Array | null {
    if (!view) return null;

    let curve: Float32Array | null = null;
    view.traverse(child => {
        if (curve !== null || !(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        const texture = material.uniforms.shellEmphasis.value as THREE.DataTexture;
        curve = (texture.image.data as Float32Array).slice();
    });
    return curve;
}

/**
 * Rescales the visible sphere without rebuilding its geometry -- the
 * "camera follows" half of the atom<->shell fade (level-transition spec
 * addendum): the contour radius genuinely differs between the whole atom and
 * one shell (a shell's own enclosed-fraction contour is typically much
 * smaller), and this is what lets that radius ease smoothly alongside the
 * camera instead of popping. Scaling the stencil meshes is enough on its own
 * -- the flat cap plane's shading comes from world position, independent of
 * the sphere's size (see the module doc above), so it is never touched here.
 * Scale is computed relative to `SphereGeometry.parameters.radius` (the
 * radius the geometry was actually built at) rather than a separately
 * tracked base value, so this stays correct however the view got here.
 */
export function setShellViewRadius(view: THREE.Object3D | null, radius: number): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.userData.isCapStencil) {
            const baseRadius = (child.geometry as THREE.SphereGeometry).parameters.radius;
            child.scale.setScalar(baseRadius > 0 ? radius / baseRadius : 1);
            return;
        }
        // The rim is drawn by the cap shader from world position, so unlike
        // the cap's shading it does have to follow the sphere as the
        // atom<->shell fade eases its radius (see the module doc).
        if (child.userData.isCap) {
            const material = child.material as THREE.ShaderMaterial;
            material.uniforms.edgeRadius.value = radius;
            material.uniforms.edgeWidth.value = radius * SHELL_EDGE_FRACTION;
        }
    });
}

/** Reads the sphere's current effective radius back -- the radius counterpart of `getShellViewCurve`. */
export function getShellViewRadius(view: THREE.Object3D | null): number | null {
    if (!view) return null;

    let radius: number | null = null;
    view.traverse(child => {
        if (radius !== null || !(child instanceof THREE.Mesh) || !child.userData.isCapStencil) return;
        const baseRadius = (child.geometry as THREE.SphereGeometry).parameters.radius;
        radius = baseRadius * child.scale.x;
    });
    return radius;
}

/** Frees the shell-emphasis and ring-colour-index textures; the geometry is shared and disposed with the mesh. */
export function disposeShellView(view: THREE.Object3D | null): void {
    if (!view) return;

    view.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.isCap) return;
        const material = child.material as THREE.ShaderMaterial;
        material.uniforms.shellEmphasis.value?.dispose();
        material.uniforms.ringColorIndexMap.value?.dispose();
        material.uniforms.valenceEmphasis.value?.dispose();
    });
}
