import * as THREE from 'three';
import { createThumbnailRenderer } from '../../src/thumbs/render_thumbnail';
import type { MeshData } from '../../src/types/orbital';
import { CLASSIC_APPEARANCE, type Appearance } from '../../src/design/appearance';
import { linearRgb, phaseColours } from '../../src/design/science';
import { GLOW_LIGHTS, SOLID_LIGHTS } from '../../src/orbital_glow';

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
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer);
        const image = await thumbs.render(triangle(), glow);
        expect(image).toMatchObject({ width: 160, height: 160 });

        expect(seen).toHaveLength(1);
        expect(seen[0].target).toBeInstanceOf(THREE.WebGLRenderTarget);
        expect(renderer.readRenderTargetPixels).toHaveBeenCalledWith(seen[0].target, 0, 0, 160, 160, expect.any(Uint8Array));
        const [surface] = seen[0].meshes;
        const colours = Array.from((surface.geometry.getAttribute('color') as THREE.BufferAttribute).array);
        const phase = phaseColours('light', 'phase');
        expect(colours.slice(0, 3)).toEqual(linearRgb(phase.positive).map(c => expect.closeTo(c, 6)));
        expect(colours.slice(6, 9)).toEqual(linearRgb(phase.negative).map(c => expect.closeTo(c, 6)));
        // Glow's rim on the surface; never its halo or mesh lines (they would not read at 72 px).
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
        expect(seen[0].meshes).toHaveLength(1);
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
        expect(surface.parent).toBeNull();
    });

    it('restores the main view even when the draw throws', async () => {
        const { renderer, mainTarget, current } = stubRenderer();
        renderer.render.mockImplementationOnce(() => { throw new Error('context lost'); });
        const thumbs = createThumbnailRenderer(renderer as unknown as THREE.WebGLRenderer);
        await expect(thumbs.render(triangle(), glow)).rejects.toThrow('context lost');
        expect(current()).toBe(mainTarget);
    });
});
