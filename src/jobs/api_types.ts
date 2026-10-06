/**
 * The job API's JSON, exactly as tools/jobs/handlers.py and
 * model.public_view write it (Phase 6B-1, Tasks 5 and 6), pinned by the
 * recorded fixtures in tests/jobs/fixtures/api. Money is USD everywhere
 * except inside `sizing`, which carries the rule's own micro-dollar
 * prediction unconverted.
 */
export type Recipe = 'single' | 'optimise';
export type JobStatus = 'QUEUED' | 'STARTING' | 'RUNNING' | 'DONE' | 'FAILED';
export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>(['QUEUED', 'STARTING', 'RUNNING']);
export const isActive = (status: JobStatus): boolean => ACTIVE_STATUSES.has(status);

export type Capacity = 'spot' | 'on-demand' | 'local';
export type WorkerSize = 'S' | 'M' | 'L' | 'XL';
/** [Z, x, y, z], Å, each coordinate rounded to 10⁻⁵ (spec §5.2). */
export type CanonicalAtom = [number, number, number, number];

export interface CanonicalJob {
    computeVersion: number;
    recipe: Recipe;
    method: { xc: string; basis: string; optimiseBasis: string | null };
    molecule: { atoms: CanonicalAtom[]; charge: number; multiplicity: number };
}

export interface Sizing {
    version: number;
    /** Always 'fargate': size, time and timeout are Fargate figures even for a local run (6B-1 M1). */
    estimateFor: 'fargate';
    size: WorkerSize;
    vcpu: number;
    memoryGB: number;
    capacity: Capacity;
    attempts: number;
    basisFunctions: number;
    predictedSeconds: number;
    predictedMemoryGB: number;
    timeoutSeconds: number;
    predictedCostMicros: number;
}

export type GeometrySource =
    | { kind: 'pubchem'; cid: number; title: string; query: string; retrievedAt: string }
    | { kind: 'xyz' };

export interface ApiError { code: string; message: string }
export interface JobActual { wallSeconds: number; peakMemoryGB: number; threads: number }

export interface JobView {
    key: string;
    status: JobStatus;
    attempt: number;
    recipe: Recipe;
    job: CanonicalJob;
    name: string;
    formula: string;
    electronCount: number;
    basisFunctions: number;
    geometrySource: GeometrySource;
    sizing: Sizing;
    month: string;
    submittedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    heartbeatAt: string | null;
    stage: string | null;
    latestEnergyHartree: number | null;
    logTail: string[];
    actual: JobActual | null;
    error: ApiError | null;
    backend: 'local' | 'aws';
    /** Written by the worker's heartbeat; null until the first one, and again after a retry. */
    peakMemoryGB: number | null;
    reservedUsd: number;
    /** null until the job is settled. */
    actualUsd: number | null;
    resultUrl: string;
}

export interface Meter { month: string; capUsd: number; spentUsd: number; reservedUsd: number; remainingUsd: number }

export type Decision = { ok: true; sizing: Sizing; reservedUsd: number } | { ok: false; error: ApiError };

export interface PreviewResponse {
    key: string;
    job: CanonicalJob;
    name: string;
    formula: string;
    electronCount: number;
    basisFunctions: number;
    atoms: CanonicalAtom[];
    charge: number;
    multiplicity: number;
    geometrySource: GeometrySource;
    decision: Decision;
    existing: JobView | null;
    meter: Meter;
    generationEnabled: boolean;
}

export interface JobListResponse { month: string; jobs: JobView[] }

/** Cost Explorer's figure (Phase 6B-3's billing Lambda); `usd` is what this UI reads. */
export interface BillingFigure { usd: number; through?: string }

export interface CostsResponse extends Meter {
    projectionUsd: number;
    daily: Array<{ date: string; usd: number }>;
    billing: BillingFigure | null;
    pricesRetrieved: string;
}

export type MoleculeInput = { name: string } | { smiles: string } | { xyz: string };

export interface JobRequest {
    recipe: Recipe;
    molecule: MoleculeInput;
    charge?: number;
    multiplicity?: number;
    retry?: boolean;
}
