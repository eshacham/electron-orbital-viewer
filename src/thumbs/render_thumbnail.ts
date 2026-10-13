import * as THREE from 'three';
import type { MeshData } from '../types/orbital';
import type { Appearance } from '../design/appearance';
import { linearRgb, phaseColours } from '../design/science';
import { applyGlow, GLOW_LIGHTS, glowSettingsFor, SOLID_LIGHTS } from '../orbital_glow';
import { CANONICAL_CAMERA_DIRECTION } from '../camera_angles';
import type { ThumbImage } from './ThumbnailService';

const SIZE = 160;

/**
 * Draws one orbital mesh into a 160 × 160 render target on the main
 * renderer and reads it back (spec §12): one scene, one camera, one target,
 * reused; the main view's render target and clear colour are restored before
 * returning, so the next main frame is untouched. Nothing of the main view's
 * scene, camera, lights or appearance is read or written: this scene has its
 * own lights, at the main view's levels for the finish (§11.1 "Lights").
 * Glow's rim applies; the halo and the lines do not (they would not read at
 * 72 px), so the frame-time guard that latches them never sees this scene.
 */
export function createThumbnailRenderer(renderer: THREE.WebGLRenderer): { render(meshData: MeshData, appearance: Appearance): Promise<ThumbImage>; dispose(): void } {
    // Four samples: the tile is drawn at 144 device pixels from 160, and
    // aliased lobe edges would shimmer against the tile's border.
    const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    // Stored as sRGB (SRGB8_ALPHA8), so the bytes read back are display colours.
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    // The main view's three lights, placed as initVisualizer places them.
    const ambient = new THREE.AmbientLight(0xffffff, SOLID_LIGHTS.ambient);
    const key = new THREE.DirectionalLight(0xffffff, SOLID_LIGHTS.key);
    key.position.set(5, 5, 5).normalize();
    const fill = new THREE.DirectionalLight(0xffffff, SOLID_LIGHTS.fill);
    fill.position.set(-5, -3, -5).normalize();
    scene.add(ambient, key, fill);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);
    const direction = new THREE.Vector3(...CANONICAL_CAMERA_DIRECTION).normalize();

    async function render(meshData: MeshData, appearance: Appearance): Promise<ThumbImage> {
        const phase = phaseColours(appearance.theme, appearance.scheme);
        const [positive, negative] = [linearRgb(phase.positive), linearRgb(phase.negative)];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions.flat(), 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(meshData.psiSigns.flatMap(sign => (sign === 1 ? positive : negative)), 3));
        geometry.setAttribute('phaseSign', new THREE.Float32BufferAttribute(meshData.psiSigns.map(sign => (sign === 1 ? 1 : -1)), 1));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0 });
        const glow = glowSettingsFor(appearance);
        applyGlow(material, glow);
        const levels = glow ? GLOW_LIGHTS : SOLID_LIGHTS;
        ambient.intensity = levels.ambient;
        key.intensity = levels.key;
        fill.intensity = levels.fill;
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        const radius = geometry.boundingSphere?.radius || 1;
        camera.position.copy(direction).multiplyScalar(radius * 4.2);
        camera.lookAt(0, 0, 0);

        const previousTarget = renderer.getRenderTarget();
        const previousClear = renderer.getClearColor(new THREE.Color());
        const previousAlpha = renderer.getClearAlpha();
        const pixels = new Uint8Array(SIZE * SIZE * 4);
        try {
            renderer.setRenderTarget(target);
            renderer.setClearColor(0x000000, 0);
            renderer.clear();
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClear, previousAlpha);
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        }
        // Painted to a 2D canvas (§12), GL's bottom-up rows flipped to an image's top-down.
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const context = canvas.getContext('2d');
        if (context) {
            const image = context.createImageData(SIZE, SIZE);
            const row = SIZE * 4;
            for (let y = 0; y < SIZE; y++) image.data.set(pixels.subarray(y * row, (y + 1) * row), (SIZE - 1 - y) * row);
            // The edges resolve against a transparent clear, i.e. premultiplied;
            // ImageData is straight alpha, so a lobe would get a dark fringe.
            const data = image.data;
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                if (alpha === 0 || alpha === 255) continue;
                data[i] = Math.min(255, (data[i] * 255) / alpha);
                data[i + 1] = Math.min(255, (data[i + 1] * 255) / alpha);
                data[i + 2] = Math.min(255, (data[i + 2] * 255) / alpha);
            }
            context.putImageData(image, 0, 0);
        }
        // Kept as an ImageBitmap, drawn into each tile's canvas (§12: no blob churn).
        return typeof createImageBitmap === 'function' ? createImageBitmap(canvas) : canvas;
    }

    return { render, dispose: () => target.dispose() };
}
