import * as THREE from 'three';
import {
    anglesFromDirection, directionFromAngles, CANONICAL_CAMERA_ANGLES, applyCameraAngles, cameraAnglesOf,
    cutFaceCameraDirection,
} from '../src/camera_angles';

describe('camera angles', () => {
    it('names the canonical three-quarter view', () => {
        expect(CANONICAL_CAMERA_ANGLES).toEqual({ azimuth: 29, elevation: 30 });
    });

    it('round-trips whole-degree angles through a direction', () => {
        for (let azimuth = -179; azimuth <= 180; azimuth += 7) {
            for (let elevation = -89; elevation <= 89; elevation += 11) {
                const d = directionFromAngles({ azimuth, elevation });
                expect(anglesFromDirection(d.x, d.y, d.z)).toEqual({ azimuth, elevation });
            }
        }
    });

    it('holds elevation short of the pole, where azimuth stops meaning anything', () => {
        expect(anglesFromDirection(0, 0, 5)).toEqual({ azimuth: 0, elevation: 89 });
    });

    it('turns the camera to the angles at the distance it already had', () => {
        const target = new THREE.Vector3(1, 1, 1);
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(1, 1, 11);
        applyCameraAngles(camera, target, { azimuth: 90, elevation: 0 });
        expect(camera.position.distanceTo(target)).toBeCloseTo(10, 9);
        expect(cameraAnglesOf(camera, target)).toEqual({ azimuth: 90, elevation: 0 });
        applyCameraAngles(camera, target, null);
        expect(cameraAnglesOf(camera, target)).toEqual(CANONICAL_CAMERA_ANGLES);
    });

    // Task 5 (ruling P17): a share link's cut, or Reset View / an element
    // pick with one active, must face the cut's exposed face -- not the
    // plain canonical angle, which (for a cut on some axis) is edge-on.
    it.each(['x', 'y', 'z'] as const)(
        'faces the %s cut from its own side, with a unit length (preflight D1/D11)',
        (axis) => {
            const [x, y, z] = cutFaceCameraDirection(axis);
            expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
            const components = { x, y, z };
            // The face is seen from the removed side, slightly above (the
            // step 1 brief): the axis itself dominates, and the other two --
            // never on the opposite side -- are both positive.
            for (const other of (['x', 'y', 'z'] as const).filter(a => a !== axis)) {
                expect(components[other]).toBeGreaterThan(0);
                expect(components[axis]).toBeGreaterThan(components[other]);
            }
        }
    );

    it('turns the camera to a standard direction other than canonical when there is no saved angle', () => {
        const target = new THREE.Vector3();
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(0, 0, 10);
        const standard = cutFaceCameraDirection('x');
        applyCameraAngles(camera, target, null, standard);
        const direction = camera.position.clone().sub(target).normalize();
        expect(direction.x).toBeCloseTo(standard[0], 9);
        expect(direction.y).toBeCloseTo(standard[1], 9);
        expect(direction.z).toBeCloseTo(standard[2], 9);
    });
});
