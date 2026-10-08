/**
 * The job API's JSON, exactly as tools/jobs/handlers.py and
 * model.public_view write it (Phase 6B-1, Tasks 5 and 6; quotes since Phase
 * 6C, tools/jobs/quotes.py), pinned by the recorded fixtures in
 * tests/jobs/fixtures/api. Money is USD everywhere except inside `sizing`,
 * which carries the rule's own micro-dollar prediction unconverted.
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
/** `resultBytes`/`resultObjects`: what the worker stored, every attempt file and result (Phase 6C; absent before). */
export interface JobActual { wallSeconds: number; peakMemoryGB: number; threads: number; resultBytes?: number; resultObjects?: number }

/** Phase 6C: the options a job can run under, and how each line of its price is made up. */
export type QuoteOptionName = 'spot' | 'on-demand' | 'local';
/** `platform` is $0 for now: the line is kept for a fee the business model may add. */
export type LineItem = 'compute' | 'storage' | 'delivery' | 'platform';
export interface QuoteLine { item: LineItem; label: string; estimateUsd: number; maximumUsd: number; note: string }

interface QuoteTerms {
    option: QuoteOptionName;
    capacity: Capacity;
    quoteId: string;
    size: WorkerSize;
    vcpu: number;
    memoryGB: number;
    attempts: number;
    /** The job's time limit: what the compute maximum buys (attempts × (limit + start/stop) at the size's rate). */
    timeoutSeconds: number;
    predictedSeconds: number;
    sizingVersion: number;
    pricesVersion: number;
    resultBytes: number;
    resultBytesMax: number;
    retentionMonths: number;
    downloads: number;
    /** The minute the server issued it (UTC, bound into quoteId): a quote holds for an hour. */
    issuedAt: string | null;
    estimateUsd: number;
    maximumUsd: number;
    lines: QuoteLine[];
    /** Spot only: what an interruption does to this recipe. */
    interruption: string | null;
    sizing: Sizing;
}
/** `approvable`/`blockedReason` are set on a preview's own options (the cap check), not on `reference`. */
export type QuoteOption =
    | (QuoteTerms & { available: true; unavailableReason: null; approvable?: boolean; blockedReason?: string | null })
    | { option: QuoteOptionName; capacity: Capacity; available: false; unavailableReason: string; quoteId: null; approvable?: false; blockedReason?: null };
export type AvailableQuoteOption = Extract<QuoteOption, { available: true }>;

export interface Quote {
    options: QuoteOption[];
    recommended: QuoteOptionName;
    /** This Mac only: what the same job would cost on AWS (informational, never approved). */
    reference: QuoteOption[] | null;
}

/** The quote the owner approved, as the job record keeps it. */
export interface ApprovedQuote {
    option: QuoteOptionName;
    quoteId: string;
    attempts: number;
    timeoutSeconds: number;
    sizingVersion: number;
    pricesVersion: number;
    approvedAt: string;
    issuedAt: string | null;
    estimateUsd: number;
    maximumUsd: number;
    lines: Array<{ item: LineItem; label: string; estimateUsd: number; maximumUsd: number }>;
}

/**
 * One settled attempt's entry in the job's ledger (fix round 1, review I2): the approval it was charged
 * against, what AWS was paid and what was charged. Entries from before quotes carry their cost alone.
 */
export interface LedgerEntry {
    quoteId: string | null;
    option: QuoteOptionName | null;
    approvedMaximumUsd: number | null;
    costUsd: number;
    chargedUsd: number | null;
    absorbedUsd: number | null;
    lines: Array<{ item: LineItem; label: string; costUsd: number; chargedUsd: number }> | null;
    month: string;
    at: string | null;
}

/** What a settled, quoted job was charged: each line its cost, capped at its approved maximum; the rest absorbed. */
export interface Charged {
    costUsd: number;
    chargedUsd: number;
    absorbedUsd: number;
    resultBytes: number;
    lines: Array<{ item: LineItem; label: string; costUsd: number; chargedUsd: number }>;
}

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
    /** null until the job is settled: what it cost (for a quoted job, compute plus storage and delivery). */
    actualUsd: number | null;
    resultUrl: string;
    /** null for a record from before Phase 6C (legacy: shown by its reservation and actual cost). */
    approvedQuote: ApprovedQuote | null;
    /** null until a quoted job is settled, and for every legacy record. */
    charged: Charged | null;
    /** Every settled attempt, oldest first: one entry per approval, never overwritten by a retry. */
    ledger: LedgerEntry[];
}

export interface Meter { month: string; capUsd: number; spentUsd: number; reservedUsd: number; remainingUsd: number }

export type Decision = { ok: true; quote: Quote } | { ok: false; error: ApiError };

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
    /** Phase 6C: a submit names the approved option and its quote id (a preview ignores both). */
    option?: QuoteOptionName;
    quoteId?: string;
}
