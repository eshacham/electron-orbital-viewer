import * as THREE from 'three';
import type { MeshData } from '../types/orbital';
import { DEFAULT_OPACITY } from '../types/orbital';
import type { Appearance } from '../design/appearance';
import { densitySurfaceHex, linearRgb, phaseColours } from '../design/science';
import { espVertexColors } from '../molecules/esp_color';
import { attachGlowExtras, GLOW_TUNING, glowSettingsFor, SOLID_LIGHTS, tuneThumbnailGlow } from '../orbital_glow';
import { setMaterialOpacity } from '../orbital_material';
import { CANONICAL_CAMERA_DIRECTION } from '../camera_angles';
import type { ThumbColouring, ThumbImage } from './ThumbnailService';
import { THUMB_FILL, thumbnailSize, thumbOpacityOf, thumbSupersample, thumbTileDevicePx } from './thumb_key';

export { thumbnailSize };

/**
 * Ruling R20d: every tile is seen from one direction -- the main view's
 * canonical three-quarter view from slightly above, so the tile previews the
 * orbital as it opens.
 */
export const THUMB_CAMERA_DIRECTION = CANONICAL_CAMERA_DIRECTION;

/**
 * Ruling R20d: the tiles' fixed light rig, as directions in the tile
 * camera's own frame (x right, y up, z towards the viewer): the key from
 * the upper left in front, the fill low from the right. Fixed to the
 * camera, so every tile is lit the same way whatever its size or place;
 * the levels are GLOW_TUNING[theme].thumb.lights (SOLID_LIGHTS for the
 * Solid finish, as the main view).
 */
export const THUMB_LIGHT_RIG = {
    key: [-0.55, 0.65, 0.5] as const,
    fill: [0.7, -0.35, 0.45] as const,
};

const FOV_DEGREES = 30;

/**
 * The distance at which a sphere of `radius` fills `fill` of a square
 * frame: its silhouette's half-angle is asin(radius / d), and that must
 * subtend `fill` of the half field of view, tan-for-tan.
 */
export function thumbnailCameraDistance(radius: number, fovDegrees: number = FOV_DEGREES, fill: number = THUMB_FILL): number {
    const halfAngle = Math.atan(fill * Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2)));
    return radius / Math.sin(halfAngle);
}

/**
 * Ruling R20d: GL's bottom-up rows, `factor` × `factor` pixels to one,
 * into a top-down straight-alpha image. The read is premultiplied (the
 * target is cleared to transparent and blended into), which is what a box
 * filter must average -- averaging straight alpha would darken every lobe's
 * edge -- and is divided out at the end.
 */
export function downsampleThumbnail(pixels: Uint8Array, side: number, factor: number): Uint8ClampedArray {
    const out = Math.floor(side / factor);
    const image = new Uint8ClampedArray(out * out * 4);
    const area = factor * factor;
    for (let y = 0; y < out; y++) {
        for (let x = 0; x < out; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let dy = 0; dy < factor; dy++) {
                let i = ((y * factor + dy) * side + x * factor) * 4;
                for (let dx = 0; dx < factor; dx++, i += 4) {
                    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; a += pixels[i + 3];
                }
            }
            if (a === 0) continue;
            // GL row y is the image's row out - 1 - y.
            const o = ((out - 1 - y) * out + x) * 4;
            image[o] = Math.round((r * 255) / a);
            image[o + 1] = Math.round((g * 255) / a);
            image[o + 2] = Math.round((b * 255) / a);
            image[o + 3] = Math.round(a / area);
        }
    }
    return image;
}

/** Each vertex's colour, in three's linear working space, for the tile's colouring. */
function surfaceColours(meshData: MeshData, appearance: Appearance, colouring: ThumbColouring): ArrayLike<number> {
    if (colouring === 'density') {
        const colour = linearRgb(densitySurfaceHex(appearance.theme));
        return meshData.positions.flatMap(() => colour);
    }
    if (colouring !== 'phase') return espVertexColors(meshData.positions, colouring.grid, colouring.limit).colors;
    const phase = phaseColours(appearance.theme);
    const [positive, negative] = [linearRgb(phase.positive), linearRgb(phase.negative)];
    return meshData.psiSigns.flatMap(sign => (sign === 1 ? positive : negative));
}

/**
 * Draws one orbital mesh into a render target on the main renderer and
 * reads it back (spec §12): one scene, one camera, one target, reused (and
 * re-made only when the size changes); the main view's render target and
 * clear colour are restored before returning, so the next main frame is
 * untouched. Nothing of the main view's scene, camera, lights or
 * appearance is read or written.
 *
 * Ruling R20a-4: the tile looks like the main view -- the theme's phase
 * colours, the main view's committed opacity (`opacity`; the default when
 * none is given), and the whole Glow finish: rim, emissive, mesh lines and
 * (Deep Space) the halo, through the same attachGlowExtras the main view
 * uses. The frame-time guard never sees this scene (afterMainFrame does not
 * time a frame that carried a thumbnail).
 *
 * Ruling R20d: a small "hero" render. The target is thumbnailSize() -- at
 * least 3× the tile's CSS size, a whole multiple of its device size -- with
 * 4× MSAA, box-filtered down to a bitmap at exactly the tile's device size
 * (drawn 1:1, never scaled by CSS). Every mesh's bounding sphere fills
 * THUMB_FILL of the tile, seen from THUMB_CAMERA_DIRECTION, centred, and lit
 * by THUMB_LIGHT_RIG at the tiles' own levels, with the tiles' Glow
 * strengths (GLOW_TUNING[theme].thumb).
 *
 * Task 10: `colouring` paints the surface as the main view would paint the
 * same mesh (updateSceneWithMeshData): 'phase' in the theme's phase colours
 * (the default, and every tile before Task 10); 'density' every vertex the
 * theme's density colour, display hex to linear (ruling DC2b); an ESP map's
 * own vertex colours (espVertexColors), copied as they are. A density or an
 * ESP has no phase, so the Glow rim takes no phase tint there (phaseSign 0).
 */
export function createThumbnailRenderer(
    renderer: THREE.WebGLRenderer,
    { pixelRatio = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio) }: { pixelRatio?: () => number } = {},
): {
    render(meshData: MeshData, appearance: Appearance, opacity?: number, extrasAllowed?: boolean, colouring?: ThumbColouring): Promise<ThumbImage>;
    size(): number; dispose(): void;
} {
    let target: THREE.WebGLRenderTarget | null = null;
    /** Four MSAA samples on top of the supersample: lobe edges would otherwise shimmer against the tile's border. */
    function targetOf(side: number): THREE.WebGLRenderTarget {
        if (target && target.width === side) return target;
        target?.dispose();
        target = new THREE.WebGLRenderTarget(side, side, { samples: 4 });
        // Stored as sRGB (SRGB8_ALPHA8), so the bytes read back are display colours.
        target.texture.colorSpace = THREE.SRGBColorSpace;
        return target;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);
    const direction = new THREE.Vector3(...THUMB_CAMERA_DIRECTION).normalize();
    // The camera only ever looks along -direction, so the rig's world directions are fixed too.
    camera.position.copy(direction);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const rigDirection = (inCamera: readonly [number, number, number]) =>
        new THREE.Vector3(...inCamera).normalize().transformDirection(camera.matrixWorld);
    const ambient = new THREE.AmbientLight(0xffffff, SOLID_LIGHTS.ambient);
    const key = new THREE.DirectionalLight(0xffffff, SOLID_LIGHTS.key);
    const fill = new THREE.DirectionalLight(0xffffff, SOLID_LIGHTS.fill);
    scene.add(ambient, key, fill, key.target, fill.target);
    // The cache key's size (fix round 1 of Task 20d): the bitmap's side, which is what a tile is given --
    // two ratios can share a render target (216 at 1× and 1.5×) but never a bitmap (72 vs 108).
    const size = () => thumbTileDevicePx(pixelRatio());

    async function render(
        meshData: MeshData, appearance: Appearance, opacity: number = DEFAULT_OPACITY, extrasAllowed: boolean = true,
        colouring: ThumbColouring = 'phase',
    ): Promise<ThumbImage> {
        const ratio = pixelRatio();
        const SIZE = thumbnailSize(ratio);
        const factor = thumbSupersample(ratio);
        const OUT = thumbTileDevicePx(ratio);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions.flat(), 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(surfaceColours(meshData, appearance, colouring), 3));
        geometry.setAttribute('phaseSign', new THREE.Float32BufferAttribute(colouring === 'phase'
            ? meshData.psiSigns.map(sign => (sign === 1 ? 1 : -1))
            : new Array<number>(meshData.positions.length).fill(0), 1));
        geometry.setIndex(meshData.cells.flat());
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0 });
        setMaterialOpacity(material, Math.max(0, Math.min(1, thumbOpacityOf(opacity))));
        const mesh = new THREE.Mesh(geometry, material);
        const group = new THREE.Group();
        group.add(mesh);
        const sphere = geometry.boundingSphere;
        const radius = sphere && sphere.radius > 0 ? sphere.radius : 1;
        const centre = sphere ? sphere.center.clone() : new THREE.Vector3();
        // The main view's Glow, extras included: the rim and emissive on the surface, the lines and halo beside it.
        // Review A, M4: honour the main view's R10 frame-time latch (extrasSuppressed),
        // not just appearance.lowPower -- a latched main view no longer draws lines/halo
        // either, and the strip must not disagree once the device has shown it is slow.
        // Ruling T15-b: an ESP tile, like the ESP map in the main view, never whitens its rim.
        attachGlowExtras(group, mesh, appearance, { radius, clippingPlanes: [], solid: true, extrasAllowed, esp: typeof colouring === 'object' });
        const glowing = glowSettingsFor(appearance) !== null;
        // Task 16b: the viewer's own Glow values (appearance.glow, as settled), at the tiles' ratios.
        if (glowing) tuneThumbnailGlow(group, mesh, appearance);
        const levels = glowing ? GLOW_TUNING[appearance.theme].thumb.lights : SOLID_LIGHTS;
        ambient.intensity = levels.ambient;
        key.intensity = levels.key;
        fill.intensity = levels.fill;
        key.target.position.copy(centre);
        key.position.copy(centre).add(rigDirection(THUMB_LIGHT_RIG.key));
        fill.target.position.copy(centre);
        fill.position.copy(centre).add(rigDirection(THUMB_LIGHT_RIG.fill));
        scene.add(group);
        const distance = thumbnailCameraDistance(radius);
        camera.position.copy(direction).multiplyScalar(distance).add(centre);
        camera.lookAt(centre);
        camera.near = Math.max(1e-4, (distance - radius) / 10);
        camera.far = (distance + radius) * 10;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);

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
        // Painted to a 2D canvas at the tile's device size (§12), box-filtered from the supersampled read.
        const canvas = document.createElement('canvas');
        canvas.width = OUT;
        canvas.height = OUT;
        const context = canvas.getContext('2d');
        if (context) {
            const image = context.createImageData(OUT, OUT);
            image.data.set(downsampleThumbnail(pixels, SIZE, factor));
            context.putImageData(image, 0, 0);
        }
        // Kept as an ImageBitmap, drawn into each tile's canvas (§12: no blob churn).
        return typeof createImageBitmap === 'function' ? createImageBitmap(canvas) : canvas;
    }

    return { render, size, dispose: () => { target?.dispose(); target = null; } };
}
