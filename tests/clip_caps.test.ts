import * as THREE from 'three';
import {
    createClipCaps,
    createDensityTexture,
    positionCaps,
    setCapsVisible,
    setCapsOpacity,
    disposeCaps,
} from '../src/clip_caps';
import { encodeDensityMap, generateOrbitalMesh } from '../src/orbital_mesh';
import { computeSamplingRadius } from '../src/orbital_presets';
import { DensityMap, OrbitalParams } from '../src/types/orbital';

const params: OrbitalParams = {
    n: 2, l: 1, ml: 0, Z: 1, resolution: 16, rMax: 15, enclosedFraction: 0.9,
};

const build = () => {
    const mesh = generateOrbitalMesh(params);
    return createClipCaps(new THREE.BufferGeometry(), {
        plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
        densityMap: mesh.densityMap,
        opacity: 1,
    });
};

const capMaterial = (caps: THREE.Object3D): THREE.ShaderMaterial => {
    let found: THREE.ShaderMaterial | undefined;
    caps.traverse(child => {
        if (child instanceof THREE.Mesh && child.userData.isCap) {
            found = child.material as THREE.ShaderMaterial;
        }
    });
    return found!;
};

describe('encodeDensityMap', () => {
    // 0.5 is the iso level, above it positive psi, below it negative, and the
    // distance from 0.5 is the log climb from the iso level to the peak.
    it('puts the iso level at the midpoint and the peak at the extremes', () => {
        const iso = 1e-4;
        // psi values whose squares span the iso level and well past it.
        const psi = new Float32Array([0, 0.01, 0.1, 1, -1, -0.1]);
        const encoded = encodeDensityMap(psi, iso);

        expect(encoded[0]).toBe(128);            // psi = 0, far below iso
        expect(encoded[3]).toBe(255);            // the positive peak
        expect(encoded[4]).toBe(1);              // the negative peak, same magnitude
        expect(encoded[2]).toBeGreaterThan(128); // positive, partway up
        expect(encoded[2]).toBeLessThan(255);
        expect(encoded[5]).toBeLessThan(128);    // its negative counterpart
    });

    it('is symmetric between the phases', () => {
        const psi = new Float32Array([0.3, -0.3, 0.05, -0.05]);
        const encoded = encodeDensityMap(psi, 1e-4);

        expect(encoded[0] - 128).toBe(128 - encoded[1]);
        expect(encoded[2] - 128).toBe(128 - encoded[3]);
    });

    it('is a log scale, so the mid-range is not crushed against the ends', () => {
        // Densities of 1e-6, 1e-4, 1e-2 against an iso level of 1e-6: on a log
        // scale the middle one lands halfway.
        const psi = new Float32Array([1e-3, 1e-2, 1e-1]);
        const encoded = encodeDensityMap(psi, 1e-6);

        const climb = (byte: number) => (byte - 128) / 127;
        expect(climb(encoded[0])).toBeCloseTo(0, 2);
        expect(climb(encoded[1])).toBeCloseTo(0.5, 1);
        expect(climb(encoded[2])).toBeCloseTo(1, 2);
    });

    it('handles an orbital that never reaches the iso level', () => {
        const encoded = encodeDensityMap(new Float32Array([1e-9, -1e-9]), 1);
        expect(Array.from(encoded)).toEqual([128, 128]);
    });

    it('produces one byte per sample', () => {
        const mesh = generateOrbitalMesh(params);
        const side = params.resolution + 1;
        expect(mesh.densityMap.data).toHaveLength(side * side * side);
        expect(mesh.densityMap.side).toBe(side);
        expect(mesh.densityMap.rMax).toBe(params.rMax);
    });

    // Regression test for the flat cut face reported for hydrogen-like 7s
    // (README's "tree rings" case): an s orbital is nonzero at the nucleus,
    // and a single grid point there can be two-plus orders of magnitude
    // denser than any of the orbital's own shells. Using the raw maximum as
    // the top of the log-scale ramp pins that one point to climb = 1 and
    // squeezes every shell -- which is what a slice actually shows -- into
    // an imperceptible sliver near the iso level.
    it('does not let one isolated peak crush a real shell of samples towards the iso level', () => {
        const n = 20000;
        const psi = new Float32Array(n);
        // A "shell": fifty samples sharing one amplitude, the way a real
        // isosurface's belly is a whole neighbourhood of grid points at
        // similar density, not a single one.
        for (let i = 0; i < 50; i++) psi[i] = 0.01; // density 1e-4
        // The nucleus: one sample, 10000x denser than the shell.
        psi[100] = 1;
        const iso = 1e-6;

        const encoded = encodeDensityMap(psi, iso);
        const climb = (byte: number) => (byte - 128) / 127;

        // Before the fix this shell climbed only to ~0.33 (log(100)/log(1e6)),
        // because the isolated spike alone set the range's ceiling.
        expect(climb(encoded[0])).toBeGreaterThan(0.6);
        // The spike is still real density and still saturates the ramp -- it
        // is just no longer the sole reference point for where "peak" is.
        expect(encoded[100]).toBe(255);
    });

    it('shades hydrogen-like 7s with visible shell structure, not a wash of near-iso colour (regression)', () => {
        const rMax = computeSamplingRadius(7, 0, 1);
        const mesh = generateOrbitalMesh({
            n: 7, l: 0, ml: 0, Z: 1, resolution: 64, rMax, enclosedFraction: 0.9,
        });

        // Samples whose climb magnitude is at least 0.72 -- comfortably past
        // where the unfixed peak (the nucleus alone) crushed everything
        // outside itself. Before the fix only the single nucleus voxel
        // reached this band; a real shell's own belly should too.
        const highClimb = Array.from(mesh.densityMap.data)
            .filter(byte => byte >= 220 || byte <= 36).length;
        expect(highClimb).toBeGreaterThan(20);
    });
});

describe('density texture', () => {
    it('is a single-byte 3D texture matching the sampled grid', () => {
        const map: DensityMap = { data: new Uint8Array(3 * 3 * 3), side: 3, rMax: 10 };
        const texture = createDensityTexture(map);

        expect(texture).toBeInstanceOf(THREE.Data3DTexture);
        expect([texture.image.width, texture.image.height, texture.image.depth]).toEqual([3, 3, 3]);
        expect(texture.format).toBe(THREE.RedFormat);
        expect(texture.type).toBe(THREE.UnsignedByteType);
        // Rows of single bytes are not padded to a multiple of four.
        expect(texture.unpackAlignment).toBe(1);
    });
});

describe('clip caps', () => {
    it('builds one stencil pair and one shaded cap face', () => {
        const caps = build();
        const stencils: THREE.Mesh[] = [];
        const faces: THREE.Mesh[] = [];
        caps.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            if (child.userData.isCapStencil) stencils.push(child);
            if (child.userData.isCap) faces.push(child);
        });

        // Shading per fragment means the mesh no longer has to be split by phase.
        expect(faces).toHaveLength(1);
        expect(stencils).toHaveLength(2);
    });

    it('counts back faces up and front faces down, without drawing them', () => {
        const caps = build();
        caps.traverse(child => {
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

    it('draws the cap only where the stencil count is non-zero, after the count', () => {
        const caps = build();
        const face = caps.children.find(c => c.userData.isCap)!;
        const stencil = caps.children.find(c => c.userData.isCapStencil)!;

        const material = capMaterial(caps);
        expect(material.stencilFunc).toBe(THREE.NotEqualStencilFunc);
        expect(material.stencilRef).toBe(0);
        expect(face.renderOrder).toBeGreaterThan(stencil.renderOrder);
    });

    it('gives the shader the density map and the box it was sampled over', () => {
        const mesh = generateOrbitalMesh(params);
        const caps = createClipCaps(new THREE.BufferGeometry(), {
            plane: new THREE.Plane(),
            densityMap: mesh.densityMap,
            opacity: 1,
        });
        const material = capMaterial(caps);

        expect(material.uniforms.densityMap.value).toBeInstanceOf(THREE.Data3DTexture);
        expect(material.uniforms.rMax.value).toBe(params.rMax);
    });

    it('lays the cap on the plane, facing the side that was cut away', () => {
        const caps = build();
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 4);
        positionCaps(caps, plane);

        caps.traverse(child => {
            if (!child.userData.isCap) return;
            expect(child.position.z).toBeCloseTo(4);
            expect(plane.distanceToPoint(child.position)).toBeCloseTo(0);
        });
    });

    it('hides and shows as a unit', () => {
        const caps = build();
        setCapsVisible(caps, false);
        expect(caps.visible).toBe(false);
        setCapsVisible(caps, true);
        expect(caps.visible).toBe(true);
    });

    it('follows the surface opacity', () => {
        const caps = build();
        setCapsOpacity(caps, 0.3);
        const material = capMaterial(caps);
        expect(material.uniforms.opacity.value).toBeCloseTo(0.3);
        expect(material.transparent).toBe(true);
    });

    it('frees the density texture when the orbital is replaced', () => {
        const caps = build();
        const texture = capMaterial(caps).uniforms.densityMap.value as THREE.Data3DTexture;
        const disposed = jest.fn();
        texture.addEventListener('dispose', disposed);

        disposeCaps(caps);
        expect(disposed).toHaveBeenCalled();
    });

    it('tolerates a missing assembly', () => {
        expect(() => positionCaps(null, new THREE.Plane())).not.toThrow();
        expect(() => setCapsVisible(null, true)).not.toThrow();
        expect(() => setCapsOpacity(null, 0.5)).not.toThrow();
        expect(() => disposeCaps(null)).not.toThrow();
    });
});
