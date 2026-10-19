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
     * Ink mode only: how far the body is mixed towards white towards its
     * edge, fading out into the ink rim (Option 2's pale see-through sphere).
     * Ruling R24-2 (owner): 0 in both themes -- the body shows its own
     * science colour; kept as a knob, never another hue.
     */
    wash: number;
    /**
     * Additive mode only: how far a phase-less surface's rim (a density, an
     * ESP map, a lobe) is mixed from its own colour towards white. Ruling
     * R24-2c (owner-tuned): 0.51 in Deep Space. Ink mode ignores it.
     */
    ownRimWhiten: number;
}

/** §11.1 "Lights": Solid keeps today's levels; Glow's are per theme, in GLOW_TUNING below. */
export const SOLID_LIGHTS = { ambient: 0.5, key: 0.8, fill: 0.35 } as const;

/**
 * Ruling R20a-3: every tuned Glow value, in one place (a test pins them).
 * Tuned live against the concept (original-concepts.png Options 1 and 2):
 * translucent lobes with a visible fine mesh-line network, a same-phase rim
 * and, in Deep Space, a soft halo.
 * Ruling R24-2 (owner: "the orbitals have too much white glare"): no white
 * wash -- the body of every surface reads as its own science colour (phase,
 * density, ESP). Ruling R24-2c: the values below are the OWNER'S OWN, tuned
 * live on the R24-2b panel (2026-10-19): soft same-hue edges, no white wash.
 * Deep Space: a narrow same-hue rim (0.75, power 3), a faint halo (0.1),
 * faint lines, and a phase-less rim half-way to white (ownRimWhiten 0.51).
 * Light Clean: the ink rim, a little self-glow (0.21) and faint, barely
 * lightened lines. Science hexes unchanged.
 * - `lines.opacity`: the mesh lines' alpha; `lines.whiten`: how far each
 *   line's own phase colour is mixed towards white (kept low, R24-2, so the
 *   lines never lighten the body visibly); `lines.additive`: added light
 *   (Deep Space) or painted over (Light Clean, where added light vanishes).
 * - `halo.offset`: the push along the normals, as a fraction of the mesh
 *   radius; `halo.opacity`: its peak alpha; `halo.power`: how fast it fades
 *   towards its own outer edge (higher is softer).
 * - `wash`: the body mixed towards white towards its edge (see
 *   GlowSettings.wash); 0 in both themes since R24-2 (was 0.7 in Light Clean).
 * - `ownRimWhiten`: Deep Space's phase-less rim, mixed this far towards white
 *   (GlowSettings.ownRimWhiten); unused in Light Clean's ink mode.
 * - `lights`: the three lights while a surface glows (§11.1 "Lights"), per
 *   theme. Deep Space dims them so the body stays a dark, see-through glass
 *   lit by its rim; Light Clean keeps them up so the lights, not an
 *   emissive term, shade the body -- and a ball-and-stick drawn beside a
 *   glowing surface there is lit as in Solid (it takes no Glow of its own).
 * - `thumb` (ruling R20d): a strip tile's own fixed light rig (levels here;
 *   the directions are render_thumbnail.ts's THUMB_LIGHT_RIG) and its rim,
 *   halo and line strengths -- the same Glow, a little stronger where a
 *   72 px tile would lose it. Independent of the main view's lights and of
 *   the frame-time guard. R24-2c: scaled with the owner's view values by the
 *   ratios the tiles already had (dark rim ×1.25, halo ×5/3, lines ×0.6;
 *   light rim ×1.15, lines ×0.35).
 */
export const GLOW_TUNING = {
    dark: {
        emissive: 0.11,
        rimStrength: 0.75,
        rimPower: 3,
        lines: { opacity: 0.02, whiten: 0.2, additive: true },
        // Ruling R23c-2 (owner): the halo was too thick -- about a third of
        // the push (offset, so the band is a third as wide, main view and
        // tiles alike: tuneThumbnailGlow never overrides it) and about half
        // the peak alpha (opacity, and thumb's haloOpacity below). Rim glow untouched.
        // R24-2c (owner): opacity 0.1 (was 0.3).
        halo: { opacity: 0.1, offset: 0.027, power: 1 },
        wash: 0,
        ownRimWhiten: 0.51,
        lights: { ambient: 0.15, key: 0.35, fill: 0.15 },
        thumb: { lights: { ambient: 0.2, key: 0.7, fill: 0.2 }, rimStrength: 0.94, haloOpacity: 0.17, linesOpacity: 0.012 },
    },
    light: {
        emissive: 0.21,
        rimStrength: 1,
        rimPower: 1.5,
        lines: { opacity: 0.06, whiten: 0.12, additive: false },
        wash: 0,
        ownRimWhiten: 0,
        lights: { ambient: 1.0, key: 1.0, fill: 0.4 },
        thumb: { lights: { ambient: 1.0, key: 1.1, fill: 0.4 }, rimStrength: 1.15, linesOpacity: 0.021 },
    },
} as const;

/** The three lights' levels while a surface glows in `theme` (§11.1 "Lights"). */
export function glowLightsFor(theme: Appearance['theme']): { ambient: number; key: number; fill: number } {
    return GLOW_TUNING[theme].lights;
}

export function glowSettingsFor(appearance: Appearance): GlowSettings | null {
    if (appearance.finish !== 'glow') return null;
    const phase = phaseColours(appearance.theme);
    const tuning = GLOW_TUNING[appearance.theme];
    return {
        mode: appearance.theme === 'dark' ? 'additive' : 'ink',
        rimPositive: new THREE.Color(phase.rimPositive),
        rimNegative: new THREE.Color(phase.rimNegative),
        emissive: tuning.emissive,
        rimStrength: tuning.rimStrength,
        rimPower: tuning.rimPower,
        wash: tuning.wash,
        ownRimWhiten: tuning.ownRimWhiten,
    };
}

/**
 * Ruling R12 / §11.1 "Ball-and-stick": in Deep Space the atoms
 * take the same rim at 0.15 and no emissive. An atom has no phase, so the
 * shader tints its rim from the atom's own colour (`vQlPhase` 0) and the two
 * phase rim colours below are never read.
 */
export function atomRimFor(appearance: Appearance): GlowSettings | null {
    if (appearance.theme !== 'dark') return null;
    return { mode: 'additive', rimPositive: new THREE.Color(1, 1, 1), rimNegative: new THREE.Color(1, 1, 1), emissive: 0, rimStrength: 0.15, rimPower: 2.5, wash: 0, ownRimWhiten: 0 };
}

interface GlowUniforms {
    qlRimPositive: THREE.IUniform<THREE.Color>;
    qlRimNegative: THREE.IUniform<THREE.Color>;
    qlInk: THREE.IUniform<number>;
    qlEmissive: THREE.IUniform<number>;
    qlRimStrength: THREE.IUniform<number>;
    qlRimPower: THREE.IUniform<number>;
    qlWash: THREE.IUniform<number>;
    qlOwnRimWhiten: THREE.IUniform<number>;
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
const FRAGMENT_HEAD = 'uniform vec3 qlRimPositive;\nuniform vec3 qlRimNegative;\nuniform float qlInk;\nuniform float qlEmissive;\nuniform float qlRimStrength;\nuniform float qlRimPower;\nuniform float qlWash;\nuniform float qlOwnRimWhiten;\nvarying float vQlPhase;\n';
const RIM = /* glsl */`
    // Fresnel rim, in the surface's own phase (vQlPhase: +1, -1, or 0 where
    // the mesh has no phase -- a density, an ESP map, an atom, a lobe -- which
    // takes its own colour: added where the rim adds light (Deep Space), mixed
    // qlOwnRimWhiten of the way to white (ruling R24-2c, owner-tuned), and
    // darker where it is ink (Light Clean, §11.2 "darker rim colour").
    float qlRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), qlRimPower);
    vec3 qlOwnTint = qlInk > 0.5 ? diffuseColor.rgb * 0.5 : mix(diffuseColor.rgb, vec3(1.0), qlOwnRimWhiten);
    vec3 qlRimColour = vQlPhase > 0.5 ? qlRimPositive : (vQlPhase < -0.5 ? qlRimNegative : qlOwnTint);
    outgoingLight = qlInk > 0.5
        ? mix(mix(outgoingLight, vec3(1.0), qlWash * qlRim), qlRimColour, qlRim * qlRim * qlRim * qlRimStrength)
        : outgoingLight + qlRimColour * qlRim * qlRimStrength;
`;

/**
 * Applies (or removes) the Glow injection in place. Colours and strengths are
 * uniforms, so a theme change does not recompile; only turning Glow
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
        qlOwnRimWhiten: { value: 0 },
    };
    uniforms.qlRimPositive.value.copy(settings.rimPositive);
    uniforms.qlRimNegative.value.copy(settings.rimNegative);
    uniforms.qlInk.value = settings.mode === 'ink' ? 1 : 0;
    uniforms.qlEmissive.value = settings.emissive;
    uniforms.qlRimStrength.value = settings.rimStrength;
    uniforms.qlRimPower.value = settings.rimPower;
    uniforms.qlWash.value = settings.wash;
    uniforms.qlOwnRimWhiten.value = settings.ownRimWhiten;
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

/**
 * Ruling R20d: a strip tile's Glow strengths (GLOW_TUNING[theme].thumb) on
 * a surface attachGlowExtras has dressed: its rim, and its halo and lines
 * if it has them. The tile's own scene only; the main view never calls it.
 */
export function tuneThumbnailGlow(group: THREE.Object3D, surface: THREE.Mesh, theme: Appearance['theme']): void {
    const thumb: { rimStrength: number; linesOpacity: number; haloOpacity?: number } = GLOW_TUNING[theme].thumb;
    const uniforms = (surface.material as THREE.Material).userData.glowUniforms as GlowUniforms | undefined;
    if (uniforms && (surface.material as THREE.Material).userData.glow) uniforms.qlRimStrength.value = thumb.rimStrength;
    for (const child of group.children) {
        const kind = child.userData.isGlowExtra as GlowExtra | undefined;
        const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
        if (kind === 'halo' && thumb.haloOpacity !== undefined) material.uniforms.qlHaloOpacity.value = thumb.haloOpacity;
        if (kind === 'lines') material.uniforms.qlLinesOpacity.value = thumb.linesOpacity;
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
