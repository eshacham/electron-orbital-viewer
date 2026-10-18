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

/**
 * The two angles `cutFaceCameraDirection` builds its vectors from, named so
 * the owner can retune the view without hunting through a vector literal
 * (preflight D11: the plan's own prose and its example vectors disagreed on
 * these two numbers -- this is now the one place either reads).
 */
const CUT_FACE_ELEVATION_DEG = 25;
const CUT_FACE_OFF_AXIS_DEG = 12;

/**
 * The camera direction that looks squarely at a cut's exposed face, rather
 * than edge-on along whatever direction the camera already happened to be
 * facing before the cut was made (the problem `frameOrbital`'s own
 * "restoreDefaultDirection" branch exists to fix -- see its doc comment: it
 * only ever rescales a direction, never changes one, on every other call).
 *
 * Mostly along `axis`, since the cut removed everything on the other side of
 * it and this is the side the exposed cap faces: lifted
 * CUT_FACE_ELEVATION_DEG toward +z (this app's world "up", so the cap's own
 * shading reads, instead of a flat silhouette) and nudged
 * CUT_FACE_OFF_AXIS_DEG toward a second axis, so the result also sits on no
 * symmetry plane -- the same reasoning as `defaultCameraPosition`'s own
 * three unequal components, applied to whichever two axes are left once one
 * is spent on "facing the cut". A cut along z itself has no further "up" to
 * lift toward (z already is up), so x takes the elevation role there, and y
 * the off-axis one.
 */
export function cutFaceCameraDirection(axis: 'x' | 'y' | 'z'): readonly [number, number, number] {
    const elevation = CUT_FACE_ELEVATION_DEG / DEGREES;
    const offAxis = CUT_FACE_OFF_AXIS_DEG / DEGREES;
    const dominant = Math.cos(elevation) * Math.cos(offAxis);
    const lift = Math.sin(elevation) * Math.cos(offAxis);
    const nudge = Math.cos(elevation) * Math.sin(offAxis);

    const vector = { x: 0, y: 0, z: 0 };
    vector[axis] = dominant;
    if (axis === 'z') {
        vector.x = lift;
        vector.y = nudge;
    } else {
        vector.z = lift;
        vector[axis === 'x' ? 'y' : 'x'] = nudge;
    }

    // Normalised explicitly: combining an elevation and an off-axis tilt as
    // two independent single-axis rotations (above) is not quite a proper
    // spherical parameterisation, so the raw result is a hair short of unit
    // length.
    const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    return [vector.x / length, vector.y / length, vector.z / length];
}

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

/**
 * Turns the camera to these angles, keeping its distance. `angles === null`
 * means "no saved angle -- use the standard view", which `standardDirection`
 * names: the plain canonical three-quarter view by default, or (preflight
 * D1) `orbital_visualizer.ts`'s `standardViewDirection(context)` when the
 * caller knows a cut is active, so a share link with no saved angle still
 * opens facing the cut's exposed face rather than edge-on.
 */
export function applyCameraAngles(
    camera: THREE.Camera,
    target: THREE.Vector3,
    angles: CameraAngles | null,
    standardDirection: readonly [number, number, number] = CANONICAL_CAMERA_DIRECTION,
): void {
    const distance = camera.position.distanceTo(target) || 1;
    const direction = angles
        ? directionFromAngles(angles)
        : new THREE.Vector3(...standardDirection).normalize();
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    camera.lookAt(target);
}
