import * as THREE from 'three';
import type { MeshData } from '../types/orbital';
import { DEFAULT_OPACITY } from '../types/orbital';
import type { Appearance } from '../design/appearance';
import { linearRgb, phaseColours } from '../design/science';
import { attachGlowExtras, glowLightsFor, glowSettingsFor, SOLID_LIGHTS } from '../orbital_glow';
import { setMaterialOpacity } from '../orbital_material';
import { CANONICAL_CAMERA_DIRECTION } from '../camera_angles';
import type { ThumbImage } from './ThumbnailService';
import { thumbnailSize, thumbOpacityOf } from './thumb_key';

export { thumbnailSize };

/**
 * Draws one orbital mesh into a render target on the main renderer and
 * reads it back (spec §12): one scene, one camera, one target, reused (and
 * re-made only when the size changes); the main view's render target and
 * clear colour are restored before returning, so the next main frame is
 * untouched. Nothing of the main view's scene, camera, lights or
 * appearance is read or written: this scene has its own lights, at the
 * main view's levels for the finish (§11.1 "Lights").
 *
 * Ruling R20a-4: the tile looks like the main view -- the theme's phase
 * colours, the main view's committed opacity (`opacity`; the default when
 * none is given), and the whole Glow finish: rim,
 * emissive, mesh lines and (Deep Space) the halo, through the same
 * attachGlowExtras the main view uses. The frame-time guard never sees this
 * scene (afterMainFrame does not time a frame that carried a thumbnail).
 */
export function createThumbnailRenderer(
    renderer: THREE.WebGLRenderer,
    { pixelRatio = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio) }: { pixelRatio?: () => number } = {},
): { render(meshData: MeshData, appearance: Appearance, opacity?: number): Promise<ThumbImage>; size(): number; dispose(): void } {
    let target: THREE.WebGLRenderTarget | null = null;
    /** Four MSAA samples on top of the 2× supersample: lobe edges would otherwise shimmer against the tile's border. */
    function targetOf(side: number): THREE.WebGLRenderTarget {
        if (target && target.width === side) return target;
        target?.dispose();
        target = new THREE.WebGLRenderTarget(side, side, { samples: 4 });
        // Stored as sRGB (SRGB8_ALPHA8), so the bytes read back are display colours.
        target.texture.colorSpace = THREE.SRGBColorSpace;
        return target;
    }
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
    const size = () => thumbnailSize(pixelRatio());

    async function render(meshData: MeshData, appearance: Appearance, opacity: number = DEFAULT_OPACITY): Promise<ThumbImage> {
        const SIZE = size();
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
        setMaterialOpacity(material, Math.max(0, Math.min(1, thumbOpacityOf(opacity))));
        const mesh = new THREE.Mesh(geometry, material);
        const group = new THREE.Group();
        group.add(mesh);
        const radius = geometry.boundingSphere?.radius || 1;
        // The main view's Glow, extras included: the rim and emissive on the surface, the lines and halo beside it.
        attachGlowExtras(group, mesh, appearance, { radius, clippingPlanes: [], solid: true, extrasAllowed: true });
        const levels = glowSettingsFor(appearance) ? glowLightsFor(appearance.theme) : SOLID_LIGHTS;
        ambient.intensity = levels.ambient;
        key.intensity = levels.key;
        fill.intensity = levels.fill;
        scene.add(group);
        camera.position.copy(direction).multiplyScalar(radius * 4.2);
        camera.lookAt(0, 0, 0);

        const previousTarget = renderer.getRenderTarget();
        const previousClear = renderer.getClearColor(new THREE.Color());
        const previousAlpha = renderer.getClearAlpha();
        const pixels = new Uint8Array(SIZE * SIZE * 4);
        try {
            const into = targetOf(SIZE);
            renderer.setRenderTarget(into);
            renderer.setClearColor(0x000000, 0);
            renderer.clear();
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(into, 0, 0, SIZE, SIZE, pixels);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousClear, previousAlpha);
            scene.remove(group);
            geometry.dispose();
            group.traverse(object => { ((object as THREE.Mesh).material as THREE.Material | undefined)?.dispose(); });
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

    return { render, size, dispose: () => { target?.dispose(); target = null; } };
}
