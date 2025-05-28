import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Add MeshData interface since it's used but not defined
interface MeshData {
    positions: number[][];
    cells: number[][];
}

// Add export to make it available to OrbitalViewer
export interface OrbitalParameters {
    n: number;
    l: number;
    ml: number;
    Z: number;
    resolution: number;
    rMax: number;
    isoLevel: number;
}

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
    "3_0": { rMax: 20, isoLevel: 0.0001 },     // 3s
    "3_1": { rMax: 20, isoLevel: 0.0001 },     // 3p
    "3_2": { rMax: 20, isoLevel: 0.0001 },     // 3d
    "4_0": { rMax: 25, isoLevel: 0.00005 },    // 4s
    "4_1": { rMax: 25, isoLevel: 0.00005 },    // 4p
    "4_2": { rMax: 25, isoLevel: 0.00005 },    // 4d
    "4_3": { rMax: 25, isoLevel: 0.00005 },    // 4f
    "5_0": { rMax: 30, isoLevel: 0.00001 },    // 5s
    "5_1": { rMax: 30, isoLevel: 0.00001 },    // 5p
    "5_2": { rMax: 30, isoLevel: 0.00001 },    // 5d
    "5_3": { rMax: 30, isoLevel: 0.00001 },    // 5f
    "5_4": { rMax: 30, isoLevel: 0.00001 },    // 5g
    "6_0": { rMax: 35, isoLevel: 0.000005 },   // 6s
    "6_1": { rMax: 35, isoLevel: 0.000005 },   // 6p
    "6_2": { rMax: 35, isoLevel: 0.000005 },   // 6d
    "6_3": { rMax: 35, isoLevel: 0.000005 },   // 6f
    "6_4": { rMax: 35, isoLevel: 0.000005 },   // 6g
    "6_5": { rMax: 35, isoLevel: 0.000005 },   // 6h
};


export function getOptimizedParameters(n: number, l: number): { rMax: number; isoLevel: number } | null {
    const key = `${n}_${l}`;
    const params = optimizedOrbitalParameters[key];
    if (params) {
        return { ...params }; // Return a copy
    }
    // Fallback if specific n_l not found
    if (n <= 2) return { rMax: 12, isoLevel: 0.005 };
    if (n === 3) return { rMax: 20, isoLevel: 0.001 };
    if (n === 4) return { rMax: 30, isoLevel: 0.0005 };
    return { rMax: 15, isoLevel: 0.0005 }; // Generic fallback
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


export async function updateOrbitalInScene(context: VisualizerContext | null, params: OrbitalParameters, showAxes: boolean = true): Promise<void> {
    if (!context) return;

    return new Promise((resolve, reject) => {
        console.log('Visualizer: Starting worker calculation');
        
        const worker = new Worker(new URL('./workers/orbitalWorker.ts', import.meta.url), { 
            type: 'module' 
        });

        const { rMax, isoLevel } = getOptimizedParameters(params.n, params.l)!;

        // Simple cleanup function
        const cleanup = () => {
            worker.terminate();
        };

        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            try {
                if (e.data.type === 'success') {
                    console.log('Visualizer: Received mesh data from worker');
                    updateSceneWithMeshData(context, e.data.meshData, params);
                    if (showAxes) {
                        addAxesHelper(context, rMax);
                    }
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
            params: { ...params, rMax, isoLevel }
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
function updateSceneWithMeshData(context: VisualizerContext, meshData: MeshData, params: OrbitalParameters) {
    if (!context || context.isDisposed) {
        console.warn('Visualizer: Cannot update scene - context is disposed or null');
        return;
    }

    try {
        console.log('Visualizer: Creating mesh from data');
        clearCurrentOrbital(context, context.scene);

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(meshData.positions.flat());
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();

        const material =  new THREE.MeshStandardMaterial({
            color: 0x77ccff, // A light blue color
            metalness: 0.3,
            roughness: 0.6,
            side: THREE.DoubleSide, // Render both sides, useful for orbitals
            transparent: true,     // Enable transparency
            opacity: 0.75,         // Set opacity level (0.0 to 1.0)
            wireframe: true, // Uncomment for debugging geometry
        });

        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            wireframe: true,
            transparent: true,
            opacity: 0.1
        });

        const mainMesh = new THREE.Mesh(geometry, material);
        mainMesh.userData.isWireframe = false;

        const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);
        wireframeMesh.userData.isWireframe = true;

        const group = new THREE.Group();
        group.add(mainMesh);
        group.add(wireframeMesh);

        context.scene.add(group);
        context.currentOrbitalGroup = group;
        console.log('Visualizer: Mesh created and added to scene');
    } catch (error) {
        console.error('Visualizer: Error creating mesh:', error);
        throw error; // Propagate error to caller
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
