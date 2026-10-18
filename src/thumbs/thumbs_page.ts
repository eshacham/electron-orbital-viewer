import * as THREE from 'three';
import { buildBallAndStick, detectBonds } from '../molecules/ball_and_stick';
import { libraryEntries } from '../molecules/catalogue';
import { loadMoleculeIndex, loadMoleculeMeta } from '../molecules/loader';
import { SOLID_LIGHTS } from '../orbital_glow';
import { THUMB_CAMERA_DIRECTION, THUMB_LIGHT_RIG } from './render_thumbnail';
import { THUMB_FILL } from './thumb_key';

/**
 * Dev-only page (public/thumbs.html) behind tools/thumbs/render_thumbs.mjs:
 * the library's build-time structure thumbnails (spec §12 item 2, ruling P11),
 * drawn by the app's own ball-and-stick builder, from the strip tiles' camera
 * direction and light rig, on a transparent 528 px square (§12's 264 px at 2×).
 *
 *   /thumbs.html          → window.__thumbIds: the library's ids, from the published index.json
 *   /thumbs.html?id=<id>  → the molecule's picture; window.__thumbReady once a frame is on screen
 *
 * Its own WebGLRenderer is no second context in the app: this page runs only in
 * the tool's own headless browser, never beside the viewer (§3.2).
 */
declare global {
    interface Window { __thumbReady?: boolean; __thumbIds?: string[]; __thumbError?: string }
}

const THUMB_PAGE_PX = 528;
const FOV_DEGREES = 30;

async function drawMolecule(id: string): Promise<void> {
    const meta = await loadMoleculeMeta(id);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(THUMB_PAGE_PX, THUMB_PAGE_PX);
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const model = buildBallAndStick(meta.atoms, detectBonds(meta.atoms));
    scene.add(model);

    // The balls: position is the centre, scale the radius (the sticks lie inside them).
    const balls = model.children.filter(part => part.userData.moleculePart === 'atom');
    const direction = new THREE.Vector3(...THUMB_CAMERA_DIRECTION).normalize();
    // The frame's right and up in the world, for a camera looking along -direction with z up.
    const [right, up] = [new THREE.Vector3(), new THREE.Vector3()];
    new THREE.Matrix4().lookAt(direction, new THREE.Vector3(), new THREE.Vector3(0, 0, 1)).extractBasis(right, up, new THREE.Vector3());
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV_DEGREES / 2));
    // As the strip's tiles (render_thumbnail.ts) the picture fills THUMB_FILL of the frame -- but the molecule's
    // own extent on screen, centred, not a bounding sphere's, which would leave a flat or long molecule a speck
    // off to one side. Perspective moves the extent as the camera moves, so a few passes settle it.
    const centre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    const enclosing = () => Math.max(...balls.map(ball => ball.position.distanceTo(centre) + ball.scale.x));
    let distance = enclosing() / Math.sin(Math.atan(THUMB_FILL * tanHalf));
    for (let pass = 0; pass < 6; pass++) {
        const eye = direction.clone().multiplyScalar(distance).add(centre);
        // Each ball's span on screen, in units of the half field of view.
        const [low, high] = [new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity)];
        for (const ball of balls) {
            const offset = ball.position.clone().sub(eye);
            const depth = -offset.dot(direction) * tanHalf;
            const at = new THREE.Vector2(offset.dot(right), offset.dot(up)).divideScalar(depth);
            const reach = ball.scale.x / depth;
            low.min(at.clone().subScalar(reach));
            high.max(at.clone().addScalar(reach));
        }
        const middle = low.clone().add(high).multiplyScalar(0.5);
        centre.addScaledVector(right, middle.x * tanHalf * distance).addScaledVector(up, middle.y * tanHalf * distance);
        distance *= Math.max(high.x - low.x, high.y - low.y) / 2 / THUMB_FILL;
    }
    const radius = enclosing();
    const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);
    camera.position.copy(direction).multiplyScalar(distance).add(centre);
    camera.lookAt(centre);
    camera.near = Math.max(1e-4, (distance - radius) / 10);
    camera.far = (distance + radius) * 10;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    // The tiles' camera-fixed rig at the Solid finish's levels.
    const toWorld = (inCamera: readonly [number, number, number]) =>
        new THREE.Vector3(...inCamera).normalize().transformDirection(camera.matrixWorld);
    const key = new THREE.DirectionalLight(0xffffff, SOLID_LIGHTS.key);
    const fill = new THREE.DirectionalLight(0xffffff, SOLID_LIGHTS.fill);
    for (const [light, inCamera] of [[key, THUMB_LIGHT_RIG.key], [fill, THUMB_LIGHT_RIG.fill]] as const) {
        light.target.position.copy(centre);
        light.position.copy(centre).add(toWorld(inCamera));
        scene.add(light, light.target);
    }
    scene.add(new THREE.AmbientLight(0xffffff, SOLID_LIGHTS.ambient));

    renderer.render(scene, camera);
    // Ready a frame later: the tool then reads the canvas (preserveDrawingBuffer keeps its pixels).
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__thumbReady = true; }));
}

async function main(): Promise<void> {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) await drawMolecule(id);
    else window.__thumbIds = libraryEntries(await loadMoleculeIndex()).map(entry => entry.id);
}

main().catch(error => { window.__thumbError = error instanceof Error ? error.message : String(error); });
