import { createAppStore, RootState } from '../../src/store';
import { setElement, solveSucceeded } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { ExportContext } from '../../src/export/run_export';
import type { ExportSurface } from '../../src/export/surfaces';

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

/**
 * Fix round 1 (M3): decoded as UTF-8, not byte-per-character -- the export
 * now carries a UTF-8 BOM and non-ASCII captions (—, ², ½). TextDecoder
 * strips a leading BOM by default, so callers see the text exactly as a
 * spreadsheet would after opening the file.
 */
export async function readText(blob: Blob): Promise<string> {
    return new TextDecoder('utf-8').decode(await readBlob(blob));
}

/**
 * Ruling C9: shared across the export tests, defined once here rather than
 * exported from a test file. Every export needs a state, a link back to the
 * view it came from, and the curves App would hand it -- callers override
 * `csvCurves` when they need to exercise the CSV encoder itself.
 */
export const baseContext = (state: RootState): ExportContext => ({ state, shareUrl: 'http://x/#mode=atom&Z=10', csvCurves: [] });

/** A closed octahedron of half-width 1 bohr, wound outward. */
export function octahedron(name = 'octa'): ExportSurface {
    return {
        name,
        positions: new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]),
        indices: new Uint32Array([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]),
        colors: new Float32Array(18).fill(1),
    };
}
