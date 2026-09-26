import * as THREE from 'three';
import {
    anglesFromDirection, directionFromAngles, CANONICAL_CAMERA_ANGLES, applyCameraAngles, cameraAnglesOf,
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
});
