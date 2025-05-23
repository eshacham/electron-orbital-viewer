// src/orbital_visualizer.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateOrbitalData } from './quantum_functions.js'; // Import our data generator

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); // Dark background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 30; // Initial camera distance

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // For a smoother orbiting experience
controls.dampingFactor = 0.05;

// --- Orbital Visualization Group ---
// This group will hold the orbital mesh, allowing us to easily clear and re-add.
const orbitalGroup = new THREE.Group();
scene.add(orbitalGroup);

// --- Global variables for orbital parameters ---
let currentN = 2;
let currentL = 1;
let currentMl = 0;
let currentZ = 1;
let currentResolution = 50;
let currentRMax = 15;

// --- UI Elements ---
const nSelect = document.getElementById('n-select');
const lSelect = document.getElementById('l-select');
const mlSelect = document.getElementById('ml-select');
const zInput = document.getElementById('z-input');
const resolutionInput = document.getElementById('resolution-input');
const rMaxInput = document.getElementById('rMax-input');
const updateButton = document.getElementById('update-orbital');

// --- Helper Functions ---

// Function to update L options based on N
function updateLOptions() {
    const n = parseInt(nSelect.value);
    lSelect.innerHTML = ''; // Clear existing options
    for (let l = 0; l < n; l++) {
        const option = document.createElement('option');
        option.value = l;
        option.textContent = l;
        lSelect.appendChild(option);
    }
    // Set L to a valid default if currentL is out of range
    if (currentL >= n) {
        currentL = 0;
    }
    lSelect.value = currentL;
    updateMlOptions(); // Update ml options as L changed
}

// Function to update Ml options based on L
function updateMlOptions() {
    const l = parseInt(lSelect.value);
    mlSelect.innerHTML = ''; // Clear existing options
    for (let ml = -l; ml <= l; ml++) {
        const option = document.createElement('option');
        option.value = ml;
        option.textContent = ml;
        mlSelect.appendChild(option);
    }
    // Set Ml to a valid default if currentMl is out of range
    if (Math.abs(currentMl) > l) {
        currentMl = 0;
    }
    mlSelect.value = currentMl;
}

// Function to render the orbital
function renderOrbital() {
    // Clear previous orbital
    while (orbitalGroup.children.length > 0) {
        const object = orbitalGroup.children[0];
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
        orbitalGroup.remove(object);
    }

    console.log(`Generating orbital for n=${currentN}, l=${currentL}, ml=${currentMl}, Z=${currentZ}, Resolution=${currentResolution}, rMax=${currentRMax}`);

    const dataPoints = generateOrbitalData(currentN, currentL, currentMl, currentZ, currentResolution, currentRMax);

    let maxDensity = 0;
    dataPoints.forEach(p => maxDensity = Math.max(maxDensity, p.value));
    const densityThreshold = maxDensity * 0.02; // Slightly higher threshold for a more defined surface

    // Create a single geometry for all spheres
    const orbitalGeometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    // Color gradient for the orbital
    const colorA = new THREE.Color(0x007bff); // A vibrant blue
    const colorB = new THREE.Color(0x00ff7f); // A vibrant green

    const maxVal = maxDensity > 0 ? maxDensity : 1;

    dataPoints.forEach(p => {
        if (p.value >= densityThreshold) {
            positions.push(p.x, p.y, p.z);
            // Interpolate color based on normalized density
            const normalizedDensity = p.value / maxVal;
            const interpolatedColor = new THREE.Color().copy(colorA).lerp(colorB, normalizedDensity);
            colors.push(interpolatedColor.r, interpolatedColor.g, interpolatedColor.b);
        }
    });

    orbitalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    orbitalGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create a material for the individual spheres (or a combined point cloud of spheres)
    // We'll use a single material and draw many instances if we want spheres.
    // For simplicity, let's stick to a point cloud but make the points larger and more solid.
    const material = new THREE.PointsMaterial({
        size: currentRMax / currentResolution * 0.5, // Make point size relative to grid spacing
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending // Gives a nice glow effect
    });

    const orbitalPoints = new THREE.Points(orbitalGeometry, material);
    orbitalGroup.add(orbitalPoints);
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
    if (isNaN(currentZ) || currentZ < 1) { // Basic validation
        currentZ = 1;
        zInput.value = 1;
    }
});

resolutionInput.addEventListener('change', () => {
    currentResolution = parseInt(resolutionInput.value);
    if (isNaN(currentResolution) || currentResolution < 20) {
        currentResolution = 50;
        resolutionInput.value = 50;
    }
});

rMaxInput.addEventListener('change', () => {
    currentRMax = parseFloat(rMaxInput.value);
    if (isNaN(currentRMax) || currentRMax < 5) {
        currentRMax = 15;
        rMaxInput.value = 15;
    }
});

updateButton.addEventListener('click', renderOrbital);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Only required if controls.enableDamping or controls.autoRotate are set to true
    renderer.render(scene, camera);
}

// --- Initialize ---
// Set initial UI values and populate dropdowns
nSelect.value = currentN;
updateLOptions(); // Populates L and Ml options based on initial N
lSelect.value = currentL;
updateMlOptions(); // Ensures ml is set for currentL
mlSelect.value = currentMl;

// Initial render
renderOrbital();
animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});