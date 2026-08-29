/**
 * Isolated from orbital_visualizer.ts for one reason: `import.meta.url` has
 * no CommonJS equivalent, so ts-jest's (CommonJS) transform leaves it in the
 * emitted output verbatim, and Node's script loader then fails outright with
 * "Cannot use 'import.meta' outside a module" -- for the *whole file*, not
 * just this expression, because a syntax error anywhere in a module stops it
 * from loading at all. `tests/atom/visualizer_dispatch.test.ts` imports
 * orbital_visualizer.ts directly to exercise the shell-view dispatch and the
 * pointer/hover linkage, so that file has to stay free of this construct;
 * moving the one line that needs it here and mocking this module out in that
 * test is what makes it loadable under Jest at all. Vite (the real app) is
 * unaffected -- it understands `import.meta.url` natively and this is still
 * exactly the pattern it recognises for bundling a worker as its own chunk.
 */
export function createOrbitalWorker(): Worker {
    return new Worker(new URL('./orbitalWorker.ts', import.meta.url), { type: 'module' });
}
