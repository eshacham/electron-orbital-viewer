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

export interface MoleculeOrbitalInfo {
    /** Position in basis.json's `orbitals`; what a 'gaussianMO' recipe's `index` means. */
    index: number;
    /** 'nσg', 'nπu', antibonding starred for homonuclear molecules. */
    label: string;
    energyHartree: number;
    occupation: number;
    spin?: OrbitalSpin;
    role?: 'HOMO' | 'LUMO' | 'SOMO';
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
    t1AtRe?: number;
    orbitals: MoleculeOrbitalInfo[];
    /** Present only where density.bin.gz ships. */
    grid?: GridSpec;
    /** Phase 6 adds ESP; diatomics ship none. */
    espGrid?: GridSpec;
    references: Array<{ quantity: string; value: number; unit: string; source: string }>;
    generator: { pyscf: string; script: string; commit: string; xc?: string; numpy?: string; scipy?: string; python?: string; dataVersion?: string };
    scan?: string;
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
