import * as THREE from 'three';
import { createThumbnailRenderer, thumbnailSize } from '../../src/thumbs/render_thumbnail';
import type { MeshData } from '../../src/types/orbital';
import { CLASSIC_APPEARANCE, type Appearance } from '../../src/design/appearance';
import { linearRgb, phaseColours } from '../../src/design/science';
import { GLOW_LIGHTS, SOLID_LIGHTS } from '../../src/orbital_glow';
import { DEFAULT_OPACITY } from '../../src/types/orbital';

const triangle = (): MeshData => ({
    positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]], psiSigns: [1, 1, -1],
    densityMap: { data: new Uint8Array(1), side: 1, rMax: 1 }, isoLevel: 1,
});

/** The main renderer, as far as a thumbnail touches it: jsdom has no WebGL. */
function stubRenderer() {
    const mainTarget = { name: 'main view' };
    let current: unknown = mainTarget;
    const seen: Array<{ target: unknown; meshes: THREE.Mesh[]; lights: number[] }> = [];
    const renderer = {
        getRenderTarget: () => current,
        setRenderTarget: jest.fn((target: unknown) => { current = target; }),
        getClearColor: (colour: THREE.Color) => colour.set(0x123456),
        getClearAlpha: () => 0.25,
        setClearColor: jest.fn(),
        clear: jest.fn(),
        render: jest.fn((scene: THREE.Scene) => {
            const meshes: THREE.Mesh[] = [];
            const lights: number[] = [];
            scene.traverse(object => {
                if (object instanceof THREE.Mesh) meshes.push(object);
                if (object instanceof THREE.Light) lights.push(object.intensity);
            });
            seen.push({ target: current, meshes, lights });
        }),
        readRenderTargetPixels: jest.fn(),
    };
    return { renderer, mainTarget, seen, current: () => current };
}

describe('createThumbnailRenderer (spec §12: a target on the main renderer)', () => {
    const glow: Appearance = { theme: 'light', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false };

    it('draws into its own target in the theme\'s phase colours, then gives the main view back its target and clear colour', async () => {
        const { renderer, mainTarget, seen, current } = stubRenderer();
        // Ruling R20a-4: a 2× screen gets a 72 × 2 × 2 = 288 px picture (was a fixed 160).
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => 2 });
        const image = await thumbs.render(triangle(), glow);
        expect(image).toMatchObject({ width: 288, height: 288 });

        expect(seen).toHaveLength(1);
        expect(seen[0].target).toBeInstanceOf(THREE.WebGLRenderTarget);
        expect((seen[0].target as THREE.WebGLRenderTarget).samples).toBe(4);
        expect(renderer.readRenderTargetPixels).toHaveBeenCalledWith(seen[0].target, 0, 0, 288, 288, expect.any(Uint8Array));
        const [surface] = seen[0].meshes;
        const colours = Array.from((surface.geometry.getAttribute('color') as THREE.BufferAttribute).array);
        const phase = phaseColours('light', 'phase');
        expect(colours.slice(0, 3)).toEqual(linearRgb(phase.positive).map(c => expect.closeTo(c, 6)));
        expect(colours.slice(6, 9)).toEqual(linearRgb(phase.negative).map(c => expect.closeTo(c, 6)));
        // Ruling R20a-4: the main view's look -- Glow's rim on a see-through surface at the
        // default opacity, with the mesh lines (no halo in Light Clean). Was: rim only, opaque.
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
        expect((surface.material as THREE.MeshStandardMaterial).opacity).toBe(DEFAULT_OPACITY);
        expect((surface.material as THREE.MeshStandardMaterial).transparent).toBe(true);
        expect(seen[0].meshes.map(mesh => mesh.userData.isGlowExtra ?? 'surface')).toEqual(['surface', 'lines']);
        expect(seen[0].lights).toEqual([GLOW_LIGHTS.ambient, GLOW_LIGHTS.key, GLOW_LIGHTS.fill]);

        expect(current()).toBe(mainTarget);
        expect(renderer.setClearColor).toHaveBeenLastCalledWith(expect.objectContaining({ r: new THREE.Color(0x123456).r }), 0.25);
    });

    it('lights a Solid or Classic thumbnail like the main view, and leaves nothing behind in its scene', async () => {
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer);
        await thumbs.render(triangle(), CLASSIC_APPEARANCE);
        expect(seen[0].lights).toEqual([SOLID_LIGHTS.ambient, SOLID_LIGHTS.key, SOLID_LIGHTS.fill]);
        const surface = seen[0].meshes[0];
        await thumbs.render(triangle(), CLASSIC_APPEARANCE);
        expect(seen[1].meshes).toHaveLength(1);
        expect(seen[1].meshes[0]).not.toBe(surface);
        expect(surface.parent?.parent ?? null).toBeNull();
    });

    // Ruling R20a-4: tile CSS size × dpr × 2, never under today's 160; one target, re-made only for a new size.
    it('sizes the picture to the screen, supersampled, and keeps one target per size', async () => {
        expect([thumbnailSize(1), thumbnailSize(2), thumbnailSize(3), thumbnailSize(Number.NaN)]).toEqual([160, 288, 432, 160]);
        let ratio = 2;
        const { renderer, seen } = stubRenderer();
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer, { pixelRatio: () => ratio });
        await thumbs.render(triangle(), glow);
        await thumbs.render(triangle(), glow);
        expect(seen[1].target).toBe(seen[0].target);
        ratio = 3;
        expect(thumbs.size()).toBe(432);
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

    it('restores the main view even when the draw throws', async () => {
        const { renderer, mainTarget, current } = stubRenderer();
        renderer.render.mockImplementationOnce(() => { throw new Error('context lost'); });
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer);
        await expect(thumbs.render(triangle(), glow)).rejects.toThrow('context lost');
        expect(current()).toBe(mainTarget);
    });
});
