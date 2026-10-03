import { createAppStore, RootState } from '../../src/store';
import { setElement, setCharge, setExcitation, solveSucceeded, solveUnbound } from '../../src/store/atomSlice';
import { AtomSpecies, speciesKey } from '../../src/atom/species';
import { SerialisedAtomProfile, ReferenceRadii, SerialisedComparison } from '../../src/workers/atomWorker';
import { RelativityMode } from '../../src/atom/relativity';
import { ExportContext } from '../../src/export/run_export';
import type { ExportSurface } from '../../src/export/surfaces';
import type { ViewerExportHandle } from '../../src/export/handle';
import { CANONICAL_CAMERA_ANGLES } from '../../src/camera_angles';

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

/**
 * Gold-shaped (Z = 79), for Task 12b's relativistic export tests: an inner
 * shell plus a 6s/6p valence, with the 6p split into its two j-levels when
 * `j` is asked for (spin–orbit) and a same-species non-relativistic
 * comparison baseline (ruling C5) when `comparison` is asked for. Real
 * gold's actual configuration doesn't matter to a caption/CSV-shape test --
 * only that the shape (shells, subshells, j, a matching baseline) is there
 * to read, same spirit as neonProfile above.
 */
export function goldProfile(relativity: RelativityMode, options: { j?: boolean; comparison?: boolean } = {}): SerialisedAtomProfile {
    const size = 401, rMin = 1e-4, dx = Math.log(30 / rMin) / (size - 1);
    const D = new Float64Array(size);
    for (let j = 0; j < size; j++) { const r = rMin * Math.exp(j * dx); D[j] = 4 * r * r * Math.exp(-2 * r); }
    const shell = (n: number, electrons: number) => ({ n, electrons, contourRadius: n, curve: D, emphasis: new Float32Array(size) });
    const sub = (n: number, l: number, electrons: number, j?: number) => ({
        n, l, ...(j === undefined ? {} : { j }), electrons, energy: -1, curve: D, R: new Float64Array(size), samplingRadius: 3, compositeSamplingRadius: 3,
    });
    const pSubshells = options.j ? [sub(6, 1, 2, 0.5), sub(6, 1, 4, 1.5)] : [sub(6, 1, 6)];
    const nonRelativistic: SerialisedComparison | undefined = options.comparison ? {
        framingRadius: 10,
        shells: [{ n: 6, contourRadius: 6, curve: D }],
        subshells: [{ n: 6, l: 1, electrons: 6, curve: D }],
    } : undefined;
    return {
        Z: 79, converged: true, rMin, dx, size, total: Float32Array.from(D), totalEmphasis: new Float32Array(size),
        contourRadius: 6, valencePeakRadius: 6, displayRadius: 6, shellPeaks: new Float64Array([6]),
        shellIndexAtR: new Float32Array(size),
        shells: [shell(5, 18), shell(6, 1)],
        subshells: [sub(5, 2, 10), ...pSubshells],
        relativity, nonRelativistic,
    };
}

/** Neutral gold, drawn in the given mode -- see goldProfile. */
export function goldStore(relativity: RelativityMode, options: { j?: boolean; comparison?: boolean } = {}) {
    const store = makeStore();
    store.dispatch(setElement(79));
    store.dispatch(solveSucceeded(goldProfile(relativity, options)));
    return store;
}

/** Au⁺ (Z = 79), drawn in the given mode, with a neutral-gold reference ring -- for the ring caption's mode-naming test. */
export function goldIonStore(relativity: RelativityMode) {
    const store = makeStore();
    store.dispatch(setElement(79));
    store.dispatch(setCharge(1));
    const reference: ReferenceRadii = { displayRadius: 1.6, contourRadius: 1.5, framingRadius: 2 };
    const species: AtomSpecies = { Z: 79, charge: 1, excitation: null };
    store.dispatch(solveSucceeded({ ...goldProfile(relativity), charge: 1, speciesKey: speciesKey(species), reference }));
    return store;
}

/**
 * Neon-shaped (see neonProfile), re-keyed for any species -- good enough for
 * the whole-atom-level export tests that use it: none of them drill down,
 * so the shells'/subshells' actual occupancy never has to match the species
 * for real. `reference` carries the neutral comparison radii Task 10's ring
 * needs (null for a neutral ground state, which is its own reference).
 */
export function speciesProfile(species: AtomSpecies, reference: ReferenceRadii | null = null): SerialisedAtomProfile {
    return { ...neonProfile(), Z: species.Z, charge: species.charge, speciesKey: speciesKey(species), reference };
}

/** Sodium ion Na⁺ (Z = 11), with a neutral-sodium reference ring. */
export function sodiumIonStore() {
    const store = makeStore();
    store.dispatch(setElement(11));
    store.dispatch(setCharge(1));
    const species: AtomSpecies = { Z: 11, charge: 1, excitation: null };
    const reference: ReferenceRadii = { displayRadius: 1.2838, contourRadius: 1.2, framingRadius: 1.9 };
    store.dispatch(solveSucceeded(speciesProfile(species, reference)));
    return store;
}

/** Sodium, excited 3s → 3p (Z = 11) -- a neutral excited atom, so no reference ring. */
export function sodiumExcitedStore() {
    const store = makeStore();
    store.dispatch(setElement(11));
    const excitation = { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } };
    store.dispatch(setExcitation(excitation));
    const species: AtomSpecies = { Z: 11, charge: 0, excitation };
    store.dispatch(solveSucceeded(speciesProfile(species)));
    return store;
}

/** Chlorine's anion, which this LDA does not bind (Global Constraints, fact 3) -- every export refuses with the store's own message. */
export function chlorideUnboundStore() {
    const store = makeStore();
    store.dispatch(setElement(17));
    store.dispatch(setCharge(-1));
    store.dispatch(solveUnbound('LDA does not bind this anion: its 3p electron is not bound by 10⁻⁴ Ha or more.'));
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

/** A stand-in for OrbitalViewer's export handle: holds nothing unless told to. */
export function exportHandle(overrides: Partial<ViewerExportHandle> = {}): ViewerExportHandle {
    return { capturePng: jest.fn(), collectSurfaces: () => [], surfaceCount: () => 0, cameraAngles: () => CANONICAL_CAMERA_ANGLES, ...overrides };
}
