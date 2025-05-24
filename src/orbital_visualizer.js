// src/orbital_visualizer.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getOrbitalPotentialFunction, atomicOrbitalProbabilityDensity } from './quantum_functions.js'; 
import MarchingCubesModule from 'marching-cubes-fast'

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// ADJUSTED: Initial camera position for a better view of objects
camera.position.z = 12; // Bring camera closer for better initial view

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
// ADDED: Set target to the center of the scene for proper rotation
controls.target.set(0, 0, 0); 
// ADDED: Adjust zoom limits for better control
controls.minDistance = 0.1; // Allow very close zoom
controls.maxDistance = 100; // Allow sufficient zoom out


// --- UI Elements ---
// Declare all UI element references at the top of this section
const nSelect = document.getElementById('n-select');
const lSelect = document.getElementById('l-select');
const mlSelect = document.getElementById('ml-select');
const zInput = document.getElementById('z-input');
const resolutionInput = document.getElementById('resolution-input'); // This is now an <input type="number">
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
// Initial currentResolution should be a power of 2 for Marching Cubes
let currentResolution = 64; // Default to a valid power of 2
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
let currentOrbitalMesh = null; // Variable to hold the current orbital mesh
let currentOrbitalPoints = null; // Variable to hold the current orbital points

function renderOrbital() {
    // Clear previous orbital mesh
    if (currentOrbitalMesh) {
        scene.remove(currentOrbitalMesh); // Remove the old mesh directly from the scene
        currentOrbitalMesh.geometry.dispose(); // Dispose geometry
        currentOrbitalMesh.material.dispose(); // Dispose material
        currentOrbitalMesh = null; // Clear reference
    }
    // Clear previous orbital points
    if (currentOrbitalPoints) {
        scene.remove(currentOrbitalPoints);
        currentOrbitalPoints.geometry.dispose();
        currentOrbitalPoints.material.dispose();
        currentOrbitalPoints = null;
    }


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

    // Validate resolution before calling Marching Cubes
    // (Keeping check for informational purposes, but removing fallback as per user request)
    function isPowerOfTwo(value) {
        return (value & (value - 1)) === 0 && value > 0;
    }

    if (!isPowerOfTwo(currentResolution)) {
        console.error(`ERROR: Resolution (${currentResolution}) must be a power of two for Marching Cubes. Orbital might not render correctly or an error might occur.`);
        // No automatic fallback here, user input is used directly.
    }


    const meshData = MarchingCubesModule.marchingCubes(
        currentResolution,
        orbitalPotentialFunction,
        worldBounds
    );

    console.log("Marching Cubes Raw Result (meshData):", meshData);
    console.log("First 5 positions (raw):", meshData.positions ? meshData.positions.slice(0, 5) : "N/A");
    console.log("First 5 cells (raw):", meshData.cells ? meshData.cells.slice(0, 5) : "N/A");


    // Check if positions (vertices) were generated
    if (!meshData || !meshData.positions || meshData.positions.length === 0) {
        console.warn("Marching Cubes generated no positions (vertices). This means the isosurface level might not be found within the given parameters (rMax, resolution) or the orbital itself has very low density.");
        console.warn("Try adjusting Iso-Level (decrease it), rMax (increase it), or choose different quantum numbers.");
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

    const scaledAndTranslatedPositions = new Float32Array(flatPositions.length);

    const modelExtent = currentRMax * 2;
    const gridDim = currentResolution;
    const scaleFactor = modelExtent / (gridDim - 1);

    for (let i = 0; i < flatPositions.length; i += 3) {
        const gx = flatPositions[i];
        const gy = flatPositions[i + 1];
        const gz = flatPositions[i + 2];

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

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(scaledAndTranslatedPositions, 3));

    // --- CRITICAL FIX: Flatten meshData.cells before setting index ---
    const flatCells = [];
    for (let i = 0; i < meshData.cells.length; i++) {
        const triangle = meshData.cells[i];
        if (!Array.isArray(triangle) || triangle.length !== 3) {
            console.error(`Unexpected triangle format at index ${i}. Expected [idx1,idx2,idx3] array. Found:`, triangle);
            // Handle error, maybe skip this triangle or break. For now, push invalid values.
            flatCells.push(0, 0, 0); // Push dummy indices to prevent further errors
        } else {
            flatCells.push(triangle[0], triangle[1], triangle[2]);
        }
    }
    console.log("flatCells length (after flattening):", flatCells.length);
    geometry.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(flatCells), 1));
    // --- END CRITICAL FIX ---


    geometry.computeVertexNormals();


    // --- Orbital Mesh Material (Transparent) ---
    const meshMaterial = new THREE.MeshStandardMaterial({
        color: 0x00aaff, // Blue color
        transparent: true,
        opacity: 0.5, // Semi-transparent
        side: THREE.DoubleSide,
        depthWrite: false // Important for correct transparency rendering
    });

    const orbitalMesh = new THREE.Mesh(geometry, meshMaterial);
    scene.add(orbitalMesh); // Add directly to the scene
    currentOrbitalMesh = orbitalMesh; // Store reference to the new mesh


    // --- Orbital Points Material ---
    const pointsMaterial = new THREE.PointsMaterial({
        color: 0x00ff00, // Green for points
        size: 0.05, // Size of each point
        sizeAttenuation: true // Points get smaller when farther away
    });

    const orbitalPoints = new THREE.Points(geometry, pointsMaterial);
    scene.add(orbitalPoints); // Add points to the scene
    currentOrbitalPoints = orbitalPoints;


    // Debugging: Log orbital mesh properties right before adding
    console.log("Orbital Mesh created:", orbitalMesh);
    console.log("Orbital Mesh Geometry:", orbitalMesh.geometry);
    console.log("Orbital Mesh Material:", orbitalMesh.material);
    console.log("Orbital Points created:", orbitalPoints);
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

// Handling resolution input as a number field (no power of 2 enforcement in logic)
resolutionInput.addEventListener('change', () => {
    let newResolution = parseInt(resolutionInput.value);
    if (isNaN(newResolution) || newResolution < 20) { // Basic validation
        newResolution = 64; // Default to a safe value
        resolutionInput.value = newResolution;
    }
    currentResolution = newResolution; // Use value directly
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
resolutionInput.value = currentResolution.toString(); // Ensure UI matches initial value
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