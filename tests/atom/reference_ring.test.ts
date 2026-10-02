import * as THREE from 'three';
import { createReferenceRing, positionReferenceRing, setReferenceRingWidth, disposeReferenceRing } from '../../src/atom/reference_ring';

describe('reference ring', () => {
    it('is an unstencilled overlay carrying its radius', () => {
        const ring = createReferenceRing(1.94);
        const material = ring.material as THREE.ShaderMaterial;
        expect(material.uniforms.radius.value).toBe(1.94);
        expect(material.stencilWrite).toBe(false);
        expect(material.depthTest).toBe(false);
        expect(ring.userData.isReferenceRing).toBe(true);
        expect(ring.renderOrder).toBeGreaterThan(2);    // above the cut face (renderOrder 2)
    });

    it('lies on the cut plane, facing along its normal', () => {
        const ring = createReferenceRing(2);
        const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.5);   // x = 0.5
        positionReferenceRing(ring, plane);
        expect(plane.distanceToPoint(ring.position)).toBeCloseTo(0, 12);
        ring.updateMatrixWorld(true);
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(ring.quaternion);
        expect(Math.abs(facing.dot(plane.normal))).toBeCloseTo(1, 9);
        expect(ring.visible).toBe(true);
    });

    it('hides when the cut plane misses the sphere it marks', () => {
        const ring = createReferenceRing(2);
        positionReferenceRing(ring, new THREE.Plane(new THREE.Vector3(1, 0, 0), -2.5));
        expect(ring.visible).toBe(false);
        positionReferenceRing(ring, new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9));   // "no cut"
        expect(ring.visible).toBe(false);
    });

    it('takes a world-space half-width, and disposes without throwing', () => {
        const ring = createReferenceRing(2);
        setReferenceRingWidth(ring, 0.03);
        expect((ring.material as THREE.ShaderMaterial).uniforms.halfWidth.value).toBe(0.03);
        expect(() => disposeReferenceRing(ring)).not.toThrow();
    });
});
