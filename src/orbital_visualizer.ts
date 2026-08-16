import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshData, OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from './types/orbital';
import { getIsoLevel, computeSamplingRadius } from './orbital_presets';
import { createOrbitalMaterial, applySurfaceStyle, updateClipPlane } from './orbital_material';
import { createClipCaps, positionCaps, setCapsVisible, setCapsOpacity, disposeCaps } from './clip_caps';
import { ScaleBar, computeScaleBar, worldUnitsPerPixel } from './scale_bar';

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
    /** rMax the camera was last framed for, so we only re-frame when the scale changes. */
    framedRMax?: number;
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

    const controls = new OrbitControls(camera, renderer.domElement);
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
        requestCounter: 0
    };
    
    startAnimationLoop(context);
    return context;
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
        context.framedRMax ?? 1
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
export type RenderOutcome = 'rendered' | 'superseded';

export async function updateOrbitalInScene(
    context: VisualizerContext | null,
    params: OrbitalParams,
    showAxes: boolean = true
): Promise<RenderOutcome> {
    if (!context) return 'superseded';

    // Stop whatever is still running. Each request spawns its own worker, so
    // without this a slower earlier calculation could return after a faster
    // later one and overwrite the orbital that was actually asked for.
    context.activeWorker?.terminate();
    const requestId = ++context.requestCounter;

    return new Promise((resolve, reject) => {
        console.log('Visualizer: Starting worker calculation');

        const worker = new Worker(new URL('./workers/orbitalWorker.ts', import.meta.url), { 
            type: 'module' 
        });
        context.activeWorker = worker;

        // Fall back to the defaults if anything arrived unusable.
        let workerIsoLevel = params.isoLevel;
        if (isNaN(workerIsoLevel) || workerIsoLevel <= 0) {
            workerIsoLevel = getIsoLevel(params.n, params.l) ?? 1e-5;
        }

        let workerRMax = params.rMax;
        if (isNaN(workerRMax) || workerRMax <= 0) {
            workerRMax = computeSamplingRadius(
                params.n, params.l, params.ml, params.Z, workerIsoLevel
            );
        }

        // Update or remove axes helper based on showAxes and the rMax to be used
        if (showAxes) {
            addAxesHelper(context, workerRMax);
        } else {
            removeAxesHelper(context); // Ensure axes are removed if showAxes is false
        }

        // Re-frame only when the scale changes, so repeated updates at the same
        // rMax leave the viewer's chosen angle and zoom alone.
        if (context.framedRMax !== workerRMax) {
            frameOrbital(context, workerRMax);
        }
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
                resolve('superseded');
                return;
            }
            try {
                if (e.data.type === 'success') {
                    console.log('Visualizer: Received mesh data from worker');
                    updateSceneWithMeshData(context, e.data.meshData, params);
                    resolve('rendered');
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
                resolve('superseded');
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
            params: { ...params, rMax: workerRMax, isoLevel: workerIsoLevel }
        });
    });
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

        // Remove from scene
        disposeCaps(context.currentCaps);
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
