/**
 * The JSON shapes of spec §4.2, as tools/molecules/generate.py actually
 * writes them (tools/molecules/out/v1/*{meta,scan,basis,index}.json). Positions
 * in bohr (a0). esp/dipole fields are Phase 6's; v1 ships none.
 */
export type OrbitalSpin = 'restricted' | 'alpha' | 'beta';

export interface MoleculeIndexEntry {
    id: string;
    name: string;
    formula: string;
    category: string;
    tags: string[];
    tier?: MoleculeTier;
}

export interface MoleculeAtom {
    Z: number;
    position: [number, number, number];
}

export interface GridSpec {
    /** Points per axis. */
    shape: [number, number, number];
    /** World position of grid point (0,0,0), a0. */
    origin: [number, number, number];
    /** Spacing, a0. */
    spacing: number;
}

/**
 * Recorded (tools/molecules/outputs.py) when the orbital kept over its
 * runner-up during MINAO-weight selection wins by less than the tie margin --
 * e.g. CO's 6σ at 0.80 R_e (Task 4's carry). Absent otherwise.
 */
export interface NearTie {
    minaoWeight: number;
    runnerUpMinaoWeight: number;
    runnerUpEnergyHartree: number;
}

/** Phase 6D adds LVMO: the lowest valence virtual, where the LUMO is a diffuse state of the basis. */
export type OrbitalRole = 'HOMO' | 'LUMO' | 'SOMO' | 'LVMO';
/** A virtual's class (Phase 6D): 'diffuse' under 75 % valence character (orbitals.py's VALENCE_THRESHOLD). */
export type VirtualClass = 'valence' | 'diffuse';

export interface MoleculeOrbitalInfo {
    /** Position in basis.json's `orbitals`; what a 'gaussianMO' recipe's `index` means. */
    index: number;
    /** 'nσg', 'nπu', antibonding starred for homonuclear molecules. */
    label: string;
    energyHartree: number;
    occupation: number;
    spin?: OrbitalSpin;
    role?: OrbitalRole;
    /** Phase 6D (library v3, jobs from compute version 2): a virtual's share inside the intrinsic minimal basis, 0-1. */
    valenceCharacter?: number;
    class?: VirtualClass;
    /** Not a canonical MO: the lowest valence virtual orbital, built from the IAO span (orbitals.py appends it). */
    kind?: 'valence-virtual';
    /** Set with `kind` on a constructed row; either flag marks it, and the viewer reads the flags, not `note`. */
    constructed?: boolean;
    /** The generator's name; read it as "the energy is an upper estimate" (Ruling D4-energy): a constructed row's
     * energy is its value within the valence space, several eV above the calculation's own orbital energies. */
    energyApproximate?: boolean;
    /** orbitals.CONSTRUCTED_NOTE as the generator wrote it -- for other readers of meta.json; the list renders its own. */
    note?: string;
    /** Why a degenerate set was left unlabelled ('?'). */
    labelNote?: string;
    nearTie?: NearTie;
}

export interface MoleculeMeta {
    id: string;
    name: string;
    formula: string;
    atoms: MoleculeAtom[];
    geometrySource: string;
    method: { density: string; energies: string };
    totalEnergyHartree: number;
    dftEnergyHartree?: number;
    dipoleDebye?: number;
    spin?: number;
    /** (bonding − antibonding)/2 for homonuclear diatomics; null where g/u counting does not apply (CO, HF). */
    bondOrder?: number | null;
    /** True where single-reference CCSD(T)/B3LYP are only qualitative at R_e (B₂, C₂; ruling T4-d). Absent for Phase 6 library metas, which never carry a T1 diagnostic. */
    multireference?: boolean;
    t1AtRe?: number | null;
    orbitals: MoleculeOrbitalInfo[];
    /** Present only where density.bin.gz ships. */
    grid?: GridSpec;
    /** Phase 6 adds ESP; diatomics ship none. */
    espGrid?: GridSpec;
    /** `label` names a bond or angle by its atoms ("C–C", "H–C–C"), as build_library writes it (Task 7b fix round 2). */
    references: Array<{ quantity: string; value: number; unit: string; source: string; label?: string }>;
    generator: { pyscf: string; script: string; commit: string; xc?: string; numpy?: string; scipy?: string; python?: string; dataVersion?: string };
    scan?: string;
    tier?: MoleculeTier;
    provenance?: MoleculeProvenance;
}

export interface BasisShell {
    atom: number;
    l: 0 | 1 | 2 | 3;
    exponents: number[];
    coefficients: number[];
}

export interface BasisOrbital extends MoleculeOrbitalInfo {
    spin: OrbitalSpin;
    coefficients: number[];
    /** Position in PySCF's own mo_coeff/mo_energy for this spin -- not what `index` means; kept for provenance. */
    pyscfIndex?: number;
}

export interface MoleculeBasis {
    id: string;
    spherical: true;
    convention: string;
    atoms: Array<[number, number, number]>;
    nao: number;
    shells: BasisShell[];
    orbitals: BasisOrbital[];
}

export interface ScanPoint {
    index: number;
    id: string;
    RBohr: number;
    energyHartree: number;
    dftEnergyHartree: number;
    t1Diagnostic: number;
}

export interface MoleculeScan {
    id: string;
    name: string;
    formula: string;
    spin: number;
    energyMethod: string;
    densityMethod: string;
    points: ScanPoint[];
    equilibriumIndex: number;
    fit: {
        ReBohr: number;
        ReUncertaintyBohr: number;
        EminHartree: number;
        DeHartree: number;
        DeEv: number;
        bound: boolean;
        separatedAtomsHartree: number;
        separatedAtomsMethod: string;
    };
    /** Single-reference CCSD(T) validity (ruling T4-a/T4-d): the shipped curve stops at the first point that fails. */
    validity: {
        pointsComputed: number;
        pointsShipped: number;
        /** True for FCI molecules (H₂, He₂, Li₂): every computed point is shipped, no T1 guard applies. */
        exact: boolean;
        t1Limit: number | null;
        t1AtRe: number | null;
        multireference: boolean;
        validUpToRBohr: number;
        stoppedAtRBohr: number | null;
        stopReason: string | null;
    };
    spinCheck: { RBohr: number; tripletHartree: number; singletHartree: number; method: string } | null;
    note: string | null;
    reference: { ReAngstrom: number | null; source: string | null };
}

/** Spec §9.1: the curated library is validated; a molecule computed on request is not benchmarked. Absent means validated. */
export type MoleculeTier = 'validated' | 'computed';

/** The compute version that added D3(BJ) and recipe B's frequency check (Phase 6D); jobs below it predate both. */
export const DISPERSION_COMPUTE_VERSION = 2;

/** Recipe B's frequency check (Phase 6D spec §7), as meta.json's `frequencyCheck` carries it. */
export interface FrequencyCheck {
    result: 'minimum' | 'minimum-after-displacement' | 'saddle-point' | 'not-run' | 'not-rechecked';
    summary: string;
    imaginaryCount?: number;
    imaginaryWavenumbers?: number[];
    noiseWavenumbers?: number[];
    lowestWavenumber?: number | null;
    zeroPointEnergyHartree?: number;
    /** Set when the zero-point energy was taken at a saddle point: it leaves the imaginary modes out. */
    zeroPointEnergyNote?: string;
    method?: string | null;
    /** The check that found a saddle point, before the run displaced from it and re-optimised. */
    history?: Array<Omit<FrequencyCheck, 'history' | 'method'>>;
}

/** An open shell's mixed treatment (Phase 6D): PySCF has no ROKS Hessian, so geometry and frequencies run UKS. */
export interface OpenShellRecord {
    methods: string;
    expectedS2: number;
    geometryS2: number | null;
    frequenciesS2: number | null;
    contaminated: boolean;
    note?: string;
}

/** meta.provenance, written by the 6B-1 worker for computed molecules (spec §9.3). */
export interface MoleculeProvenance {
    jobKey: string;
    computeVersion: number;
    recipe: 'single' | 'optimise';
    geometrySource: { kind: 'pubchem'; cid: number; title: string; query: string; retrievedAt: string } | { kind: 'xyz' };
    caveats: string[];
    generatorCommit: string;
    imageDigest: string;
    pyscfVersion: string;
    sizingVersion: number;
    size: string;
    capacity: 'spot' | 'on-demand' | 'local';
    wallSeconds: number;
    /** Phase 6D (compute version 2): the optimisation's level, the frequency check's summary, the time limit the budget worked to. */
    geometryMethod?: string | null;
    frequencyCheck?: string | null;
    timeLimitSeconds?: number | null;
    /** Phase 6D: an open shell's UKS/ROKS split and UKS's <S^2>. */
    openShell?: OpenShellRecord;
    /** Phase 6D: what happened to the geometry before the final SCF (symmetrised; or symmetry off, with a note). */
    finalGeometry?: { summary: string; symmetrised?: boolean; pointGroup?: string | null; note?: string; [key: string]: unknown };
    /** Phase 6D: a final SCF that converged only when rerun without point-group symmetry. */
    finalScf?: { symmetry: 'off'; retried: boolean; summary: string };
    /** Phase 6D: the atomic masses the frequencies used. */
    frequencyMasses?: string;
    /** Always null (6B-1): settlement comes after the immutable files; the owner reads the cost from the job record. */
    costUsd: number | null;
}

export function tierOf(item: { tier?: MoleculeTier }): MoleculeTier {
    return item.tier ?? 'validated';
}
