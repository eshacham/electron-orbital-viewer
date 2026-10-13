import * as THREE from 'three';
import type { Appearance } from './design/appearance';
import { phaseColours } from './design/science';

/**
 * The Glow finish (spec §11.2): the concept's glowing translucent look with
 * the science intact. A Fresnel rim tinted with the SAME phase's colour
 * (never the other's -- that would read as a sign change), an emissive term
 * of 0.18 × the surface colour, and in Deep Space a faint additive halo
 * drawn from the same geometry pushed out 1.5 % along its normals; fine
 * mesh lines at 6 % alpha show the real marching-cubes edges. Light Clean
 * mixes towards a darker "ink" rim, since added light is invisible on white.
 * No bloom (§11.4). Geometry, vertices, cut planes, caps, stencil passes and
 * opacity are never touched: Glow is presentation only.
 */
export interface GlowSettings {
    mode: 'additive' | 'ink';
    rimPositive: THREE.Color;
    rimNegative: THREE.Color;
    emissive: number;
    rimStrength: number;
}

/** §11.1 "Lights": Glow's emissive term carries part of the light; Solid (and Classic) keep today's levels. */
export const GLOW_LIGHTS = { ambient: 0.35, key: 0.6, fill: 0.25 } as const;
export const SOLID_LIGHTS = { ambient: 0.5, key: 0.8, fill: 0.35 } as const;

const HALO_OPACITY = 0.12;
/** The halo's push along the normals, as a fraction of the mesh radius. */
const HALO_OFFSET = 0.015;
const LINES_OPACITY = 0.06;

export function glowSettingsFor(appearance: Appearance): GlowSettings | null {
    if (appearance.finish !== 'glow' || appearance.scheme === 'classic') return null;
    const phase = phaseColours(appearance.theme, appearance.scheme);
    return {
        mode: appearance.theme === 'dark' ? 'additive' : 'ink',
        rimPositive: new THREE.Color(phase.rimPositive!),
        rimNegative: new THREE.Color(phase.rimNegative!),
        emissive: 0.18,
        rimStrength: 0.9,
    };
}

/**
 * Ruling R12 / §11.1 "Ball-and-stick": in Deep Space (non-Classic) the atoms
 * take the same rim at 0.15 and no emissive. An atom has no phase, so the
 * shader tints its rim from the atom's own colour (`vQlPhase` 0) and the two
 * phase rim colours below are never read.
 */
export function atomRimFor(appearance: Appearance): GlowSettings | null {
    if (appearance.theme !== 'dark' || appearance.scheme === 'classic') return null;
    return { mode: 'additive', rimPositive: new THREE.Color(1, 1, 1), rimNegative: new THREE.Color(1, 1, 1), emissive: 0, rimStrength: 0.15 };
}

interface GlowUniforms {
    qlRimPositive: THREE.IUniform<THREE.Color>;
    qlRimNegative: THREE.IUniform<THREE.Color>;
    qlInk: THREE.IUniform<number>;
    qlEmissive: THREE.IUniform<number>;
    qlRimStrength: THREE.IUniform<number>;
}

const VERTEX_HEAD = 'attribute float phaseSign;\nvarying float vQlPhase;\n';
const FRAGMENT_HEAD = 'uniform vec3 qlRimPositive;\nuniform vec3 qlRimNegative;\nuniform float qlInk;\nuniform float qlEmissive;\nuniform float qlRimStrength;\nvarying float vQlPhase;\n';
const RIM = /* glsl */`
    // Fresnel rim, in the surface's own phase (vQlPhase: +1, -1, or 0 where
    // the mesh has no phase -- a density, an ESP map or an atom -- which takes
    // a lighter tint of its own colour).
    float qlRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
    vec3 qlRimColour = vQlPhase > 0.5 ? qlRimPositive : (vQlPhase < -0.5 ? qlRimNegative : mix(diffuseColor.rgb, vec3(1.0), 0.5));
    outgoingLight = qlInk > 0.5
        ? mix(outgoingLight, qlRimColour, qlRim * qlRimStrength)
        : outgoingLight + qlRimColour * qlRim * qlRimStrength;
`;

/**
 * Applies (or removes) the Glow injection in place. Colours and strengths are
 * uniforms, so a theme or scheme change does not recompile; only turning Glow
 * on or off does.
 */
export function applyGlow(material: THREE.MeshStandardMaterial, settings: GlowSettings | null): void {
    if (!settings) {
        if (material.userData.glow) {
            const uniforms = material.userData.glowUniforms as GlowUniforms;
            // The shader is today's, untouched. The uniforms still ride along:
            // three.js keeps each material's programs by cache key but only
            // the uniforms of its latest compile, so turning Glow back on
            // reuses the glow program with THESE uniforms -- without the ql
            // ones the rim would silently stop updating.
            material.onBeforeCompile = shader => { Object.assign(shader.uniforms, uniforms); };
            material.customProgramCacheKey = () => 'ql-plain';
            material.userData.glow = false;
            material.needsUpdate = true;
        }
        return;
    }
    const uniforms: GlowUniforms = material.userData.glowUniforms ?? {
        qlRimPositive: { value: new THREE.Color() },
        qlRimNegative: { value: new THREE.Color() },
        qlInk: { value: 0 },
        qlEmissive: { value: 0 },
        qlRimStrength: { value: 0 },
    };
    uniforms.qlRimPositive.value.copy(settings.rimPositive);
    uniforms.qlRimNegative.value.copy(settings.rimNegative);
    uniforms.qlInk.value = settings.mode === 'ink' ? 1 : 0;
    uniforms.qlEmissive.value = settings.emissive;
    uniforms.qlRimStrength.value = settings.rimStrength;
    material.userData.glowUniforms = uniforms;
    if (material.userData.glow) return;
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvQlPhase = phaseSign;');
        shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * qlEmissive;')
            .replace('#include <opaque_fragment>', `${RIM}\n\t#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'ql-glow';
    material.userData.glow = true;
    material.needsUpdate = true;
}

/**
 * The mesher's normals point INTO the lobe (marching_cubes.ts winds its
 * triangles that way; computeVertexNormals follows the winding, and a test
 * pins it), so "out" is minus the normal. By the same winding the lobe's far
 * wall faces the camera as a front face: drawing front faces of the pushed
 * shell draws its far wall, which shows only as a band past the silhouette.
 */
const HALO_VERTEX = /* glsl */`
    uniform float qlHaloOffset;
    varying vec3 vQlColour;
    #include <clipping_planes_pars_vertex>
    void main() {
        vQlColour = color;
        vec4 mvPosition = modelViewMatrix * vec4(position - normal * qlHaloOffset, 1.0);
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
    }
`;
const HALO_FRAGMENT = /* glsl */`
    uniform float qlHaloOpacity;
    varying vec3 vQlColour;
    #include <clipping_planes_pars_fragment>
    void main() {
        #include <clipping_planes_fragment>
        gl_FragColor = vec4(vQlColour, qlHaloOpacity);
        #include <colorspace_fragment>
    }
`;

type GlowExtra = 'halo' | 'lines';

function removeExtra(group: THREE.Object3D, child: THREE.Object3D): void {
    group.remove(child);
    // The geometry is the surface's own and is disposed with it.
    ((child as THREE.Mesh).material as THREE.Material).dispose();
}

function createExtra(kind: GlowExtra, geometry: THREE.BufferGeometry, radius: number, clippingPlanes: THREE.Plane[], fade: number): THREE.Mesh {
    const material = kind === 'halo'
        ? new THREE.ShaderMaterial({
            vertexShader: HALO_VERTEX,
            fragmentShader: HALO_FRAGMENT,
            uniforms: { qlHaloOffset: { value: HALO_OFFSET * radius }, qlHaloOpacity: { value: HALO_OPACITY * fade } },
            vertexColors: true,
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            clipping: true,
            clippingPlanes,
        })
        : new THREE.MeshBasicMaterial({
            wireframe: true, vertexColors: true, transparent: true, opacity: LINES_OPACITY * fade, depthWrite: false,
            clippingPlanes,
        });
    const mesh = new THREE.Mesh(geometry, material);
    // Unmarked for export (export/surfaces.ts collects marked meshes only); this marks it as Glow's.
    mesh.userData.isGlowExtra = kind;
    return mesh;
}

/**
 * Brings a surface's Glow to `appearance`: the material injection on a solid
 * surface (a wireframe keeps today's material, §11.1); the halo (Deep Space)
 * and the mesh lines only on a solid surface, never on a phone (`lowPower`)
 * and the lines not once the frame-time guard has turned them off. Extras
 * share the surface's geometry.
 *
 * Idempotent (ruling DC3): an extra that is already there and still wanted
 * is kept as it is -- no material disposed, no shader rebuilt -- so calling
 * this again costs nothing.
 */
export function attachGlowExtras(
    group: THREE.Group,
    surface: THREE.Mesh,
    appearance: Appearance,
    options: { radius: number; clippingPlanes: THREE.Plane[]; solid: boolean; linesAllowed: boolean },
): void {
    const settings = options.solid ? glowSettingsFor(appearance) : null;
    applyGlow(surface.material as THREE.MeshStandardMaterial, settings);
    const wanted = new Set<GlowExtra>();
    if (settings && !appearance.lowPower) {
        if (appearance.theme === 'dark') wanted.add('halo');
        if (options.linesAllowed) wanted.add('lines');
    }
    for (const child of [...group.children]) {
        const kind = child.userData.isGlowExtra as GlowExtra | undefined;
        if (!kind) continue;
        if (wanted.has(kind)) wanted.delete(kind);
        else removeExtra(group, child);
    }
    const fade = (group.userData.glowFade as number | undefined) ?? 1;
    for (const kind of wanted) group.add(createExtra(kind, surface.geometry, options.radius, options.clippingPlanes, fade));
}

/**
 * Scales the halo and lines by `fraction` of their full strength, for a
 * cross-fade (ruling DC3): they fade with their surface rather than staying
 * at full strength around a lobe that is not there yet. Remembered on the
 * group so an extra added mid-fade joins at the same strength.
 */
export function fadeGlowExtras(group: THREE.Object3D | null, fraction: number): void {
    if (!group) return;
    group.userData.glowFade = fraction;
    for (const child of group.children) {
        const material = (child as THREE.Mesh).material;
        if (child.userData.isGlowExtra === 'halo') (material as THREE.ShaderMaterial).uniforms.qlHaloOpacity.value = HALO_OPACITY * fraction;
        else if (child.userData.isGlowExtra === 'lines') (material as THREE.Material).opacity = LINES_OPACITY * fraction;
    }
}

export function hasGlowLines(group: THREE.Object3D | null): boolean {
    return Boolean(group?.children.some(child => child.userData.isGlowExtra === 'lines'));
}

/** Takes the mesh lines out (ruling R10's latch); the halo and the rim stay. */
export function removeGlowLines(group: THREE.Object3D | null): void {
    if (!group) return;
    for (const child of [...group.children]) {
        if (child.userData.isGlowExtra === 'lines') removeExtra(group, child);
    }
}

/**
 * Longest frame the average hears, in ms. A one-off hitch -- a new orbital
 * meshed on the main thread, a shader compile, a tab coming back from the
 * background -- is not a slow device: uncapped, one 400 ms frame would push a
 * steady 60 Hz average past 20 ms and latch the lines off for good.
 */
const FRAME_CAP_MS = 50;

/**
 * Ruling R10: a 60-frame exponential moving average of frame time; true once
 * it passes 20 ms (after a 120-frame warm-up, so the first frames -- shader
 * compiles -- do not count).
 */
export function updateFrameGuard(state: { ema: number; frames: number }, dtMs: number): boolean {
    state.frames += 1;
    state.ema += (Math.min(dtMs, FRAME_CAP_MS) - state.ema) / 60;
    return state.frames > 120 && state.ema > 20;
}
