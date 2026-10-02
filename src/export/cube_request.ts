import { AnalyticFieldSource } from '../field_source';
import { CubeAtom, RadialCurveOnGrid, encodeCube, fieldCubeGrid, radialDensityCubeGrid } from './cube';

/**
 * Worker-safe: this module (and only what `cube.ts` already imports) is
 * everything `exportWorker.ts` pulls in (ruling C8, spec §3.7 worker
 * weight). Building a request out of the store's state -- `cubeJobFor`,
 * `cubeReason` -- needs `caption.ts` and `RootState`, so that stays on the
 * main thread, in `run_export.ts`, rather than here.
 */
interface CubeMeta { atoms: CubeAtom[]; title: string; description: string; requestId: number; }
export type CubeRequest =
    | ({ type: 'fieldCube'; source: AnalyticFieldSource; resolution: number } & CubeMeta)
    | ({ type: 'radialCube'; curve: RadialCurveOnGrid; resolution: number } & CubeMeta);
export type CubeResponse =
    | { type: 'success'; blob: Blob; requestId: number }
    | { type: 'error'; message: string; requestId: number };

type WithoutRequestId<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export type CubeJob = WithoutRequestId<CubeRequest>;

export function buildCubeBlob(request: CubeRequest): Blob {
    const grid = request.type === 'fieldCube'
        ? fieldCubeGrid(request.source, request.resolution)
        : radialDensityCubeGrid(request.curve, request.resolution);
    return new Blob(encodeCube(grid, request.atoms, request.title, request.description), { type: 'chemical/x-cube' });
}

export interface CubeWorkerHandle {
    postMessage(message: CubeRequest): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<CubeResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    /** Fires instead of onmessage when the worker's reply cannot be deserialised. */
    onmessageerror: ((event: MessageEvent) => void) | null;
}

let nextRequestId = 0;

/** Fallback wording shared by every way a cube job can fail without its own message. */
const CUBE_WORKER_FAILED_REASON = 'The cube file could not be built.';

/** One worker per file: a cube is rare, and the worker's memory goes with it. */
export function requestCube(job: CubeJob, createWorker: () => CubeWorkerHandle): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const worker = createWorker();
        const requestId = ++nextRequestId;
        worker.onmessage = event => {
            worker.terminate();
            if (event.data.type === 'success') resolve(event.data.blob);
            else reject(new Error(event.data.message));
        };
        worker.onerror = event => {
            worker.terminate();
            reject(new Error(event.message || CUBE_WORKER_FAILED_REASON));
        };
        // A reply the worker posted but this side cannot deserialise (e.g. a
        // corrupted transfer) -- fires instead of onmessage, never alongside it.
        worker.onmessageerror = () => {
            worker.terminate();
            reject(new Error('The cube reply could not be read.'));
        };
        try {
            worker.postMessage({ ...job, requestId } as CubeRequest);
        } catch (error) {
            // A message the worker boundary refuses outright (e.g.
            // DataCloneError on a non-cloneable job) never reaches onerror --
            // postMessage throws synchronously instead.
            worker.terminate();
            reject(error instanceof Error ? error : new Error(CUBE_WORKER_FAILED_REASON));
        }
    });
}
