/** Isolated for the same reason as createOrbitalWorker.ts: `import.meta.url` does not load under ts-jest. */
export function createH2PlusCurveWorker(): Worker {
    return new Worker(new URL('./h2plusCurveWorker.ts', import.meta.url), { type: 'module' });
}
