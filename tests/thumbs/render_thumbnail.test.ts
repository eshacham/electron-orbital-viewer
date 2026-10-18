import * as THREE from 'three';
import {
    createThumbnailRenderer, downsampleThumbnail, THUMB_CAMERA_DIRECTION, THUMB_LIGHT_RIG, thumbnailSize,
} from '../../src/thumbs/render_thumbnail';
import { THUMB_FILL, THUMB_TILE_PX, thumbLookKey, thumbSupersample, thumbTileDevicePx } from '../../src/thumbs/thumb_key';
import type { MeshData } from '../../src/types/orbital';
import { INITIAL_APPEARANCE, type Appearance } from '../../src/design/appearance';
import { densitySurfaceHex, linearRgb, phaseColours } from '../../src/design/science';
import { espVertexColors } from '../../src/molecules/esp_color';
import type { ScalarGrid } from '../../src/molecules/esp';
import { GLOW_TUNING, SOLID_LIGHTS } from '../../src/orbital_glow';
import { DEFAULT_OPACITY } from '../../src/types/orbital';

const triangle = (): MeshData => ({
    positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]], psiSigns: [1, 1, -1],
    densityMap: { data: new Uint8Array(1), side: 1, rMax: 1 }, isoLevel: 1,
});

/** The main renderer, as far as a thumbnail touches it: jsdom has no WebGL. */
function stubRenderer() {
    const mainTarget = { name: 'main view' };
    let current: unknown = mainTarget;
    const seen: Array<{ target: unknown; meshes: THREE.Mesh[]; lights: number[]; directional: THREE.Vector3[]; camera: THREE.PerspectiveCamera }> = [];
    const renderer = {
        getRenderTarget: () => current,
        setRenderTarget: jest.fn((target: unknown) => { current = target; }),
        getClearColor: (colour: THREE.Color) => colour.set(0x123456),
        getClearAlpha: () => 0.25,
        setClearColor: jest.fn(),
        clear: jest.fn(),
        render: jest.fn((scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
            const meshes: THREE.Mesh[] = [];
            const lights: number[] = [];
            const directional: THREE.Vector3[] = [];
            scene.updateMatrixWorld(true);
            scene.traverse(object => {
                if (object instanceof THREE.Mesh) meshes.push(object);
                if (object instanceof THREE.Light) lights.push(object.intensity);
                // Where each directional light shines from, in the camera's own frame.
                if (object instanceof THREE.DirectionalLight) {
                    const from = object.getWorldPosition(new THREE.Vector3()).sub(object.target.getWorldPosition(new THREE.Vector3()));
                    directional.push(from.transformDirection(camera.matrixWorldInverse).normalize());
                }
            });
            seen.push({ target: current, meshes, lights, directional, camera: camera.clone() });
        }),
        readRenderTargetPixels: jest.fn(),
    };
    return { renderer, mainTarget, seen, current: () => current };
}

describe('createThumbnailRenderer (spec §12: a target on the main renderer)', () => {
    const glow: Appearance = { theme: 'light', finish: 'glow', showAxes: true, lowPower: false };

    it('draws into its own target in the theme\'s phase colours, then gives the main view back its target and clear colour', async () => {
        const { renderer, mainTarget, seen, current } = stubRenderer();
        // Ruling R20a-4: a 2× screen draws a 72 × 2 × 2 = 288 px picture (was a fixed 160).
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 2 });
        const image = await thumbs.render(triangle(), glow);
        // Ruling R20d: and hands the tile a bitmap at its own device size, 72 × 2 = 144 (was the 288 picture itself).
        expect(image).toMatchObject({ width: 144, height: 144 });

        expect(seen).toHaveLength(1);
        expect(seen[0].target).toBeInstanceOf(THREE.WebGLRenderTarget);
        expect((seen[0].target as THREE.WebGLRenderTarget).samples).toBe(4);
        expect(renderer.readRenderTargetPixels).toHaveBeenCalledWith(seen[0].target, 0, 0, 288, 288, expect.any(Uint8Array));
        const [surface] = seen[0].meshes;
        const colours = Array.from((surface.geometry.getAttribute('color') as THREE.BufferAttribute).array);
        const phase = phaseColours('light');
        expect(colours.slice(0, 3)).toEqual(linearRgb(phase.positive).map(c => expect.closeTo(c, 6)));
        expect(colours.slice(6, 9)).toEqual(linearRgb(phase.negative).map(c => expect.closeTo(c, 6)));
        // Ruling R20a-4: the main view's look -- Glow's rim on a see-through surface at the
        // default opacity, with the mesh lines (no halo in Light Clean). Was: rim only, opaque.
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
        expect((surface.material as THREE.MeshStandardMaterial).opacity).toBe(DEFAULT_OPACITY);
        expect((surface.material as THREE.MeshStandardMaterial).transparent).toBe(true);
        expect(seen[0].meshes.map(mesh => mesh.userData.isGlowExtra ?? 'surface')).toEqual(['surface', 'lines']);
        // Ruling R20d: the tiles' own light rig, per theme (this is Light Clean). Was: the main view's Glow lights.
        const lights = GLOW_TUNING.light.thumb.lights;
        expect(seen[0].lights).toEqual([lights.ambient, lights.key, lights.fill]);

        expect(current()).toBe(mainTarget);
        expect(renderer.setClearColor).toHaveBeenLastCalledWith(expect.objectContaining({ r: new THREE.Color(0x123456).r }), 0.25);
    });

    // Ruling R22a: Classic is gone -- INITIAL_APPEARANCE is the Solid finish.
    it('lights a Solid thumbnail like the main view, and leaves nothing behind in its scene', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer);
        await thumbs.render(triangle(), INITIAL_APPEARANCE);
        expect(seen[0].lights).toEqual([SOLID_LIGHTS.ambient, SOLID_LIGHTS.key, SOLID_LIGHTS.fill]);
        const surface = seen[0].meshes[0];
        await thumbs.render(triangle(), INITIAL_APPEARANCE);
        expect(seen[1].meshes).toHaveLength(1);
        expect(seen[1].meshes[0]).not.toBe(surface);
        expect(surface.parent?.parent ?? null).toBeNull();
    });

    // Ruling R20a-4: tile CSS size × dpr × 2; one target, re-made only for a new size. Ruling R20d: at
    // least 3× the CSS size (216 on a 1× screen, was 160), a whole multiple of the tile's device size.
    it('sizes the picture to the screen, supersampled, and keeps one target per size', async () => {
        expect([thumbnailSize(1), thumbnailSize(2), thumbnailSize(3), thumbnailSize(Number.NaN)]).toEqual([216, 288, 432, 216]);
        let ratio = 2;
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => ratio });
        await thumbs.render(triangle(), glow);
        await thumbs.render(triangle(), glow);
        expect(seen[1].target).toBe(seen[0].target);
        ratio = 3;
        // Fix round 1 of Task 20d: size() is the bitmap's side (the cache key's size), 72 × 3; the target is 432.
        expect(thumbs.size()).toBe(216);
        await thumbs.render(triangle(), glow);
        expect(seen[2].target).not.toBe(seen[0].target);
        expect((seen[2].target as THREE.WebGLRenderTarget).width).toBe(432);
    });

    it('draws Deep Space\'s halo as well, and on a phone (lowPower) neither lines nor halo, as the main view', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), { ...glow, theme: 'dark' });
        expect(seen[0].meshes.map(mesh => mesh.userData.isGlowExtra ?? 'surface').sort()).toEqual(['halo', 'lines', 'surface']);
        await thumbs.render(triangle(), { ...glow, theme: 'dark', lowPower: true });
        expect(seen[1].meshes).toHaveLength(1);
    });

    // Review A, M4: the main view's R10 frame-time guard can latch Glow's lines/halo off
    // for the rest of the session on a slow device; without this the strip ignored the
    // latch and kept drawing them in every tile. A 4th argument, defaulting to true (every
    // existing caller/test above is unaffected), lets the host say the latch is on.
    it('honours the main view\'s R10 extras latch when the host passes extrasAllowed: false', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), { ...glow, theme: 'dark' }, DEFAULT_OPACITY, false);
        expect(seen[0].meshes).toHaveLength(1);
        await thumbs.render(triangle(), { ...glow, theme: 'dark' }, DEFAULT_OPACITY, true);
        expect(seen[1].meshes.map(mesh => mesh.userData.isGlowExtra ?? 'surface').sort()).toEqual(['halo', 'lines', 'surface']);
    });

    it('restores the main view even when the draw throws', async () => {
        const { renderer, mainTarget, current } = stubRenderer();
        renderer.render.mockImplementationOnce(() => { throw new Error('context lost'); });
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer);
        await expect(thumbs.render(triangle(), glow)).rejects.toThrow('context lost');
        expect(current()).toBe(mainTarget);
    });

    // Fix round 1 of Task 20a (R20a-4): the main view's committed opacity, not always the default.
    it('draws the surface at the opacity it is given, opaque at 1', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), glow, 0.4);
        expect((seen[0].meshes[0].material as THREE.MeshStandardMaterial).opacity).toBe(0.4);
        await thumbs.render(triangle(), glow, 1);
        const opaque = seen[1].meshes[0].material as THREE.MeshStandardMaterial;
        expect(opaque.opacity).toBe(1);
        expect(opaque.transparent).toBe(false);
    });

    // Ruling R20d: every tile frames its object the same way -- the mesh's bounding sphere fills
    // THUMB_FILL of the tile, seen from one fixed direction, centred.
    it('fits each mesh\'s bounding sphere to the same fill, from one direction, centred on the sphere', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 2 });
        const small: MeshData = { ...triangle(), positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] };
        const large: MeshData = { ...triangle(), positions: [[10, 4, -2], [40, 4, -2], [10, 34, 8]] };
        for (const mesh of [small, large]) await thumbs.render(mesh, glow);
        const direction = new THREE.Vector3(...THUMB_CAMERA_DIRECTION).normalize();
        for (const [index, mesh] of [small, large].entries()) {
            const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.flat(), 3));
            geometry.computeBoundingSphere();
            const { center, radius } = geometry.boundingSphere!;
            const camera = seen[index].camera;
            const toCamera = camera.position.clone().sub(center);
            // From the fixed direction...
            expect(toCamera.clone().normalize().dot(direction)).toBeCloseTo(1, 9);
            // ...looking straight at the sphere's centre...
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            expect(forward.dot(toCamera.clone().normalize().negate())).toBeCloseTo(1, 9);
            // ...whose silhouette spans THUMB_FILL of the frame's height (and width: the tile is square).
            const silhouette = Math.tan(Math.asin(radius / toCamera.length()));
            expect(silhouette / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))).toBeCloseTo(THUMB_FILL, 9);
            expect(camera.aspect).toBe(1);
            expect(camera.near).toBeLessThan(toCamera.length() - radius);
            expect(camera.far).toBeGreaterThan(toCamera.length() + radius);
        }
    });

    // Ruling R20d: a fixed light rig, placed relative to the tile's camera, at the tiles' own levels per
    // theme -- not the main view's lights, and never touched by the frame-time guard (which never sees this scene).
    it('lights every tile with the same rig, at the tiles\' own levels per theme', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), { ...glow, theme: 'dark' });
        await thumbs.render({ ...triangle(), positions: [[5, 5, 5], [50, 5, 5], [5, 50, 5]] }, glow);
        const dark = GLOW_TUNING.dark.thumb.lights;
        expect(seen[0].lights).toEqual([dark.ambient, dark.key, dark.fill]);
        for (const { directional } of seen) {
            expect(directional.map(v => v.toArray())).toEqual([THUMB_LIGHT_RIG.key, THUMB_LIGHT_RIG.fill].map(
                rig => new THREE.Vector3(...rig).normalize().toArray().map(c => expect.closeTo(c, 9))));
        }
    });

    // Ruling R20d: the Glow look per theme, a touch stronger in a 72 px tile (GLOW_TUNING[theme].thumb).
    it('wears the main view\'s Glow with the tiles\' rim, halo and line strengths', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), { ...glow, theme: 'dark' });
        await thumbs.render(triangle(), glow);
        const uniformsOf = (mesh: THREE.Mesh) => (mesh.material as THREE.ShaderMaterial).uniforms;
        const [darkTile, lightTile] = seen;
        const extra = (tile: typeof darkTile, kind: string) => tile.meshes.find(mesh => mesh.userData.isGlowExtra === kind)!;
        const surface = (tile: typeof darkTile) => tile.meshes.find(mesh => !mesh.userData.isGlowExtra)!;
        expect((surface(darkTile).material as THREE.MeshStandardMaterial).userData.glowUniforms.qlRimStrength.value).toBe(GLOW_TUNING.dark.thumb.rimStrength);
        expect(uniformsOf(extra(darkTile, 'halo')).qlHaloOpacity.value).toBe(GLOW_TUNING.dark.thumb.haloOpacity);
        expect(uniformsOf(extra(darkTile, 'lines')).qlLinesOpacity.value).toBe(GLOW_TUNING.dark.thumb.linesOpacity);
        expect((surface(lightTile).material as THREE.MeshStandardMaterial).userData.glowUniforms.qlRimStrength.value).toBe(GLOW_TUNING.light.thumb.rimStrength);
        expect(uniformsOf(extra(lightTile, 'lines')).qlLinesOpacity.value).toBe(GLOW_TUNING.light.thumb.linesOpacity);
    });
});

// Ruling R20d: the picture is at least 3× the tile's CSS size, at least 2× its device size, and a whole
// multiple of the device size, so the tile's bitmap is a box filter of it -- no CSS or non-integer scaling.
// Task 10 (spec §12, ruling P5): a tile is drawn in the colouring its strip asks for --
// the phase colours (an orbital), the density's one colour, or a mapped ESP.
describe('createThumbnailRenderer colourings (Task 10)', () => {
    const dark: Appearance = { theme: 'dark', finish: 'glow', showAxes: true, lowPower: false };
    const coloursOf = (mesh: THREE.Mesh) => Array.from((mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array);
    const signsOf = (mesh: THREE.Mesh) => Array.from((mesh.geometry.getAttribute('phaseSign') as THREE.BufferAttribute).array);

    it('draws every vertex of a density in the theme\'s density colour, display hex to linear as the main view does', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), dark, DEFAULT_OPACITY, true, 'density');
        const surface = seen[0].meshes[0];
        const expected = linearRgb(densitySurfaceHex('dark'));
        const colours = coloursOf(surface);
        expect(colours).toHaveLength(9);
        for (let i = 0; i < 3; i++) expect(colours.slice(3 * i, 3 * i + 3)).toEqual(expected.map(c => expect.closeTo(c, 6)));
        // A density has no phase: the Glow rim takes no phase tint (the main view's 0, orbital_visualizer.ts).
        expect(signsOf(surface)).toEqual([0, 0, 0]);
    });

    it('copies an ESP colouring\'s vertex colours verbatim', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        // A 2 × 2 × 2 grid ramping in x: the three vertices sample three different potentials.
        const grid: ScalarGrid = {
            shape: [2, 2, 2], origin: [0, 0, 0], spacing: 1,
            values: new Float32Array([-0.05, -0.05, -0.05, -0.05, 0.05, 0.05, 0.05, 0.05]),
        };
        const mesh = triangle();
        await thumbs.render(mesh, dark, DEFAULT_OPACITY, true, { kind: 'esp', grid, limit: 0.05 });
        const surface = seen[0].meshes[0];
        expect(coloursOf(surface)).toEqual(Array.from(espVertexColors(mesh.positions, grid, 0.05).colors));
        expect(signsOf(surface)).toEqual([0, 0, 0]);
    });

    it('draws the phase colours when asked for them, exactly as without a colouring', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 1 });
        await thumbs.render(triangle(), dark, DEFAULT_OPACITY, true, 'phase');
        await thumbs.render(triangle(), dark);
        expect(coloursOf(seen[0].meshes[0])).toEqual(coloursOf(seen[1].meshes[0]));
        expect(signsOf(seen[0].meshes[0])).toEqual([1, 1, -1]);
        const phase = phaseColours('dark');
        expect(coloursOf(seen[0].meshes[0]).slice(6, 9)).toEqual(linearRgb(phase.negative).map(c => expect.closeTo(c, 6)));
    });
});

describe('thumbnail sizes', () => {
    it.each([1, 1.25, 1.5, 2, 2.625, 3])('at devicePixelRatio %p', dpr => {
        const device = thumbTileDevicePx(dpr);
        expect(device).toBe(Math.round(THUMB_TILE_PX * dpr));
        expect(thumbnailSize(dpr)).toBe(device * thumbSupersample(dpr));
        expect(thumbSupersample(dpr)).toBeGreaterThanOrEqual(2);
        expect(thumbnailSize(dpr)).toBeGreaterThanOrEqual(3 * THUMB_TILE_PX);
        expect(thumbnailSize(dpr)).toBeGreaterThanOrEqual(2 * device);
    });
});

describe('downsampleThumbnail', () => {
    it('box-filters premultiplied GL rows into a top-down, straight-alpha image, without a dark fringe', () => {
        // A 4 × 4 GL read (bottom row first), factor 2: the bottom-left block is opaque red, the
        // top-right block half covered by a premultiplied opaque blue, the rest clear.
        const side = 4;
        const gl = new Uint8Array(side * side * 4);
        const set = (x: number, y: number, rgba: number[]) => gl.set(rgba, (y * side + x) * 4);
        for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x, y, [255, 0, 0, 255]);
        set(2, 2, [0, 0, 255, 255]);
        set(3, 3, [0, 0, 255, 255]);
        const out = downsampleThumbnail(gl, side, 2);
        expect(out).toHaveLength(2 * 2 * 4);
        const at = (x: number, y: number) => Array.from(out.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
        // GL's bottom rows become the image's bottom rows.
        expect(at(0, 1)).toEqual([255, 0, 0, 255]);
        expect(at(1, 0)).toEqual([0, 0, 255, 128]);   // half covered: full blue at half alpha, not a darker blue
        expect(at(0, 0)).toEqual([0, 0, 0, 0]);
        expect(at(1, 1)).toEqual([0, 0, 0, 0]);
    });
});

// Fix round 1 of Task 20d: the key must say which bitmap it files. Keyed on the render target, DPR 1 and
// 1.5 (and 1.333 and 2) shared a key, so a 72 px bitmap was served to a 108 px canvas and stretched.
describe('the cache key identifies the bitmap', () => {
    const look = { theme: 'dark' as const, finish: 'glow' as const, lowPower: false };
    const keyAt = (dpr: number) => thumbLookKey({ appearance: look, opacity: 0.7, size: thumbTileDevicePx(dpr) });

    it('differs between screens whose bitmaps differ, even where the render targets match', () => {
        expect(thumbnailSize(1)).toBe(thumbnailSize(1.5));
        expect(keyAt(1)).not.toBe(keyAt(1.5));
        expect(thumbnailSize(4 / 3)).toBe(thumbnailSize(2));
        expect(keyAt(4 / 3)).not.toBe(keyAt(2));
    });

    it('is the size of the bitmap the renderer hands back, at every ratio', async () => {
        let ratio = 1;
        const { renderer } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => ratio });
        for (ratio of [1, 4 / 3, 1.5, 2, 3]) {
            const image = await thumbs.render(triangle(), { theme: 'dark', finish: 'glow', showAxes: true, lowPower: false });
            expect(thumbs.size()).toBe(image.width);
            expect(thumbs.size()).toBe(thumbTileDevicePx(ratio));
        }
    });
});

