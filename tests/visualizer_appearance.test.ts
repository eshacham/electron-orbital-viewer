import * as THREE from 'three';

jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../src/workers/createOrbitalWorker';
import {
    VisualizerContext, setAppearance, setMoleculeOverlay, updateAtomViewInScene, updateOrbitalInScene, presentFieldMesh,
    setSurfaceStyle, guardMeshLines,
} from '../src/orbital_visualizer';
import { collectExportSurfaces } from '../src/export/surfaces';
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
        // Ruling DC11b: the context's own lights (Task 15), at today's levels (initVisualizer's), which Classic keeps.
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        const lights = [context.lights.ambient, context.lights.key, context.lights.fill];
        await drawOrbital(context);
        setAppearance(context, { theme: 'dark', scheme: 'phase', finish: 'glow', showAxes: true, lowPower: false });
        // The Glow step really changed the lights and the surface, so the Classic checks below can fail.
        expect(lights.map(light => light.intensity)).toEqual([0.35, 0.6, 0.25]);
        expect(context.currentOrbitalGroup!.children.some(child => child.userData.isGlowExtra)).toBe(true);
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
        // Ruling DC11b: Glow's real marks -- the shader injection flag and the halo/lines marker -- are gone.
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBeFalsy();
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

describe('Glow on the drawn orbital (spec §11.2)', () => {
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { (console.log as jest.Mock).mockRestore(); });

    const glow = { theme: 'dark' as const, scheme: 'phase' as const, finish: 'glow' as const, showAxes: true, lowPower: false };
    const extras = (context: VisualizerContext) => context.currentOrbitalGroup!.children.filter(child => child.userData.isGlowExtra);
    const extra = (context: VisualizerContext, kind: 'halo' | 'lines') => extras(context).find(child => child.userData.isGlowExtra === kind) as THREE.Mesh | undefined;

    it('glows in place and never exports the halo or the lines', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const before = collectExportSurfaces(context.currentOrbitalGroup);
        setAppearance(context, glow);
        expect(extras(context)).toHaveLength(2);
        expect(surfaceOf(context).geometry.getAttribute('phaseSign').array).toEqual(Float32Array.from([1, -1, 1]));
        expect(collectExportSurfaces(context.currentOrbitalGroup)).toHaveLength(before.length);
    });

    it('drops the extras for a wireframe and brings them back for the solid surface', async () => {
        const context = buildContext();
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        await drawOrbital(context);
        setAppearance(context, glow);
        setSurfaceStyle(context, { ...context.surfaceStyle, mode: 'wireframe' });
        expect(extras(context)).toHaveLength(0);
        // §11.1 "Material": Wireframe = today's -- today's material, so today's lights.
        expect((surfaceOf(context).material as THREE.MeshStandardMaterial).userData.glow).toBe(false);
        expect(context.lights.ambient.intensity).toBe(0.5);
        setSurfaceStyle(context, { ...context.surfaceStyle, mode: 'solid' });
        expect(extras(context)).toHaveLength(2);
        expect(context.lights.ambient.intensity).toBe(0.35);
    });

    it('dims the lights for Glow, whose emissive term carries the rest, and restores them for Solid', () => {
        const context = buildContext();
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        setAppearance(context, glow);
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([0.35, 0.6, 0.25]);
        setAppearance(context, { ...glow, finish: 'solid' });
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([0.5, 0.8, 0.35]);
    });

    // Ruling DC3: the cut and opacity sliders restyle every tick; the halo's shader must not be rebuilt by them.
    it('keeps the same halo and lines through opacity and cut changes', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, glow);
        const [halo, lines] = [extra(context, 'halo')!, extra(context, 'lines')!];
        const disposals = [halo, lines].map(mesh => jest.spyOn(mesh.material as THREE.Material, 'dispose'));
        const repaint = jest.spyOn(surfaceOf(context).userData, 'applyAppearance');
        setSurfaceStyle(context, { ...context.surfaceStyle, opacity: 0.4 });
        setSurfaceStyle(context, { ...context.surfaceStyle, clipAxis: 'x', clipPosition: 0.3 });
        setSurfaceStyle(context, { ...context.surfaceStyle, clipPosition: 0.6 });
        expect(extra(context, 'halo')).toBe(halo);
        expect(extra(context, 'lines')).toBe(lines);
        disposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
        expect(repaint).not.toHaveBeenCalled();
    });

    // Ruling DC3: a cross-fade starts the incoming orbital at opacity 0 -- its halo and lines with it.
    it('starts a cross-fade with the halo and lines faded out too', async () => {
        const context = buildContext();
        setAppearance(context, glow);
        updateAtomViewInScene(context, {
            contourRadius: 4, shellEmphasis: new Float32Array([0.1, 0.4, 1, 0.3, 0.05]), rMin: 0.1, dx: 0.5, size: 5, rMax: 0.1 * Math.exp(2),
        });
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const pending = updateOrbitalInScene(context, { n: 2, l: 1, ml: 0, Z: 1, resolution: 4, rMax: 20, enclosedFraction: 0.9 }, true, { animate: true });
        worker.onmessage!({ data: { type: 'success', meshData: meshData() } });
        await pending;
        expect(context.transition?.kind).toBe('cross-fade');
        expect(((extra(context, 'halo')!.material) as THREE.ShaderMaterial).uniforms.qlHaloOpacity.value).toBe(0);
        expect((extra(context, 'lines')!.material as THREE.Material).opacity).toBe(0);
    });

    // Ruling R10: the guard latches the lines off, and only a new appearance brings them back.
    it('latches the mesh lines off on slow frames until the appearance next changes', async () => {
        const context = buildContext();
        context.frameGuard = { ema: 16, frames: 0 };
        await drawOrbital(context);
        setAppearance(context, glow);
        for (let i = 0; i < 300; i++) guardMeshLines(context, 40);
        expect(context.linesSuppressed).toBe(true);
        expect(extra(context, 'lines')).toBeUndefined();
        expect(extra(context, 'halo')).toBeDefined();
        // Restyling is not an appearance change: still off.
        setSurfaceStyle(context, { ...context.surfaceStyle, mode: 'wireframe' });
        setSurfaceStyle(context, { ...context.surfaceStyle, mode: 'solid' });
        setAppearance(context, glow);
        expect(extra(context, 'lines')).toBeUndefined();
        setAppearance(context, { ...glow, scheme: 'density' });
        expect(context.linesSuppressed).toBe(false);
        expect(context.frameGuard).toEqual({ ema: 16, frames: 0 });
        expect(extra(context, 'lines')).toBeDefined();
    });
});
