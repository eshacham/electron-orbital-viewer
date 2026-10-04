import { createAppStore, RootState } from '../../src/store';
import { setElement, setCharge, setExcitation, setRelativity, setMode, solveSucceeded, solveUnbound } from '../../src/store/atomSlice';
import { startFieldCalculation, finishOrbitalCalculation } from '../../src/store/orbitalSlice';
import { selectBondsSystem, setScanPoint, setBondsView } from '../../src/store/bondsSlice';
import { AtomSpecies, speciesKey } from '../../src/atom/species';
import { SerialisedAtomProfile, ReferenceRadii, SerialisedComparison } from '../../src/workers/atomWorker';
import { RelativityMode } from '../../src/atom/relativity';
import { ExportContext } from '../../src/export/run_export';
import type { ExportSurface } from '../../src/export/surfaces';
import type { ViewerExportHandle } from '../../src/export/handle';
import { CANONICAL_CAMERA_ANGLES } from '../../src/camera_angles';
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import type { BondsView } from '../../src/store/bondsSlice';
import { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../../src/molecules/types';
import type { H2PlusCurve } from '../../src/bonds/useH2PlusCurve';

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
        displayRadius: 10,
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
    // The switch shows the picture's own mode, as once its solve has landed
    // (pictureLanded): exports wait while the two differ (final review M5).
    store.dispatch(setRelativity(relativity));
    store.dispatch(solveSucceeded(goldProfile(relativity, options)));
    return store;
}

/** Au⁺ (Z = 79), drawn in the given mode, with a neutral-gold reference ring -- for the ring caption's mode-naming test. */
export function goldIonStore(relativity: RelativityMode) {
    const store = makeStore();
    store.dispatch(setElement(79));
    store.dispatch(setCharge(1));
    store.dispatch(setRelativity(relativity));
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

/**
 * Fluorine's anion F⁻ (Z = 9, charge -1), which this LDA *does* bind -- for
 * fix round 1 (I3), pinning that a cube title's charge superscript survives
 * `asciiLine` as a trailing hyphen ('F-') rather than vanishing. `⁻`
 * (U+207B SUPERSCRIPT MINUS) decomposes under NFKD into U+2212 MINUS SIGN, a
 * *second* non-ASCII character produced only by normalising -- the same
 * mechanism as H₂⁺'s '10⁻¹⁰ Ha' losing its sign, found live.
 */
export function fluorideIonStore() {
    const store = makeStore();
    store.dispatch(setElement(9));
    store.dispatch(setCharge(-1));
    const species: AtomSpecies = { Z: 9, charge: -1, excitation: null };
    store.dispatch(solveSucceeded(speciesProfile(species)));
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

/**
 * N₂ at its (shortened, for the test) scan point 07 -- shaped like
 * tests/bonds/bonds_request.test.ts's own `basis` fixture, plus the meta and
 * scan Task 13b's exports need (bonds_request.ts alone only ever needed the
 * basis). Positions in bohr; `R ≈ 2.074` matches the basis' own two atoms,
 * same as bonds_request.test.ts, so a derived-from-geometry R and a
 * scan-point R agree in these tests.
 */
export const N2_BASIS: MoleculeBasis = {
    id: 'n2@07', spherical: true, convention: 'x', atoms: [[0, 0, -1.037], [0, 0, 1.037]], nao: 1,
    shells: [{ atom: 0, l: 0, exponents: [1], coefficients: [1] }],
    orbitals: [
        { index: 0, label: '3σg', energyHartree: -0.38, occupation: 2, spin: 'restricted', coefficients: [1] },
        { index: 1, label: '1πg*', energyHartree: -0.08, occupation: 0, spin: 'restricted', coefficients: [1] },
        { index: 2, label: '1πg*', energyHartree: -0.08, occupation: 0, spin: 'restricted', coefficients: [1] },
    ],
};

export const N2_META: MoleculeMeta = {
    id: 'n2@07', name: 'Nitrogen', formula: 'N₂',
    atoms: [{ Z: 7, position: [0, 0, -1.037] }, { Z: 7, position: [0, 0, 1.037] }],
    geometrySource: 'test', method: { density: 'B3LYP/def2-TZVP', energies: 'CCSD(T)/aug-cc-pVTZ (frozen core)' },
    totalEnergyHartree: -109.15, multireference: false, t1AtRe: 0.011,
    orbitals: N2_BASIS.orbitals, references: [],
    generator: { pyscf: '2.8.0', script: 'generate.py', commit: 'test' },
};

export const N2_SCAN: MoleculeScan = {
    id: 'n2', name: 'Nitrogen', formula: 'N₂', spin: 0,
    energyMethod: 'CCSD(T)/aug-cc-pVTZ (frozen core)', densityMethod: 'B3LYP/def2-TZVP',
    points: [
        { index: 6, id: 'n2@06', RBohr: 2.0, energyHartree: -109.14, dftEnergyHartree: -109.3, t1Diagnostic: 0.01 },
        { index: 7, id: 'n2@07', RBohr: 2.074, energyHartree: -109.15, dftEnergyHartree: -109.31, t1Diagnostic: 0.011 },
        { index: 8, id: 'n2@08', RBohr: 2.2, energyHartree: -109.1, dftEnergyHartree: -109.25, t1Diagnostic: 0.012 },
    ],
    equilibriumIndex: 1,
    fit: {
        ReBohr: 2.074, ReUncertaintyBohr: 0.0001, EminHartree: -109.15, DeHartree: 0.3, DeEv: 8.16,
        bound: true, separatedAtomsHartree: -109.0, separatedAtomsMethod: 'N ⁴S + N ⁴S, UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core)',
    },
    validity: {
        pointsComputed: 3, pointsShipped: 3, exact: false, t1Limit: 0.02, t1AtRe: 0.011,
        multireference: false, validUpToRBohr: 2.2, stoppedAtRBohr: null, stopReason: null,
    },
    spinCheck: null, note: null, reference: { ReAngstrom: 1.098, source: 'NIST' },
};

/** N₂'s basis.json carries no element data (only the Gaussian functions) -- O₂'s cube test needs its own Z-bearing meta to match. */
export const O2_META: MoleculeMeta = {
    ...N2_META, id: 'o2@04', name: 'Oxygen', formula: 'O₂',
    atoms: [{ Z: 8, position: [0, 0, -1.145] }, { Z: 8, position: [0, 0, 1.145] }],
};

/** O₂'s open shell: an unrestricted 1πg* (α and β), for the spin-labelled caption/file-stem tests (brief's own worked example). */
export const O2_BASIS: MoleculeBasis = {
    id: 'o2@04', spherical: true, convention: 'x', atoms: [[0, 0, -1.145], [0, 0, 1.145]], nao: 1,
    shells: [{ atom: 0, l: 0, exponents: [1], coefficients: [1] }],
    orbitals: [
        { index: 0, label: '1πg*', energyHartree: -0.3, occupation: 1, spin: 'alpha', coefficients: [1] },
        { index: 1, label: '1πg*', energyHartree: -0.3, occupation: 1, spin: 'beta', coefficients: [1] },
    ],
};

/** Bonds mode, N₂ drawn at scan point 07, the orbital or density `view` asks for (default: the 3σg orbital). */
export function bondsMoleculeStore(view: { kind: 'mo'; label: string; spin: 'restricted' | 'alpha' | 'beta'; component: number } | { kind: 'density' } = { kind: 'mo', label: '3σg', spin: 'restricted', component: 0 }) {
    const store = makeStore();
    store.dispatch(setMode('bonds'));
    store.dispatch(selectBondsSystem('n2'));
    store.dispatch(setScanPoint({ system: 'n2', index: 7, RBohr: 2.074 }));
    store.dispatch(setBondsView(view));
    const { request } = bondsFieldRequest(store.getState().bonds, N2_BASIS, 0.9)!;
    store.dispatch(startFieldCalculation(request));
    // A landed render (App.tsx's one finishOrbitalCalculation call site,
    // dispatched regardless of mode): without it isLoading stays true and
    // every export but CSV would read as still busy.
    store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
    return store;
}

/** Bonds mode, O₂ drawn at scan point 04 (R = 2.29 a₀), the brief's own worked example (requirement 3). */
export function bondsO2Store(view: BondsView = { kind: 'mo', label: '1πg*', spin: 'alpha', component: 0 }) {
    const store = makeStore();
    store.dispatch(setMode('bonds'));
    store.dispatch(selectBondsSystem('o2'));
    store.dispatch(setScanPoint({ system: 'o2', index: 4, RBohr: 2.29 }));
    store.dispatch(setBondsView(view));
    const { request } = bondsFieldRequest(store.getState().bonds, O2_BASIS, 0.9)!;
    store.dispatch(startFieldCalculation(request));
    store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
    return store;
}

/** Bonds mode, H₂⁺'s default view (1σg at R = 2 a₀), landed (see bondsMoleculeStore). */
export function bondsH2PlusStore() {
    const store = makeStore();
    store.dispatch(setMode('bonds'));
    const { request } = bondsFieldRequest(store.getState().bonds, null, 0.9)!;
    store.dispatch(startFieldCalculation(request));
    store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
    return store;
}

/**
 * Fix round 1 (I1), the reviewer's own probe: H₂⁺'s picture is drawn and
 * landed, then the panel is switched to N₂ -- `selectBondsSystem` updates
 * `state.bonds.system` at once, but nothing has re-rendered yet, so
 * `state.orbital.currentField` still holds H₂⁺'s request. Every Bonds export
 * must read the *drawn* H₂⁺ picture (or refuse outright), never N₂'s method/
 * scan/meta layered onto it.
 */
export function bondsMismatchStore() {
    const store = bondsH2PlusStore();
    store.dispatch(selectBondsSystem('n2'));
    return store;
}

/**
 * A small, fast stand-in for useH2PlusCurve's real (solved) curve -- fix
 * round 1 (I2): the CSV must read this rather than re-solving on the main
 * thread, so tests exercising it no longer need the ~1 s real solve either.
 */
export const FAKE_H2PLUS_CURVE: H2PlusCurve = {
    R: [0.5, 1, 2, 3],
    sigmaG: [-0.3, -0.9, -1.1026342144951868, -0.97],
    sigmaU: [-0.1, -0.4, -0.6675343922018, -0.55],
    equilibrium: { R: 1.997193, totalEnergy: -0.602634619 },
};

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
