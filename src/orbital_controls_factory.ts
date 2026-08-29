import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Isolated from orbital_visualizer.ts for the same reason as
 * createOrbitalWorker.ts: `three/addons/.../OrbitControls.js` ships only as
 * an ES module, and Jest (no Babel in this project, ts-jest transforming to
 * CommonJS) cannot load an untransformed `import`/`export` file from
 * node_modules. `tests/atom/visualizer_dispatch.test.ts` imports
 * orbital_visualizer.ts directly, so the constructor call had to move out so
 * that module can be mocked out from under that test; orbital_visualizer.ts
 * itself only needs OrbitControls as a *type*, which a type-only import
 * erases at compile time and so never triggers this at all.
 */
export function createOrbitalControls(camera: THREE.PerspectiveCamera, domElement: HTMLElement): OrbitControls {
    return new OrbitControls(camera, domElement);
}
