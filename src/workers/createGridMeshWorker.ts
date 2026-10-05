/** Isolated for the same reason as createOrbitalWorker.ts: import.meta.url does not load under ts-jest. */
export function createGridMeshWorker(): Worker {
    return new Worker(new URL('./gridMeshWorker.ts', import.meta.url), { type: 'module' });
}
