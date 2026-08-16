import * as THREE from 'three';
import {
    createOrbitalMaterial,
    applySurfaceStyle,
    updateClipPlane,
} from '../src/orbital_material';
import { SurfaceStyle, defaultSurfaceStyle } from '../src/types/orbital';

const style = (over: Partial<SurfaceStyle> = {}): SurfaceStyle => ({
    ...defaultSurfaceStyle, ...over,
});

const buildOrbital = (initial: SurfaceStyle, planes: THREE.Plane[] = []) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createOrbitalMaterial(initial, planes));
    const group = new THREE.Group();
    group.add(mesh);
    return { group, mesh, material: () => mesh.material as THREE.MeshStandardMaterial };
};

describe('orbital material', () => {
    it('draws a lit surface in solid mode and lines in wireframe mode', () => {
        expect(createOrbitalMaterial(style({ mode: 'solid' }), []).wireframe).toBe(false);
        expect(createOrbitalMaterial(style({ mode: 'wireframe' }), []).wireframe).toBe(true);
    });

    it('keeps the psi-sign vertex colours in both modes', () => {
        for (const mode of ['solid', 'wireframe'] as const) {
            const material = createOrbitalMaterial(style({ mode }), []);
            expect(material.vertexColors).toBe(true);
            expect(material.side).toBe(THREE.DoubleSide);
        }
    });

    it('is opaque at full opacity and translucent below it', () => {
        const opaque = createOrbitalMaterial(style({ opacity: 1 }), []);
        expect(opaque.transparent).toBe(false);
        // Depth is written when opaque so shells occlude each other properly.
        expect(opaque.depthWrite).toBe(true);

        const seeThrough = createOrbitalMaterial(style({ opacity: 0.4 }), []);
        expect(seeThrough.transparent).toBe(true);
        expect(seeThrough.opacity).toBeCloseTo(0.4);
        // Off, so overlapping shells blend evenly instead of the first drawn winning.
        expect(seeThrough.depthWrite).toBe(false);
    });

    it('switches an existing mesh in place, without rebuilding it', () => {
        const { group, mesh, material } = buildOrbital(style());
        const originalMaterial = mesh.material;
        const originalGeometry = mesh.geometry;

        applySurfaceStyle(group, style({ mode: 'wireframe', opacity: 0.5 }));
        expect(material().wireframe).toBe(true);
        expect(material().opacity).toBeCloseTo(0.5);

        applySurfaceStyle(group, style({ mode: 'solid', opacity: 1 }));
        expect(material().wireframe).toBe(false);
        expect(material().opacity).toBe(1);

        // Same objects throughout: nothing was recreated.
        expect(mesh.material).toBe(originalMaterial);
        expect(mesh.geometry).toBe(originalGeometry);
    });

    it('hands the shared clipping planes to the material', () => {
        const planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9)];
        expect(createOrbitalMaterial(style(), planes).clippingPlanes).toBe(planes);
    });

    it('ignores a missing group', () => {
        expect(() => applySurfaceStyle(null, style())).not.toThrow();
    });
});

describe('cut-away plane', () => {
    const keeps = (plane: THREE.Plane, point: [number, number, number]) =>
        plane.distanceToPoint(new THREE.Vector3(...point)) > 0;

    it('keeps every point when the cut is off', () => {
        const plane = new THREE.Plane();
        updateClipPlane(plane, 'none', 0, 200);

        for (const p of [[0, 0, 0], [200, 200, 200], [-200, -200, -200]] as const) {
            expect(keeps(plane, [...p])).toBe(true);
        }
    });

    it.each([
        ['x', [1, 0, 0], [-1, 0, 0]],
        ['y', [0, 1, 0], [0, -1, 0]],
        ['z', [0, 0, 1], [0, 0, -1]],
    ] as Array<['x' | 'y' | 'z', [number, number, number], [number, number, number]]>)(
        'cuts the far half along %s',
        (axis, positive, negative) => {
            const rMax = 20;
            const plane = new THREE.Plane();
            updateClipPlane(plane, axis, 0, rMax);   // cut through the centre

            const far = positive.map(c => c * rMax * 0.5) as [number, number, number];
            const near = negative.map(c => c * rMax * 0.5) as [number, number, number];
            expect(keeps(plane, far)).toBe(false);
            expect(keeps(plane, near)).toBe(true);
        }
    );

    it('keeps the whole orbital at +1 and removes it at -1', () => {
        const rMax = 20;
        const plane = new THREE.Plane();
        const corner: [number, number, number] = [rMax, 0, 0];
        const opposite: [number, number, number] = [-rMax, 0, 0];

        updateClipPlane(plane, 'x', 1, rMax);
        expect(keeps(plane, opposite)).toBe(true);

        updateClipPlane(plane, 'x', -1, rMax);
        expect(keeps(plane, corner)).toBe(false);
        expect(keeps(plane, opposite)).toBe(false);
    });

    it('scales with rMax so the same slider position cuts the same fraction', () => {
        const small = new THREE.Plane();
        const large = new THREE.Plane();
        updateClipPlane(small, 'z', 0.5, 20);
        updateClipPlane(large, 'z', 0.5, 200);

        expect(small.constant).toBeCloseTo(10);
        expect(large.constant).toBeCloseTo(100);
    });
});
