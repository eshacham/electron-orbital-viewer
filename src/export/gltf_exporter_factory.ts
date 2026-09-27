import type * as THREE from 'three';

/**
 * Isolated for the same reason as orbital_controls_factory.ts: three's
 * addons ship only as ES modules, which Jest here cannot load. Imported
 * lazily as well, so the exporter is a separate chunk fetched on first use
 * rather than weight on every page load.
 */
export async function exportGlb(scene: THREE.Object3D): Promise<ArrayBuffer> {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const result = await new GLTFExporter().parseAsync(scene, { binary: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('The glTF exporter returned JSON where binary was asked for.');
    return result;
}
