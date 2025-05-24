// src/orbital_visualizer.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getOrbitalPotentialFunction, atomicOrbitalProbabilityDensity } from './quantum_functions.js'; 
import MarchingCubesModule from 'marching-cubes-fast'

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 30;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- Orbital Visualization Group ---
const orbitalMeshGroup = new THREE.Group();
scene.add(orbitalMeshGroup);

// --- TEST CUBE ADDED HERE ---
const geometryTest = new THREE.BoxGeometry(2, 2, 2); // A 2x2x2 cube
const materialTest = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red color
const cubeTest = new THREE.Mesh(geometryTest, materialTest);
scene.add(cubeTest); // Add the cube to the scene
// --- END TEST CUBE ---


// --- UI Elements ---
// Declare all UI element references at the top of this section
const nSelect = document.getElementById('n-select');
const lSelect = document.getElementById('l-select');
const mlSelect = document.getElementById('ml-select');
const zInput = document.getElementById('z-input');
const resolutionInput = document.getElementById('resolution-input'); // This is a <select>
const rMaxInput = document.getElementById('rMax-input');
const updateButton = document.getElementById('update-orbital');

// NEW UI for Isosurface Level: Create and append dynamically
const isoLevelInput = document.createElement('input');
isoLevelInput.type = 'number';
isoLevelInput.id = 'iso-level-input';
isoLevelInput.value = '0.0005'; // Default starting value
isoLevelInput.min = '0.0000001';
isoLevelInput.max = '0.1';
isoLevelInput.step = '0.00001';
isoLevelInput.style.width = '80px';

const isoLevelGroup = document.createElement('div');
isoLevelGroup.className = 'control-group';
isoLevelGroup.innerHTML = '<label for="iso-level-input">Iso-Level:</label>';
isoLevelGroup.appendChild(isoLevelInput);

const controlsContainer = document.getElementById('controls');
controlsContainer.insertBefore(isoLevelGroup, updateButton.parentNode);

// --- Global Orbital Parameters (initialized from UI) ---
let currentN = parseInt(nSelect.value);
let currentL = parseInt(lSelect.value);
let currentMl = parseInt(mlSelect.value);
let currentZ = parseInt(zInput.value);
let currentResolution = parseInt(resolutionInput.value);
let currentRMax = parseFloat(rMaxInput.value);
let isoSurfaceLevel = parseFloat(isoLevelInput.value);

// --- Functions to Update UI Options ---

function updateLOptions() {
    const n = parseInt(nSelect.value);
    lSelect.innerHTML = '';
    const orbitalTypes = ['s', 'p', 'd', 'f', 'g', 'h', 'i'];
    for (let l = 0; l < n; l++) {
        const option = document.createElement('option');
        option.value = l;
        const orbitalChar = orbitalTypes[l] || `orbital(${l})`;
        option.textContent = `l=${l} (${orbitalChar} orbital)`;
        lSelect.appendChild(option);
    }
    if (currentL >= n || isNaN(currentL)) {
        currentL = n - 1;
    }
    lSelect.value = currentL;
    updateMlOptions();
}

function updateMlOptions() {
    const l = parseInt(lSelect.value);
    mlSelect.innerHTML = '';
    for (let ml = -l; ml <= l; ml++) {
        const option = document.createElement('option');
        option.value = ml;
        option.textContent = `m_l=${ml}`;
        mlSelect.appendChild(option);
    }
    if (Math.abs(currentMl) > l || isNaN(currentMl)) {
        currentMl = 0;
    }
    mlSelect.value = currentMl;
}

// --- Render Orbital ---
function renderOrbital() {
    // Clear previous orbital mesh
    orbitalMeshGroup.clear();

    const n = currentN;
    const l = currentL;
    const ml = currentMl;
    const Z = currentZ;

    const orbitalPotentialFunction = getOrbitalPotentialFunction(n, l, ml, Z, isoSurfaceLevel);

    const worldBounds = [
        [-currentRMax, -currentRMax, -currentRMax],
        [currentRMax, currentRMax, currentRMax]
    ];

    console.log("--- Rendering Orbital ---");
    console.log(`Parameters: n=${n}, l=${l}, ml=${ml}, Z=${Z}`);
    console.log(`Visualization: Resolution=${currentResolution}, rMax=${currentRMax}, Iso-Level=${isoSurfaceLevel}`);
    console.log(`World Bounds:`, worldBounds);

    const meshData = MarchingCubesModule.marchingCubes(
        currentResolution,
        orbitalPotentialFunction,
        worldBounds
    );

    console.log("Marching Cubes Raw Result (meshData):", meshData);
    // Check if positions (vertices) were generated
    if (!meshData || !meshData.positions || meshData.positions.length === 0) {
        console.warn("Marching Cubes generated no positions (vertices). This means the isosurface level might not be found within the given parameters (rMax, resolution) or the orbital itself has very low density.");
        console.warn("Try adjusting Iso-Level, rMax, or choose different quantum numbers. Also ensure your Marching Cubes library is correctly returning 'positions' and 'cells'.");
        return;
    }

    // --- Detailed NaN/Infinity check and Flattening for meshData.positions ---
    const flatPositions = [];
    let hasInvalidNumberInSource = false; // Flag for issues in meshData.positions source
    for (let i = 0; i < meshData.positions.length; i++) {
        const vertex = meshData.positions[i]; // Each element is an array [x, y, z]
        if (!Array.isArray(vertex) || vertex.length !== 3) {
            console.error(`Unexpected vertex format at index ${i}. Expected [x,y,z] array. Found:`, vertex);
            hasInvalidNumberInSource = true;
            continue;
        }
        for (let j = 0; j < 3; j++) {
            if (isNaN(vertex[j]) || !isFinite(vertex[j])) { // Check for NaN OR Infinity
                console.error(`Invalid value (NaN or Infinity) found in meshData.positions[${i}][${j}]: ${vertex[j]}`);
                hasInvalidNumberInSource = true;
            }
            flatPositions.push(vertex[j]); // Flatten the array here
        }
    }

    if (hasInvalidNumberInSource) {
        console.error("meshData.positions contains invalid numerical values (NaN or Infinity). This is likely the cause of the computeBoundingSphere error.");
        return; // Stop rendering if data is bad
    }

    console.log("flatPositions length:", flatPositions.length); // Log the length
    // --- End NaN/Infinity check & Flattening ---

    // --- Check if flatPositions length is a multiple of 3 ---
    if (flatPositions.length % 3 !== 0) {
        console.error(`ERROR: flatPositions length (${flatPositions.length}) is not a multiple of 3. This means vertex data is incomplete or corrupted!`);
        return; // Prevent further errors
    }

    const geometry = new THREE.BufferGeometry();

    // CORRECTED: Initialize scaledAndTranslatedPositions with the correct length
    // It needs to hold 3 components (x,y,z) for EACH vertex.
    const scaledAndTranslatedPositions = new Float32Array(flatPositions.length);

    // Scaling and Translation (remains the same, logic is correct for grid to world mapping)
    const modelExtent = currentRMax * 2;
    const gridDim = currentResolution;
    const scaleFactor = modelExtent / (gridDim - 1);

    // CORRECTED: Iterate over flatPositions and extract individual components (numbers)
    for (let i = 0; i < flatPositions.length; i += 3) {
        const gx = flatPositions[i];
        const gy = flatPositions[i + 1];
        const gz = flatPositions[i + 2];

        // Debug logs (re-added, though if this is correct, they won't trigger errors)
        if (typeof gx !== 'number' || typeof gy !== 'number' || typeof gz !== 'number' ||
            isNaN(gx) || isNaN(gy) || isNaN(gz) || !isFinite(gx) || !isFinite(gy) || !isFinite(gz)) {
            console.error(`Runtime ERROR: Invalid gx, gy, or gz found in scaling loop at index ${i}.`);
            console.error(`gx: ${gx} (type: ${typeof gx}), gy: ${gy} (type: ${typeof gy}), gz: ${gz} (type: ${typeof gz})`);
        }

        scaledAndTranslatedPositions[i]     = gx * scaleFactor - currentRMax;
        scaledAndTranslatedPositions[i + 1] = gy * scaleFactor - currentRMax;
        scaledAndTranslatedPositions[i + 2] = gz * scaleFactor - currentRMax;
    }
    console.log("scaledAndTranslatedPositions length:", scaledAndTranslatedPositions.length);

    // CORRECTED: Use scaledAndTranslatedPositions for the geometry's position attribute
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(scaledAndTranslatedPositions, 3));
    // Set the index attribute from meshData.cells (these are already correct)
    geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.cells, 1));


    // Calculate vertex colors (still calculate, but won't be used by BasicMaterial below)
    const colors = new THREE.Float32BufferAttribute(new Float32Array(scaledAndTranslatedPositions.length), 3);
    const baseColor = new THREE.Color(0x00aaff);
    const highlightColor = new THREE.Color(0xaa00ff);
    let maxDensityAtVertices = 0;
    const tempVector = new THREE.Vector3();

    // Iterate over the *flattened* and *scaled* positions for color calculation
    for (let i = 0; i < scaledAndTranslatedPositions.length; i += 3) {
        tempVector.set(scaledAndTranslatedPositions[i], scaledAndTranslatedPositions[i + 1], scaledAndTranslatedPositions[i + 2]);
        const r = tempVector.length();
        const theta = Math.acos(Math.min(1, Math.max(-1, r === 0 ? 0 : tempVector.z / r)));
        const phi = Math.atan2(tempVector.y, tempVector.x);

        let densityAtVertex;
        if (r === 0) {
            densityAtVertex = atomicOrbitalProbabilityDensity(n, l, ml, 0, 0, 0, Z);
        } else {
            densityAtVertex = atomicOrbitalProbabilityDensity(n, l, ml, r, theta, phi, Z);
        }
        maxDensityAtVertices = Math.max(maxDensityAtVertices, densityAtVertex);
    }

    const densityRangeForColor = maxDensityAtVertices - isoSurfaceLevel;

    for (let i = 0; i < scaledAndTranslatedPositions.length; i += 3) {
        tempVector.set(scaledAndTranslatedPositions[i], scaledAndTranslatedPositions[i + 1], scaledAndTranslatedPositions[i + 2]);
        const r = tempVector.length();
        const theta = Math.acos(Math.min(1, Math.max(-1, r === 0 ? 0 : tempVector.z / r)));
        const phi = Math.atan2(tempVector.y, tempVector.x);

        let densityAtVertex;
        if (r === 0) {
            densityAtVertex = atomicOrbitalProbabilityDensity(n, l, ml, 0, 0, 0, Z);
        } else {
            densityAtVertex = atomicOrbitalProbabilityDensity(n, l, ml, r, theta, phi, Z);
        }

        let normalizedColorDensity = 0;
        if (densityRangeForColor > 0) {
            normalizedColorDensity = Math.min(1, Math.max(0, (densityAtVertex - isoSurfaceLevel) / densityRangeForColor));
        }

        const interpolatedColor = new THREE.Color().copy(baseColor).lerp(highlightColor, normalizedColorDensity);

        colors.setXYZ(i / 3, interpolatedColor.r, interpolatedColor.g, interpolatedColor.b);
    }

    geometry.setAttribute('color', colors);
    geometry.computeVertexNormals();

    // TEMPORARY: Use a basic material to rule out lighting/transparency issues
    const material = new THREE.MeshBasicMaterial({
        color: 0x00aaff, // A fixed blue color
        // vertexColors: true, // No need if not using vertex colors with BasicMaterial
        // transparent: true, // Remove for now
        opacity: 1.0, // Full opacity
        side: THREE.DoubleSide
    });

    const orbitalMesh = new THREE.Mesh(geometry, material);
    orbitalMeshGroup.add(orbitalMesh);

    // Debugging: Log orbital mesh properties right before adding
    console.log("Orbital Mesh created:", orbitalMesh);
    console.log("Orbital Mesh Geometry:", orbitalMesh.geometry);
    console.log("Orbital Mesh Material:", orbitalMesh.material);
}


// --- Event Listeners ---
nSelect.addEventListener('change', () => {
    currentN = parseInt(nSelect.value);
    updateLOptions();
});

lSelect.addEventListener('change', () => {
    currentL = parseInt(lSelect.value);
    updateMlOptions();
});

mlSelect.addEventListener('change', () => {
    currentMl = parseInt(mlSelect.value);
});

zInput.addEventListener('change', () => {
    currentZ = parseInt(zInput.value);
    if (isNaN(currentZ) || currentZ < 1) {
        currentZ = 1;
        zInput.value = 1;
    }
});

resolutionInput.addEventListener('change', () => {
    currentResolution = parseInt(resolutionInput.value);
});

rMaxInput.addEventListener('change', () => {
    currentRMax = parseFloat(rMaxInput.value);
    if (isNaN(currentRMax) || currentRMax < 5) {
        currentRMax = 15;
        rMaxInput.value = 15;
    }
});

isoLevelInput.addEventListener('change', () => {
    isoSurfaceLevel = parseFloat(isoLevelInput.value);
    if (isNaN(isoSurfaceLevel) || isoSurfaceLevel < 0.0000001) {
        isoSurfaceLevel = 0.0005;
        isoLevelInput.value = 0.0005;
    }
});


updateButton.addEventListener('click', renderOrbital);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- Initialize ---
nSelect.value = currentN.toString();
updateLOptions();
lSelect.value = currentL.toString();
mlSelect.value = currentMl.toString();
zInput.value = currentZ.toString();
resolutionInput.value = currentResolution.toString();
rMaxInput.value = currentRMax.toString();
isoLevelInput.value = isoSurfaceLevel.toString();

// Initial render
renderOrbital();
animate();

// --- Window Resize Handling ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});