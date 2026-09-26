import * as THREE from 'three';

/**
 * Which side the camera looks from, in whole degrees with z up: azimuth
 * round the z axis from +x, elevation above the xy plane. Whole degrees
 * because this goes in a shared link, where 29.2517 says nothing 29 does
 * not. Distance is deliberately absent: the app fits it to the screen and
 * the panels, which differ between the device that shared and the one that
 * opens the link.
 */
export interface CameraAngles { azimuth: number; elevation: number; }

/** The canonical three-quarter view (see defaultCameraPosition's comment). */
export const CANONICAL_CAMERA_DIRECTION: readonly [number, number, number] = [0.75, 0.42, 0.5];

const DEGREES = 180 / Math.PI;
/** Short of the pole, where azimuth is undefined and OrbitControls flips. */
const MAX_ELEVATION = 89;

export function anglesFromDirection(x: number, y: number, z: number): CameraAngles {
    const length = Math.hypot(x, y, z) || 1;
    const elevation = Math.round(Math.asin(Math.max(-1, Math.min(1, z / length))) * DEGREES);
    let azimuth = Math.round(Math.atan2(y, x) * DEGREES);
    if (azimuth <= -180) azimuth += 360;
    // + 0 turns -0 into 0, so a link never reads "-0".
    return {
        azimuth: azimuth + 0,
        elevation: Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, elevation)) + 0,
    };
}

export const CANONICAL_CAMERA_ANGLES: CameraAngles = anglesFromDirection(...CANONICAL_CAMERA_DIRECTION);

export function directionFromAngles({ azimuth, elevation }: CameraAngles): THREE.Vector3 {
    const a = azimuth / DEGREES;
    const e = elevation / DEGREES;
    return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e));
}

export function isCanonicalAngles(angles: CameraAngles): boolean {
    return angles.azimuth === CANONICAL_CAMERA_ANGLES.azimuth && angles.elevation === CANONICAL_CAMERA_ANGLES.elevation;
}

export function cameraAnglesOf(camera: THREE.Camera, target: THREE.Vector3): CameraAngles {
    const d = camera.position.clone().sub(target);
    return anglesFromDirection(d.x, d.y, d.z);
}

/** Turns the camera to these angles (null: the canonical view), keeping its distance. */
export function applyCameraAngles(camera: THREE.Camera, target: THREE.Vector3, angles: CameraAngles | null): void {
    const distance = camera.position.distanceTo(target) || 1;
    const direction = angles
        ? directionFromAngles(angles)
        : new THREE.Vector3(...CANONICAL_CAMERA_DIRECTION).normalize();
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    camera.lookAt(target);
}
