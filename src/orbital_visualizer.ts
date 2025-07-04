import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshData, OrbitalParams } from './types/orbital';

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

// --- Optimized Parameters Storage (with more predictions) ---
const optimizedOrbitalParameters: Record<string, { rMax: number; isoLevel: number }> = {
    // Example: "n_0"
    "1_0": { rMax: 10, isoLevel: 0.001 },      // 1s
    "2_0": { rMax: 15, isoLevel: 0.0005 },     // 2s
    "2_1": { rMax: 15, isoLevel: 0.0005 },     // 2p
    "3_0": { rMax: 20, isoLevel: 0.00001 },    // 3s
    "3_1": { rMax: 20, isoLevel: 0.00001 },    // 3p
    "3_2": { rMax: 20, isoLevel: 0.00001 },    // 3d
    "4_0": { rMax: 35, isoLevel: 0.000004 },   // 4s
    "4_1": { rMax: 35, isoLevel: 0.000004 },   // 4p
    "4_2": { rMax: 35, isoLevel: 0.000004 },   // 4d
    "4_3": { rMax: 35, isoLevel: 0.000004 },   // 4f
    "5_0": { rMax: 50, isoLevel: 0.0000025 },  // 5s
    "5_1": { rMax: 50, isoLevel: 0.0000025 },  // 5p
    "5_2": { rMax: 50, isoLevel: 0.0000025 },  // 5d
    "5_3": { rMax: 50, isoLevel: 0.0000025 },  // 5f
    "5_4": { rMax: 50, isoLevel: 0.0000025 },  // 5g
    "6_0": { rMax: 70, isoLevel: 0.000001 },   // 6s
    "6_1": { rMax: 70, isoLevel: 0.000001 },   // 6p
    "6_2": { rMax: 70, isoLevel: 0.000001 },   // 6d
    "6_3": { rMax: 70, isoLevel: 0.000001 },   // 6f
    "6_4": { rMax: 70, isoLevel: 0.000001 },   // 6g
    "6_5": { rMax: 70, isoLevel: 0.000001 },   // 6h
    "7_0": { rMax: 90, isoLevel: 0.0000007 },  // 
    "7_1": { rMax: 90, isoLevel: 0.0000007 },  // 
    "7_2": { rMax: 90, isoLevel: 0.0000007 },  //
    "7_3": { rMax: 90, isoLevel: 0.0000007 },  //
    "7_4": { rMax: 90, isoLevel: 0.0000007 },  //
    "7_5": { rMax: 90, isoLevel: 0.0000007 },  //
    "7_6": { rMax: 90, isoLevel: 0.0000007 },  //
    "8_0": { rMax: 120, isoLevel: 0.0000001 }, // 
    "8_1": { rMax: 140, isoLevel: 0.0000001 }, // 
    "8_2": { rMax: 130, isoLevel: 0.0000001 }, //
    "8_3": { rMax: 140, isoLevel: 0.0000001 }, //
    "8_4": { rMax: 140, isoLevel: 0.0000001 }, //
    "8_5": { rMax: 140, isoLevel: 0.0000001 }, //
    "8_6": { rMax: 140, isoLevel: 0.0000001 }, //
    "8_7": { rMax: 140, isoLevel: 0.0000001 }, //
    "9_0": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_1": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_2": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_3": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_4": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_5": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_6": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_7": { rMax: 200, isoLevel: 0.00000001 }, //
    "9_8": { rMax: 200, isoLevel: 0.00000001 }, //
};


export function getOptimizedParameters(n: number, l: number): { rMax: number; isoLevel: number } | null {
    const key = `${n}_${l}`;
    const params = optimizedOrbitalParameters[key];
    if (params) {
        return { ...params }; // Return a copy
    }
    // Per your request, the fallback logic has been removed.
    // The function now expects the key to be present in optimizedOrbitalParameters.
    return null; // Explicitly return null if the key is not found.
}

export function initVisualizer(container: HTMLElement, initialCameraZ: number = 12): VisualizerContext {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = initialCameraZ;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5).normalize(); // Adjusted light position
    scene.add(directionalLight);

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
        isDisposed: false  // Initialize the flag
    };
    
    startAnimationLoop(context);
    return context;
}


export function cleanupVisualizer(context: VisualizerContext | null) {
    if (context) {
        context.isDisposed = true;  // Set flag first
        if (context.animationFrameId) {
            cancelAnimationFrame(context.animationFrameId);
            context.animationFrameId = undefined;
        }
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


export async function updateOrbitalInScene(context: VisualizerContext | null, params: OrbitalParams, showAxes: boolean = true): Promise<void> {
    if (!context) return;

    return new Promise((resolve, reject) => {
        console.log('Visualizer: Starting worker calculation');
        
        const worker = new Worker(new URL('./workers/orbitalWorker.ts', import.meta.url), { 
            type: 'module' 
        });

        // Get optimized/default parameters to use as fallbacks
        const optimizedDefaults = getOptimizedParameters(params.n, params.l)!;

        let workerRMax = params.rMax;
        if (isNaN(workerRMax) || workerRMax <= 0) {
            workerRMax = optimizedDefaults.rMax;
        }

        let workerIsoLevel = params.isoLevel;
        if (isNaN(workerIsoLevel)) {
            workerIsoLevel = optimizedDefaults.isoLevel;
        }

        // Update or remove axes helper based on showAxes and the rMax to be used
        if (showAxes) {
            addAxesHelper(context, workerRMax);
        } else {
            removeAxesHelper(context); // Ensure axes are removed if showAxes is false
        }

        // Simple cleanup function
        const cleanup = () => {
            worker.terminate();
        };


        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            try {
                if (e.data.type === 'success') {
                    console.log('Visualizer: Received mesh data from worker');
                    updateSceneWithMeshData(context, e.data.meshData, params);
                    resolve();
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
            console.error('Visualizer: Worker error:', error);
            cleanup();
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
        scene.remove(context.currentOrbitalGroup);
        context.currentOrbitalGroup = null;
        
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

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,     // Wireframe lines will use vertex colors
            side: THREE.DoubleSide,
            transparent: true,      // Can be true if you want transparent wireframe (e.g., for fading)
            opacity: 1.0,           // Or lower if transparent wireframe is desired
            wireframe: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        const group = new THREE.Group();
        group.add(mesh);

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
