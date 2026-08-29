/**
 * Isolated from useAtomSolver.ts for the same reason as
 * createOrbitalWorker.ts: `import.meta.url` has no CommonJS equivalent, and
 * App.test.tsx (which renders the real App, and therefore the real
 * useAtomSolver) needs to load without ever parsing this expression. Moving
 * the one line that needs it here, and mocking this module out in tests,
 * keeps App.tsx's atom-mode solve wiring under test without touching how
 * Vite bundles the real worker.
 */
export function createAtomWorker(): Worker {
    return new Worker(new URL('./atomWorker.ts', import.meta.url), { type: 'module' });
}
