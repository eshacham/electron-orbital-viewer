import * as THREE from 'three';
import {
    createShellView,
    setShellViewHighlight,
    setShellViewRingWidth,
    setShellViewCurve,
    getShellViewCurve,
    setShellViewRadius,
    getShellViewRadius,
    disposeShellView,
    ShellViewOptions,
} from '../../src/atom/shell_view';

/**
 * An already-computed shellEmphasis curve (see atom_profile.ts) on a tiny
 * log grid: rMin = 0.1, dx = 0.5, size = 5, so r_j = 0.1 * e^(0.5j) for
 * j = 0..4. Bounded to [0, 1] by construction -- the shader no longer
 * normalises against a peak, it just ramps this ratio directly.
 */
const RMIN = 0.1;
const DX = 0.5;
const SIZE = 5;
const SHELL_EMPHASIS = new Float32Array([0.1, 0.4, 1.0, 0.3, 0.05]);
const RMAX = RMIN * Math.exp(DX * (SIZE - 1));

const options = (): ShellViewOptions => ({
    contourRadius: RMAX * 0.8,
    shellEmphasis: SHELL_EMPHASIS,
    rMin: RMIN,
    dx: DX,
    size: SIZE,
    rMax: RMAX,
    opacity: 1,
    plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
});

const capMaterial = (view: THREE.Object3D): THREE.ShaderMaterial => {
    let found: THREE.ShaderMaterial | undefined;
    view.traverse(child => {
        if (child instanceof THREE.Mesh && child.userData.isCap) {
            found = child.material as THREE.ShaderMaterial;
        }
    });
    return found!;
};

describe('shell view', () => {
    it('is a sphere at the contour radius, not a sampled grid', () => {
        const view = createShellView(options());
        const stencils: THREE.Mesh[] = [];
        view.traverse(child => {
            if (child instanceof THREE.Mesh && child.userData.isCapStencil) stencils.push(child);
        });

        expect(stencils).toHaveLength(2);
        for (const stencil of stencils) {
            expect(stencil.geometry).toBeInstanceOf(THREE.SphereGeometry);
            expect((stencil.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(RMAX * 0.8);
        }
    });

    it('builds one stencil pair and one shaded cap face, marked for reuse of clip_caps helpers', () => {
        const view = createShellView(options());
        expect(view.userData.isCapAssembly).toBe(true);

        const stencils: THREE.Mesh[] = [];
        const faces: THREE.Mesh[] = [];
        view.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            if (child.userData.isCapStencil) stencils.push(child);
            if (child.userData.isCap) faces.push(child);
        });

        expect(stencils).toHaveLength(2);
        expect(faces).toHaveLength(1);
    });

    it('counts back faces up and front faces down, without drawing them', () => {
        const view = createShellView(options());
        view.traverse(child => {
            if (!(child instanceof THREE.Mesh) || !child.userData.isCapStencil) return;
            const material = child.material as THREE.MeshBasicMaterial;
            expect(material.colorWrite).toBe(false);
            expect(material.stencilWrite).toBe(true);
            expect(material.stencilZPass).toBe(
                material.side === THREE.BackSide
                    ? THREE.IncrementWrapStencilOp
                    : THREE.DecrementWrapStencilOp
            );
        });
    });

    it('draws the cap only where the stencil count is non-zero, after the count, and clears the stencil after rendering', () => {
        const view = createShellView(options());
        const face = view.children.find(c => c.userData.isCap)! as THREE.Mesh;
        const stencil = view.children.find(c => c.userData.isCapStencil)!;

        const material = face.material as THREE.ShaderMaterial;
        expect(material.stencilFunc).toBe(THREE.NotEqualStencilFunc);
        expect(material.stencilRef).toBe(0);
        expect(face.renderOrder).toBeGreaterThan(stencil.renderOrder);

        const renderer = { clearStencil: jest.fn() };
        face.onAfterRender!(renderer as unknown as THREE.WebGLRenderer, {} as never, {} as never, {} as never, {} as never, {} as never);
        expect(renderer.clearStencil).toHaveBeenCalled();
    });

    it('carries a float RedFormat texture of the shellEmphasis curve exactly as given, plus the log-grid parameters the shader needs', () => {
        const view = createShellView(options());
        const material = capMaterial(view);

        const texture = material.uniforms.shellEmphasis.value as THREE.DataTexture;
        expect(texture).toBeInstanceOf(THREE.DataTexture);
        expect(texture.image.width).toBe(SIZE);
        expect(texture.image.height).toBe(1);
        expect(texture.format).toBe(THREE.RedFormat);
        expect(texture.type).toBe(THREE.FloatType);
        // Shipped as-is -- shellEmphasis is already bounded to [0, 1] by
        // construction (atom_profile.ts), so unlike the old raw-D(r) texture
        // there is no further normalisation for the shader to do.
        expect(Array.from(texture.image.data as Float32Array)).toEqual(Array.from(SHELL_EMPHASIS));

        expect(material.uniforms.rMin.value).toBe(RMIN);
        expect(material.uniforms.dx.value).toBe(DX);
        expect(material.uniforms.size.value).toBe(SIZE);
        expect(material.uniforms.rMax.value).toBe(RMAX);
        expect(material.uniforms.opacity.value).toBe(1);
        // Nothing highlighted yet.
        expect(material.uniforms.highlightR.value).toBeLessThan(0);
        expect(material.glslVersion).toBe(THREE.GLSL3);
    });

    // Regression test: the atom<->shell fade (level-transition spec addendum)
    // mutates the texture's backing array in place every frame
    // (setShellViewCurve), and the caller passes it a *direct reference* to
    // a curve owned by the Redux store (AtomProfile.totalEmphasis /
    // shell.emphasis) so it can be read again later, by the next view built
    // and by the radial plot. If the texture aliased that array instead of
    // copying it, animating one shell view would permanently corrupt the
    // profile's own stored curve -- exactly the bug this guards against,
    // caught live (see orbital_visualizer.ts / shell_view.ts's own doc
    // comments) rather than by any pre-existing test, because no other test
    // builds a view and then goes on to read the *input* array afterwards.
    it('does not mutate the caller\'s shellEmphasis array when the displayed curve is later changed', () => {
        const original = Float32Array.from(SHELL_EMPHASIS);
        const view = createShellView(options());

        setShellViewCurve(view, new Float32Array([0.9, 0.9, 0.9, 0.9, 0.9]));

        expect(Array.from(SHELL_EMPHASIS)).toEqual(Array.from(original));
    });

    it('setShellViewCurve overwrites the displayed curve; getShellViewCurve reads back a copy of whatever is currently shown', () => {
        const view = createShellView(options());
        const next = new Float32Array([0.2, 0.3, 0.4, 0.5, 0.6]);

        setShellViewCurve(view, next);

        const read = getShellViewCurve(view);
        expect(read).not.toBeNull();
        expect(Array.from(read!)).toEqual(Array.from(next));

        // A copy, not the live buffer -- mutating it must not affect the view.
        read![0] = 999;
        expect(Array.from(getShellViewCurve(view)!)).toEqual(Array.from(next));
    });

    it('getShellViewCurve tolerates a missing view', () => {
        expect(getShellViewCurve(null)).toBeNull();
    });

    it('setShellViewRadius scales the stencil meshes relative to the geometry\'s own built radius; getShellViewRadius reads the result back', () => {
        const view = createShellView(options());
        const builtRadius = options().contourRadius;
        expect(getShellViewRadius(view)).toBeCloseTo(builtRadius);

        setShellViewRadius(view, builtRadius / 2);
        expect(getShellViewRadius(view)).toBeCloseTo(builtRadius / 2);

        setShellViewRadius(view, builtRadius * 3);
        expect(getShellViewRadius(view)).toBeCloseTo(builtRadius * 3);
    });

    it('setShellViewRadius/getShellViewRadius tolerate a missing view', () => {
        expect(() => setShellViewRadius(null, 1)).not.toThrow();
        expect(getShellViewRadius(null)).toBeNull();
    });

    it('setShellViewHighlight updates the highlight uniform', () => {
        const view = createShellView(options());
        setShellViewHighlight(view, 3.5);
        expect(capMaterial(view).uniforms.highlightR.value).toBe(3.5);

        setShellViewHighlight(view, null);
        expect(capMaterial(view).uniforms.highlightR.value).toBeLessThan(0);
    });

    // Regression test: the ring's width used to be a fraction of the sampling
    // grid's rMax, which has no relationship to the camera's zoom. Zooming in
    // made the (grid-relative) band cover more and more of the screen, since
    // nothing about it tracked apparent size. It must instead be driven
    // explicitly, in world units the caller derives from camera distance.
    it('setShellViewRingWidth sets the ring uniform directly, independent of rMax', () => {
        const view = createShellView(options());
        const initial = capMaterial(view).uniforms.ringWidth.value;
        expect(initial).toBeGreaterThan(0);

        setShellViewRingWidth(view, 0.01);
        expect(capMaterial(view).uniforms.ringWidth.value).toBe(0.01);

        // A much larger value (as if the camera had zoomed far out) is taken
        // as-is too -- there is no clamping back to a fraction of rMax.
        setShellViewRingWidth(view, 5);
        expect(capMaterial(view).uniforms.ringWidth.value).toBe(5);
    });

    it('setShellViewRingWidth tolerates a missing view', () => {
        expect(() => setShellViewRingWidth(null, 0.01)).not.toThrow();
    });

    it('tolerates a missing view', () => {
        expect(() => setShellViewHighlight(null, 1)).not.toThrow();
        expect(() => disposeShellView(null)).not.toThrow();
    });

    it('frees the shell-emphasis texture on dispose', () => {
        const view = createShellView(options());
        const texture = capMaterial(view).uniforms.shellEmphasis.value as THREE.DataTexture;
        const disposed = jest.fn();
        texture.addEventListener('dispose', disposed);

        disposeShellView(view);
        expect(disposed).toHaveBeenCalled();
    });

    // Regression test (task 22, bug 5): "the bg color of the most outer
    // shell ... is too dark and is barely visible (compared to the dark bg
    // of the whole viewer)". Reads the two colours straight out of the
    // shipped fragment shader source (rather than a reimplementation of the
    // ramp) so a future edit to either literal is caught here directly.
    describe('cut-face colour', () => {
        /** Pulls a `vec3 <name> = vec3(r, g, b);` literal out of GLSL source text. */
        function extractVec3(source: string, name: string): [number, number, number] {
            const match = source.match(new RegExp(`vec3 ${name} = vec3\\(([^)]+)\\)`));
            if (!match) throw new Error(`could not find "vec3 ${name} = vec3(...)" in the shader source`);
            const [r, g, b] = match[1].split(',').map(component => parseFloat(component.trim()));
            return [r, g, b];
        }

        /** Standard perceptual (Rec. 709) luminance weights -- a straight RGB average would rate the old, blue-heavy floor brighter than it actually reads. */
        function luminance([r, g, b]: [number, number, number]): number {
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }

        it('lifts the cold floor well clear of the scene background, so the disc reads as a distinct object', () => {
            const material = capMaterial(createShellView(options()));
            const cold = extractVec3(material.fragmentShader, 'cold');

            // orbital_visualizer.ts's scene.background is 0x050505 -- 5/255
            // in every channel.
            const background: [number, number, number] = [5 / 255, 5 / 255, 5 / 255];
            const contrastRatio = luminance(cold) / luminance(background);

            // The old floor, vec3(0.02, 0.03, 0.10), sat under 1.7x the
            // background's own luminance -- close enough to read as "barely
            // visible", per the bug report. This bar is comfortably above
            // that without demanding a specific colour.
            expect(contrastRatio).toBeGreaterThanOrEqual(3);
        });

        it('keeps the warm ring clearly brighter than the lifted cold floor, so rings stay crisp', () => {
            const material = capMaterial(createShellView(options()));
            const cold = extractVec3(material.fragmentShader, 'cold');
            const warm = extractVec3(material.fragmentShader, 'warm');

            // This is the "keep enough peak-to-trough contrast" half of the
            // bug fix, expressed directly in colour space -- the acceptance
            // test in atom_profile.test.ts covers the same requirement in
            // ramp space (independent of these two literals) and is
            // unaffected by this change either way.
            expect(luminance(warm) / luminance(cold)).toBeGreaterThanOrEqual(3);
        });
    });
});
