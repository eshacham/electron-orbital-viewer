import * as THREE from 'three';

jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../src/workers/createOrbitalWorker';
import {
    VisualizerContext, setAppearance, setMoleculeOverlay, updateAtomViewInScene, updateOrbitalInScene, presentFieldMesh,
} from '../src/orbital_visualizer';
import { defaultSurfaceStyle, MeshData } from '../src/types/orbital';
import { CLASSIC_APPEARANCE, type Appearance } from '../src/design/appearance';
import { CURVE_COLORS } from '../src/curve_colors';
import { CLASSIC, CURVE_COLORS_LIGHT, DENSITY_RAMP, densitySurfaceHex, displayRgb, LIGHT_HYDROGEN, linearRgb } from '../src/design/science';
import { CPK_COLORS } from '../src/molecules/ball_and_stick';

/** A VisualizerContext without a WebGLRenderer (jsdom has no WebGL) -- tests/atom/visualizer_dispatch.test.ts's recipe. */
function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
    };
}
const fakeWorker = () => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null });
const meshData = (): MeshData => ({
    positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]], psiSigns: [1, -1, 1],
    densityMap: { data: new Uint8Array(1), side: 1, rMax: 20 }, isoLevel: 0.5,
});
async function drawOrbital(context: VisualizerContext) {
    const worker = fakeWorker();
    (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
    const pending = updateOrbitalInScene(context, { n: 2, l: 1, ml: 0, Z: 1, resolution: 4, rMax: 20, enclosedFraction: 0.9 });
    worker.onmessage!({ data: { type: 'success', meshData: meshData() } });
    await pending;
}
const surfaceOf = (context: VisualizerContext) => {
    let found: THREE.Mesh | null = null;
    context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) found = o; });
    return found! as THREE.Mesh;
};
const capOf = (context: VisualizerContext) => {
    let found: THREE.Mesh | null = null;
    context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.userData.isCap) found = o; });
    return found! as THREE.Mesh;
};
const colourAt = (mesh: THREE.Mesh, i: number) => {
    const c = mesh.geometry.getAttribute('color');
    return [c.getX(i), c.getY(i), c.getZ(i)];
};

describe('the renderer\'s appearance (spec §6.6, §11)', () => {
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { (console.log as jest.Mock).mockRestore(); });

    it('draws today\'s Classic constants until told otherwise (§11.3)', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const surface = surfaceOf(context);
        expect(colourAt(surface, 0)).toEqual([1, 0, 0]);
        expect(colourAt(surface, 1)).toEqual([0, 0, 1]);
        const cap = capOf(context).material as THREE.ShaderMaterial;
        expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb('#D42020'));
        expect(cap.uniforms.negativePhase.value.toArray()).toEqual(displayRgb('#2030D4'));
        expect(cap.uniforms.rampMode.value).toBe(0);
        expect(context.currentAxesHelper!.children.some(child => child instanceof THREE.AxesHelper)).toBe(true);
    });

    it('recolours the same mesh in place for a theme and scheme, and back to Classic exactly', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const surface = surfaceOf(context);
        const geometry = surface.geometry;
        const positions = geometry.getAttribute('position').array;
        setAppearance(context, { theme: 'light', scheme: 'phase', finish: 'solid', showAxes: true, lowPower: false });
        expect(surfaceOf(context)).toBe(surface);
        expect(surface.geometry).toBe(geometry);
        expect(geometry.getAttribute('position').array).toBe(positions);
        linearRgb('#E8590C').forEach((v, k) => expect(colourAt(surface, 0)[k]).toBeCloseTo(v, 6));
        linearRgb('#1F5FE0').forEach((v, k) => expect(colourAt(surface, 1)[k]).toBeCloseTo(v, 6));
        setAppearance(context, CLASSIC_APPEARANCE);
        expect(colourAt(surface, 0)).toEqual([1, 0, 0]);
        expect(colourAt(surface, 1)).toEqual([0, 0, 1]);
    });

    // DC11: the Classic a user actually picks -- in Light Clean, with Glow chosen as the finish.
    it('draws Classic exactly in Light Clean with Glow chosen too: colours, caps, AxesHelper, today\'s materials and lights', async () => {
        const context = buildContext();
        // Today's three lights at today's levels (initVisualizer's), which Classic keeps.
        const lights = [new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 0.8), new THREE.DirectionalLight(0xffffff, 0.35)];
        lights.forEach(light => context.scene.add(light));
        await drawOrbital(context);
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        setAppearance(context, { theme: 'light', scheme: 'classic', finish: 'glow', showAxes: true, lowPower: false });
        const surface = surfaceOf(context);
        expect(colourAt(surface, 0)).toEqual([1, 0, 0]);
        expect(colourAt(surface, 1)).toEqual([0, 0, 1]);
        const cap = capOf(context).material as THREE.ShaderMaterial;
        expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb(CLASSIC.capPositive));
        expect(cap.uniforms.negativePhase.value.toArray()).toEqual(displayRgb(CLASSIC.capNegative));
        expect(cap.uniforms.rampMode.value).toBe(0);
        const axes = context.currentAxesHelper!;
        expect(axes.visible).toBe(true);
        expect(axes.children.some(child => child instanceof THREE.AxesHelper)).toBe(true);
        expect(axes.children.some(child => child instanceof THREE.Mesh)).toBe(false); // no arrowheads
        // No Glow material: the surface is today's MeshStandardMaterial, and nothing else was added to the group.
        expect(surface.material).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(context.currentOrbitalGroup!.children.some(child => child.userData.isGlowExtra)).toBe(false);
        expect(lights.map(light => light.intensity)).toEqual([0.5, 0.8, 0.35]);
    });

    it('maps |ψ|² on the cut face through the density ramp only in the Density scheme', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const cap = capOf(context).material as THREE.ShaderMaterial;
        setAppearance(context, { theme: 'dark', scheme: 'density', finish: 'solid', showAxes: true, lowPower: false });
        expect(cap.uniforms.rampMode.value).toBe(1);
        expect(cap.uniforms.ramp.value[0].toArray()).toEqual(displayRgb(DENSITY_RAMP[0]));
        expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb('#FF7A2F'));
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'solid', showAxes: true, lowPower: false });
        expect(cap.uniforms.rampMode.value).toBe(0);
    });

    it('restyles the axes to one hue, hides them on request, and keeps them a helper', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        const axes = context.currentAxesHelper!;
        expect(axes.children.some(child => child instanceof THREE.AxesHelper)).toBe(false);
        expect(axes.children.some(child => child instanceof THREE.LineSegments)).toBe(true);
        expect(axes.userData.isAxes).toBe(true);
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: false, lowPower: false });
        expect(context.currentAxesHelper!.visible).toBe(false);
    });

    it('gives a shell view the light curve palette, index for index', () => {
        const context = buildContext();
        updateAtomViewInScene(context, {
            contourRadius: 4, shellEmphasis: new Float32Array([0.1, 0.4, 1, 0.3, 0.05]), rMin: 0.1, dx: 0.5, size: 5, rMax: 0.1 * Math.exp(2),
        });
        let cap: THREE.ShaderMaterial | null = null;
        context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.userData.isCap) cap = o.material as THREE.ShaderMaterial; });
        const paletteOf = () => (cap as unknown as THREE.ShaderMaterial).uniforms.palette.value.map((v: THREE.Vector3) => v.toArray());
        expect(paletteOf()[3]).toEqual(displayRgb(CURVE_COLORS[3]));
        setAppearance(context, { theme: 'light', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        expect(paletteOf()[3]).toEqual(displayRgb(CURVE_COLORS_LIGHT[3]));
    });

    // DC2: the ESP map overrides the surface's colours, but its cut face is the density's material -- never NaN, never ψ's red.
    it('gives a cut ESP map\'s cut face the density surface colour, in Classic and in a theme', () => {
        const context = buildContext();
        context.surfaceStyle = { ...defaultSurfaceStyle, clipAxis: 'x', clipPosition: 0.5 };
        const esp = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
        presentFieldMesh(context, meshData(), { vertexColors: esp, boxRMax: 20 });
        const surface = surfaceOf(context);
        const cap = capOf(context);
        const positive = () => (cap.material as THREE.ShaderMaterial).uniforms.positivePhase.value as THREE.Vector3;
        expect(cap.parent!.visible).toBe(true);
        // Ruling DC2b: display space, the space the cap shader ramps in, so the cut face matches the surface and the key.
        expect(positive().toArray()).toEqual(displayRgb(CLASSIC.densitySurface));
        const look: Appearance = { theme: 'light', scheme: 'phase', finish: 'solid', showAxes: true, lowPower: false };
        setAppearance(context, look);
        expect(positive().toArray()).toEqual(displayRgb(densitySurfaceHex(look.theme, look.scheme)));
        // The ESP's own colouring is left alone by a theme change.
        expect(Array.from(surface.geometry.getAttribute('color').array)).toEqual(Array.from(esp));
    });

    // Ruling R12, from science.ts: CPK white would vanish on Light Clean's page.
    it('greys hydrogen in Light Clean, and gives it back its CPK white in Classic and in Deep Space', () => {
        const context = buildContext();
        const hydrogen = new THREE.MeshStandardMaterial({ color: CPK_COLORS[1] });
        hydrogen.userData.Z = 1;
        const oxygen = new THREE.MeshStandardMaterial({ color: CPK_COLORS[8] });
        oxygen.userData.Z = 8;
        const overlay = new THREE.Group();
        overlay.add(new THREE.Mesh(new THREE.SphereGeometry(1), hydrogen), new THREE.Mesh(new THREE.SphereGeometry(1), oxygen));
        setMoleculeOverlay(context, overlay);
        expect(hydrogen.color.getHexString()).toBe(CPK_COLORS[1].slice(1));
        setAppearance(context, { theme: 'light', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        expect(`#${hydrogen.color.getHexString().toUpperCase()}`).toBe(LIGHT_HYDROGEN);
        expect(oxygen.color.getHexString()).toBe(CPK_COLORS[8].slice(1));
        setAppearance(context, { theme: 'light', scheme: 'classic', finish: 'glow', showAxes: true, lowPower: false });
        expect(hydrogen.color.getHexString()).toBe(CPK_COLORS[1].slice(1));
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        expect(hydrogen.color.getHexString()).toBe(CPK_COLORS[1].slice(1));
    });
});
