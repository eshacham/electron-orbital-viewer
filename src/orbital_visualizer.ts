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
  currentOrbitalPoints: THREE.Points | null;
  currentAxesHelper: THREE.AxesHelper | null;
  animationFrameId?: number;
}


// --- Optimized Parameters Storage (with more predictions) ---
const optimizedOrbitalParameters: Record<string, { rMax: number; isoLevel: number }> = {
    // Example: "n_l"
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
    if (!context) {
        console.error("Visualizer not initialized.");
        return;
    }
    const { scene, controls } = context;
    const { n, l, ml, Z, resolution, rMax, isoLevel } = params;

    return new Promise(resolve => {
        setTimeout(() => { // Small delay to ensure spinner renders before heavy computation
            clearCurrentOrbital(context, scene);

            if (showAxes) {
                addOrUpdateAxesHelper(context, scene, rMax);
            }

            const orbitalPotentialFunction = getOrbitalPotentialFunction(n, l, ml, Z, isoLevel);

            const worldBounds: [[number, number, number], [number, number, number]] = [
                [-rMax, -rMax, -rMax],
                [rMax, rMax, rMax]
            ];

            console.log("--- Rendering Orbital ---");
            console.log(`Parameters: n=${n}, l=${l}, ml=${ml}, Z=${Z}`);
            console.log(`Visualization: Resolution=${resolution}, rMax=${rMax}, Iso-Level=${isoLevel}`);
            console.log(`World Bounds:`, worldBounds);

            function isPowerOfTwo(value: number): boolean {
                return (value & (value - 1)) === 0 && value > 0;
            }

            if (!isPowerOfTwo(resolution)) {
                console.error(`ERROR: Resolution (${resolution}) must be a power of two for Marching Cubes. Orbital might not render correctly or an error might occur.`);
                // Optionally, you could try to find the nearest power of two or default
            }

            let meshData: MarchingCubesMeshData | null = null;
            try {
                meshData = marchingCubes( // Use the direct import
                    resolution,
                    orbitalPotentialFunction,
                    worldBounds
                );
            } catch (e) {
                console.error("Error during Marching Cubes calculation:", e);
                resolve(); // Resolve the promise even on error
                return;
            }

            if (!meshData || !meshData.positions || meshData.positions.length === 0) {
                console.warn("Marching Cubes generated no positions (vertices). This means the isosurface level might not be found within the given parameters (rMax, resolution) or the orbital itself has very low density.");
                console.warn("Try adjusting Iso-Level (decrease it), rMax (increase it), or choose different quantum numbers.");
                resolve(); // Resolve the promise
                return;
            }

            // Check for invalid numbers in the source positions from marchingCubes
            let hasInvalidNumberInSource = false;
            if (meshData.positions) {
                for (const pos of meshData.positions) {
                    if (pos.some(val => typeof val !== 'number' || isNaN(val) || !isFinite(val))) {
                        hasInvalidNumberInSource = true;
                        break;
                    }
                }
            }

            if (hasInvalidNumberInSource) {
                console.error("meshData.positions contains invalid numerical values (NaN or Infinity). This is likely the cause of a rendering error.");
                resolve(); // Resolve the promise
                return;
            }

            const flatPositions = meshData.positions.flat();

            if (flatPositions.length % 3 !== 0) {
                console.error(`ERROR: flatPositions length (${flatPositions.length}) is not a multiple of 3. This means vertex data is incomplete or corrupted!`);
                resolve(); // Resolve the promise
                return;
            }

            const scaledAndTranslatedPositions = new Float32Array(flatPositions.length);
            const modelExtent = rMax * 2;
            const gridDim = resolution; // This is the number of points along one edge of the cube
            const scaleFactor = modelExtent / (gridDim -1) ; // Scale from grid units to world units

            for (let i = 0; i < flatPositions.length; i += 3) {
                const gx = flatPositions[i];     // Grid x (0 to resolution-1)
                const gy = flatPositions[i + 1]; // Grid y (0 to resolution-1)
                const gz = flatPositions[i + 2]; // Grid z (0 to resolution-1)

                // Check for invalid numbers before scaling
                if (typeof gx !== 'number' || typeof gy !== 'number' || typeof gz !== 'number' ||
                    isNaN(gx) || isNaN(gy) || isNaN(gz) || !isFinite(gx) || !isFinite(gy) || !isFinite(gz)) {
                    console.error(`Runtime ERROR: Invalid gx, gy, or gz found in scaling loop at source index ${i/3}. Values: ${gx}, ${gy}, ${gz}`);
                    // Set to origin or skip to prevent further errors
                    scaledAndTranslatedPositions[i]     = 0;
                    scaledAndTranslatedPositions[i + 1] = 0;
                    scaledAndTranslatedPositions[i + 2] = 0;
                    continue;
                }
                
                // Scale and translate from grid coordinates to world coordinates
                // The marching cubes output is typically in grid coordinates (0 to resolution-1)
                // We need to map this to our worldBounds (-rMax to +rMax)
                scaledAndTranslatedPositions[i]     = gx * scaleFactor - rMax;
                scaledAndTranslatedPositions[i + 1] = gy * scaleFactor - rMax;
                scaledAndTranslatedPositions[i + 2] = gz * scaleFactor - rMax;
            }
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(scaledAndTranslatedPositions, 3));
            
            // Use meshData.cells for indexing if available and correct
            if (meshData.cells && meshData.cells.length > 0) {
                const indices = meshData.cells.flat();
                geometry.setIndex(indices);
            }
            geometry.computeVertexNormals(); // Important for lighting

            const meshMaterial = new THREE.MeshStandardMaterial({
                color: 0x77ccff, // A light blue color
                metalness: 0.3,
                roughness: 0.6,
                side: THREE.DoubleSide, // Render both sides, useful for orbitals
                transparent: true,     // Enable transparency
                opacity: 0.75,         // Set opacity level (0.0 to 1.0)
                wireframe: true, // Uncomment for debugging geometry
            });

            const orbitalMesh = new THREE.Mesh(geometry, meshMaterial);
            scene.add(orbitalMesh);
            context.currentOrbitalMesh = orbitalMesh;

            // Optionally add points for debugging or different visual style
            // const pointsMaterial = new THREE.PointsMaterial({
            //     color: 0x00ff00, // Green for points
            //     size: 0.1
            // });
            // const orbitalPoints = new THREE.Points(geometry, pointsMaterial);
            // if (!context) return; // Guard
            // scene.add(orbitalPoints);
            // context.currentOrbitalPoints = orbitalPoints;

            // --- CRITICAL FIX: Set controls target to the center of the orbital ---
            if (!geometry.boundingSphere) {
                geometry.computeBoundingSphere(); // Ensure bounding sphere is computed
            }

            if (geometry.boundingSphere) {
                controls.target.copy(geometry.boundingSphere.center);
                if (context.currentAxesHelper) {
                    context.currentAxesHelper.position.copy(geometry.boundingSphere.center);
                }
                console.log("Controls target updated to orbital center:", controls.target);
            } else {
                controls.target.set(0, 0, 0); // Fallback
                if (context.currentAxesHelper) {
                    context.currentAxesHelper.position.set(0, 0, 0);
                }
                console.warn("Bounding sphere could not be computed, controls target set to origin.");

            }
            controls.update(); // Update controls after changing target

            console.log("Orbital rendered successfully.");

            // Hide loading spinner after a minimum delay
            setTimeout(() => {
                resolve(); // Resolve the promise
            }, 100); // Shorter delay now that main work is done
        }, 50); // Small initial delay to ensure spinner has time to render before main computation
    });
}

function clearCurrentOrbital(context: VisualizerContext | null, scene: THREE.Scene) {
    if (!context) return;

    if (context.currentOrbitalMesh) {
        scene.remove(context.currentOrbitalMesh);
        context.currentOrbitalMesh.geometry.dispose();
        if (Array.isArray(context.currentOrbitalMesh.material)) {
            context.currentOrbitalMesh.material.forEach(m => m.dispose());
        } else {
           context.currentOrbitalMesh.material.dispose();
        }
        context.currentOrbitalMesh = null;
    }
    if (context.currentOrbitalPoints) {
        scene.remove(context.currentOrbitalPoints);
        context.currentOrbitalPoints.geometry.dispose();
        if (Array.isArray(context.currentOrbitalPoints.material)) {
            context.currentOrbitalPoints.material.forEach(m => m.dispose());
        } else {
            context.currentOrbitalPoints.material.dispose();
        }
        context.currentOrbitalPoints = null;
    }
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
