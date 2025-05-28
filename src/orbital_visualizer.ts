// src/orbital_visualizer.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { getOrbitalPotentialFunction } from './quantum_functions'; // .ts extension is usually not needed in imports
import { marchingCubes, MarchingCubesMeshData } from 'marching-cubes-fast';

interface OrbitalParameters {
  n: number;
  l: number;
  ml: number;
  Z: number;
  resolution: number;
  rMax: number;
  isoLevel: number;
}

interface VisualizerContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  currentOrbitalMesh: THREE.Mesh | null;
  currentOrbitalPoints: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null; // Change the type from Points to Mesh
  currentAxesHelper: THREE.AxesHelper | null;
  animationFrameId?: number;
  currentOrbitalGroup: THREE.Group | null;
}


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
        currentOrbitalMesh: null,
        currentOrbitalPoints: null,
        currentAxesHelper: null,
        currentOrbitalGroup: null,
    };
    
    startAnimationLoop(context);
    return context;
}


export function cleanupVisualizer(context: VisualizerContext | null) {
    if (context) {
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

    // Remove axes and clear orbital before starting calculation
    if (context.currentAxesHelper) {
        context.scene.remove(context.currentAxesHelper);
    }
    clearCurrentOrbital(context, context.scene);

    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/orbitalWorker.ts', import.meta.url), { 
            type: 'module' 
        });

        worker.onmessage = (e) => {
            if (e.data.type === 'success') {
                try {
                    const { meshData } = e.data;
                    updateSceneWithMeshData(context, meshData, params);
                    // Add axes back after mesh is updated
                    if (showAxes) {
                        addOrUpdateAxesHelper(context, context.scene, params.rMax);
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    worker.terminate();
                }
            } else if (e.data.type === 'error') {
                worker.terminate();
                reject(new Error(e.data.error));
            }
        };

        worker.onerror = (error) => {
            worker.terminate();
            reject(error);
        };

        worker.postMessage({
            type: 'calculate',
            params
        });
    });
}

interface MeshData {
    positions: [number, number, number][];
    cells: [number, number, number][];
}

function updateSceneWithMeshData(context: VisualizerContext, meshData: MeshData, params: OrbitalParameters) {
    if (!context) return;

    console.log('Updating scene with new mesh data...', {
        vertexCount: meshData.positions.length,
        triangleCount: meshData.cells.length
    });

    // Clear existing orbital first
    clearCurrentOrbital(context, context.scene);

    const geometry = new THREE.BufferGeometry();
    
    // Convert array of triplets to flat array for THREE.js
    const positions = new Float32Array(meshData.positions.flat());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Set indices for the triangles
    geometry.setIndex(meshData.cells.flat());
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
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

    // Create both meshes
    const mainMesh = new THREE.Mesh(geometry, material);
    mainMesh.userData.isWireframe = false;

    const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);
    wireframeMesh.userData.isWireframe = true;

    // Create new group and add both meshes
    const group = new THREE.Group();
    group.add(mainMesh);
    group.add(wireframeMesh);

    // Clear any existing orbital first
    if (context.currentOrbitalGroup) {
        clearCurrentOrbital(context, context.scene);
    }

    // Add new group to scene and store reference
    context.scene.add(group);
    context.currentOrbitalGroup = group;
    context.currentOrbitalMesh = null; // Clear old reference

    // Force scene update
    context.scene.updateMatrixWorld(true);
}

function clearCurrentOrbital(context: VisualizerContext, scene: THREE.Scene) {
    if (!context) return;
    
    console.log('Clearing orbital...', {
        hasGroup: !!context.currentOrbitalGroup,
        childCount: context.currentOrbitalGroup?.children.length
    });

    // Remove current orbital group if it exists
    if (context.currentOrbitalGroup) {
        // Get all meshes from the group
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

        // Remove from scene and clear reference
        scene.remove(context.currentOrbitalGroup);
        context.currentOrbitalGroup = null;
    }

    // Also clear old references if they exist
    if (context.currentOrbitalMesh) {
        if (context.currentOrbitalMesh.geometry) {
            context.currentOrbitalMesh.geometry.dispose();
        }
        if (context.currentOrbitalMesh.material) {
            if (Array.isArray(context.currentOrbitalMesh.material)) {
                context.currentOrbitalMesh.material.forEach(mat => mat.dispose());
            } else {
                context.currentOrbitalMesh.material.dispose();
            }
        }
        scene.remove(context.currentOrbitalMesh);
        context.currentOrbitalMesh = null;
    }

    // Ensure scene is marked for update
    scene.updateMatrixWorld(true);
}

function addOrUpdateAxesHelper(context: VisualizerContext | null, scene: THREE.Scene, rMax: number) {
    if (!context) return;

    if (context.currentAxesHelper) {
        scene.remove(context.currentAxesHelper);
        context.currentAxesHelper.dispose();
        context.currentAxesHelper = null;
    }
    context.currentAxesHelper = new THREE.AxesHelper(Math.max(1, rMax * 0.5));
    scene.add(context.currentAxesHelper);
}

function startAnimationLoop(context: VisualizerContext | null) {
    if (!context) return;
    const { renderer, scene, camera, controls } = context;
    
    function animateLoop() {
        if (!context || !context.animationFrameId === undefined) return; // Stop if cleaned up or animationFrameId is intentionally undefined after cleanup
        context.animationFrameId = requestAnimationFrame(animateLoop);
        controls.update(); // Only call if controls exist and are enabled
        renderer.render(scene, camera);
    }
    animateLoop();
}

export function handleResize(context: VisualizerContext | null, containerWidth: number, containerHeight: number) {
    if (!context) return;
    const { camera, renderer } = context;
    if (containerHeight === 0) return; // Avoid division by zero

    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(containerWidth, containerHeight);
}
