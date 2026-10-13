import * as THREE from 'three';
import type { Appearance } from './design/appearance';
import { phaseColours } from './design/science';

/**
 * The Glow finish (spec §11.2): the concept's glowing translucent look with
 * the science intact. A Fresnel rim tinted with the SAME phase's colour
 * (never the other's -- that would read as a sign change), an emissive term
 * of a fraction of the surface colour, and in Deep Space a soft additive
 * halo drawn from the same geometry pushed out along its normals; fine mesh
 * lines show the real marching-cubes edges. Light Clean mixes towards a
 * darker "ink" rim, since added light is invisible on white. No bloom
 * (§11.4). Geometry, vertices, cut planes, caps, stencil passes and opacity
 * are never touched: Glow is presentation only.
 */
export interface GlowSettings {
    mode: 'additive' | 'ink';
    rimPositive: THREE.Color;
    rimNegative: THREE.Color;
    emissive: number;
    rimStrength: number;
    /** The Fresnel exponent: lower is a wider rim. */
    rimPower: number;
    /**
     * Light Clean only (ink): how far the body is mixed towards white where
     * it faces the viewer, fading out into the ink rim -- Option 2's pale
     * see-through sphere with a saturated edge. A paler tint of the same
     * phase, never another hue; the alpha (the user's opacity) is untouched.
     */
    wash: number;
}

/** §11.1 "Lights": Solid (and Classic) keep today's levels; Glow's are per theme, in GLOW_TUNING below. */
export const SOLID_LIGHTS = { ambient: 0.5, key: 0.8, fill: 0.35 } as const;

/**
 * Ruling R20a-3: every tuned Glow value, in one place (a test pins them).
 * Tuned live against the concept (original-concepts.png Options 1 and 2):
 * translucent lobes with a visible fine mesh-line network, a bright
 * same-phase rim and, in Deep Space, a soft halo.
 * - `lines.opacity`: the mesh lines' alpha; `lines.whiten`: how far each
 *   line's own phase colour is mixed towards white (the concept's lines are
 *   lighter than the lobe in both themes); `lines.additive`: added light
 *   (Deep Space) or painted over (Light Clean, where added light vanishes).
 * - `halo.offset`: the push along the normals, as a fraction of the mesh
 *   radius; `halo.opacity`: its peak alpha; `halo.power`: how fast it fades
 *   towards its own outer edge (higher is softer).
 * - `wash` (Light Clean): the body mixed towards white where it faces the
 *   viewer, fading into the ink rim (see GlowSettings.wash); 0 in Deep Space.
 * - `lights`: the three lights while a surface glows (§11.1 "Lights"), per
 *   theme. Deep Space dims them so the body stays a dark, see-through glass
 *   lit by its rim; Light Clean keeps them up so the lights, not an
 *   emissive term, shade the body -- and a ball-and-stick drawn beside a
 *   glowing surface there is lit as in Solid (it takes no Glow of its own).
 */
export const GLOW_TUNING = {
    dark: {
        emissive: 0.1,
        rimStrength: 1.0,
        rimPower: 1.8,
        lines: { opacity: 0.05, whiten: 0.3, additive: true },
        halo: { opacity: 0.6, offset: 0.08, power: 1 },
        wash: 0,
        lights: { ambient: 0.15, key: 0.35, fill: 0.15 },
    },
    light: {
        emissive: 0.05,
        rimStrength: 1.0,
        rimPower: 1.5,
        lines: { opacity: 0.1, whiten: 0.85, additive: false },
        wash: 0.7,
        lights: { ambient: 1.0, key: 1.0, fill: 0.4 },
    },
} as const;

/** The three lights' levels while a surface glows in `theme` (§11.1 "Lights"). */
export function glowLightsFor(theme: Appearance['theme']): { ambient: number; key: number; fill: number } {
    return GLOW_TUNING[theme].lights;
}

export function glowSettingsFor(appearance: Appearance): GlowSettings | null {
    if (appearance.finish !== 'glow' || appearance.scheme === 'classic') return null;
    const phase = phaseColours(appearance.theme, appearance.scheme);
    const tuning = GLOW_TUNING[appearance.theme];
    return {
        mode: appearance.theme === 'dark' ? 'additive' : 'ink',
        rimPositive: new THREE.Color(phase.rimPositive!),
        rimNegative: new THREE.Color(phase.rimNegative!),
        emissive: tuning.emissive,
        rimStrength: tuning.rimStrength,
        rimPower: tuning.rimPower,
        wash: tuning.wash,
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
    return { mode: 'additive', rimPositive: new THREE.Color(1, 1, 1), rimNegative: new THREE.Color(1, 1, 1), emissive: 0, rimStrength: 0.15, rimPower: 2.5, wash: 0 };
}

interface GlowUniforms {
    qlRimPositive: THREE.IUniform<THREE.Color>;
    qlRimNegative: THREE.IUniform<THREE.Color>;
    qlInk: THREE.IUniform<number>;
    qlEmissive: THREE.IUniform<number>;
    qlRimStrength: THREE.IUniform<number>;
    qlRimPower: THREE.IUniform<number>;
    qlWash: THREE.IUniform<number>;
}

/**
 * A phased surface (an orbital, a density or ESP map) carries a `phaseSign`
 * attribute; a phase-less one (an atom, a composition lobe, a combination
 * overlay) does not declare it at all and reads 0. Declaring an attribute a
 * geometry lacks is not safe to rely on: WebGL then reads the location's
 * generic value, which three.js sets per location for ShaderMaterials (a
 * missing `color` becomes 1,1,1) -- a phase-less lobe could take ψ > 0's rim.
 */
const VERTEX_HEAD_PHASED = 'attribute float phaseSign;\nvarying float vQlPhase;\n';
const VERTEX_HEAD_PLAIN = 'varying float vQlPhase;\n';
const FRAGMENT_HEAD = 'uniform vec3 qlRimPositive;\nuniform vec3 qlRimNegative;\nuniform float qlInk;\nuniform float qlEmissive;\nuniform float qlRimStrength;\nuniform float qlRimPower;\nuniform float qlWash;\nvarying float vQlPhase;\n';
const RIM = /* glsl */`
    // Fresnel rim, in the surface's own phase (vQlPhase: +1, -1, or 0 where
    // the mesh has no phase -- a density, an ESP map, an atom, a lobe -- which
    // takes a tint of its own colour: lighter where the rim adds light (Deep
    // Space), darker where it is ink (Light Clean, §11.2 "darker rim colour").
    float qlRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), qlRimPower);
    vec3 qlOwnTint = qlInk > 0.5 ? diffuseColor.rgb * 0.5 : mix(diffuseColor.rgb, vec3(1.0), 0.5);
    vec3 qlRimColour = vQlPhase > 0.5 ? qlRimPositive : (vQlPhase < -0.5 ? qlRimNegative : qlOwnTint);
    outgoingLight = qlInk > 0.5
        ? mix(mix(outgoingLight, vec3(1.0), qlWash * qlRim), qlRimColour, qlRim * qlRim * qlRim * qlRimStrength)
        : outgoingLight + qlRimColour * qlRim * qlRimStrength;
`;

/**
 * Applies (or removes) the Glow injection in place. Colours and strengths are
 * uniforms, so a theme or scheme change does not recompile; only turning Glow
 * on or off does. `phased: false` for a mesh with no `phaseSign` attribute
 * (see VERTEX_HEAD_PLAIN); fixed for a material's life.
 */
export function applyGlow(material: THREE.MeshStandardMaterial, settings: GlowSettings | null, { phased = true }: { phased?: boolean } = {}): void {
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
        qlRimPower: { value: 2.5 },
        qlWash: { value: 0 },
    };
    uniforms.qlRimPositive.value.copy(settings.rimPositive);
    uniforms.qlRimNegative.value.copy(settings.rimNegative);
    uniforms.qlInk.value = settings.mode === 'ink' ? 1 : 0;
    uniforms.qlEmissive.value = settings.emissive;
    uniforms.qlRimStrength.value = settings.rimStrength;
    uniforms.qlRimPower.value = settings.rimPower;
    uniforms.qlWash.value = settings.wash;
    material.userData.glowUniforms = uniforms;
    if (material.userData.glow) return;
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = (phased ? VERTEX_HEAD_PHASED : VERTEX_HEAD_PLAIN) + shader.vertexShader
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n\tvQlPhase = ${phased ? 'phaseSign' : '0.0'};`);
        shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * qlEmissive;')
            .replace('#include <opaque_fragment>', `${RIM}\n\t#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => (phased ? 'ql-glow' : 'ql-glow-plain');
    material.userData.glow = true;
    material.needsUpdate = true;
}

/**
 * The mesher's normals point INTO the lobe (marching_cubes.ts winds its
 * triangles that way; computeVertexNormals follows the winding, and a test
 * pins it), so "out" is minus the normal. By the same winding the lobe's far
 * wall faces the camera as a front face: drawing front faces of the pushed
 * shell draws its far wall -- a band past the silhouette, and, through a
 * translucent lobe (which writes no depth), a glow behind it. Its alpha
 * falls off towards the shell's own outline (|n·v|^power is 0 there), so
 * the halo's outer edge is soft rather than a hard second outline.
 */
const HALO_VERTEX = /* glsl */`
    uniform float qlHaloOffset;
    varying vec3 vQlColour;
    varying vec3 vQlNormal;
    varying vec3 vQlView;
    #include <clipping_planes_pars_vertex>
    void main() {
        vQlColour = color;
        vec4 mvPosition = modelViewMatrix * vec4(position - normal * qlHaloOffset, 1.0);
        vQlNormal = normalMatrix * normal;
        vQlView = -mvPosition.xyz;
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
    }
`;
const HALO_FRAGMENT = /* glsl */`
    uniform float qlHaloOpacity;
    uniform float qlHaloPower;
    varying vec3 vQlColour;
    varying vec3 vQlNormal;
    varying vec3 vQlView;
    #include <clipping_planes_pars_fragment>
    void main() {
        #include <clipping_planes_fragment>
        // 0 at the shell's own outline (facing 0) and straight through the
        // middle of the lobe (facing 1); brightest in between -- a band
        // around the lobe's silhouette, soft on both sides.
        float facing = abs(dot(normalize(vQlNormal), normalize(vQlView)));
        gl_FragColor = vec4(vQlColour, qlHaloOpacity * pow(facing, qlHaloPower) * (1.0 - facing));
        #include <colorspace_fragment>
    }
`;

/**
 * The mesh lines: the surface's own triangles as 1 px lines, each in its
 * own phase's colour mixed `whiten` of the way to white -- never the other
 * phase's hue -- added as light in Deep Space, painted over in Light Clean.
 */
const LINES_VERTEX = /* glsl */`
    uniform float qlLinesWhiten;
    varying vec3 vQlColour;
    varying vec3 vQlNormal;
    varying vec3 vQlView;
    #include <clipping_planes_pars_vertex>
    void main() {
        vQlColour = mix(color, vec3(1.0), qlLinesWhiten);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vQlNormal = normalMatrix * normal;
        vQlView = -mvPosition.xyz;
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
    }
`;
const LINES_FRAGMENT = /* glsl */`
    uniform float qlLinesOpacity;
    varying vec3 vQlColour;
    varying vec3 vQlNormal;
    varying vec3 vQlView;
    #include <clipping_planes_pars_fragment>
    void main() {
        #include <clipping_planes_fragment>
        // Edge-on, the triangles crowd into a solid band; fading the lines
        // there leaves the outline to the rim.
        float facing = abs(dot(normalize(vQlNormal), normalize(vQlView)));
        gl_FragColor = vec4(vQlColour, qlLinesOpacity * facing);
        #include <colorspace_fragment>
    }
`;

type GlowExtra = 'halo' | 'lines';

function removeExtra(group: THREE.Object3D, child: THREE.Object3D): void {
    group.remove(child);
    // The geometry is the surface's own and is disposed with it.
    ((child as THREE.Mesh).material as THREE.Material).dispose();
}

/** An extra's full-strength alpha in this theme (GLOW_TUNING); the fade scales it. */
function fullOpacity(kind: GlowExtra, theme: Appearance['theme']): number {
    return kind === 'halo' ? GLOW_TUNING.dark.halo.opacity : GLOW_TUNING[theme].lines.opacity;
}

/**
 * Brings an extra's theme-dependent uniforms and blending to `theme` in
 * place: no recompile (blending is render state), so an extra that is kept
 * across a theme switch (ruling DC3) still looks right.
 */
function tuneExtra(material: THREE.ShaderMaterial, kind: GlowExtra, theme: Appearance['theme'], fade: number): void {
    material.userData.qlTheme = theme;
    if (kind === 'halo') {
        material.uniforms.qlHaloOpacity.value = fullOpacity(kind, theme) * fade;
        return;
    }
    const lines = GLOW_TUNING[theme].lines;
    material.uniforms.qlLinesOpacity.value = lines.opacity * fade;
    material.uniforms.qlLinesWhiten.value = lines.whiten;
    material.blending = lines.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
}

function createExtra(kind: GlowExtra, geometry: THREE.BufferGeometry, radius: number, clippingPlanes: THREE.Plane[], theme: Appearance['theme'], fade: number): THREE.Mesh {
    const halo = GLOW_TUNING.dark.halo;
    const material = kind === 'halo'
        ? new THREE.ShaderMaterial({
            vertexShader: HALO_VERTEX,
            fragmentShader: HALO_FRAGMENT,
            uniforms: { qlHaloOffset: { value: halo.offset * radius }, qlHaloOpacity: { value: 0 }, qlHaloPower: { value: halo.power } },
            vertexColors: true,
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            clipping: true,
            clippingPlanes,
        })
        : new THREE.ShaderMaterial({
            vertexShader: LINES_VERTEX,
            fragmentShader: LINES_FRAGMENT,
            uniforms: { qlLinesOpacity: { value: 0 }, qlLinesWhiten: { value: 0 } },
            wireframe: true,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            clipping: true,
            clippingPlanes,
        });
    tuneExtra(material, kind, theme, fade);
    const mesh = new THREE.Mesh(geometry, material);
    // Unmarked for export (export/surfaces.ts collects marked meshes only); this marks it as Glow's.
    mesh.userData.isGlowExtra = kind;
    return mesh;
}

/**
 * Brings a surface's Glow to `appearance`: the material injection on a solid
 * surface (a wireframe keeps today's material, §11.1); the halo (Deep Space)
 * and the mesh lines only on a solid surface, never on a phone (`lowPower`)
 * and not once the frame-time guard has turned them off (`extrasAllowed`
 * false; spec §15: "lines and halo off on phones and when frames exceed
 * 20 ms"). Extras share the surface's geometry.
 *
 * Idempotent (ruling DC3): an extra that is already there and still wanted
 * is kept as it is -- no material disposed, no shader rebuilt; only its
 * theme's uniforms are set -- so calling this again costs nothing.
 */
export function attachGlowExtras(
    group: THREE.Group,
    surface: THREE.Mesh,
    appearance: Appearance,
    options: { radius: number; clippingPlanes: THREE.Plane[]; solid: boolean; extrasAllowed: boolean },
): void {
    const settings = options.solid ? glowSettingsFor(appearance) : null;
    applyGlow(surface.material as THREE.MeshStandardMaterial, settings, { phased: Boolean(surface.geometry.getAttribute('phaseSign')) });
    const wanted = new Set<GlowExtra>();
    if (settings && !appearance.lowPower && options.extrasAllowed) {
        if (appearance.theme === 'dark') wanted.add('halo');
        wanted.add('lines');
    }
    const fade = (group.userData.glowFade as number | undefined) ?? 1;
    for (const child of [...group.children]) {
        const kind = child.userData.isGlowExtra as GlowExtra | undefined;
        if (!kind) continue;
        if (wanted.has(kind)) {
            wanted.delete(kind);
            const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
            if (material.userData.qlTheme !== appearance.theme) tuneExtra(material, kind, appearance.theme, fade);
        } else removeExtra(group, child);
    }
    for (const kind of wanted) group.add(createExtra(kind, surface.geometry, options.radius, options.clippingPlanes, appearance.theme, fade));
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
        const kind = child.userData.isGlowExtra as GlowExtra | undefined;
        if (!kind) continue;
        const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
        const full = fullOpacity(kind, material.userData.qlTheme as Appearance['theme']);
        material.uniforms[kind === 'halo' ? 'qlHaloOpacity' : 'qlLinesOpacity'].value = full * fraction;
    }
}

export function hasGlowExtras(group: THREE.Object3D | null): boolean {
    return Boolean(group?.children.some(child => child.userData.isGlowExtra));
}

/** Takes the halo and the mesh lines out (ruling R10's latch, spec §15); the rim and emissive stay. */
export function removeGlowExtras(group: THREE.Object3D | null): void {
    if (!group) return;
    for (const child of [...group.children]) {
        if (child.userData.isGlowExtra) removeExtra(group, child);
    }
}

/** True while some material under `root` wears the Glow injection: what dims the lights (§11.1 "Lights"). */
export function hasGlowingSurface(root: THREE.Object3D | null): boolean {
    let glowing = false;
    root?.traverse(object => {
        const material = (object as THREE.Mesh).material as THREE.Material | undefined;
        if (material && !Array.isArray(material) && material.userData.glow === true) glowing = true;
    });
    return glowing;
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
