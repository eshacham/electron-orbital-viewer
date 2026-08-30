/**
 * Isolated from orbital_visualizer.ts / OrbitalViewer.tsx for the same
 * reason as createOrbitalWorker.ts and createAtomWorker.ts:
 * `import.meta.url` has no CommonJS equivalent, so ts-jest's (CommonJS)
 * transform cannot load a file containing it. Moving the one line that
 * needs it here, and mocking this module out in tests, keeps the shell
 * composition wiring under test without touching how Vite bundles the real
 * worker.
 */
export function createShellCompositionWorker(): Worker {
    return new Worker(new URL('./shellCompositionWorker.ts', import.meta.url), { type: 'module' });
}
