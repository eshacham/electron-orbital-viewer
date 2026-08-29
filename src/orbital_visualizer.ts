import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshData, OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from './types/orbital';
import { DEFAULT_ENCLOSED_FRACTION, computeSamplingRadius } from './orbital_presets';
import { createOrbitalMaterial, applySurfaceStyle, updateClipPlane, setGroupOpacity } from './orbital_material';
import { createClipCaps, positionCaps, setCapsVisible, setCapsOpacity, disposeCaps } from './clip_caps';
import { ScaleBar, computeScaleBar, worldUnitsPerPixel } from './scale_bar';
import { createOrbitalWorker } from './workers/createOrbitalWorker';
import { createOrbitalControls } from './orbital_controls_factory';
import {
    createShellView,
    setShellViewHighlight,
    setShellViewRingWidth,
    setShellViewCurve,
    getShellViewCurve,
    setShellViewRadius,
    getShellViewRadius,
    disposeShellView,
    ShellViewOptions
} from './atom/shell_view';
import { lerp, clamp01, easeInOutCubic, interpolateCurves } from './atom/level_transition';

// Add export to make it available to OrbitalViewer
export interface VisualizerContext {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    currentOrbitalGroup: THREE.Group | null;
    currentAxesHelper: THREE.AxesHelper | null;
    animationFrameId?: number;
    isDisposed?: boolean;  // Add this flag
    /**
     * The radius the camera was last framed for, so we only re-frame when
     * the scale changes. For a marching-cubes orbital this is the sampling
     * box's rMax; for a levels-1/2 shell view it is the *contour* radius
     * (spec bugfix), which is what actually bounds the visible object --
     * not the sampling grid's rMax, which can be over 100x larger for a
     * heavy atom (see clipExtent below for that quantity).
     */
    framedRMax?: number;
    /**
     * The rMax used for the cut plane / discard radius, tracked separately
     * from `framedRMax` above. The two coincide for a marching-cubes
     * orbital (both are the sampling box's rMax), but a shell view's cut
     * face and shader discard still need to span the full sampling grid
     * even though the camera is framed tighter, on the contour radius --
     * conflating the two would either clip the shell view's cut face short
     * or zoom the camera out to the near-empty grid extent.
     */
    clipExtent?: number;
    surfaceStyle: SurfaceStyle;
    /** Single cut-away plane, shared by every orbital material. */
    clipPlane: THREE.Plane;
    clippingPlanes: THREE.Plane[];
    /** Stencil-capped faces over the cut, rebuilt with each orbital. */
    currentCaps: THREE.Group | null;
    /** The calculation currently in flight, if any. */
    activeWorker: Worker | null;
    /** Increments per request, so a superseded result can be recognised. */
    requestCounter: number;
    /**
     * True when `currentOrbitalGroup` is a levels-1/2 shell view rather than
     * a marching-cubes orbital mesh. The two share a cap material with
     * different uniforms (`radialCurve` vs `densityMap`), so this decides
     * which disposal path and which highlight function apply to whatever is
     * currently on screen (see clearCurrentOrbital and setHoverRadius below).
     */
    isShellView?: boolean;
    /**
     * Set by the owning component after `initVisualizer`; fed the radius
     * under the pointer on every `pointermove` over the canvas (levels 1-2
     * cross-view linkage, the reverse of `setHoverRadius`).
     */
    onHoverRadius?: (r: number | null) => void;
    /**
     * The in-flight level-transition animation, if any (level-transition
     * spec addendum) -- either the atom<->shell curve/camera fade
     * (`ShellFadeTransition`) or the shell<->orbital cross-fade
     * (`CrossFadeTransition`). Ticked once per frame from
     * `startAnimationLoop`. A new render request at any level always calls
     * `cancelTransition` first (see `updateAtomViewInScene` /
     * `updateOrbitalInScene`), which snaps whatever this was left mid-flight
     * to a clean resting state rather than ever running two transitions at
     * once -- the same "only the newest request may own the scene"
     * discipline `requestCounter` already gives the marching-cubes path,
     * applied to the animation state too.
     */
    transition?: LevelTransition | null;
}

/**
 * The atom<->shell fade (level-transition spec addendum): one already-built
 * shell view is mutated in place, easing its curve, its visible radius and
 * the camera's distance from wherever they started to wherever the newly
 * selected level/shell wants them. `fadeDelay`/`cameraDelay` are what encode
 * the "fade leads, camera follows" (drilling in) vs "camera leads, fade
 * follows" (drilling out) ordering the spec requires -- whichever phase has
 * the smaller delay starts first, and the other overlaps it briefly rather
 * than starting at the same instant (see `beginShellFade`).
 */
interface ShellFadeTransition {
    kind: 'shell-fade';
    /** Stamped by the first tick (`requestAnimationFrame` timestamps are relative to page load, not to when this object was built). */
    startTime: number | null;
    fromCurve: Float32Array;
    toCurve: Float32Array;
    fromRadius: number;
    toRadius: number;
    fromCameraDistance: number;
    toCameraDistance: number;
    fadeDelay: number;
    cameraDelay: number;
    /** `context.framedRMax` to record once this completes -- the framing radius the camera eased to, which can differ from `toRadius` (see `framingRadiusFor`). */
    finalFramedRadius: number;
}

/**
 * The shell<->orbital cross-fade (level-transition spec addendum): a genuine
 * topology change, so unlike the fade above there is no single mutated view
 * -- `outgoing` is kept alive in the scene alongside whatever
 * `context.currentOrbitalGroup` already became (the "incoming" side, built
 * or requested up front at opacity 0), and the two are fully composited via
 * `renderCrossFade`'s two-pass render rather than one shared draw (see its
 * own doc comment for why one pass is not safe when two stencil-capped
 * groups are visible at once).
 */
interface CrossFadeTransition {
    kind: 'cross-fade';
    startTime: number | null;
    outgoing: THREE.Object3D;
    /** Which disposal path `outgoing` needs once the fade finishes -- see `disposeOrbitalGroup`. */
    outgoingIsShellView: boolean;
}

type LevelTransition = ShellFadeTransition | CrossFadeTransition;

/** How long the atom<->shell fade/camera-ease phases and the shell<->orbital cross-fade each take, and how much the fade/camera-ease phases overlap. Tuned by eye (see task report) rather than derived from anything physical. */
const FADE_DURATION_MS = 350;
const CAMERA_DURATION_MS = 350;
const PHASE_OVERLAP_MS = 100;
const CROSS_FADE_DURATION_MS = 350;

interface WorkerSuccessMessage {
    type: 'success';
    meshData: MeshData;
}

interface WorkerErrorMessage {
    type: 'error';
    message: string;
}

type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

/**
 * The default camera position, a three-quarter view rather than one straight
 * down any single axis (spec bugfix): every m=0 orbital (2p_z, 3d_z^2,
 * 4f_z^3, ...) is rotationally symmetric about z, so a camera sitting on the
 * z axis looks straight down that symmetry axis and sees only a silhouette
 * -- the near lobe hides the far one and the whole orbital reads as a
 * featureless ball until the viewer drags it.
 *
 * The three components are deliberately unequal (not a plain (1,1,1)
 * isometric view) so the camera is not exactly on any single axis or any
 * x=y/y=z/x=z symmetry plane either, which would reintroduce the same
 * edge-on problem for an orbital symmetric about a *different* axis or
 * diagonal. `frameOrbital` only ever rescales this direction to fit whatever
 * is on screen (see its own doc comment), so only the direction matters here
 * -- `distance` sets the magnitude for the caller that wants an actual
 * position rather than just this function's own return value.
 *
 * A free function, rather than inline in `initVisualizer`, purely so it can
 * be unit-tested: `initVisualizer` itself constructs a real
 * `THREE.WebGLRenderer`, which has no WebGL context under jsdom.
 */
export function defaultCameraPosition(distance: number): THREE.Vector3 {
    return new THREE.Vector3(0.6, 0.45, 0.65).normalize().multiplyScalar(distance);
}

export function initVisualizer(container: HTMLElement, initialCameraZ: number = 12): VisualizerContext {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.copy(defaultCameraPosition(initialCameraZ));

    // stencil defaults to false since three r163, and without the buffer every
    // stencil test passes — which would draw the cut-away caps as full quads
    // instead of only across the orbital's interior.
    const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Without this the canvas backs at one device pixel per CSS pixel, which on
    // a phone is a third of the screen's resolution. Capped at 2 so a 3x display
    // does not pay for nine fragments per CSS pixel.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5).normalize(); // Adjusted light position
    scene.add(directionalLight);

    // Orbitals get turned around freely, so light the other side too. Without
    // this the solid surface goes black whenever it is viewed from behind.
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-5, -3, -5).normalize();
    scene.add(fillLight);

    // Kept for the lifetime of the context so materials can hold a stable
    // reference; "no cut" is expressed by moving it out of range, not by
    // detaching it, which would force a shader recompile.
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);

    const controls = createOrbitalControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.minDistance = 0.1; // Adjusted min distance
    // controls.maxDistance = 100; // Added max distance

    const context: VisualizerContext = {
        scene,
        camera,
        renderer,
        controls,
        currentOrbitalGroup: null,
        currentAxesHelper: null,
        isDisposed: false,  // Initialize the flag
        surfaceStyle: { ...defaultSurfaceStyle },
        clipPlane,
        clippingPlanes: [clipPlane],
        currentCaps: null,
        activeWorker: null,
        requestCounter: 0,
        isShellView: false,
        transition: null
    };

    // Levels 1-2 cross-view linkage (spec §6): the plot reports a radius on
    // hover, and this is the reverse direction, reading one back off the cut
    // face under the pointer. Attached once, here, rather than per-render,
    // since the canvas element itself never changes for the life of the
    // context.
    renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
        context.onHoverRadius?.(radiusUnderPointer(context, event));
    });
    renderer.domElement.addEventListener('pointerleave', () => {
        context.onHoverRadius?.(null);
    });

    startAnimationLoop(context);
    return context;
}

// Reused across calls rather than allocated per pointermove: raycasting runs
// on every pointer event, and per-frame allocation here would otherwise be
// the one GC-pressure hot path in an app that is deliberately careful about
// disposal everywhere else.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();

/**
 * The radius where the ray through the pointer meets the cut plane -- the
 * cross-view link from the 3D view back to the radial plot (spec §6, the
 * reverse of setHoverRadius below). Exported (rather than kept as a
 * pointermove-only closure) so it can be tested directly: `initVisualizer`
 * constructs a real WebGLRenderer, which has no WebGL context under jsdom,
 * so nothing that requires it can be exercised in a test.
 */
export function radiusUnderPointer(context: VisualizerContext, event: PointerEvent): number | null {
    const canvas = context.renderer.domElement;
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, context.camera);
    // Only meaningful when there is a cut face to read a radius off.
    if (context.surfaceStyle.clipAxis === 'none') return null;
    return raycaster.ray.intersectPlane(context.clipPlane, hit) ? hit.length() : null;
}

/**
 * Drives the shell view's highlight ring from the radial plot's hovered
 * radius -- the other direction of the link above. A no-op when the current
 * view is a marching-cubes orbital rather than a shell view: that cap
 * material carries no `highlightR` uniform at all, so reaching for it would
 * throw rather than silently doing nothing.
 */
export function setHoverRadius(context: VisualizerContext | null, r: number | null): void {
    if (!context || context.isDisposed) return;
    if (!context.isShellView) return;
    setShellViewHighlight(context.currentOrbitalGroup, r);
}

/**
 * The distance a camera with this FOV must sit at to fit a sphere of radius
 * rMax, with a little margin. Factored out of `frameOrbital` so the
 * atom<->shell fade's camera-ease phase (`beginShellFade`) can compute its
 * target distance up front, without moving the camera itself until the
 * animation actually gets there.
 */
function fitDistance(camera: THREE.PerspectiveCamera, rMax: number): number {
    const halfFov = (camera.fov * Math.PI) / 180 / 2;
    return (rMax * Math.sqrt(3) * 1.15) / Math.sin(halfFov);
}

/**
 * Pulls the camera back far enough to see a box of half-width rMax, keeping the
 * direction it is currently looking from. Orbitals span 10 to 200 Bohr radii
 * depending on n, so a fixed camera distance leaves the viewer inside the mesh
 * for anything above n=3.
 */
export function frameOrbital(context: VisualizerContext | null, rMax: number) {
    if (!context || context.isDisposed) return;

    const { camera, controls } = context;
    const distance = fitDistance(camera, rMax);

    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);
    direction.normalize();

    controls.target.set(0, 0, 0);
    camera.position.copy(direction.multiplyScalar(distance));
    camera.near = Math.max(0.01, distance / 1000);
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
    controls.update();

    context.framedRMax = rMax;
}

/**
 * Puts the caps where the plane is, and shows them only when they mean
 * something: there has to be a cut, and a solid surface for it to cut through.
 */
function refreshCaps(context: VisualizerContext) {
    const { surfaceStyle, currentCaps } = context;
    setCapsVisible(
        currentCaps,
        surfaceStyle.clipAxis !== 'none' && surfaceStyle.mode === 'solid'
    );
    setCapsOpacity(currentCaps, surfaceStyle.opacity);
    positionCaps(currentCaps, context.clipPlane);
}

/** Restyles the orbital — mode, opacity, cut plane — without recalculating it. */
export function setSurfaceStyle(context: VisualizerContext | null, style: SurfaceStyle) {
    if (!context || context.isDisposed) return;
    context.surfaceStyle = style;
    applySurfaceStyle(context.currentOrbitalGroup, style);
    updateClipPlane(
        context.clipPlane,
        style.clipAxis,
        style.clipPosition,
        context.clipExtent ?? 1
    );
    refreshCaps(context);
}

/** Scale bar for the current camera, or null if there is nothing to measure. */
export function getScaleBar(
    context: VisualizerContext | null,
    canvasHeightPx: number,
    maxPixels: number
): ScaleBar | null {
    if (!context || context.isDisposed) return null;

    const { camera, controls } = context;
    return computeScaleBar(
        worldUnitsPerPixel(camera.position.distanceTo(controls.target), camera.fov, canvasHeightPx),
        maxPixels
    );
}

export function cleanupVisualizer(context: VisualizerContext | null) {
    if (context) {
        context.isDisposed = true;  // Set flag first
        if (context.animationFrameId) {
            cancelAnimationFrame(context.animationFrameId);
            context.animationFrameId = undefined;
        }
        context.activeWorker?.terminate();   // do not leave a calculation running
        context.activeWorker = null;
        clearCurrentOrbital(context, context.scene); // Ensure orbital is cleared
        if (context.currentAxesHelper) {
            context.scene.remove(context.currentAxesHelper);
            context.currentAxesHelper.dispose();
            context.currentAxesHelper = null;
        }
        if (context.controls) {
            context.controls.dispose();
        }
        if (context.renderer) {
            context.renderer.domElement.remove();
            context.renderer.dispose();
        }
        // The calling component will nullify its reference to the context
        console.log("Visualizer cleaned up.");
    }
}


/**
 * Disposes one orbital-or-shell-view group's own resources, without touching
 * `context` -- the shared body of `clearCurrentOrbital` below, factored out
 * so the shell<->orbital cross-fade can dispose whichever side is on its way
 * *out* (`context.currentOrbitalGroup` has already moved on to the
 * incoming side by the time that happens, so `clearCurrentOrbital` itself,
 * which always reads `context.currentOrbitalGroup`, cannot be reused as-is).
 */
function disposeOrbitalGroup(group: THREE.Object3D, isShellView: boolean): void {
    group.traverse(child => {
        if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat => mat.dispose());
        }
    });

    // A shell view's cap material carries a `radialCurve` (shellEmphasis)
    // uniform rather than clip_caps.ts's `densityMap`, so it needs its own
    // disposal path for the one resource `material.dispose()` above does not
    // reach: a texture referenced only from a custom uniform.
    if (isShellView) {
        disposeShellView(group);
    } else {
        const caps = group.children.find(child => child.userData.isCapAssembly) ?? null;
        disposeCaps(caps);
    }
}

/**
 * Settles whatever `context.transition` is currently doing, instantly,
 * before a new render request takes over -- the animation counterpart of
 * `requestCounter` superseding a stale worker result. Without this, a
 * selection change made mid-animation would either strand the outgoing side
 * of a cross-fade in the scene forever (nothing else ever removes it) or
 * leave a shell view's curve/radius/camera frozen part-way through a fade
 * when the next request's own logic starts reading "where is this view
 * right now" as its new starting point.
 *
 * Every entry point that can touch the scene (`updateAtomViewInScene`,
 * `updateOrbitalInScene`) calls this first, unconditionally -- exactly the
 * same discipline `requestCounter` already applies to in-flight workers,
 * applied to in-flight animation state instead of a parallel mechanism of
 * its own.
 */
function cancelTransition(context: VisualizerContext): void {
    const transition = context.transition;
    if (!transition) return;

    if (transition.kind === 'cross-fade') {
        context.scene.remove(transition.outgoing);
        disposeOrbitalGroup(transition.outgoing, transition.outgoingIsShellView);
        // The incoming side was already `context.currentOrbitalGroup`, faded
        // in only part-way -- it becomes the new resting view, so it must
        // read as fully there, not still translucent from an interrupted fade.
        setGroupOpacity(context.currentOrbitalGroup, context.surfaceStyle.opacity);
    } else {
        setShellViewCurve(context.currentOrbitalGroup, transition.toCurve);
        setShellViewRadius(context.currentOrbitalGroup, transition.toRadius);
        context.framedRMax = transition.finalFramedRadius;
    }
    context.transition = null;
}

/**
 * Advances the atom<->shell fade by one frame: the curve and the visible
 * radius both ease from wherever they started to the target, on their own
 * (possibly staggered) schedules -- see `beginShellFade` for how
 * `fadeDelay`/`cameraDelay` encode "fade leads, camera follows" (drilling
 * in) versus "camera leads, fade follows" (drilling out). The camera itself
 * is only touched once its own phase has actually started (`cameraT > 0`):
 * before that it must stay completely still, which is the entire point of
 * the fade leading rather than the two running together (level-transition
 * spec addendum -- an atom<->shell transition that moves the camera and
 * fades the curve at the same time reads as flying through the shells,
 * which is physically wrong, see spec §2).
 */
function tickShellFade(context: VisualizerContext, transition: ShellFadeTransition, elapsed: number): void {
    const fadeT = easeInOutCubic(clamp01((elapsed - transition.fadeDelay) / FADE_DURATION_MS));
    const cameraT = easeInOutCubic(clamp01((elapsed - transition.cameraDelay) / CAMERA_DURATION_MS));

    setShellViewCurve(context.currentOrbitalGroup, interpolateCurves(transition.fromCurve, transition.toCurve, fadeT));
    setShellViewRadius(context.currentOrbitalGroup, lerp(transition.fromRadius, transition.toRadius, cameraT));

    if (cameraT > 0) {
        const { camera, controls } = context;
        const distance = lerp(transition.fromCameraDistance, transition.toCameraDistance, cameraT);
        // Re-read the current bearing every frame, exactly like frameOrbital
        // does, rather than a bearing frozen at the transition's start: the
        // user is free to keep dragging the view while the zoom eases, and
        // this keeps following wherever they end up looking rather than
        // fighting them back to a stale direction.
        const direction = camera.position.clone().sub(controls.target);
        if (direction.lengthSq() === 0) direction.set(0, 0, 1);
        direction.normalize();

        controls.target.set(0, 0, 0);
        camera.position.copy(direction.multiplyScalar(distance));
        camera.near = Math.max(0.01, distance / 1000);
        camera.far = distance * 10;
        camera.updateProjectionMatrix();
    }

    const totalDuration = Math.max(
        transition.fadeDelay + FADE_DURATION_MS,
        transition.cameraDelay + CAMERA_DURATION_MS
    );
    if (elapsed >= totalDuration) {
        // Snap to the exact target: easing can land at 0.999999 rather than
        // 1, and the final frame has to be exact so a *later* transition's
        // "from" (read live off the scene, see beginShellFade) starts from
        // the real target rather than a value one ULP short of it.
        setShellViewCurve(context.currentOrbitalGroup, transition.toCurve);
        setShellViewRadius(context.currentOrbitalGroup, transition.toRadius);
        context.framedRMax = transition.finalFramedRadius;
        context.transition = null;
    }
}

/**
 * Advances the shell<->orbital cross-fade by one frame: a plain opacity
 * ramp, outgoing down as incoming goes up, both scaled by the surface
 * style's own resting opacity (read live, not captured at the start, so a
 * user dragging the opacity slider mid-fade is respected rather than
 * overridden). `renderCrossFade` (called from the render loop instead of a
 * plain `renderer.render`, see its own doc comment) is what actually keeps
 * the two groups' stencil caps from corrupting each other while both are
 * visible.
 */
function tickCrossFade(context: VisualizerContext, transition: CrossFadeTransition, elapsed: number): void {
    const t = easeInOutCubic(clamp01(elapsed / CROSS_FADE_DURATION_MS));
    const resting = context.surfaceStyle.opacity;
    setGroupOpacity(transition.outgoing, resting * (1 - t));
    setGroupOpacity(context.currentOrbitalGroup, resting * t);

    if (elapsed >= CROSS_FADE_DURATION_MS) {
        context.scene.remove(transition.outgoing);
        disposeOrbitalGroup(transition.outgoing, transition.outgoingIsShellView);
        // Snap to the exact resting opacity for the same reason tickShellFade
        // snaps its curve/radius: easing can undershoot by a hair.
        setGroupOpacity(context.currentOrbitalGroup, resting);
        context.transition = null;
    }
}

/** Ticks whichever kind of transition is running -- dispatches to the two functions above. */
function tickTransition(context: VisualizerContext, timestamp: number): void {
    const transition = context.transition;
    if (!transition) return;

    if (transition.startTime === null) transition.startTime = timestamp;
    const elapsed = timestamp - transition.startTime;

    if (transition.kind === 'shell-fade') {
        tickShellFade(context, transition, elapsed);
    } else {
        tickCrossFade(context, transition, elapsed);
    }
}

/**
 * Renders a frame while a cross-fade has two stencil-capped groups alive at
 * once. A single `renderer.render(scene, camera)` cannot show both
 * correctly: the stencil trick both `clip_caps.ts` and `shell_view.ts` use
 * assumes its own geometry is the *only* contributor to the stencil buffer
 * its cap reads, incrementing/decrementing a shared counter that a second,
 * unrelated capped object's geometry would just as easily push past zero or
 * back to zero -- so one object's silhouette leaks into the other's cap, or
 * cancels it out, depending on where they overlap. Three.js also renders all
 * opaque objects (the stencil passes) before any transparent one (the caps),
 * regardless of `renderOrder`, so ordering the two groups' meshes relative
 * to each other cannot separate their stencil writes from each other's cap
 * reads either.
 *
 * The fix is two full render passes, one per group, with only the stencil
 * buffer cleared in between: the first pass clears everything and draws with
 * only the outgoing group visible, the second clears just the stencil buffer
 * (`autoClear` off, so colour and depth survive) and draws with only the
 * incoming group visible, alpha-blending on top of the first pass's result.
 * Each group's stencil technique only ever sees its own geometry, and the
 * two are still composited into one frame exactly as the "both geometries
 * alive briefly with opacity animated" cross-fade the spec addendum asks for.
 */
function renderCrossFade(context: VisualizerContext, transition: CrossFadeTransition): void {
    const { renderer, scene, camera, currentOrbitalGroup } = context;
    const incoming = currentOrbitalGroup;
    if (!incoming) {
        renderer.render(scene, camera);
        return;
    }

    const outgoing = transition.outgoing;
    // Whatever refreshCaps last set these to (e.g. hidden entirely when the
    // cut is off) -- restored afterwards so nothing outside this function
    // has to know a cross-fade is even happening.
    const outgoingVisible = outgoing.visible;
    const incomingVisible = incoming.visible;

    incoming.visible = false;
    renderer.autoClear = true;
    renderer.render(scene, camera);

    outgoing.visible = false;
    incoming.visible = incomingVisible;
    renderer.autoClear = false;
    renderer.clearStencil();
    renderer.render(scene, camera);

    outgoing.visible = outgoingVisible;
    incoming.visible = incomingVisible;
    renderer.autoClear = true;
}

/**
 * Starts the atom<->shell fade in place of an instant rebuild: reads
 * wherever the current shell view actually is right now (mid-fade or
 * settled -- `getShellViewCurve`/`getShellViewRadius` and the camera's own
 * live distance, never a value cached from whenever the *previous* request
 * arrived) as the "from" endpoint, and the newly requested params as "to".
 *
 * Which phase leads is decided by comparing the two framings rather than by
 * the caller stating a direction: the whole atom's own contour is never
 * smaller than any one shell's (a shell's enclosed-fraction contour is a
 * subset of the atom's), so a request that frames *tighter* than the
 * current view is drilling in (fade leads, camera follows) and one that
 * frames *wider* is drilling out (camera leads, fade follows) -- which also
 * happens to do the sensible thing for a sideways shell-to-shell pick with
 * no canonical "in"/"out" of its own.
 */
function beginShellFade(context: VisualizerContext, params: AtomShellViewParams, framingRadius: number): void {
    const fromCurve = getShellViewCurve(context.currentOrbitalGroup);
    const fromRadius = getShellViewRadius(context.currentOrbitalGroup);
    if (!fromCurve || fromRadius === null) {
        // Should not happen given this is only called once the caller has
        // already confirmed a shell view is showing, but there is nothing
        // sane to animate from nothing -- fall back to the instant path.
        updateAtomViewInScene(context, params);
        return;
    }

    context.clipExtent = params.rMax;
    updateClipPlane(context.clipPlane, context.surfaceStyle.clipAxis, context.surfaceStyle.clipPosition, params.rMax);

    const fromCameraDistance = context.camera.position.distanceTo(context.controls.target);
    const toCameraDistance = fitDistance(context.camera, framingRadius);
    const drillingOut = toCameraDistance > fromCameraDistance;

    context.transition = {
        kind: 'shell-fade',
        startTime: null,
        fromCurve,
        toCurve: params.shellEmphasis,
        fromRadius,
        toRadius: params.contourRadius,
        fromCameraDistance,
        toCameraDistance,
        fadeDelay: drillingOut ? CAMERA_DURATION_MS - PHASE_OVERLAP_MS : 0,
        cameraDelay: drillingOut ? 0 : FADE_DURATION_MS - PHASE_OVERLAP_MS,
        finalFramedRadius: framingRadius,
    };
}

/**
 * Result of a render request. A request is superseded when a newer one starts
 * before it finishes: its mesh is discarded rather than drawn.
 */
export type RenderOutcome =
    | { status: 'rendered'; isoLevel: number }
    | { status: 'superseded' };

export interface UpdateOrbitalOptions {
    /**
     * Cross-fade into this orbital from whatever shell view is currently
     * showing, once the worker's mesh actually lands (level-transition spec
     * addendum) -- rather than the instant swap this defaults to. Ignored
     * (falls back to the instant swap) when there is no shell view currently
     * showing to fade from, e.g. picking a different orbital while already
     * at level 3: that is not a level transition, so it stays instant
     * regardless of this flag. The caller is expected to have already
     * folded `prefers-reduced-motion` into this before passing it in.
     */
    animate?: boolean;
}

export async function updateOrbitalInScene(
    context: VisualizerContext | null,
    params: OrbitalParams,
    showAxes: boolean = true,
    options: UpdateOrbitalOptions = {}
): Promise<RenderOutcome> {
    if (!context) return { status: 'superseded' };

    // Stop whatever is still running. Each request spawns its own worker, so
    // without this a slower earlier calculation could return after a faster
    // later one and overwrite the orbital that was actually asked for.
    context.activeWorker?.terminate();
    const requestId = ++context.requestCounter;
    // Settle any in-flight level-transition animation before this request's
    // own effects start landing -- same reasoning as the requestCounter bump
    // above, applied to animation state (see cancelTransition's doc comment).
    cancelTransition(context);

    return new Promise((resolve, reject) => {
        console.log('Visualizer: Starting worker calculation');

        const worker = createOrbitalWorker();
        context.activeWorker = worker;

        // Fall back to the defaults if anything arrived unusable.
        let workerFraction = params.enclosedFraction;
        if (isNaN(workerFraction) || workerFraction <= 0 || workerFraction >= 1) {
            workerFraction = DEFAULT_ENCLOSED_FRACTION;
        }

        let workerRMax = params.rMax;
        if (isNaN(workerRMax) || workerRMax <= 0) {
            workerRMax = computeSamplingRadius(params.n, params.l, params.Z);
        }

        // Update or remove axes helper based on showAxes and the rMax to be used
        if (showAxes) {
            addAxesHelper(context, workerRMax);
        } else {
            removeAxesHelper(context); // Ensure axes are removed if showAxes is false
        }

        // Re-frame only when the scale changes, so repeated updates at the same
        // rMax leave the viewer's chosen angle and zoom alone. A
        // marching-cubes orbital's visible extent *is* the sampling box, so
        // camera framing and the clip extent are the same value here (unlike
        // a shell view -- see updateAtomViewInScene).
        if (context.framedRMax !== workerRMax) {
            frameOrbital(context, workerRMax);
        }
        context.clipExtent = workerRMax;
        // The cut position is a fraction of rMax, so it has to be recomputed
        // whenever the box changes size.
        updateClipPlane(
            context.clipPlane,
            context.surfaceStyle.clipAxis,
            context.surfaceStyle.clipPosition,
            workerRMax
        );
        refreshCaps(context);

        const cleanup = () => {
            worker.terminate();
            if (context.activeWorker === worker) context.activeWorker = null;
        };

        /** True once a newer request has taken over. */
        const superseded = () => requestId !== context.requestCounter;


        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            if (superseded()) {
                cleanup();
                resolve({ status: 'superseded' });
                return;
            }
            try {
                if (e.data.type === 'success') {
                    console.log('Visualizer: Received mesh data from worker');
                    // Cross-fade only makes sense in from a shell view -- an
                    // orbital replacing another orbital (a different n/l/ml
                    // picked while already at level 3) is not a level
                    // transition, and takes the instant path regardless of
                    // `options.animate` (see UpdateOrbitalOptions's doc
                    // comment). Read here, at the moment the mesh actually
                    // lands, rather than when the request started: the
                    // worker round trip can take a while, and it is
                    // whichever view is *still* showing right now that this
                    // needs to fade from.
                    const crossFadeFromShellView = Boolean(options.animate) && context.isShellView && context.currentOrbitalGroup !== null;
                    updateSceneWithMeshData(context, e.data.meshData, params, crossFadeFromShellView);
                    resolve({ status: 'rendered', isoLevel: e.data.meshData.isoLevel });
                } else {
                    console.error('Visualizer: Worker error:', e.data.message);
                    reject(new Error(e.data.message));
                }
            } catch (error) {
                console.error('Visualizer: Error processing mesh data:', error);
                reject(error);
            } finally {
                cleanup();
            }
        };

        worker.onerror = (error) => {
            cleanup();
            if (superseded()) {
                resolve({ status: 'superseded' });
                return;
            }
            console.error('Visualizer: Worker error:', error);
            reject(error);
        };

        // Send calculation request to worker
        worker.postMessage({ 
            type: 'calculate',
            // Send original params for n, l, ml, Z, resolution
            // but use the sanitized/defaulted rMax and isoLevel
            params: { ...params, rMax: workerRMax, enclosedFraction: workerFraction }
        });
    });
}

/** What updateAtomViewInScene needs to build one level-1/2 shell view. */
export interface AtomShellViewParams {
    /** Radius enclosing this view's requested fraction of its electrons. */
    contourRadius: number;
    /**
     * `shellEmphasis(grid, D, ...)` for this view (the whole atom or one
     * shell) -- D(r) already divided by a smoothed running maximum of
     * itself, already bounded to [0, 1] -- on the log grid below. Always a
     * Float32Array: unlike raw D(r) (which spans orders of magnitude and so
     * genuinely needs float64 upstream), this is a bounded ratio computed
     * once on the CPU (atom_profile.ts) and shipped as-is.
     */
    shellEmphasis: Float32Array;
    rMin: number;
    dx: number;
    size: number;
    /**
     * Outer extent of the shared log grid; sizes the cut face and the
     * shader's discard radius. **Not** the camera framing target -- the
     * grid extent is chosen generously enough to hold the outermost
     * occupied orbital's tail, so it is routinely 20-100x the radius that
     * is actually visible (e.g. gold: rMax=140 vs a contour radius of
     * 1.4). The camera frames on `contourRadius` instead (see
     * updateAtomViewInScene) -- tighter still when `outermostFeatureR` is
     * given.
     */
    rMax: number;
    /**
     * Radius of the outermost resolved shell peak, when known (level 1's
     * whole-atom view only -- see `AtomProfile.shellPeaks`). Lets the camera
     * start tighter than the enclosed-fraction contour for a heavy atom,
     * where the fraction's tail vastly outsizes the shell structure itself
     * (uranium: a 90%-enclosed contour of 1.58 a0 against an outermost
     * resolved peak of just 0.30 a0 -- the structure is under 4% of the
     * visible disc). Omit to frame on `contourRadius` exactly as before.
     */
    outermostFeatureR?: number;
}

/**
 * How far out the camera frames a shell view by default.
 *
 * `contourRadius` bounds the sphere itself and must keep doing so exactly --
 * this only chooses where the camera *starts*. Framing on the outermost
 * resolved shell peak instead, with a margin for the ring's own width and a
 * little breathing room beyond it, starts the camera close enough that the
 * shell structure is what the viewer actually sees rather than a sliver in
 * the middle of an empty disc. `Math.min` with `contourRadius` means this
 * can only pull the default view in, never push it out past what the
 * enclosed-fraction control already asked for -- scrolling back out still
 * reaches the full contour, the control is untouched.
 */
const SHELL_VIEW_FRAMING_MARGIN = 2.5;
function framingRadiusFor(contourRadius: number, outermostFeatureR: number | undefined): number {
    if (!(outermostFeatureR !== undefined && outermostFeatureR > 0)) return contourRadius;
    return Math.min(contourRadius, outermostFeatureR * SHELL_VIEW_FRAMING_MARGIN);
}

/**
 * Renders levels 1-2 (whole atom / single shell): a spherical cut-away shaded
 * by D(r), built directly from the profile already sitting in the store.
 *
 * This is the sibling of updateOrbitalInScene above, for the case where the
 * density is spherically symmetric (see shell_view.ts's module doc): there is
 * no worker round trip and no sampling grid, because nothing needs
 * calculating that solveAtom has not already produced. It shares
 * clearCurrentOrbital, the clip plane, camera framing and the caps lifecycle
 * with the marching-cubes path, exactly as the marching-cubes path shares
 * them with itself across renders.
 */
export interface UpdateAtomViewOptions {
    /**
     * Animate into this view rather than cutting to it instantly
     * (level-transition spec addendum): the atom<->shell fade when the
     * current view is already a shell view of some kind, or a cross-fade
     * when it is a marching-cubes orbital (drilling out of level 3). Ignored
     * (falls back to the instant cut) when there is nothing showing yet to
     * animate from, e.g. the very first shell view after solving a freshly
     * selected element. The caller is expected to have already folded
     * `prefers-reduced-motion` into this before passing it in.
     */
    animate?: boolean;
}

export function updateAtomViewInScene(
    context: VisualizerContext | null,
    params: AtomShellViewParams,
    options: UpdateAtomViewOptions = {}
): void {
    if (!context || context.isDisposed) return;

    // A marching-cubes worker from updateOrbitalInScene may still be in
    // flight (cold-load race, spec bugfix): the two paths land in the same
    // scene, but only updateOrbitalInScene used to check requestCounter
    // before drawing, so a stray worker result could arrive after this shell
    // view and silently overwrite it. Terminating any active worker and
    // bumping the shared counter here makes the two paths mutually
    // exclusive -- whichever runs more recently wins, and the other's
    // in-flight result is recognised as superseded when it lands.
    context.activeWorker?.terminate();
    context.activeWorker = null;
    context.requestCounter++;
    // Settle any in-flight level-transition animation before this request's
    // own effects start landing (see cancelTransition's doc comment).
    cancelTransition(context);

    // Frame on the contour radius -- the radius that actually bounds the
    // sphere drawn below -- not the sampling grid's rMax (spec bugfix: the
    // grid is sized to comfortably hold the tail of the outermost orbital,
    // which for a heavy atom leaves the visible contour a few pixels across
    // in the middle of an otherwise empty viewport), and tighter still when
    // `outermostFeatureR` narrows that further (see framingRadiusFor). This
    // is also what makes drilling into a shell actually zoom in: each shell
    // carries its own, smaller contour radius.
    const framingRadius = framingRadiusFor(params.contourRadius, params.outermostFeatureR);

    // The atom<->shell fade: both the current and the new view are shell
    // views (of the whole atom or of one shell each), so this mutates the
    // existing view in place instead of rebuilding -- see beginShellFade.
    if (options.animate && context.isShellView && context.currentOrbitalGroup) {
        beginShellFade(context, params, framingRadius);
        return;
    }

    // Drilling out of level 3: cross-fade instead of an instant swap (a
    // genuine topology change, spec addendum -- a marching-cubes orbital
    // does not continuously deform into a sphere). Keep the outgoing
    // orbital alive in the scene rather than clearing it immediately; it
    // becomes `transition.outgoing` below.
    const crossFadeFrom = (options.animate && !context.isShellView && context.currentOrbitalGroup)
        ? context.currentOrbitalGroup
        : null;
    if (crossFadeFrom) {
        context.currentOrbitalGroup = null;
        context.currentCaps = null;
    } else {
        clearCurrentOrbital(context, context.scene);
    }

    context.isShellView = true;
    // Spherically symmetric: there is no preferred direction for the axes to
    // mark, unlike a marching-cubes orbital's lobes.
    removeAxesHelper(context);

    if (context.framedRMax !== framingRadius) {
        frameOrbital(context, framingRadius);
    }
    // The cut face and the shader's discard radius still need to span the
    // full sampling grid, independently of how tight the camera is framed.
    context.clipExtent = params.rMax;
    updateClipPlane(
        context.clipPlane,
        context.surfaceStyle.clipAxis,
        context.surfaceStyle.clipPosition,
        params.rMax
    );

    const view = createShellView({
        contourRadius: params.contourRadius,
        shellEmphasis: params.shellEmphasis,
        rMin: params.rMin,
        dx: params.dx,
        size: params.size,
        rMax: params.rMax,
        opacity: context.surfaceStyle.opacity,
        plane: context.clipPlane,
    } satisfies ShellViewOptions);

    context.scene.add(view);
    // The shell view's own group *is* its caps -- there is no separate
    // always-visible surface mesh the way a marching-cubes orbital has one,
    // because the interesting content only exists on the cut face (see
    // shell_view.ts). Setting both to the same group is what lets
    // refreshCaps/setSurfaceStyle's positionCaps/setCapsVisible/setCapsOpacity
    // calls work against it unchanged.
    context.currentOrbitalGroup = view;
    context.currentCaps = view;
    refreshCaps(context);

    if (crossFadeFrom) {
        // Starts fully transparent -- tickCrossFade ramps it (and fades
        // crossFadeFrom down) from here.
        setGroupOpacity(view, 0);
        context.transition = {
            kind: 'cross-fade',
            startTime: null,
            outgoing: crossFadeFrom,
            outgoingIsShellView: false,
        };
    }
}

// --- Helper Functions ---
function clearCurrentOrbital(context: VisualizerContext, scene: THREE.Scene) {
    if (!context) return;
    
    console.log('Clearing orbital...', {
        hasGroup: !!context.currentOrbitalGroup,
        childCount: context.currentOrbitalGroup?.children.length
    });
    
    if (context.currentOrbitalGroup) {
        // A shell view's cap material carries a `radialCurve` uniform rather
        // than clip_caps.ts's `densityMap`, so it needs its own disposal
        // path -- see disposeOrbitalGroup, which also handles the plain
        // geometry/material disposal every kind of group needs.
        disposeOrbitalGroup(context.currentOrbitalGroup, !!context.isShellView);
        scene.remove(context.currentOrbitalGroup);
        context.currentOrbitalGroup = null;
        context.currentCaps = null;
        
        // Force scene update
        scene.updateMatrixWorld(true);
    }
}

// Ring half-width, in on-screen pixels, regardless of zoom (spec bugfix --
// see the `ringWidth` uniform in shell_view.ts). A handful of pixels reads as
// a crisp line at any distance; a fraction of the sampling grid's rMax, the
// old approach, does not, because rMax has no relationship to how far the
// camera has zoomed in.
const HIGHLIGHT_RING_HALF_WIDTH_PX = 2;

function startAnimationLoop(context: VisualizerContext) {
    if (!context) return;
    const { renderer, scene, camera, controls } = context;

    function animate(timestamp: number) {
        if (!context || context.isDisposed) {
            return;
        }

        controls.update();
        // Advances the level-transition animation, if one is running --
        // before the ring-width/render steps below, so both see this
        // frame's already-updated curve/radius/opacity/camera rather than
        // last frame's.
        if (context.transition) tickTransition(context, timestamp);
        // Damping keeps the camera moving for several frames after a drag
        // ends, so this is recomputed every frame rather than only on
        // explicit camera-move events.
        if (context.isShellView) {
            const canvasHeightPx = renderer.domElement.clientHeight;
            const pxToWorld = worldUnitsPerPixel(
                camera.position.distanceTo(controls.target),
                camera.fov,
                canvasHeightPx
            );
            setShellViewRingWidth(context.currentOrbitalGroup, pxToWorld * HIGHLIGHT_RING_HALF_WIDTH_PX);
        }
        if (context.transition?.kind === 'cross-fade') {
            renderCrossFade(context, context.transition);
        } else {
            renderer.render(scene, camera);
        }
        context.animationFrameId = requestAnimationFrame(animate);
    }

    // Start the animation
    context.animationFrameId = requestAnimationFrame(animate);
}

// Modified updateSceneWithMeshData to include better error handling
function updateSceneWithMeshData(
    context: VisualizerContext,
    meshData: MeshData,
    params: OrbitalParams,
    crossFadeFromShellView: boolean = false
) {
    if (!context || context.isDisposed) {
        console.warn('Visualizer: Cannot update scene - context is disposed or null');
        return;
    }

    try {
        // Cross-fading in: keep the shell view alive in the scene instead of
        // clearing it immediately -- it becomes `transition.outgoing` below,
        // disposed only once the fade actually finishes (or is itself
        // superseded -- see cancelTransition).
        const outgoingShellView = crossFadeFromShellView ? context.currentOrbitalGroup : null;
        if (outgoingShellView) {
            context.currentOrbitalGroup = null;
            context.currentCaps = null;
        } else {
            clearCurrentOrbital(context, context.scene);
        }
        context.isShellView = false;

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(meshData.positions.flat());
        const colors = new Float32Array(meshData.positions.length * 3); // RGB for each vertex

        // Assign colors based on ψ sign
        meshData.psiSigns.forEach((sign, index) => {
            const colorIndex = index * 3;
            if (sign === 1) {
                colors[colorIndex] = 1; // Red
                colors[colorIndex + 1] = 0;
                colors[colorIndex + 2] = 0;
            } else {
                colors[colorIndex] = 0; // Blue
                colors[colorIndex + 1] = 0;
                colors[colorIndex + 2] = 1;
            }
        });

        const positionAttribute = new THREE.Float32BufferAttribute(positions, 3);
        geometry.setAttribute('position', positionAttribute);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();

        const material = createOrbitalMaterial(context.surfaceStyle, context.clippingPlanes);

        const mesh = new THREE.Mesh(geometry, material);
        const group = new THREE.Group();
        group.add(mesh);

        // Solid faces over the cut, so a cross-section reads as cut material
        // rather than the hollow inside of the far wall.
        const caps = createClipCaps(geometry, {
            plane: context.clipPlane,
            densityMap: meshData.densityMap,
            opacity: context.surfaceStyle.opacity
        });
        group.add(caps);
        context.currentCaps = caps;
        refreshCaps(context);

        context.scene.add(group);
        context.currentOrbitalGroup = group;

        if (outgoingShellView) {
            // Starts fully transparent -- tickCrossFade ramps it (and fades
            // outgoingShellView down) from here.
            setGroupOpacity(group, 0);
            context.transition = {
                kind: 'cross-fade',
                startTime: null,
                outgoing: outgoingShellView,
                outgoingIsShellView: true,
            };
        }
    } catch (error) {
        console.error('Visualizer: Error creating mesh:', error);
        throw error;
    }
}

function addAxesHelper(context: VisualizerContext, size: number) {
    if (!context) return;
    
    // Remove existing axes if any
    removeAxesHelper(context);
    
    // Create and add new axes
    const axesHelper = new THREE.AxesHelper(size);
    context.scene.add(axesHelper);
    context.currentAxesHelper = axesHelper;
}

function removeAxesHelper(context: VisualizerContext) {
    if (!context || !context.currentAxesHelper) return;
    
    context.scene.remove(context.currentAxesHelper);
    context.currentAxesHelper.dispose();
    context.currentAxesHelper = null;
}

export function handleResize(context: VisualizerContext, width: number, height: number) {
    if (!context) return;
    
    const { camera, renderer } = context;
    
    // Update camera aspect ratio
    if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
    
    // Update renderer size
    renderer.setSize(width, height);
}
