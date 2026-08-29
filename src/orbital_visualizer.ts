import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshData, OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from './types/orbital';
import { DEFAULT_ENCLOSED_FRACTION, computeSamplingRadius } from './orbital_presets';
import { createOrbitalMaterial, applySurfaceStyle, updateClipPlane } from './orbital_material';
import { createClipCaps, positionCaps, setCapsVisible, setCapsOpacity, disposeCaps } from './clip_caps';
import { ScaleBar, computeScaleBar, worldUnitsPerPixel } from './scale_bar';
import { createOrbitalWorker } from './workers/createOrbitalWorker';
import { createOrbitalControls } from './orbital_controls_factory';
import { createShellView, setShellViewHighlight, disposeShellView, ShellViewOptions } from './atom/shell_view';

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
}

interface WorkerSuccessMessage {
    type: 'success';
    meshData: MeshData;
}

interface WorkerErrorMessage {
    type: 'error';
    message: string;
}

type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

export function initVisualizer(container: HTMLElement, initialCameraZ: number = 12): VisualizerContext {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = initialCameraZ;

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
        isShellView: false
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
 * Pulls the camera back far enough to see a box of half-width rMax, keeping the
 * direction it is currently looking from. Orbitals span 10 to 200 Bohr radii
 * depending on n, so a fixed camera distance leaves the viewer inside the mesh
 * for anything above n=3.
 */
export function frameOrbital(context: VisualizerContext | null, rMax: number) {
    if (!context || context.isDisposed) return;

    const { camera, controls } = context;
    const halfFov = (camera.fov * Math.PI) / 180 / 2;
    // Fit the sphere that encloses the sampling box, with a little margin.
    const distance = (rMax * Math.sqrt(3) * 1.15) / Math.sin(halfFov);

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
 * Result of a render request. A request is superseded when a newer one starts
 * before it finishes: its mesh is discarded rather than drawn.
 */
export type RenderOutcome =
    | { status: 'rendered'; isoLevel: number }
    | { status: 'superseded' };

export async function updateOrbitalInScene(
    context: VisualizerContext | null,
    params: OrbitalParams,
    showAxes: boolean = true
): Promise<RenderOutcome> {
    if (!context) return { status: 'superseded' };

    // Stop whatever is still running. Each request spawns its own worker, so
    // without this a slower earlier calculation could return after a faster
    // later one and overwrite the orbital that was actually asked for.
    context.activeWorker?.terminate();
    const requestId = ++context.requestCounter;

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
                    updateSceneWithMeshData(context, e.data.meshData, params);
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
    /** D(r) for this view (the whole atom or one shell), on the log grid below. */
    radialCurve: Float32Array | Float64Array;
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
     * updateAtomViewInScene).
     */
    rMax: number;
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
export function updateAtomViewInScene(
    context: VisualizerContext | null,
    params: AtomShellViewParams
): void {
    if (!context || context.isDisposed) return;

    clearCurrentOrbital(context, context.scene);
    context.isShellView = true;
    // Spherically symmetric: there is no preferred direction for the axes to
    // mark, unlike a marching-cubes orbital's lobes.
    removeAxesHelper(context);

    // Frame on the contour radius -- the radius that actually bounds the
    // sphere drawn below -- not the sampling grid's rMax (spec bugfix: the
    // grid is sized to comfortably hold the tail of the outermost orbital,
    // which for a heavy atom leaves the visible contour a few pixels across
    // in the middle of an otherwise empty viewport). This is also what
    // makes drilling into a shell actually zoom in: each shell carries its
    // own, smaller contour radius.
    if (context.framedRMax !== params.contourRadius) {
        frameOrbital(context, params.contourRadius);
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

    // The shader's DataTexture needs 32-bit floats regardless of which
    // precision the curve arrived in (a whole-atom curve is already
    // Float32Array off the wire; a single shell's curve is Float64Array --
    // see SerialisedShell/SerialisedAtomProfile in atomWorker.ts).
    const radialCurve = params.radialCurve instanceof Float32Array
        ? params.radialCurve
        : Float32Array.from(params.radialCurve);

    const view = createShellView({
        contourRadius: params.contourRadius,
        radialCurve,
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
}

// --- Helper Functions ---
function clearCurrentOrbital(context: VisualizerContext, scene: THREE.Scene) {
    if (!context) return;
    
    console.log('Clearing orbital...', {
        hasGroup: !!context.currentOrbitalGroup,
        childCount: context.currentOrbitalGroup?.children.length
    });
    
    if (context.currentOrbitalGroup) {
        // Dispose of all children first
        context.currentOrbitalGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });

        // Remove from scene. A shell view's cap material carries a
        // `radialCurve` uniform rather than clip_caps.ts's `densityMap`, so
        // it needs its own disposal path -- calling disposeCaps on it would
        // reach for a uniform that does not exist.
        if (context.isShellView) {
            disposeShellView(context.currentOrbitalGroup);
        } else {
            disposeCaps(context.currentCaps);
        }
        scene.remove(context.currentOrbitalGroup);
        context.currentOrbitalGroup = null;
        context.currentCaps = null;
        
        // Force scene update
        scene.updateMatrixWorld(true);
    }
}

function startAnimationLoop(context: VisualizerContext) {
    if (!context) return;
    const { renderer, scene, camera, controls } = context;
    
    function animate() {
        if (!context || context.isDisposed) {
            return;
        }
        
        controls.update();
        renderer.render(scene, camera);
        context.animationFrameId = requestAnimationFrame(animate);
    }
    
    // Start the animation
    context.animationFrameId = requestAnimationFrame(animate);
}

// Modified updateSceneWithMeshData to include better error handling
function updateSceneWithMeshData(context: VisualizerContext, meshData: MeshData, params: OrbitalParams) {
    if (!context || context.isDisposed) {
        console.warn('Visualizer: Cannot update scene - context is disposed or null');
        return;
    }

    try {
        clearCurrentOrbital(context, context.scene);
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
