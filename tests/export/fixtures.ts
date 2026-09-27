import { createAppStore, RootState } from '../../src/store';
import { setElement, solveSucceeded } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { ExportContext } from '../../src/export/run_export';

/** A store with production's middleware config (see createAppStore), so a typed-array payload does not print serializableCheck's console.error. */
export const makeStore = () => createAppStore();

/** Neon-shaped: shells 1 and 2; 1s, 2s, 2p; hydrogen-like D(r) on an odd log grid. */
export function neonProfile(): SerialisedAtomProfile {
    const size = 401, rMin = 1e-4, dx = Math.log(30 / rMin) / (size - 1);
    const D = new Float64Array(size);
    for (let j = 0; j < size; j++) { const r = rMin * Math.exp(j * dx); D[j] = 4 * r * r * Math.exp(-2 * r); }
    const shell = (n: number) => ({ n, electrons: n === 1 ? 2 : 8, contourRadius: n, curve: D, emphasis: new Float32Array(size) });
    const sub = (n: number, l: number) => ({ n, l, electrons: 2, energy: -1, curve: D, R: new Float64Array(size), samplingRadius: 3, compositeSamplingRadius: 3 });
    return {
        Z: 10, converged: true, rMin, dx, size, total: Float32Array.from(D), totalEmphasis: new Float32Array(size),
        contourRadius: 2, valencePeakRadius: 1, displayRadius: 2, shellPeaks: new Float64Array([1]),
        shellIndexAtR: new Float32Array(size), shells: [shell(1), shell(2)], subshells: [sub(1, 0), sub(2, 0), sub(2, 1)],
    };
}

export function neonStore() {
    const store = makeStore();
    store.dispatch(setElement(10));
    store.dispatch(solveSucceeded(neonProfile()));
    return store;
}

export function readBlob(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

export async function readText(blob: Blob): Promise<string> {
    return Array.from(new Uint8Array(await readBlob(blob)), c => String.fromCharCode(c)).join('');
}

/**
 * Ruling C9: shared across the export tests, defined once here rather than
 * exported from a test file. Every export needs a state, a link back to the
 * view it came from, and the curves App would hand it -- callers override
 * `csvCurves` when they need to exercise the CSV encoder itself.
 */
export const baseContext = (state: RootState): ExportContext => ({ state, shareUrl: 'http://x/#mode=atom&Z=10', csvCurves: [] });
