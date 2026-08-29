import * as THREE from 'three';
import { createShellView, setShellViewHighlight, disposeShellView, ShellViewOptions } from '../../src/atom/shell_view';

/**
 * D(r) on a tiny log grid: rMin = 0.1, dx = 0.5, size = 5, so
 * r_j = 0.1 * e^(0.5j) for j = 0..4. Peak is at j = 2 (arbitrary shape, just
 * needs a clear maximum so peakD is unambiguous).
 */
const RMIN = 0.1;
const DX = 0.5;
const SIZE = 5;
const RADIAL_CURVE = new Float32Array([1, 4, 10, 3, 0.5]);
const RMAX = RMIN * Math.exp(DX * (SIZE - 1));

const options = (): ShellViewOptions => ({
    contourRadius: RMAX * 0.8,
    radialCurve: RADIAL_CURVE,
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

    it('carries a float RedFormat texture of the raw (unnormalised) log-grid curve, plus the log-grid parameters the shader needs', () => {
        const view = createShellView(options());
        const material = capMaterial(view);

        const texture = material.uniforms.radialCurve.value as THREE.DataTexture;
        expect(texture).toBeInstanceOf(THREE.DataTexture);
        expect(texture.image.width).toBe(SIZE);
        expect(texture.image.height).toBe(1);
        expect(texture.format).toBe(THREE.RedFormat);
        expect(texture.type).toBe(THREE.FloatType);
        // Raw values, not renormalised to [0, 1] before upload (ruling R16) --
        // the shader does the peak-normalisation and perceptual ramp itself.
        expect(Array.from(texture.image.data as Float32Array)).toEqual(Array.from(RADIAL_CURVE));

        expect(material.uniforms.rMin.value).toBe(RMIN);
        expect(material.uniforms.dx.value).toBe(DX);
        expect(material.uniforms.size.value).toBe(SIZE);
        expect(material.uniforms.rMax.value).toBe(RMAX);
        // The shader normalises D(r) against this before ramping (ruling R16).
        expect(material.uniforms.peakD.value).toBeCloseTo(10);
        expect(material.uniforms.opacity.value).toBe(1);
        // Nothing highlighted yet.
        expect(material.uniforms.highlightR.value).toBeLessThan(0);
        expect(material.glslVersion).toBe(THREE.GLSL3);
    });

    it('setShellViewHighlight updates the highlight uniform', () => {
        const view = createShellView(options());
        setShellViewHighlight(view, 3.5);
        expect(capMaterial(view).uniforms.highlightR.value).toBe(3.5);

        setShellViewHighlight(view, null);
        expect(capMaterial(view).uniforms.highlightR.value).toBeLessThan(0);
    });

    it('tolerates a missing view', () => {
        expect(() => setShellViewHighlight(null, 1)).not.toThrow();
        expect(() => disposeShellView(null)).not.toThrow();
    });

    it('frees the radial curve texture on dispose', () => {
        const view = createShellView(options());
        const texture = capMaterial(view).uniforms.radialCurve.value as THREE.DataTexture;
        const disposed = jest.fn();
        texture.addEventListener('dispose', disposed);

        disposeShellView(view);
        expect(disposed).toHaveBeenCalled();
    });
});
