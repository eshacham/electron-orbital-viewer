import * as THREE from 'three';

jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../src/workers/createOrbitalWorker';
import {
    VisualizerContext, setAppearance, setMoleculeOverlay, updateAtomViewInScene, updateOrbitalInScene, presentFieldMesh,
    setSurfaceStyle, guardGlowExtras, updateFieldInScene, attachShellCompositionLobes,
} from '../src/orbital_visualizer';
import { fieldRequestFor } from '../src/combinations';
import { collectExportSurfaces } from '../src/export/surfaces';
import { defaultSurfaceStyle, MeshData } from '../src/types/orbital';
import { INITIAL_APPEARANCE, type Appearance } from '../src/design/appearance';
import { CURVE_COLORS } from '../src/curve_colors';
import { CURVE_COLORS_LIGHT, densitySurfaceHex, displayRgb, LIGHT_HYDROGEN, linearRgb, PHASE_COLOURS, PHASE_HUES } from '../src/design/science';
import { CPK_COLORS } from '../src/molecules/ball_and_stick';
import { GLOW_TUNING } from '../src/orbital_glow';

// Fix round 1 of Task 20a: the Glow lights are per theme; these tests glow in Deep Space.
const GLOW_LIGHTS = GLOW_TUNING.dark.lights;

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

    // Ruling R22a (owner) replaces "draws today's Classic constants until told otherwise": the context
    // starts in INITIAL_APPEARANCE -- Deep Space's phase colours, Solid, the one-hue axes.
    it('draws the phase colours until told otherwise', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const surface = surfaceOf(context);
        linearRgb(PHASE_HUES.positive).forEach((v, k) => expect(colourAt(surface, 0)[k]).toBeCloseTo(v, 6));
        linearRgb(PHASE_HUES.negative).forEach((v, k) => expect(colourAt(surface, 1)[k]).toBeCloseTo(v, 6));
        const cap = capOf(context).material as THREE.ShaderMaterial;
        expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb(PHASE_HUES.positive));
        expect(cap.uniforms.negativePhase.value.toArray()).toEqual(displayRgb(PHASE_HUES.negative));
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBeFalsy();
        expect(context.currentAxesHelper!.children.some(child => child instanceof THREE.AxesHelper)).toBe(false);
        expect(context.currentAxesHelper!.children.some(child => child instanceof THREE.LineSegments)).toBe(true);
    });

    // Ruling R22a: the way back is to Deep Space (was "and back to Classic exactly").
    it('recolours the same mesh in place for a theme, and back', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const surface = surfaceOf(context);
        const geometry = surface.geometry;
        const positions = geometry.getAttribute('position').array;
        setAppearance(context, { theme: 'light', finish: 'solid', showAxes: true, lowPower: false });
        expect(surfaceOf(context)).toBe(surface);
        expect(surface.geometry).toBe(geometry);
        expect(geometry.getAttribute('position').array).toBe(positions);
        // Ruling R20a-1: Light Clean now paints Deep Space's phase pair (was #E8590C / #1F5FE0).
        linearRgb('#FF7A2F').forEach((v, k) => expect(colourAt(surface, 0)[k]).toBeCloseTo(v, 6));
        linearRgb('#2F6BFF').forEach((v, k) => expect(colourAt(surface, 1)[k]).toBeCloseTo(v, 6));
        setAppearance(context, INITIAL_APPEARANCE);
        expect(surfaceOf(context)).toBe(surface);
        linearRgb(PHASE_COLOURS.dark.positive).forEach((v, k) => expect(colourAt(surface, 0)[k]).toBeCloseTo(v, 6));
        linearRgb(PHASE_COLOURS.dark.negative).forEach((v, k) => expect(colourAt(surface, 1)[k]).toBeCloseTo(v, 6));
    });

    // Ruling R22a (owner) replaces "maps |ψ|² on the cut face through the density ramp only in the Density
    // scheme" (and the DC11 Light-Clean Classic case): an orbital's cut face is always shaded by phase.
    it('shades an orbital\'s cut face by phase in every look, with no density ramp', async () => {
        const context = buildContext();
        await drawOrbital(context);
        const cap = capOf(context).material as THREE.ShaderMaterial;
        expect(cap.uniforms.rampMode).toBeUndefined();
        expect(cap.uniforms.ramp).toBeUndefined();
        expect(cap.fragmentShader).not.toContain('ramp[');
        for (const look of [
            { theme: 'dark', finish: 'solid' }, { theme: 'light', finish: 'glow' }, { theme: 'light', finish: 'solid' },
        ] as const) {
            setAppearance(context, { ...look, showAxes: true, lowPower: false });
            expect(cap.uniforms.positivePhase.value.toArray()).toEqual(displayRgb(PHASE_COLOURS[look.theme].positive));
            expect(cap.uniforms.negativePhase.value.toArray()).toEqual(displayRgb(PHASE_COLOURS[look.theme].negative));
        }
    });

    it('restyles the axes to one hue, hides them on request, and keeps them a helper', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, { theme: 'dark', finish: 'glow', showAxes: true, lowPower: false });
        const axes = context.currentAxesHelper!;
        expect(axes.children.some(child => child instanceof THREE.AxesHelper)).toBe(false);
        expect(axes.children.some(child => child instanceof THREE.LineSegments)).toBe(true);
        expect(axes.userData.isAxes).toBe(true);
        setAppearance(context, { theme: 'dark', finish: 'glow', showAxes: false, lowPower: false });
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
        setAppearance(context, { theme: 'light', finish: 'glow', showAxes: true, lowPower: false });
        expect(paletteOf()[3]).toEqual(displayRgb(CURVE_COLORS_LIGHT[3]));
    });

    // DC2: the ESP map overrides the surface's colours, but its cut face is the density's material -- never NaN, never ψ's red.
    // Ruling R22a: in each theme (was "in Classic and in a theme").
    it('gives a cut ESP map\'s cut face the density surface colour, in each theme', () => {
        const context = buildContext();
        context.surfaceStyle = { ...defaultSurfaceStyle, clipAxis: 'x', clipPosition: 0.5 };
        const esp = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
        presentFieldMesh(context, meshData(), { vertexColors: esp, boxRMax: 20 });
        const surface = surfaceOf(context);
        const cap = capOf(context);
        const positive = () => (cap.material as THREE.ShaderMaterial).uniforms.positivePhase.value as THREE.Vector3;
        expect(cap.parent!.visible).toBe(true);
        // Ruling DC2b: display space, the space the cap shader ramps in, so the cut face matches the surface and the key.
        expect(positive().toArray()).toEqual(displayRgb(densitySurfaceHex('dark')));
        const look: Appearance = { theme: 'light', finish: 'solid', showAxes: true, lowPower: false };
        setAppearance(context, look);
        expect(positive().toArray()).toEqual(displayRgb(densitySurfaceHex(look.theme)));
        // The ESP's own colouring is left alone by a theme change.
        expect(Array.from(surface.geometry.getAttribute('color').array)).toEqual(Array.from(esp));
    });

    // Ruling R12, from science.ts: CPK white would vanish on Light Clean's page.
    // Ruling R22a: Deep Space alone gives the white back (Classic is gone).
    it('greys hydrogen in Light Clean, and gives it back its CPK white in Deep Space', () => {
        const context = buildContext();
        const hydrogen = new THREE.MeshStandardMaterial({ color: CPK_COLORS[1] });
        hydrogen.userData.Z = 1;
        const oxygen = new THREE.MeshStandardMaterial({ color: CPK_COLORS[8] });
        oxygen.userData.Z = 8;
        const overlay = new THREE.Group();
        overlay.add(new THREE.Mesh(new THREE.SphereGeometry(1), hydrogen), new THREE.Mesh(new THREE.SphereGeometry(1), oxygen));
        setMoleculeOverlay(context, overlay);
        expect(hydrogen.color.getHexString()).toBe(CPK_COLORS[1].slice(1));
        setAppearance(context, { theme: 'light', finish: 'glow', showAxes: true, lowPower: false });
        expect(`#${hydrogen.color.getHexString().toUpperCase()}`).toBe(LIGHT_HYDROGEN);
        expect(oxygen.color.getHexString()).toBe(CPK_COLORS[8].slice(1));
        setAppearance(context, { theme: 'dark', finish: 'glow', showAxes: true, lowPower: false });
        expect(hydrogen.color.getHexString()).toBe(CPK_COLORS[1].slice(1));
    });
});

describe('Glow on the drawn orbital (spec §11.2)', () => {
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { (console.log as jest.Mock).mockRestore(); });

    const glow = { theme: 'dark' as const, finish: 'glow' as const, showAxes: true, lowPower: false };
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

    // Owner R25-B1: replaces "drops the extras for a wireframe and brings them back for the solid surface" -- there is
    // no wireframe; a restyle (opacity, cut) keeps the surface's Glow, its extras and the Glow lights as they are.
    it('keeps Glow, its extras and the Glow lights through a restyle', async () => {
        const context = buildContext();
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        await drawOrbital(context);
        setAppearance(context, glow);
        const before = extras(context);
        expect(before).toHaveLength(2);
        setSurfaceStyle(context, { ...context.surfaceStyle, opacity: 0.4, clipAxis: 'x', clipPosition: 0 });
        expect(extras(context)).toEqual(before);
        expect((surfaceOf(context).material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
        // Ruling R20a-3: the tuned Glow ambient (was the literal 0.35).
        expect(context.lights.ambient.intensity).toBe(GLOW_LIGHTS.ambient);
    });

    // Ruling T15-glowcover: the lights dim only while a drawn surface glows, so the orbital is drawn first.
    it('dims the lights for Glow, whose emissive term carries the rest, and restores them for Solid', async () => {
        const context = buildContext();
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        await drawOrbital(context);
        setAppearance(context, glow);
        // Ruling R20a-3: the tuned Glow lights (were the literals 0.35, 0.6, 0.25).
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([GLOW_LIGHTS.ambient, GLOW_LIGHTS.key, GLOW_LIGHTS.fill]);
        setAppearance(context, { ...glow, finish: 'solid' });
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([0.5, 0.8, 0.35]);
        // Fix round 1 of Task 20a: per theme -- Light Clean's Glow keeps the lights up (no darker than Solid).
        const light = GLOW_TUNING.light.lights;
        setAppearance(context, { ...glow, theme: 'light' });
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([light.ambient, light.key, light.fill]);
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
        // Ruling R20a-3: the lines are a shader material now; their alpha is a uniform.
        expect(((extra(context, 'lines')!.material) as THREE.ShaderMaterial).uniforms.qlLinesOpacity.value).toBe(0);
    });

    // Ruling R10: the guard latches the lines off, and only a new appearance brings them back.
    it('latches the mesh lines off on slow frames until the appearance next changes', async () => {
        const context = buildContext();
        context.frameGuard = { ema: 16, frames: 0 };
        await drawOrbital(context);
        setAppearance(context, glow);
        for (let i = 0; i < 300; i++) guardGlowExtras(context, 40);
        expect(context.extrasSuppressed).toBe(true);
        // Ruling T15-halo-slow (spec §15): the halo goes with the lines; the rim and emissive stay.
        expect(extras(context)).toHaveLength(0);
        expect((surfaceOf(context).material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
        // Restyling is not an appearance change: still off. (Owner R25-B1: an opacity restyle, was a wireframe round trip.)
        setSurfaceStyle(context, { ...context.surfaceStyle, opacity: 0.5 });
        setAppearance(context, glow);
        expect(extras(context)).toHaveLength(0);
        // Ruling R22a: a showAxes change (was a scheme change) is the new appearance here.
        setAppearance(context, { ...glow, showAxes: false });
        expect(context.extrasSuppressed).toBe(false);
        expect(context.frameGuard).toEqual({ ema: 16, frames: 0 });
        expect(extra(context, 'lines')).toBeDefined();
        expect(extra(context, 'halo')).toBeDefined();
    });

    // Task 16d item 10: the latch is reported up (OrbitalViewer puts it in the store), so Advanced appearance can say
    // why its Halo and Mesh rows do nothing -- and that it has lifted.
    it('reports the latch when the guard sets it and when a new appearance lifts it', async () => {
        const context = buildContext();
        context.frameGuard = { ema: 16, frames: 0 };
        const reported = jest.fn();
        context.onExtrasSuppressedChange = reported;
        await drawOrbital(context);
        setAppearance(context, glow);
        reported.mockClear();
        for (let i = 0; i < 300; i++) guardGlowExtras(context, 40);
        expect(reported.mock.calls).toEqual([[true]]);
        setAppearance(context, { ...glow, showAxes: false });
        expect(reported.mock.calls).toEqual([[true], [false]]);
        // A new appearance with nothing latched says nothing.
        setAppearance(context, glow);
        expect(reported.mock.calls).toEqual([[true], [false]]);
    });

    // Ruling T15-halo-slow: on a phone (lowPower) neither the halo nor the lines, on the drawn orbital too.
    it('draws no halo and no lines on a phone, but keeps the rim', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, { ...glow, lowPower: true });
        expect(extras(context)).toHaveLength(0);
        expect((surfaceOf(context).material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
    });

    // Ruling T15-glowcover: what Glow dims the lights for must glow -- the combination overlay and the composition lobes too.
    const lights = () => ({ ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) });
    const glowOf = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).userData;
    const shaderOf = (mesh: THREE.Mesh) => {
        const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
        (mesh.material as THREE.MeshStandardMaterial).onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
        return shader;
    };

    // Ruling R22a: Solid is the one look without Glow (Classic is gone).
    it('glows a combination overlay (emissive, own-tint rim) under Glow, and not under Solid', async () => {
        const context = buildContext();
        context.lights = lights();
        setAppearance(context, glow);
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const pending = updateFieldInScene(context, fieldRequestFor({ kind: 'hybrid', hybrid: 'sp', member: 'all' }, 0.9)!);
        const piece = (offset: number): MeshData => ({ ...meshData(), positions: [[offset, 0, 0], [offset + 1, 0, 0], [offset, 1, 0]] });
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [piece(0), piece(5)] } });
        await pending;
        expect(context.currentOrbitalGroup!.userData.isFieldOverlay).toBe(true);
        const overlay = surfaceOf(context);
        expect(glowOf(overlay).glow).toBe(true);
        // Ruling R20a-3: the tuned emissive and lights (were the literals 0.18 and 0.35).
        expect(glowOf(overlay).glowUniforms.qlEmissive.value).toBeCloseTo(GLOW_TUNING[glow.theme].emissive);
        expect(shaderOf(overlay).vertexShader).toContain('vQlPhase = 0.0;');
        expect(context.lights.ambient.intensity).toBe(GLOW_LIGHTS.ambient);
        setAppearance(context, { ...glow, finish: 'solid' });
        expect(glowOf(overlay).glow).toBe(false);
        expect(context.lights.ambient.intensity).toBe(0.5);
        setAppearance(context, glow);
        expect(glowOf(overlay).glow).toBe(true);
    });

    // Ruling R22a: Solid is the one look without Glow (Classic is gone).
    it('glows a shell\'s composition lobes under Glow, and not under Solid; the shell view alone keeps today\'s lights', () => {
        const context = buildContext();
        context.lights = lights();
        setAppearance(context, glow);
        updateAtomViewInScene(context, {
            contourRadius: 4, shellEmphasis: new Float32Array([0.1, 0.4, 1, 0.3, 0.05]), rMin: 0.1, dx: 0.5, size: 5, rMax: 0.1 * Math.exp(2),
        });
        expect(context.lights.ambient.intensity).toBe(0.5);
        const components = [{ n: 2, l: 1, ml: 0, occupancyFraction: 1, colorIndex: 1 }, { n: 2, l: 1, ml: 1, occupancyFraction: 1, colorIndex: 1 }];
        const lobe = { positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]] };
        attachShellCompositionLobes(context, context.requestCounter, components, [lobe, lobe]);
        const lobes: THREE.Mesh[] = [];
        context.currentOrbitalGroup!.traverse(o => { if (o instanceof THREE.Mesh && o.userData.lobe) lobes.push(o); });
        expect(lobes).toHaveLength(2);
        lobes.forEach(mesh => {
            expect(glowOf(mesh).glow).toBe(true);
            // Ruling R20a-3: the tuned emissive and lights (were the literals 0.18 and 0.35).
            expect(glowOf(mesh).glowUniforms.qlEmissive.value).toBeCloseTo(GLOW_TUNING[glow.theme].emissive);
        });
        expect(context.lights.ambient.intensity).toBe(GLOW_LIGHTS.ambient);
        setAppearance(context, { ...glow, finish: 'solid' });
        lobes.forEach(mesh => expect(glowOf(mesh).glow).toBe(false));
        expect(context.lights.ambient.intensity).toBe(0.5);
        setAppearance(context, glow);
        lobes.forEach(mesh => expect(glowOf(mesh).glow).toBe(true));
    });

    it('keeps today\'s lights for a ball-and-stick on its own under Glow, with the atoms\' 0.15 rim', () => {
        const context = buildContext();
        context.lights = lights();
        const oxygen = new THREE.MeshStandardMaterial();
        oxygen.userData.Z = 8;
        const overlay = new THREE.Group();
        overlay.add(new THREE.Mesh(new THREE.SphereGeometry(1), oxygen));
        setMoleculeOverlay(context, overlay);
        setAppearance(context, glow);
        expect([context.lights.ambient.intensity, context.lights.key.intensity, context.lights.fill.intensity]).toEqual([0.5, 0.8, 0.35]);
        expect(oxygen.userData.glow).toBe(true);
        expect(oxygen.userData.glowUniforms.qlRimStrength.value).toBeCloseTo(0.15);
        expect(oxygen.userData.glowUniforms.qlEmissive.value).toBe(0);
    });
});

// Task 16b ("Advanced appearance"): a slider moves the viewer's own Glow values; the main view follows at once,
// through Glow's uniforms only. Ruling T15-b: the ESP map's rim is never whitened.
describe('the viewer\'s own Glow values on the drawn surface (Task 16b)', () => {
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { (console.log as jest.Mock).mockRestore(); });

    const glow: Appearance = { theme: 'dark', finish: 'glow', showAxes: true, lowPower: false };
    const uniformsOf = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).userData.glowUniforms;
    const extraOf = (context: VisualizerContext, kind: 'halo' | 'lines') =>
        (context.currentOrbitalGroup!.children.find(child => child.userData.isGlowExtra === kind) as THREE.Mesh).material as THREE.ShaderMaterial;

    it('follows a slider through the uniforms alone: no repaint, no recompile, no new extras, no fresh frame-time look', async () => {
        const context = buildContext();
        context.frameGuard = { ema: 16, frames: 0 };
        context.lights = { ambient: new THREE.AmbientLight(0xffffff, 0.5), key: new THREE.DirectionalLight(0xffffff, 0.8), fill: new THREE.DirectionalLight(0xffffff, 0.35) };
        await drawOrbital(context);
        setAppearance(context, glow);
        const surface = surfaceOf(context);
        const material = surface.material as THREE.MeshStandardMaterial;
        const [halo, lines] = [extraOf(context, 'halo'), extraOf(context, 'lines')];
        const version = material.version;
        const colours = surface.geometry.getAttribute('color') as THREE.BufferAttribute;
        const colourVersion = colours.version;
        const repaint = jest.spyOn(surface.userData, 'applyAppearance');
        context.frameGuard.frames = 90;

        setAppearance(context, { ...glow, glow: { rimStrength: 1.2, rimPower: 2, emissive: 0.3, haloOpacity: 0.3, linesOpacity: 0.1, linesWhiten: 0.5 } });
        expect(uniformsOf(surface).qlRimStrength.value).toBeCloseTo(1.2);
        expect(uniformsOf(surface).qlRimPower.value).toBeCloseTo(2);
        expect(uniformsOf(surface).qlEmissive.value).toBeCloseTo(0.3);
        expect(halo.uniforms.qlHaloOpacity.value).toBeCloseTo(0.3);
        expect(lines.uniforms.qlLinesOpacity.value).toBeCloseTo(0.1);
        expect(lines.uniforms.qlLinesWhiten.value).toBeCloseTo(0.5);
        expect([extraOf(context, 'halo'), extraOf(context, 'lines')]).toEqual([halo, lines]);
        expect(material.version).toBe(version);
        expect(colours.version).toBe(colourVersion);
        expect(repaint).not.toHaveBeenCalled();
        expect(context.frameGuard.frames).toBe(90);
        expect(context.lights.ambient.intensity).toBe(GLOW_TUNING.dark.lights.ambient);

        // Reset to default: the owner's values again, exactly.
        setAppearance(context, glow);
        expect(uniformsOf(surface).qlRimStrength.value).toBe(GLOW_TUNING.dark.rimStrength);
        expect(halo.uniforms.qlHaloOpacity.value).toBe(GLOW_TUNING.dark.halo.opacity);
        expect(lines.uniforms.qlLinesOpacity.value).toBe(GLOW_TUNING.dark.lines.opacity);
        expect(material.version).toBe(version);
    });

    it('takes the viewer\'s values for a theme together with the theme', async () => {
        const context = buildContext();
        await drawOrbital(context);
        setAppearance(context, { ...glow, glow: { rimStrength: 1.2 } });
        setAppearance(context, { ...glow, theme: 'light', glow: { rimStrength: 0.4 } });
        expect(uniformsOf(surfaceOf(context)).qlRimStrength.value).toBeCloseTo(0.4);
        expect(uniformsOf(surfaceOf(context)).qlInk.value).toBe(1);
    });

    // Ruling T15-b (science): on an ESP map white means ≈ 0 potential, so its rim is never whitened -- in the
    // tuned look or with the viewer's own setting; the density's surface keeps the tuned 0.51 or the viewer's value.
    it('never whitens the ESP map\'s rim; the density keeps the tuned or the viewer\'s whitening', () => {
        const context = buildContext();
        setAppearance(context, glow);
        presentFieldMesh(context, meshData(), { vertexColors: new Float32Array(9).fill(0.5), boxRMax: 20 });
        expect(uniformsOf(surfaceOf(context)).qlOwnRimWhiten.value).toBe(0);
        setAppearance(context, { ...glow, glow: { ownRimWhiten: 0.6 } });
        expect(uniformsOf(surfaceOf(context)).qlOwnRimWhiten.value).toBe(0);
        presentFieldMesh(context, meshData(), { boxRMax: 20 });
        expect(uniformsOf(surfaceOf(context)).qlOwnRimWhiten.value).toBe(0.6);
        setAppearance(context, glow);
        expect(uniformsOf(surfaceOf(context)).qlOwnRimWhiten.value).toBe(GLOW_TUNING.dark.ownRimWhiten);
    });
});
