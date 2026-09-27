/** Isolated for the reason given in createOrbitalWorker.ts: import.meta.url, which Jest cannot parse. */
export function createExportWorker(): Worker {
    return new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });
}
