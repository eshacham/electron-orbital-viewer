import * as THREE from 'three';
import {
    applyGlow, attachGlowExtras, clampGlow, effectiveGlow, fadeGlowExtras, GLOW_CAPS, GLOW_KNOBS, GLOW_TUNING, glowDefaults, glowLightsFor,
    glowSettingsFor, SOLID_LIGHTS, tuneThumbnailGlow, updateFrameGuard,
} from '../src/orbital_glow';
import { INITIAL_APPEARANCE, type Appearance } from '../src/design/appearance';
import { marchingCubes } from '../src/marching_cubes';

const glowDark = { theme: 'dark' as const, finish: 'glow' as const, showAxes: true, lowPower: false };
const shaderOf = (material: THREE.MeshStandardMaterial) => {
    const shader = {
        uniforms: {} as Record<string, THREE.IUniform>,
        vertexShader: THREE.ShaderLib.physical.vertexShader,
        fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return shader;
};
const surfaceIn = (group: THREE.Group) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
    group.add(surface);
    return surface;
};

describe('Glow (spec §11.2)', () => {
    // Ruling R22a: Classic (no Glow) is gone; the Solid finish is the only look without it.
    it('is off for the Solid finish; additive in Deep Space, an ink rim in Light Clean', () => {
        expect(glowSettingsFor(INITIAL_APPEARANCE)).toBeNull();
        expect(glowSettingsFor({ ...glowDark, finish: 'solid' })).toBeNull();
        expect(glowSettingsFor(glowDark)!.mode).toBe('additive');
        expect(glowSettingsFor({ ...glowDark, theme: 'light' })!.mode).toBe('ink');
        expect(glowSettingsFor(glowDark)!.rimPositive.getHexString()).toBe(new THREE.Color('#FFC59A').getHexString());
    });

    // Ruling R20a-3: the emissive and the rim's strength and width are tuned values (GLOW_TUNING, pinned below).
    it('injects a same-phase Fresnel rim and the tuned emissive term, and updates them without recompiling', () => {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        applyGlow(material, glowSettingsFor(glowDark));
        const shader = shaderOf(material);
        expect(shader.vertexShader).toContain('vQlPhase = phaseSign;');
        expect(shader.fragmentShader).toMatch(/qlRim[\s\S]*#include <opaque_fragment>/);
        expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * qlEmissive;');
        expect(shader.uniforms.qlEmissive.value).toBeCloseTo(GLOW_TUNING.dark.emissive);
        expect(shader.uniforms.qlRimPower.value).toBeCloseTo(GLOW_TUNING.dark.rimPower);
        expect(shader.fragmentShader).toContain('normalize(vViewPosition))), qlRimPower);');
        const version = material.version;
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }));
        expect(material.version).toBe(version);
        expect(shader.uniforms.qlInk.value).toBe(1);
        expect(shader.uniforms.qlEmissive.value).toBeCloseTo(GLOW_TUNING.light.emissive);
        expect(shader.uniforms.qlRimStrength.value).toBeCloseTo(GLOW_TUNING.light.rimStrength);
        applyGlow(material, null);
        expect(material.version).toBeGreaterThan(version);
    });

    // three.js keeps a program per cache key per material, but only the uniforms of the LAST compile:
    // a Glow -> Solid -> Glow round trip reuses the glow program with the plain compile's uniforms.
    it('keeps its uniforms in the plain compile, so Glow -> Solid -> Glow still feeds the rim', () => {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        applyGlow(material, glowSettingsFor(glowDark));
        applyGlow(material, null);
        const plain = shaderOf(material);
        expect(plain.vertexShader).toBe(THREE.ShaderLib.physical.vertexShader);
        expect(plain.fragmentShader).toBe(THREE.ShaderLib.physical.fragmentShader);
        expect(plain.uniforms.qlRimStrength).toBeDefined();
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }));
        expect(plain.uniforms.qlInk.value).toBe(1);
    });

    it('adds the halo in Deep Space only and the mesh lines unless on a phone, sharing the surface geometry', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        const geometry = surface.geometry;
        const extras = () => group.children.filter(child => child.userData.isGlowExtra);
        const options = { radius: 2, clippingPlanes: [], solid: true, extrasAllowed: true };

        attachGlowExtras(group, surface, glowDark, options);
        expect(extras().map(child => child.userData.isGlowExtra).sort()).toEqual(['halo', 'lines']);
        expect(extras().every(child => (child as THREE.Mesh).geometry === geometry)).toBe(true);
        const halo = extras().find(child => child.userData.isGlowExtra === 'halo') as THREE.Mesh;
        // Ruling R20a-3: the halo's push, peak and falloff are the tuned values (radius 2 here).
        expect((halo.material as THREE.ShaderMaterial).uniforms.qlHaloOffset.value).toBeCloseTo(GLOW_TUNING.dark.halo.offset * 2);
        expect((halo.material as THREE.ShaderMaterial).uniforms.qlHaloOpacity.value).toBeCloseTo(GLOW_TUNING.dark.halo.opacity);
        expect((halo.material as THREE.ShaderMaterial).uniforms.qlHaloPower.value).toBeCloseTo(GLOW_TUNING.dark.halo.power);

        attachGlowExtras(group, surface, { ...glowDark, theme: 'light' }, options);
        expect(extras().map(child => child.userData.isGlowExtra)).toEqual(['lines']);
        attachGlowExtras(group, surface, { ...glowDark, lowPower: true }, options);
        expect(extras()).toHaveLength(0);
        attachGlowExtras(group, surface, glowDark, { ...options, solid: false });
        expect(extras()).toHaveLength(0);
        // Ruling R22a: the Solid finish (was Classic here) takes the extras away.
        attachGlowExtras(group, surface, INITIAL_APPEARANCE, options);
        expect(extras()).toHaveLength(0);
        // Spec §15: the halo follows the lines -- once the frame-time guard says no, neither is drawn.
        attachGlowExtras(group, surface, glowDark, { ...options, extrasAllowed: false });
        expect(extras()).toHaveLength(0);
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBe(true);
    });

    // Ruling T15-inkrim: §11.2's ink rim is a DARKER colour -- for a phase-less surface too, never white.
    // Ruling R24-2c (owner-tuned): Deep Space's additive tint is the surface's own colour mixed `ownRimWhiten`
    // of the way to white -- a tuned value (0.51), no longer fixed (A: 0.5, R24-2: 0); Light Clean's ink stays darker.
    it('gives a phase-less surface an own-colour rim: mixed ownRimWhiten towards white in Deep Space, darker ink in Light Clean', () => {
        const material = new THREE.MeshStandardMaterial();
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }), { phased: false });
        const shader = shaderOf(material);
        expect(shader.fragmentShader).toContain('vec3 qlOwnTint = qlInk > 0.5 ? diffuseColor.rgb * 0.5 : mix(diffuseColor.rgb, vec3(1.0), qlOwnRimWhiten);');
        expect(shader.fragmentShader).toContain(': (vQlPhase < -0.5 ? qlRimNegative : qlOwnTint)');
        expect(shader.uniforms.qlInk.value).toBe(1);
        applyGlow(material, glowSettingsFor(glowDark), { phased: false });
        expect(shader.uniforms.qlOwnRimWhiten.value).toBeCloseTo(GLOW_TUNING.dark.ownRimWhiten);
        expect(shader.uniforms.qlInk.value).toBe(0);
    });

    // A phase-less mesh has no phaseSign attribute; reading an undeclared one would take whatever generic value WebGL holds.
    it('does not declare phaseSign on a phase-less mesh, which reads phase 0', () => {
        const material = new THREE.MeshStandardMaterial();
        applyGlow(material, glowSettingsFor(glowDark), { phased: false });
        const shader = shaderOf(material);
        expect(shader.vertexShader).not.toContain('phaseSign');
        expect(shader.vertexShader).toContain('vQlPhase = 0.0;');
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        attachGlowExtras(group, surface, glowDark, { radius: 1, clippingPlanes: [], solid: true, extrasAllowed: false });
        expect(shaderOf(surface.material as THREE.MeshStandardMaterial).vertexShader).not.toContain('phaseSign');
        surface.geometry.setAttribute('phaseSign', new THREE.Float32BufferAttribute([1, -1, 1], 1));
        const phased = new THREE.Mesh(surface.geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
        attachGlowExtras(group, phased, glowDark, { radius: 1, clippingPlanes: [], solid: true, extrasAllowed: false });
        expect(shaderOf(phased.material as THREE.MeshStandardMaterial).vertexShader).toContain('vQlPhase = phaseSign;');
    });

    // The halo pushes along MINUS the normal and draws front faces: on the mesher's surfaces the
    // normals point into the lobe. If marching_cubes.ts ever winds the other way, this fails first.
    it('relies on the mesher\'s normals pointing into the lobe', () => {
        const res = 16, side = res + 1, origin = -2, step = 4 / res;
        const samples = new Float64Array(side ** 3);
        for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
            const [x, y, z] = [origin + i * step, origin + j * step, origin + k * step];
            samples[(i * side + j) * side + k] = 1 - (x * x + y * y + z * z); // > 0 inside, as |ψ|² − iso is
        }
        const mesh = marchingCubes(res, samples, origin, step);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.flat(), 3));
        geometry.setIndex(mesh.cells.flat());
        geometry.computeVertexNormals();
        const [p, n] = [geometry.getAttribute('position'), geometry.getAttribute('normal')];
        for (let v = 0; v < p.count; v++) {
            expect(p.getX(v) * n.getX(v) + p.getY(v) * n.getY(v) + p.getZ(v) * n.getZ(v)).toBeLessThan(0);
        }
        const group = new THREE.Group();
        const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
        group.add(surface);
        attachGlowExtras(group, surface, glowDark, { radius: 1, clippingPlanes: [], solid: true, extrasAllowed: true });
        const halo = (group.children.find(child => child.userData.isGlowExtra === 'halo') as THREE.Mesh).material as THREE.ShaderMaterial;
        expect(halo.vertexShader).toContain('position - normal * qlHaloOffset');
        expect(halo.side).toBe(THREE.FrontSide);
    });

    // §11.1 "Material": Wireframe = today's.
    it('leaves a wireframe surface today\'s material, with no rim', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        attachGlowExtras(group, surface, glowDark, { radius: 2, clippingPlanes: [], solid: false, extrasAllowed: true });
        expect((surface.material as THREE.MeshStandardMaterial).userData.glow).toBeFalsy();
    });

    // Ruling DC3: re-attaching what is already there keeps it (no shader rebuilt per slider tick).
    it('keeps the extras it already has, disposing nothing', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        const options = { radius: 2, clippingPlanes: [], solid: true, extrasAllowed: true };
        attachGlowExtras(group, surface, glowDark, options);
        const before = group.children.filter(child => child.userData.isGlowExtra);
        const disposals = before.map(child => jest.spyOn((child as THREE.Mesh).material as THREE.Material, 'dispose'));
        attachGlowExtras(group, surface, glowDark, options);
        // Ruling R22a: a showAxes change (was a scheme change) is another appearance with the same Glow.
        attachGlowExtras(group, surface, { ...glowDark, showAxes: false }, options);
        expect(group.children.filter(child => child.userData.isGlowExtra)).toEqual(before);
        disposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
    });

    it('fades the halo and the lines with their surface, and new extras join at the current fade', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        const options = { radius: 2, clippingPlanes: [], solid: true, extrasAllowed: true };
        // Light Clean: lines only.
        attachGlowExtras(group, surface, { ...glowDark, theme: 'light' }, options);
        const haloOpacity = () => ((group.children.find(c => c.userData.isGlowExtra === 'halo') as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.qlHaloOpacity.value;
        // Ruling R20a-3: the lines are a shader material now; their alpha is a uniform.
        const linesOpacity = () => ((group.children.find(c => c.userData.isGlowExtra === 'lines') as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.qlLinesOpacity.value;
        fadeGlowExtras(group, 0);
        expect(linesOpacity()).toBe(0);
        // Deep Space mid-fade: the halo joins at the fade, not at full strength.
        attachGlowExtras(group, surface, glowDark, options);
        expect(haloOpacity()).toBe(0);
        // Ruling R20a-3: half and full of the tuned strengths; the lines kept from Light Clean now wear Deep Space's.
        fadeGlowExtras(group, 0.5);
        expect(haloOpacity()).toBeCloseTo(GLOW_TUNING.dark.halo.opacity / 2);
        expect(linesOpacity()).toBeCloseTo(GLOW_TUNING.dark.lines.opacity / 2);
        fadeGlowExtras(group, 1);
        expect(haloOpacity()).toBeCloseTo(GLOW_TUNING.dark.halo.opacity);
        expect(linesOpacity()).toBeCloseTo(GLOW_TUNING.dark.lines.opacity);
    });

    // Ruling R20a-3: the concept look, tuned live (Task 20a) -- pinned so a change is deliberate.
    it('pins the tuned Glow values', () => {
        // Fix round 1 of Task 20a: lights per theme; Light Clean shaded by its lights.
        // Ruling R24-2c (owner-tuned on the R24-2b panel, 2026-10-19): the values below are the owner's own --
        // soft same-hue edges, no white wash (rim, emissive, lines, halo and ownRimWhiten from the panel's JSON;
        // R24-2 had dark rim 0.5, emissive 0.1, lines 0.05/0, halo 0.3, light emissive 0.05, lines 0.1/0.2).
        expect(GLOW_TUNING).toEqual({
            dark: {
                emissive: 0.11, rimStrength: 0.75, rimPower: 3,
                lines: { opacity: 0.02, whiten: 0.2, additive: true },
                // Ruling R23c-2 (owner): a third of the offset (band width); R24-2c: opacity 0.1 (owner).
                halo: { opacity: 0.1, offset: 0.027, power: 1 },
                wash: 0,
                ownRimWhiten: 0.51,
                lights: { ambient: 0.15, key: 0.35, fill: 0.15 },
                // Ruling R20d: the tiles' own rig and strengths -- a little stronger at 72 px, fainter lines at 64³.
                // R24-2c: scaled with the owner's view values by the same ratios (rim ×1.25, halo ×5/3, lines ×0.6).
                thumb: { lights: { ambient: 0.2, key: 0.7, fill: 0.2 }, rimStrength: 0.94, haloOpacity: 0.17, linesOpacity: 0.012 },
            },
            light: {
                emissive: 0.21, rimStrength: 1, rimPower: 1.5,
                lines: { opacity: 0.06, whiten: 0.12, additive: false },
                wash: 0,
                // Ink mode never reads it: Light Clean's phase-less rim is its own colour, darker.
                ownRimWhiten: 0,
                lights: { ambient: 1.0, key: 1.0, fill: 0.4 },
                // R24-2c: lines scaled with the view's (×0.35, as 0.035 was to 0.1); the rim (×1.15) is unchanged.
                thumb: { lights: { ambient: 1.0, key: 1.1, fill: 0.4 }, rimStrength: 1.15, linesOpacity: 0.021 },
            },
        });
        expect(glowLightsFor('dark')).toBe(GLOW_TUNING.dark.lights);
        expect(glowLightsFor('light')).toBe(GLOW_TUNING.light.lights);
    });

    // Fix round 1 of Task 20a: a ball-and-stick takes no Glow of its own in Light Clean (atomRimFor is null),
    // so the lights a glowing scene sets there must not leave it darker than Solid would.
    it('never lights a glowing Light Clean scene below Solid, so its atoms are not underlit', () => {
        const lights = glowLightsFor('light');
        expect(lights.ambient).toBeGreaterThanOrEqual(SOLID_LIGHTS.ambient);
        expect(lights.key).toBeGreaterThanOrEqual(SOLID_LIGHTS.key);
        expect(lights.fill).toBeGreaterThanOrEqual(SOLID_LIGHTS.fill);
        // Ruling R24-2c: the owner tuned Light Clean's emissive to 0.21 (was 0.05); the lights still do the shading,
        // the emissive stays a minor term (bound was < 0.2).
        expect(glowSettingsFor({ ...glowDark, theme: 'light' })!.emissive).toBeLessThan(0.25);
    });

    // Fix round 1 of Task 20a: Light Clean inks a thin outline in the body's own phase.
    // Ruling R24-2 (owner, "too much white glare"): the body is no longer washed towards white -- wash is 0 in
    // both themes, so a lobe reads as its own science colour (was 0.7 in Light Clean, the main source of the glare).
    it('inks Light Clean\'s outline without washing its body towards white; neither theme washes', () => {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }));
        const shader = shaderOf(material);
        expect(shader.fragmentShader).toContain('mix(mix(outgoingLight, vec3(1.0), qlWash * qlRim), qlRimColour, qlRim * qlRim * qlRim * qlRimStrength)');
        expect(shader.uniforms.qlWash.value).toBe(0);
        applyGlow(material, glowSettingsFor(glowDark));
        expect(shader.uniforms.qlWash.value).toBe(0);
    });

    // Ruling R20a-3: lines lighter than their lobe in its own hue (never the other phase's),
    // added as light in Deep Space and painted over on white; a kept extra follows a theme switch.
    it('draws the mesh lines in their own phase, whitened, additive in Deep Space and painted in Light Clean', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        const options = { radius: 2, clippingPlanes: [], solid: true, extrasAllowed: true };
        attachGlowExtras(group, surface, glowDark, options);
        const lines = group.children.find(c => c.userData.isGlowExtra === 'lines') as THREE.Mesh;
        const material = lines.material as THREE.ShaderMaterial;
        expect(material.wireframe).toBe(true);
        expect(material.vertexShader).toContain('mix(color, vec3(1.0), qlLinesWhiten)');
        expect(material.blending).toBe(THREE.AdditiveBlending);
        expect(material.uniforms.qlLinesWhiten.value).toBeCloseTo(GLOW_TUNING.dark.lines.whiten);
        attachGlowExtras(group, surface, { ...glowDark, theme: 'light' }, options);
        expect(group.children.find(c => c.userData.isGlowExtra === 'lines')).toBe(lines);
        expect(material.blending).toBe(THREE.NormalBlending);
        expect(material.uniforms.qlLinesOpacity.value).toBeCloseTo(GLOW_TUNING.light.lines.opacity);
        expect(material.uniforms.qlLinesWhiten.value).toBeCloseTo(GLOW_TUNING.light.lines.whiten);
        // Edge-on the lines fade, leaving the outline to the rim; the halo is soft at both edges.
        expect(material.fragmentShader).toContain('qlLinesOpacity * facing');
        attachGlowExtras(group, surface, glowDark, options);
        const halo = group.children.find(c => c.userData.isGlowExtra === 'halo') as THREE.Mesh;
        expect((halo.material as THREE.ShaderMaterial).fragmentShader).toContain('pow(facing, qlHaloPower) * (1.0 - facing)');
    });

    it('turns the lines off once frames average over 20 ms (ruling R10)', () => {
        const state = { ema: 16, frames: 0 };
        let suppress = false;
        for (let i = 0; i < 200; i++) suppress = updateFrameGuard(state, 16) || suppress;
        expect(suppress).toBe(false);
        for (let i = 0; i < 200; i++) suppress = updateFrameGuard(state, 30) || suppress;
        expect(suppress).toBe(true);
    });

    // A hitch -- a new orbital meshed on the main thread, a shader compile, a tab coming back -- is not a slow device.
    it('does not latch on one long frame at 60 Hz', () => {
        const state = { ema: 16, frames: 0 };
        let suppress = false;
        for (let i = 0; i < 200; i++) suppress = updateFrameGuard(state, 16.7) || suppress;
        suppress = updateFrameGuard(state, 400) || suppress;
        for (let i = 0; i < 10; i++) suppress = updateFrameGuard(state, 16.7) || suppress;
        expect(suppress).toBe(false);
    });
});

// Task 16b ("Advanced appearance", owner R24-adv): the viewer's own Glow values on top of GLOW_TUNING.
describe('Glow with the viewer\'s own values (Task 16b)', () => {
    const extraOf = (group: THREE.Group, kind: 'halo' | 'lines') =>
        (group.children.find(child => child.userData.isGlowExtra === kind) as THREE.Mesh).material as THREE.ShaderMaterial;

    // The caps keep the phase colours recognisable: each range holds the owner's tuned value (R24-2c), on its step.
    it('caps every knob around the owner\'s tuned values, which sit on each knob\'s step', () => {
        expect(GLOW_CAPS).toEqual({
            rimStrength: { min: 0, max: 1.5, step: 0.01, darkOnly: false },
            rimPower: { min: 1, max: 5, step: 0.1, darkOnly: false },
            emissive: { min: 0, max: 0.35, step: 0.01, darkOnly: false },
            haloOpacity: { min: 0, max: 0.4, step: 0.01, darkOnly: true },
            linesOpacity: { min: 0, max: 0.15, step: 0.005, darkOnly: false },
            linesWhiten: { min: 0, max: 0.6, step: 0.01, darkOnly: false },
            ownRimWhiten: { min: 0, max: 0.6, step: 0.01, darkOnly: true },
        });
        for (const theme of ['dark', 'light'] as const) {
            const defaults = glowDefaults(theme);
            for (const knob of GLOW_KNOBS) expect(clampGlow(knob, defaults[knob])).toBe(defaults[knob]);
        }
        expect(glowDefaults('dark')).toEqual({ rimStrength: 0.75, rimPower: 3, emissive: 0.11, haloOpacity: 0.1, linesOpacity: 0.02, linesWhiten: 0.2, ownRimWhiten: 0.51 });
        expect(effectiveGlow('light', { haloOpacity: 0.3, ownRimWhiten: 0.4, rimStrength: 9 })).toEqual({ ...glowDefaults('light'), rimStrength: 1.5 });
    });

    it('draws with the overrides: rim, width, brightness and own-rim whitening as uniforms, without recompiling', () => {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        applyGlow(material, glowSettingsFor(glowDark), { phased: false });
        const shader = shaderOf(material);
        const version = material.version;
        applyGlow(material, glowSettingsFor({ ...glowDark, glow: { rimStrength: 1.2, rimPower: 2, emissive: 0.3, ownRimWhiten: 0.2 } }), { phased: false });
        expect(material.version).toBe(version);
        expect(shader.uniforms.qlRimStrength.value).toBeCloseTo(1.2);
        expect(shader.uniforms.qlRimPower.value).toBeCloseTo(2);
        expect(shader.uniforms.qlEmissive.value).toBeCloseTo(0.3);
        expect(shader.uniforms.qlOwnRimWhiten.value).toBeCloseTo(0.2);
        // Body tint and edge wash are not knobs: the wash stays the tuned 0 whatever is asked.
        applyGlow(material, glowSettingsFor({ ...glowDark, glow: { wash: 0.9 } as never }), { phased: false });
        expect(shader.uniforms.qlWash.value).toBe(0);
        expect(shader.uniforms.qlRimStrength.value).toBeCloseTo(GLOW_TUNING.dark.rimStrength);
    });

    // Ruling T15-b (science): on an ESP map white means a potential of about 0, so its rim is never whitened.
    it('never whitens an ESP map\'s rim, whatever the setting; a density keeps the tuned or chosen value', () => {
        expect(glowSettingsFor(glowDark, { esp: true })!.ownRimWhiten).toBe(0);
        expect(glowSettingsFor({ ...glowDark, glow: { ownRimWhiten: 0.6 } }, { esp: true })!.ownRimWhiten).toBe(0);
        expect(glowSettingsFor(glowDark)!.ownRimWhiten).toBe(0.51);
        expect(glowSettingsFor({ ...glowDark, glow: { ownRimWhiten: 0.3 } })!.ownRimWhiten).toBe(0.3);
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        attachGlowExtras(group, surface, { ...glowDark, glow: { ownRimWhiten: 0.6 } }, { radius: 1, clippingPlanes: [], solid: true, extrasAllowed: false, esp: true });
        expect((surface.material as THREE.MeshStandardMaterial).userData.glowUniforms.qlOwnRimWhiten.value).toBe(0);
        attachGlowExtras(group, surface, { ...glowDark, glow: { ownRimWhiten: 0.6 } }, { radius: 1, clippingPlanes: [], solid: true, extrasAllowed: false });
        expect((surface.material as THREE.MeshStandardMaterial).userData.glowUniforms.qlOwnRimWhiten.value).toBe(0.6);
    });

    // Task 16d item 14 (16b review M5): a halo or mesh lines set to 0 are not drawn at all -- no additive pass, and
    // nothing for the frame-time guard to time -- and come back when the value does.
    it('draws no halo or mesh lines whose strength is 0, and brings them back above it', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        const kinds = () => group.children.filter(child => child.userData.isGlowExtra).map(child => child.userData.isGlowExtra).sort();
        const options = { radius: 2, clippingPlanes: [], solid: true, extrasAllowed: true };
        attachGlowExtras(group, surface, { ...glowDark, glow: { haloOpacity: 0 } }, options);
        expect(kinds()).toEqual(['lines']);
        attachGlowExtras(group, surface, { ...glowDark, glow: { linesOpacity: 0 } }, options);
        expect(kinds()).toEqual(['halo']);
        attachGlowExtras(group, surface, { ...glowDark, glow: { haloOpacity: 0, linesOpacity: 0 } }, options);
        expect(kinds()).toEqual([]);
        attachGlowExtras(group, surface, glowDark, options);
        expect(kinds()).toEqual(['halo', 'lines']);
    });

    it('retunes the halo and lines it keeps, in place, and fades them from the viewer\'s strengths', () => {
        const group = new THREE.Group();
        const surface = surfaceIn(group);
        const options = { radius: 2, clippingPlanes: [], solid: true, extrasAllowed: true };
        attachGlowExtras(group, surface, glowDark, options);
        const [halo, lines] = [extraOf(group, 'halo'), extraOf(group, 'lines')];
        const disposals = [halo, lines].map(material => jest.spyOn(material, 'dispose'));
        attachGlowExtras(group, surface, { ...glowDark, glow: { haloOpacity: 0.3, linesOpacity: 0.1, linesWhiten: 0.5 } }, options);
        expect([extraOf(group, 'halo'), extraOf(group, 'lines')]).toEqual([halo, lines]);
        disposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
        expect(halo.uniforms.qlHaloOpacity.value).toBeCloseTo(0.3);
        expect(lines.uniforms.qlLinesOpacity.value).toBeCloseTo(0.1);
        expect(lines.uniforms.qlLinesWhiten.value).toBeCloseTo(0.5);
        fadeGlowExtras(group, 0.5);
        expect(halo.uniforms.qlHaloOpacity.value).toBeCloseTo(0.15);
        expect(lines.uniforms.qlLinesOpacity.value).toBeCloseTo(0.05);
    });

    // R24-2c: a tile is "a little stronger at 72 px" than the view; with the viewer's values it keeps that ratio.
    it('gives a tile the viewer\'s values at the tiles\' own ratios, and exactly the tuned tile values with none', () => {
        const tile = (appearance: Appearance) => {
            const group = new THREE.Group();
            const surface = surfaceIn(group);
            attachGlowExtras(group, surface, appearance, { radius: 1, clippingPlanes: [], solid: true, extrasAllowed: true });
            tuneThumbnailGlow(group, surface, appearance);
            return {
                rim: (surface.material as THREE.MeshStandardMaterial).userData.glowUniforms.qlRimStrength.value as number,
                halo: group.children.some(c => c.userData.isGlowExtra === 'halo') ? extraOf(group, 'halo').uniforms.qlHaloOpacity.value as number : undefined,
                lines: extraOf(group, 'lines').uniforms.qlLinesOpacity.value as number,
            };
        };
        expect(tile(glowDark)).toEqual({ rim: GLOW_TUNING.dark.thumb.rimStrength, halo: GLOW_TUNING.dark.thumb.haloOpacity, lines: GLOW_TUNING.dark.thumb.linesOpacity });
        expect(tile({ ...glowDark, theme: 'light' })).toEqual({ rim: GLOW_TUNING.light.thumb.rimStrength, halo: undefined, lines: GLOW_TUNING.light.thumb.linesOpacity });
        const tuned = tile({ ...glowDark, glow: { rimStrength: 1.5, haloOpacity: 0.2, linesOpacity: 0.04 } });
        expect(tuned.rim).toBeCloseTo(GLOW_TUNING.dark.thumb.rimStrength * 2);
        expect(tuned.halo).toBeCloseTo(GLOW_TUNING.dark.thumb.haloOpacity * 2);
        expect(tuned.lines).toBeCloseTo(GLOW_TUNING.dark.thumb.linesOpacity * 2);
        expect(tile({ ...glowDark, glow: { rimStrength: 0 } }).rim).toBe(0);
    });
});
