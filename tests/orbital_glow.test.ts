import * as THREE from 'three';
import { applyGlow, attachGlowExtras, fadeGlowExtras, GLOW_TUNING, glowLightsFor, glowSettingsFor, SOLID_LIGHTS, updateFrameGuard } from '../src/orbital_glow';
import { INITIAL_APPEARANCE } from '../src/design/appearance';
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
    it('gives a phase-less surface an own-tint rim: lighter additive in Deep Space, darker ink in Light Clean', () => {
        const material = new THREE.MeshStandardMaterial();
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }), { phased: false });
        const shader = shaderOf(material);
        expect(shader.fragmentShader).toContain('vec3 qlOwnTint = qlInk > 0.5 ? diffuseColor.rgb * 0.5 : mix(diffuseColor.rgb, vec3(1.0), 0.5);');
        expect(shader.fragmentShader).toContain(': (vQlPhase < -0.5 ? qlRimNegative : qlOwnTint)');
        expect(shader.uniforms.qlInk.value).toBe(1);
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
        // Fix round 1 of Task 20a: lights per theme; Light Clean shaded by its lights (no emissive crutch),
        // paler towards the edge (wash) with a thin ink outline, as concept Option 2.
        expect(GLOW_TUNING).toEqual({
            dark: {
                emissive: 0.1, rimStrength: 1.0, rimPower: 1.8,
                lines: { opacity: 0.05, whiten: 0.3, additive: true },
                // Ruling R23c-2 (owner): the halo read as too thick -- a third of the
                // offset (band width) and half the opacity (peak alpha).
                halo: { opacity: 0.3, offset: 0.027, power: 1 },
                wash: 0,
                lights: { ambient: 0.15, key: 0.35, fill: 0.15 },
                // Ruling R20d: the strip tiles' own rig and strengths -- a brighter key, rim and halo, fainter lines at 64³.
                // Ruling R23c-2: haloOpacity halved alongside the main view's halo.opacity above.
                thumb: { lights: { ambient: 0.2, key: 0.7, fill: 0.2 }, rimStrength: 1.25, haloOpacity: 0.5, linesOpacity: 0.03 },
            },
            light: {
                emissive: 0.05, rimStrength: 1.0, rimPower: 1.5,
                lines: { opacity: 0.1, whiten: 0.85, additive: false },
                wash: 0.7,
                lights: { ambient: 1.0, key: 1.0, fill: 0.4 },
                thumb: { lights: { ambient: 1.0, key: 1.1, fill: 0.4 }, rimStrength: 1.15, linesOpacity: 0.035 },
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
        expect(glowSettingsFor({ ...glowDark, theme: 'light' })!.emissive).toBeLessThan(0.2);
    });

    // Fix round 1 of Task 20a: Light Clean's body washes towards white at the edge (never another hue), inked at the outline.
    it('washes Light Clean\'s body paler towards its edge and inks a thin outline; Deep Space has no wash', () => {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        applyGlow(material, glowSettingsFor({ ...glowDark, theme: 'light' }));
        const shader = shaderOf(material);
        expect(shader.fragmentShader).toContain('mix(mix(outgoingLight, vec3(1.0), qlWash * qlRim), qlRimColour, qlRim * qlRim * qlRim * qlRimStrength)');
        expect(shader.uniforms.qlWash.value).toBeCloseTo(GLOW_TUNING.light.wash);
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
