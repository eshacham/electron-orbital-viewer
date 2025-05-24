// src/orbital_visualizer.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getOrbitalPotentialFunction } from './quantum_functions.js'; 
import MarchingCubesModule from 'marching-cubes-fast'

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 12; // Initial camera position

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
controls.target.set(0, 0, 0); 
controls.minDistance = 0.1; // Allow very close zoom
controls.maxDistance = 100; // Allow sufficient zoom out


// --- UI Elements ---
const nSelect = document.getElementById('n-select');
const lSelect = document.getElementById('l-select');
const mlSelect = document.getElementById('ml-select');
const zInput = document.getElementById('z-input');
const resolutionInput = document.getElementById('resolution-input');
const rMaxInput = document.getElementById('rMax-input');
const updateButton = document.getElementById('update-orbital');

// Dynamically create and append Iso-Level input
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


// --- Global Orbital Parameters (initialized from UI or defaults) ---
let currentN = parseInt(nSelect.value);
let currentL = parseInt(lSelect.value);
let currentMl = parseInt(mlSelect.value);
let currentZ = parseInt(zInput.value);
let currentResolution = 64; // Default to a valid power of 2
let currentRMax = parseFloat(rMaxInput.value);
let isoSurfaceLevel = parseFloat(isoLevelInput.value);


// --- Optimized Parameters Storage ---
// YOU WILL FILL THIS OBJECT WITH YOUR OPTIMIZED VALUES
// Example: "n_l": { rMax: value, isoLevel: value }
const optimizedOrbitalParameters = {
    // Initial suggested values - you will adjust these through experimentation!
    "1_0": { rMax: 10, isoLevel: 0.001 },
    "2_0": { rMax: 15, isoLevel: 0.0005 },
    "2_1": { rMax: 15, isoLevel: 0.0005 },
    "3_0": { rMax: 20, isoLevel: 0.0001 },
    "3_1": { rMax: 20, isoLevel: 0.0001 },
    "3_2": { rMax: 20, isoLevel: 0.0001 },
    "4_0": { rMax: 25, isoLevel: 0.00005 },
    "4_1": { rMax: 25, isoLevel: 0.00005 },
    "4_2": { rMax: 25, isoLevel: 0.00005 },
    "4_3": { rMax: 25, isoLevel: 0.00005 },
    // Add more entries here as you find optimal rMax and isoLevel for other (n,l) combinations
    // For example:
    // "5_0": { rMax: 30, isoLevel: 0.00001 },
    // "5_1": { rMax: 30, isoLevel: 0.00001 },
    // ...
};

// --- Function to Load and Apply Optimized Parameters ---
function loadOptimizedParameters() {
    const key = `${currentN}_${currentL}`;
    const params = optimizedOrbitalParameters[key];

    if (params) {
        currentRMax = params.rMax;
        isoSurfaceLevel = params.isoLevel;
        console.log(`Loaded optimized parameters for n=${currentN}, l=${currentL}: rMax=${currentRMax}, isoLevel=${isoSurfaceLevel}`);
    } else {
        // Fallback to default if no optimized parameters are found
        currentRMax = parseFloat(rMaxInput.defaultValue || 15); // Use existing input default or 15
        isoSurfaceLevel = parseFloat(isoLevelInput.defaultValue || 0.0005); // Use existing input default or 0.0005
        console.warn(`No optimized parameters found for n=${currentN}, l=${currentL}. Using default values.`);
    }

    // Update UI inputs to reflect the loaded/default values
    rMaxInput.value = currentRMax;
    isoLevelInput.value = isoSurfaceLevel;
}


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
    loadOptimizedParameters(); // Call after n and l are potentially updated
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
let currentOrbitalMesh = null;
let currentOrbitalPoints = null;

function renderOrbital() {
    // Clear previous orbital mesh and points
    if (currentOrbitalMesh) {
        scene.remove(currentOrbitalMesh);
        currentOrbitalMesh.geometry.dispose();
        currentOrbitalMesh.material.dispose();
        currentOrbitalMesh = null;
    }
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

    // Use currentRMax and isoSurfaceLevel that were potentially loaded
    const orbitalPotentialFunction = getOrbitalPotentialFunction(n, l, ml, Z, isoSurfaceLevel);

    const worldBounds = [
        [-currentRMax, -currentRMax, -currentRMax],
        [currentRMax, currentRMax, currentRMax]
    ];

    console.log("--- Rendering Orbital ---");
    console.log(`Parameters: n=${n}, l=${l}, ml=${ml}, Z=${Z}`);
    console.log(`Visualization: Resolution=${currentResolution}, rMax=${currentRMax}, Iso-Level=${isoSurfaceLevel}`);
    console.log(`World Bounds:`, worldBounds);

    function isPowerOfTwo(value) {
        return (value & (value - 1)) === 0 && value > 0;
    }

    if (!isPowerOfTwo(currentResolution)) {
        console.error(`ERROR: Resolution (${currentResolution}) must be a power of two for Marching Cubes. Orbital might not render correctly or an error might occur.`);
    }


    const meshData = MarchingCubesModule.marchingCubes(
        currentResolution,
        orbitalPotentialFunction,
        worldBounds
    );

    console.log("Marching Cubes Raw Result (meshData):", meshData);
    console.log("First 5 positions (raw):", meshData.positions ? meshData.positions.slice(0, 5) : "N/A");
    console.log("First 5 cells (raw):", meshData.cells ? meshData.cells.slice(0, 5) : "N/A");


    if (!meshData || !meshData.positions || meshData.positions.length === 0) {
        console.warn("Marching Cubes generated no positions (vertices). This means the isosurface level might not be found within the given parameters (rMax, resolution) or the orbital itself has very low density.");
        console.warn("Try adjusting Iso-Level (decrease it), rMax (increase it), or choose different quantum numbers.");
        return;
    }

    const flatPositions = [];
    let hasInvalidNumberInSource = false;
    for (let i = 0; i < meshData.positions.length; i++) {
        const vertex = meshData.positions[i];
        if (!Array.isArray(vertex) || vertex.length !== 3) {
            console.error(`Unexpected vertex format at index ${i}. Expected [x,y,z] array. Found:`, vertex);
            hasInvalidNumberInSource = true;
            continue;
        }
        for (let j = 0; j < 3; j++) {
            if (isNaN(vertex[j]) || !isFinite(vertex[j])) {
                console.error(`Invalid value (NaN or Infinity) found in meshData.positions[${i}][${j}]: ${vertex[j]}`);
                hasInvalidNumberInSource = true;
            }
            flatPositions.push(vertex[j]);
        }
    }

    if (hasInvalidNumberInSource) {
        console.error("meshData.positions contains invalid numerical values (NaN or Infinity). This is likely the cause of a rendering error.");
        return;
    }

    if (flatPositions.length % 3 !== 0) {
        console.error(`ERROR: flatPositions length (${flatPositions.length}) is not a multiple of 3. This means vertex data is incomplete or corrupted!`);
        return;
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
        }

        scaledAndTranslatedPositions[i]     = gx * scaleFactor - currentRMax;
        scaledAndTranslatedPositions[i + 1] = gy * scaleFactor - currentRMax;
        scaledAndTranslatedPositions[i + 2] = gz * scaleFactor - currentRMax;
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(scaledAndTranslatedPositions, 3));

    const flatCells = [];
    for (let i = 0; i < meshData.cells.length; i++) {
        const triangle = meshData.cells[i];
        if (!Array.isArray(triangle) || triangle.length !== 3) {
            console.error(`Unexpected triangle format at index ${i}. Expected [idx1,idx2,idx3] array. Found:`, triangle);
            flatCells.push(0, 0, 0);
        } else {
            flatCells.push(triangle[0], triangle[1], triangle[2]);
        }
    }
    geometry.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(flatCells), 1));

    geometry.computeVertexNormals();

    const meshMaterial = new THREE.MeshStandardMaterial({
        color: 0x00aaff, // Blue color
        transparent: true,
        opacity: 0.5, // Semi-transparent
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const orbitalMesh = new THREE.Mesh(geometry, meshMaterial);
    scene.add(orbitalMesh);
    currentOrbitalMesh = orbitalMesh;

    const pointsMaterial = new THREE.PointsMaterial({
        color: 0x00ff00, // Green for points
        size: 0.05,
        sizeAttenuation: true
    });

    const orbitalPoints = new THREE.Points(geometry, pointsMaterial);
    scene.add(orbitalPoints);
    currentOrbitalPoints = orbitalPoints;

    console.log("Orbital Mesh created:", orbitalMesh);
    console.log("Orbital Points created:", orbitalPoints);
}


// --- Event Listeners ---
nSelect.addEventListener('change', () => {
    currentN = parseInt(nSelect.value);
    updateLOptions(); // This will now also call loadOptimizedParameters
});

lSelect.addEventListener('change', () => {
    currentL = parseInt(lSelect.value);
    updateMlOptions();
    loadOptimizedParameters(); // Call to load parameters for the new (n,l)
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
    let newResolution = parseInt(resolutionInput.value);
    if (isNaN(newResolution) || newResolution < 20) {
        newResolution = 64;
        resolutionInput.value = newResolution;
    }
    currentResolution = newResolution;
});

rMaxInput.addEventListener('change', () => {
    currentRMax = parseFloat(rMaxInput.value);
    if (isNaN(currentRMax) || currentRMax < 5) {
        currentRMax = 15;
        rMaxInput.value = 15;
    }
    // If the user manually changes rMax, this overwrites the loaded value for this session
});

isoLevelInput.addEventListener('change', () => {
    isoSurfaceLevel = parseFloat(isoLevelInput.value);
    if (isNaN(isoSurfaceLevel) || isoSurfaceLevel < 0.0000001) {
        isoSurfaceLevel = 0.0005;
        isoLevelInput.value = 0.0005;
    }
    // If the user manually changes isoLevel, this overwrites the loaded value for this session
});


updateButton.addEventListener('click', renderOrbital);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- Initialize ---
// Set initial UI values to match current variables
nSelect.value = currentN.toString();
updateLOptions(); // This will populate L and Ml options and load initial optimized parameters
lSelect.value = currentL.toString();
mlSelect.value = currentMl.toString();
zInput.value = currentZ.toString();
resolutionInput.value = currentResolution.toString();
rMaxInput.value = currentRMax.toString(); // Updated by loadOptimizedParameters initially
isoLevelInput.value = isoSurfaceLevel.toString(); // Updated by loadOptimizedParameters initially

// Initial render
renderOrbital();
animate();

// --- Window Resize Handling ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});